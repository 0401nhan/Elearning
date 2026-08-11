import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputRoot = path.join(root, "input");
const uploadDir = path.join(root, "public", "uploads", "training-materials");
const publicUploadPath = "/uploads/training-materials";
const questionImageUploadDir = path.join(root, "public", "uploads", "question-images", "qhse");
const publicQuestionImagePath = "/uploads/question-images/qhse";
const optionLabels = ["A", "B", "C", "D"];
const officeMaterialExtensions = new Set([".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"]);
const imageMaterialExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const videoMaterialExtensions = new Set([".mov", ".mp4", ".webm"]);

function walkFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const name of readdirSync(dir)) {
    const filePath = path.join(dir, name);
    if (statSync(filePath).isDirectory()) {
      files.push(...walkFiles(filePath));
    } else {
      files.push(filePath);
    }
  }

  return files;
}

async function loadEnvFile(filename) {
  try {
    const content = await readFile(path.join(root, filename), "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return {
      uri: process.env.DATABASE_URL,
      charset: "utf8mb4"
    };
  }

  return {
    host: requireEnv("DATABASE_HOST"),
    port: Number(requireEnv("DATABASE_PORT")),
    user: requireEnv("DATABASE_USER"),
    password: requireEnv("DATABASE_PASSWORD"),
    database: requireEnv("DATABASE_NAME"),
    charset: "utf8mb4"
  };
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function readDocxParagraphObjects(inputPath) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "eb-input-docx-"));
  const zipPath = path.join(tempDir, "document.zip");
  try {
    copyFileSync(inputPath, zipPath);
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(tempDir)} -Force`
      ],
      { stdio: "pipe" }
    );

    const documentXml = readFileSync(path.join(tempDir, "word", "document.xml"), "utf8");
    const relationshipTargets = new Map();
    const relationshipPath = path.join(tempDir, "word", "_rels", "document.xml.rels");

    if (existsSync(relationshipPath)) {
      const relationshipXml = readFileSync(relationshipPath, "utf8");
      for (const relationship of relationshipXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
        const relationshipXmlText = relationship[0];
        const id = /\bId="([^"]+)"/.exec(relationshipXmlText)?.[1];
        const target = /\bTarget="([^"]+)"/.exec(relationshipXmlText)?.[1];
        const type = /\bType="([^"]+)"/.exec(relationshipXmlText)?.[1] ?? "";

        if (id && target && /\/image$/i.test(type)) {
          relationshipTargets.set(id, decodeXml(target));
        }
      }
    }

    return Array.from(documentXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g), (paragraphMatch) => {
      const paragraphXml = paragraphMatch[0];
      const parts = [];
      const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
      const images = [];

      for (const token of paragraphXml.matchAll(tokenPattern)) {
        if (token[1] !== undefined) {
          parts.push(decodeXml(token[1]));
        } else {
          parts.push(" ");
        }
      }

      for (const imageReference of paragraphXml.matchAll(/\br:(?:embed|link)="([^"]+)"/g)) {
        const relationshipId = imageReference[1];
        const target = relationshipTargets.get(relationshipId);
        if (!target) {
          continue;
        }

        const mediaPath = path.resolve(path.join(tempDir, "word"), target);
        if (!existsSync(mediaPath)) {
          continue;
        }

        images.push({
          relationshipId,
          target,
          extension: path.extname(target).toLowerCase() || ".png",
          bytes: readFileSync(mediaPath)
        });
      }

      return {
        text: cleanText(parts.join("")),
        images
      };
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function xmlAttribute(xml, name) {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(xml)?.[1] ?? null;
}

function xlsxColumnIndex(cellReference) {
  const letters = /^[A-Z]+/i.exec(String(cellReference ?? ""))?.[0]?.toUpperCase() ?? "";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }

  return index;
}

function readXlsxSharedStrings(extractDir) {
  const sharedStringsPath = path.join(extractDir, "xl", "sharedStrings.xml");
  if (!existsSync(sharedStringsPath)) {
    return [];
  }

  const sharedStringsXml = readFileSync(sharedStringsPath, "utf8");
  return Array.from(sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), (match) =>
    Array.from(match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (textMatch) => decodeXml(textMatch[1])).join("")
  );
}

function xlsxRelationshipTargets(extractDir) {
  const relationshipPath = path.join(extractDir, "xl", "_rels", "workbook.xml.rels");
  const targets = new Map();
  if (!existsSync(relationshipPath)) {
    return targets;
  }

  const relationshipXml = readFileSync(relationshipPath, "utf8");
  for (const relationship of relationshipXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attributes = relationship[1];
    const id = xmlAttribute(attributes, "Id");
    const target = xmlAttribute(attributes, "Target");
    if (id && target) {
      targets.set(id, decodeXml(target));
    }
  }

  return targets;
}

function xlsxSheetPath(extractDir, relationshipTarget, fallbackSheetId) {
  if (relationshipTarget) {
    return relationshipTarget.startsWith("/")
      ? path.join(extractDir, relationshipTarget.replace(/^\/+/, ""))
      : path.join(extractDir, "xl", relationshipTarget);
  }

  return path.join(extractDir, "xl", "worksheets", `sheet${fallbackSheetId}.xml`);
}

function xlsxCellValue(attributes, innerXml, sharedStrings) {
  const type = xmlAttribute(attributes, "t");
  if (type === "s") {
    const sharedStringIndex = /<v>([\s\S]*?)<\/v>/.exec(innerXml)?.[1];
    return sharedStringIndex === undefined ? "" : sharedStrings[Number(sharedStringIndex)] ?? "";
  }

  if (type === "inlineStr") {
    return Array.from(innerXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (match) => decodeXml(match[1])).join("");
  }

  return decodeXml(/<v>([\s\S]*?)<\/v>/.exec(innerXml)?.[1] ?? "");
}

function parseXlsxRows(sheetXml, sharedStrings) {
  const rows = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    const cellXml = rowMatch[1];
    const cellPattern = /<c\b([^/>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;

    for (const cellMatch of cellXml.matchAll(cellPattern)) {
      const attributes = cellMatch[1] ?? cellMatch[2] ?? "";
      const innerXml = cellMatch[3] ?? "";
      const cellReference = xmlAttribute(attributes, "r");
      const columnIndex = xlsxColumnIndex(cellReference) || values.length + 1;
      values[columnIndex - 1] = cleanText(xlsxCellValue(attributes, innerXml, sharedStrings));
    }

    rows.push(values.map((value) => value ?? ""));
  }

  return rows;
}

function readXlsxSheets(inputPath) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "eb-input-xlsx-"));
  const zipPath = path.join(tempDir, "workbook.zip");
  try {
    copyFileSync(inputPath, zipPath);
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(tempDir)} -Force`
      ],
      { stdio: "pipe" }
    );

    const workbookXml = readFileSync(path.join(tempDir, "xl", "workbook.xml"), "utf8");
    const relationships = xlsxRelationshipTargets(tempDir);
    const sharedStrings = readXlsxSharedStrings(tempDir);

    return Array.from(workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g), (sheetMatch) => {
      const attributes = sheetMatch[1];
      const name = decodeXml(xmlAttribute(attributes, "name") ?? "Sheet");
      const sheetId = Number(xmlAttribute(attributes, "sheetId") ?? 0);
      const relationshipId = xmlAttribute(attributes, "r:id");
      const sheetPath = xlsxSheetPath(tempDir, relationshipId ? relationships.get(relationshipId) : null, sheetId);
      const sheetXml = readFileSync(sheetPath, "utf8");
      return {
        name,
        rows: parseXlsxRows(sheetXml, sharedStrings)
      };
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function ascii(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase();
}

function slugify(value) {
  return ascii(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "input";
}

function paragraphText(paragraph) {
  return typeof paragraph === "string" ? paragraph : paragraph?.text ?? "";
}

function paragraphImages(paragraph) {
  return typeof paragraph === "string" ? [] : paragraph?.images ?? [];
}

function isImageOnlyParagraph(paragraph) {
  return !paragraphText(paragraph) && paragraphImages(paragraph).length > 0;
}

function withoutExtension(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function childDirectory(parentDir, canonicalName) {
  if (!existsSync(parentDir)) {
    return null;
  }

  const expected = canonicalTitle(canonicalName);
  for (const name of readdirSync(parentDir)) {
    const filePath = path.join(parentDir, name);
    if (statSync(filePath).isDirectory() && canonicalTitle(name) === expected) {
      return filePath;
    }
  }

  return null;
}

function titleFromQuestionFile(filePath) {
  const words = withoutExtension(filePath).split(/\s+/);
  if (ascii(words[0]) === "cau" && ascii(words[1]) === "hoi") {
    return words.slice(2).join(" ").trim();
  }
  return withoutExtension(filePath).trim();
}

function titleFromHcnsPdf(filePath) {
  const base = withoutExtension(filePath).replace(/^FN\.\s*/i, "").trim();
  const dashIndex = base.indexOf(" - ");
  return dashIndex >= 0 ? base.slice(dashIndex + 3).trim() : base;
}

function titleFromNumberedPdf(filePath) {
  return withoutExtension(filePath).replace(/^\d+\.\s*/, "").trim();
}

function canonicalTitle(value) {
  return ascii(value)
    .replace(/\bquy dinh ve\b/g, "quy dinh")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function codeFromHcnsPdf(filePath) {
  const normalized = ascii(withoutExtension(filePath));
  const match = /\b(nq|qc|qd)[.\s-]*hcns[.\s-]*(\d{1,2})\b/.exec(normalized);
  if (match) {
    return `HCNS_${match[1].toUpperCase()}_HCNS_${match[2].padStart(2, "0")}`;
  }
  return `HCNS_${slugify(withoutExtension(filePath)).toUpperCase().replace(/-/g, "_").slice(0, 44)}`;
}

function codeFromQhsePart(partNumber) {
  return `QHSE_PART_${String(partNumber).padStart(2, "0")}`;
}

function boundedText(value, maxLength) {
  const text = cleanText(value);
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text;
}

function answerLabel(line) {
  const match = /dap an(?:\s+dung)?\s*:?\s*([A-D])/i.exec(ascii(paragraphText(line)));
  return match?.[1]?.toUpperCase() ?? null;
}

function isAnswerLine(line) {
  return Boolean(answerLabel(line));
}

function isHcnsQuestionLine(line) {
  return /^cau\s+\d+\./i.test(ascii(line));
}

function genericQuestionNumber(line) {
  const match = /^cau\s+(\d+)\b/i.exec(ascii(paragraphText(line)));
  return match ? Number(match[1]) : null;
}

function isGenericQuestionLine(line) {
  return genericQuestionNumber(line) !== null;
}

function matchHcnsQuestion(line) {
  if (!isHcnsQuestionLine(line)) {
    return null;
  }

  return /^\S+\s+(\d+)\.\s*(.+)$/i.exec(line);
}

function isRomanSection(line) {
  return /^[IVXLCDM]+\.\s+/.test(line);
}

function parseOptions(lines, questionLabel) {
  const text = lines.join(" ");
  const markers = [];
  const markerPattern = /(^|\s)([A-D])\.\s*/g;

  for (let match = markerPattern.exec(text); match; match = markerPattern.exec(text)) {
    markers.push({
      label: match[2],
      index: match.index + match[1].length,
      end: markerPattern.lastIndex
    });
  }

  const starts = [];
  let searchFrom = 0;
  for (const label of optionLabels) {
    const found = markers.find((marker) => marker.label === label && marker.index >= searchFrom);
    if (!found) {
      throw new Error(`Question ${questionLabel}: missing option ${label}.`);
    }

    starts.push(found);
    searchFrom = found.end;
  }

  return starts.map((marker, index) => ({
    label: marker.label,
    text: cleanText(text.slice(marker.end, starts[index + 1]?.index ?? text.length))
  }));
}

function parseHcnsQuestions(filePath) {
  const paragraphs = readDocxParagraphObjects(filePath);
  const questions = [];
  let currentGroup = "Cau hoi";

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const text = paragraphText(paragraph);
    if (isRomanSection(text)) {
      currentGroup = text;
      continue;
    }

    const questionMatch = matchHcnsQuestion(text);
    if (!questionMatch) {
      continue;
    }

    const questionNumber = Number(questionMatch[1]);
    const optionLines = [];
    const imageRefs = [...paragraphImages(paragraph)];
    index += 1;
    while (index < paragraphs.length && !isAnswerLine(paragraphText(paragraphs[index]))) {
      const optionText = paragraphText(paragraphs[index]);
      if (optionText) {
        optionLines.push(optionText);
      }
      imageRefs.push(...paragraphImages(paragraphs[index]));
      index += 1;
    }

    if (index >= paragraphs.length) {
      throw new Error(`${path.basename(filePath)} question ${questionNumber}: missing answer line.`);
    }

    const correctLabel = answerLabel(paragraphText(paragraphs[index]));
    const explanationParts = [];
    while (
      index + 1 < paragraphs.length &&
      !isHcnsQuestionLine(paragraphText(paragraphs[index + 1])) &&
      !isRomanSection(paragraphText(paragraphs[index + 1]))
    ) {
      index += 1;
      const explanationText = paragraphText(paragraphs[index]);
      if (explanationText) {
        explanationParts.push(explanationText);
      }
    }

    questions.push({
      number: questionNumber,
      groupName: currentGroup,
      questionText: cleanText(questionMatch[2]),
      imageRefs,
      explanation: cleanText(explanationParts.join(" ")) || null,
      difficulty: "medium",
      options: parseOptions(optionLines, questionNumber).map((option) => ({
        ...option,
        isCorrect: option.label === correctLabel
      }))
    });
  }

  validateQuestions(filePath, questions);
  return questions;
}

function isQhsePart(line) {
  return /^phan\s*\d+\s*:/i.test(ascii(line));
}

function getQhsePartNumber(line) {
  const match = /^phan\s*(\d+)\s*:/i.exec(ascii(line));
  return match ? Number(match[1]) : null;
}

function startsOptionA(line) {
  return /^A\.\s*/.test(cleanText(paragraphText(line)));
}

function startsAnyOption(line) {
  return /^[A-D]\.\s*/.test(cleanText(paragraphText(line)));
}

function tryParseOptions(lines, questionLabel) {
  try {
    return parseOptions(lines, questionLabel);
  } catch {
    return null;
  }
}

function findQhseAnswerAfter(paragraphs, startIndex, maxDistance = 12) {
  const limit = Math.min(paragraphs.length, startIndex + maxDistance);
  const images = [];
  const optionLines = [];
  let foundOptions = false;

  for (let index = startIndex; index < limit; index += 1) {
    const paragraph = paragraphs[index];
    const text = paragraphText(paragraph);

    if (isQhsePart(text)) {
      return null;
    }

    if (!text) {
      images.push(...paragraphImages(paragraph));
      continue;
    }

    if (!foundOptions) {
      if (!startsOptionA(text)) {
        return null;
      }
      foundOptions = true;
    }

    if (isAnswerLine(text)) {
      if (tryParseOptions(optionLines, "probe")) {
        return {
          answerIndex: index,
          optionLines,
          images
        };
      }

      return null;
    }

    optionLines.push(text);
  }

  return null;
}

function isQhseQuestionStart(paragraphs, index) {
  return index + 1 < paragraphs.length && findQhseAnswerAfter(paragraphs, index + 1) !== null;
}

function isLeadingImageForQuestion(paragraphs, index) {
  return isImageOnlyParagraph(paragraphs[index]) && index + 1 < paragraphs.length && isQhseQuestionStart(paragraphs, index + 1);
}

function inlineQhseExplanation(answerLine) {
  const line = paragraphText(answerLine);
  const normalized = ascii(line);
  const answerIndex = normalized.indexOf("theo ");
  return answerIndex >= 0 ? cleanText(line.slice(answerIndex)) : "";
}

function parseQhseParts(filePath, expectedPartCount = 4) {
  const paragraphs = readDocxParagraphObjects(filePath);
  const parts = [];
  let currentPart = null;
  let pendingImages = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const text = paragraphText(paragraph);

    if (isQhsePart(text)) {
      currentPart = {
        number: getQhsePartNumber(text),
        title: text,
        questions: []
      };
      parts.push(currentPart);
      pendingImages = [];
      continue;
    }

    if (!currentPart || startsOptionA(text) || isAnswerLine(text)) {
      pendingImages = [];
      continue;
    }

    if (isImageOnlyParagraph(paragraph)) {
      if (isLeadingImageForQuestion(paragraphs, index)) {
        pendingImages.push(...paragraphImages(paragraph));
      }
      continue;
    }

    const answerMatch = findQhseAnswerAfter(paragraphs, index + 1);
    if (answerMatch === null) {
      pendingImages = [];
      continue;
    }

    const correctLabel = answerLabel(paragraphs[answerMatch.answerIndex]);
    const options = parseOptions(
      answerMatch.optionLines,
      `${currentPart.number}.${currentPart.questions.length + 1}`
    );
    const explanationParts = [];
    const inlineExplanation = inlineQhseExplanation(paragraphs[answerMatch.answerIndex]);
    if (inlineExplanation) {
      explanationParts.push(inlineExplanation);
    }

    let nextIndex = answerMatch.answerIndex + 1;
    while (
      nextIndex < paragraphs.length &&
      !isQhsePart(paragraphText(paragraphs[nextIndex])) &&
      !isQhseQuestionStart(paragraphs, nextIndex) &&
      !isLeadingImageForQuestion(paragraphs, nextIndex)
    ) {
      const explanationText = paragraphText(paragraphs[nextIndex]);
      if (explanationText) {
        explanationParts.push(explanationText);
      }
      nextIndex += 1;
    }

    currentPart.questions.push({
      number: currentPart.questions.length + 1,
      groupName: currentPart.title,
      questionText: cleanText(text),
      imageRefs: [...pendingImages, ...paragraphImages(paragraph), ...answerMatch.images],
      explanation: cleanText(explanationParts.join(" ")) || null,
      difficulty: "medium",
      options: options.map((option) => ({
        ...option,
        isCorrect: option.label === correctLabel
      }))
    });

    pendingImages = [];
    index = nextIndex - 1;
  }

  if (parts.length !== expectedPartCount) {
    throw new Error(`Expected ${expectedPartCount} QHSE parts, found ${parts.length}.`);
  }

  for (const part of parts) {
    validateQuestions(`${path.basename(filePath)} part ${part.number}`, part.questions);
  }

  return parts;
}

function genericInlineQuestionText(line) {
  const text = paragraphText(line);
  const inlineText = cleanText(text.replace(/^\S+\s+\d+\b\s*[:.)-]?\s*/u, ""));
  return inlineText === text ? "" : inlineText;
}

function isGenericExplanationHeading(line) {
  const normalized = ascii(paragraphText(line))
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized === "giai thich";
}

function stripGenericExplanationHeading(line) {
  return isGenericExplanationHeading(line) ? "" : paragraphText(line);
}

function inferGenericGroupName(explanationParts, fallback) {
  const text = explanationParts.join(" ");
  const quotedMatch = /Theo\s+(?:tài liệu|quy trình)\s+"([^"]+)"/iu.exec(text);
  if (quotedMatch?.[1]) {
    return boundedText(
      quotedMatch[1]
        .replace(/\s*\([^)]*Mã tài liệu[^)]*\)\s*/iu, " ")
        .replace(/\s*\([^)]*\)\s*$/u, " "),
      180
    );
  }

  return boundedText(fallback, 180);
}

function parseGenericQuestions(filePath, defaultGroupName) {
  const paragraphs = readDocxParagraphObjects(filePath);
  const questions = [];
  let sequenceNumber = 1;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const sourceNumber = genericQuestionNumber(paragraphs[index]);
    if (sourceNumber === null) {
      continue;
    }

    const questionParts = [];
    const imageRefs = [...paragraphImages(paragraphs[index])];
    const inlineQuestionText = genericInlineQuestionText(paragraphs[index]);
    if (inlineQuestionText) {
      questionParts.push(inlineQuestionText);
    }

    index += 1;
    while (
      index < paragraphs.length &&
      !startsAnyOption(paragraphs[index]) &&
      !isAnswerLine(paragraphs[index]) &&
      !isGenericQuestionLine(paragraphs[index])
    ) {
      const questionText = paragraphText(paragraphs[index]);
      if (questionText) {
        questionParts.push(questionText);
      }
      imageRefs.push(...paragraphImages(paragraphs[index]));
      index += 1;
    }

    const optionLines = [];
    while (index < paragraphs.length && !isAnswerLine(paragraphs[index]) && !isGenericQuestionLine(paragraphs[index])) {
      const optionText = paragraphText(paragraphs[index]);
      if (optionText) {
        optionLines.push(optionText);
      }
      imageRefs.push(...paragraphImages(paragraphs[index]));
      index += 1;
    }

    if (index >= paragraphs.length || !isAnswerLine(paragraphs[index])) {
      throw new Error(`${path.basename(filePath)} question ${sourceNumber}: missing answer line.`);
    }

    const correctLabel = answerLabel(paragraphs[index]);
    const explanationParts = [];
    index += 1;
    while (index < paragraphs.length && !isGenericQuestionLine(paragraphs[index])) {
      const explanationText = cleanText(stripGenericExplanationHeading(paragraphs[index]));
      if (explanationText) {
        explanationParts.push(explanationText);
      }
      index += 1;
    }

    questions.push({
      number: sequenceNumber,
      groupName: inferGenericGroupName(explanationParts, defaultGroupName),
      questionText: cleanText(questionParts.join(" ")),
      imageRefs,
      explanation: cleanText(explanationParts.join(" ")) || null,
      difficulty: "medium",
      options: parseOptions(optionLines, sourceNumber).map((option) => ({
        ...option,
        isCorrect: option.label === correctLabel
      }))
    });

    sequenceNumber += 1;
    index -= 1;
  }

  validateQuestions(filePath, questions);
  return questions;
}

function normalizedHeader(value) {
  return ascii(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerIndex(headers, aliases) {
  const normalizedAliases = aliases.map(normalizedHeader);
  return headers.findIndex((header) => normalizedAliases.includes(normalizedHeader(header)));
}

function parseCorrectOptionLabel(value, sourceLabel) {
  const match = /^[A-D]/i.exec(cleanText(value));
  if (!match) {
    throw new Error(`${sourceLabel}: invalid correct option "${value}".`);
  }

  return match[0].toUpperCase();
}

function parseKtvpLevel1Questions(filePath) {
  const sheets = readXlsxSheets(filePath);
  const questions = [];
  let sequenceNumber = 1;

  for (const sheet of sheets) {
    const rows = sheet.rows.filter((row) => row.some((cell) => cleanText(cell)));
    if (!rows.length) {
      continue;
    }

    const headers = rows[0];
    const questionIndex = headerIndex(headers, ["cau hoi"]);
    const answerIndex = headerIndex(headers, ["dap an"]);
    const explanationIndex = headerIndex(headers, ["giai thich"]);
    const optionIndexes = optionLabels.map((label) => headerIndex(headers, [label]));

    if (
      questionIndex < 0 ||
      answerIndex < 0 ||
      explanationIndex < 0 ||
      optionIndexes.some((optionIndex) => optionIndex < 0)
    ) {
      throw new Error(`${path.basename(filePath)} sheet ${sheet.name}: missing required columns.`);
    }

    for (const row of rows.slice(1)) {
      const questionText = cleanText(row[questionIndex]);
      if (!questionText) {
        continue;
      }

      const sourceLabel = `${path.basename(filePath)} sheet ${sheet.name} question ${sequenceNumber}`;
      const correctLabel = parseCorrectOptionLabel(row[answerIndex], sourceLabel);
      const options = optionLabels.map((label, index) => ({
        label,
        text: cleanText(row[optionIndexes[index]]),
        isCorrect: label === correctLabel
      }));

      questions.push({
        number: sequenceNumber,
        groupName: sheet.name,
        questionText,
        imageRefs: [],
        explanation: cleanText(row[explanationIndex]) || null,
        difficulty: "medium",
        options
      });

      sequenceNumber += 1;
    }
  }

  validateQuestions(filePath, questions);
  return questions;
}

function validateQuestions(source, questions) {
  if (!questions.length) {
    throw new Error(`No questions parsed from ${source}.`);
  }

  const duplicateNumbers = questions
    .map((question) => question.number)
    .filter((number, index, numbers) => numbers.indexOf(number) !== index);
  if (duplicateNumbers.length > 0) {
    throw new Error(`Duplicate question numbers in ${source}: ${[...new Set(duplicateNumbers)].join(", ")}.`);
  }

  for (const question of questions) {
    if (!question.questionText) {
      throw new Error(`${source} question ${question.number}: empty question text.`);
    }

    if (question.options.length !== 4) {
      throw new Error(`${source} question ${question.number}: expected 4 options.`);
    }

    if (question.options.filter((option) => option.isCorrect).length !== 1) {
      throw new Error(`${source} question ${question.number}: expected exactly 1 correct option.`);
    }

    for (const option of question.options) {
      if (!option.text) {
        throw new Error(`${source} question ${question.number}: empty option ${option.label}.`);
      }
    }
  }
}

function buildHcnsBundles() {
  const hcnsRoot = path.join(inputRoot, "HCNS");
  const files = walkFiles(hcnsRoot);
  const pdfs = files.filter((filePath) => path.extname(filePath).toLowerCase() === ".pdf");
  const docxs = files.filter((filePath) => path.extname(filePath).toLowerCase() === ".docx");
  const pdfsByTitle = new Map(pdfs.map((pdf) => [canonicalTitle(titleFromHcnsPdf(pdf)), pdf]));
  const bundles = [];

  for (const questionFile of docxs) {
    const questionTitle = titleFromQuestionFile(questionFile);
    const pdfFile = pdfsByTitle.get(canonicalTitle(questionTitle));
    if (!pdfFile) {
      throw new Error(`Missing HCNS PDF for question file: ${path.relative(root, questionFile)}`);
    }

    const title = titleFromHcnsPdf(pdfFile);
    const questions = parseHcnsQuestions(questionFile);
    bundles.push({
      family: "HCNS",
      code: codeFromHcnsPdf(pdfFile),
      title: `HCNS - ${title}`,
      materialTitle: `HCNS - ${title}`,
      description: `Imported from ${path.relative(root, questionFile)}.`,
      departmentKey: "HCNS",
      materialFile: pdfFile,
      questionFile,
      questions
    });
  }

  return bundles.sort((left, right) => left.code.localeCompare(right.code));
}

function buildCombinedHcnsBundle() {
  const hcnsRoot = path.join(inputRoot, "HCNS");
  const questionDir = childDirectory(hcnsRoot, "Cau hoi") ?? hcnsRoot;
  const materialDir = childDirectory(hcnsRoot, "Tai lieu") ?? hcnsRoot;
  const questionFiles = walkFiles(questionDir)
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".docx")
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), "vi"));
  const materialFiles = walkFiles(materialDir)
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".pdf")
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), "vi"));

  if (!questionFiles.length) {
    throw new Error("Missing HCNS question DOCX files.");
  }

  if (!materialFiles.length) {
    throw new Error("Missing HCNS material PDF files.");
  }

  const questions = [];
  for (const questionFile of questionFiles) {
    const sourceTitle = titleFromQuestionFile(questionFile);
    const parsedQuestions = parseHcnsQuestions(questionFile);
    for (const question of parsedQuestions) {
      questions.push({
        ...question,
        groupName: cleanText(`${sourceTitle} - ${question.groupName}`)
      });
    }
  }

  return {
    family: "HCNS",
    code: "HCNS_ALL",
    title: "HCNS - T\u1ed5ng h\u1ee3p",
    description: `Imported from ${path.relative(root, questionDir)} and ${path.relative(root, materialDir)}.`,
    departmentKey: "HCNS",
    materialFiles,
    questionFiles,
    questions
  };
}

function buildQhseBundles() {
  const qhseRoot = path.join(inputRoot, "QHSE");
  const files = walkFiles(qhseRoot);
  const pdfs = files
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".pdf")
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), "vi"));
  const questionFile = files.find(
    (filePath) =>
      path.extname(filePath).toLowerCase() === ".docx" && ascii(path.basename(filePath)).startsWith("cau")
  );

  if (!questionFile) {
    throw new Error("Missing QHSE question DOCX.");
  }

  const parts = parseQhseParts(questionFile);
  return parts.map((part) => {
    const pdfFile = pdfs.find((pdf) => Number(/^\d+/.exec(path.basename(pdf))?.[0]) === part.number);
    if (!pdfFile) {
      throw new Error(`Missing QHSE PDF for part ${part.number}.`);
    }

    const title = titleFromNumberedPdf(pdfFile);
    return {
      family: "QHSE",
      code: codeFromQhsePart(part.number),
      title: `QHSE - ${title}`,
      materialTitle: `QHSE - ${title}`,
      description: `Imported from ${path.relative(root, questionFile)} part ${part.number}.`,
      departmentKey: "QHSE",
      materialFile: pdfFile,
      questionFile,
      questions: part.questions
    };
  });
}

function buildCombinedQhseBundle() {
  const qhseRoot = path.join(inputRoot, "QHSE");
  const questionDir = childDirectory(qhseRoot, "Cau hoi") ?? qhseRoot;
  const materialDir = childDirectory(qhseRoot, "Tai lieu") ?? qhseRoot;
  const materialFiles = walkFiles(materialDir)
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".pdf")
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), "vi"));
  const questionFiles = walkFiles(questionDir)
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".docx")
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), "vi"));
  const questionFile =
    questionFiles.find((filePath) => ascii(path.basename(filePath)).startsWith("cau")) ?? questionFiles[0];

  if (!questionFile) {
    throw new Error("Missing QHSE question DOCX.");
  }

  if (!materialFiles.length) {
    throw new Error("Missing QHSE material PDF files.");
  }

  const parts = parseQhseParts(questionFile);
  return {
    family: "QHSE",
    code: "QHSE_ALL",
    title: "QHSE - T\u1ed5ng h\u1ee3p",
    description: `Imported from ${path.relative(root, questionDir)} and ${path.relative(root, materialDir)}.`,
    departmentKey: "QHSE",
    materialFiles,
    questionFiles: [questionFile],
    questions: parts.flatMap((part) => part.questions)
  };
}

function extractZipContents(zipPath) {
  const destination = mkdtempSync(path.join(os.tmpdir(), "eb-input-archive-"));
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(destination)} -Force`
      ],
      { stdio: "pipe" }
    );
    return destination;
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

function buildQhseDepartmentBundle() {
  const bundleRoot = inputDirectoryByCanonicalTitle("bai kiem tra qhse");
  if (!bundleRoot) {
    throw new Error("Missing input folder for BAI KIEM TRA QHSE.");
  }

  const sourceFiles = walkFiles(bundleRoot);
  const questionFile = sourceFiles.find(
    (filePath) =>
      path.extname(filePath).toLowerCase() === ".docx" && ascii(path.basename(filePath)).startsWith("cau")
  );
  const materialArchive = sourceFiles.find((filePath) => path.extname(filePath).toLowerCase() === ".zip");
  if (!questionFile || !materialArchive) {
    throw new Error("BAI KIEM TRA QHSE requires a question DOCX and materials ZIP.");
  }

  const parts = parseQhseParts(questionFile, 11);
  const extractedMaterialsDirectory = extractZipContents(materialArchive);
  const materialFiles = walkFiles(extractedMaterialsDirectory)
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".pdf")
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), "vi"));
  if (!materialFiles.length) {
    rmSync(extractedMaterialsDirectory, { recursive: true, force: true });
    throw new Error("BAI KIEM TRA QHSE materials ZIP does not contain PDF files.");
  }

  return {
    family: "QHSE",
    code: "QHSE_DEPARTMENT",
    title: "BÀI KIỂM TRA QHSE",
    description: `Imported from ${path.relative(root, bundleRoot)}.`,
    departmentKey: "QHSE",
    configuredQuestionCount: 30,
    durationMinutes: 30,
    materialFiles,
    questionFiles: [questionFile],
    materialTitlePrefix: "QHSE",
    questions: parts.flatMap((part) => part.questions),
    temporaryDirectories: [extractedMaterialsDirectory]
  };
}

function inputDirectoryByCanonicalTitle(fragment) {
  if (!existsSync(inputRoot)) {
    return null;
  }

  const expected = canonicalTitle(fragment);
  for (const name of readdirSync(inputRoot)) {
    const filePath = path.join(inputRoot, name);
    if (statSync(filePath).isDirectory() && canonicalTitle(name).includes(expected)) {
      return filePath;
    }
  }

  return null;
}

function titleFromGenericPdf(filePath) {
  return withoutExtension(filePath).trim();
}

function buildGenericProcedureBundle(config) {
  const bundleRoot = inputDirectoryByCanonicalTitle(config.folderTitle);
  if (!bundleRoot) {
    throw new Error(`Missing input folder for ${config.folderTitle}.`);
  }

  const questionFile = walkFiles(bundleRoot).find((filePath) => path.extname(filePath).toLowerCase() === ".docx");
  if (!questionFile) {
    throw new Error(`Missing question DOCX in ${path.relative(root, bundleRoot)}.`);
  }

  const materialDir = childDirectory(bundleRoot, "Tai lieu") ?? bundleRoot;
  const materialFiles = walkFiles(materialDir)
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".pdf")
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), "vi"));
  if (!materialFiles.length) {
    throw new Error(`Missing PDF materials in ${path.relative(root, bundleRoot)}.`);
  }

  const title = path.basename(bundleRoot);
  return {
    family: config.family,
    code: config.code,
    title,
    description: `Imported from ${path.relative(root, bundleRoot)}.`,
    departmentKey: config.departmentKey,
    allowMissingDepartment: true,
    configuredQuestionCount: 30,
    durationMinutes: 30,
    materialFiles,
    questionFiles: [questionFile],
    materialTitlePrefix: config.materialTitlePrefix,
    questions: parseGenericQuestions(questionFile, title)
  };
}

function buildAccountingBundle() {
  const bundleRoot = inputDirectoryByCanonicalTitle("bai kiem tra phong ke toan");
  if (!bundleRoot) {
    throw new Error("Missing input folder for BAI KIEM TRA PHONG KE TOAN.");
  }

  const files = walkFiles(bundleRoot);
  const docxFiles = files.filter((filePath) => path.extname(filePath).toLowerCase() === ".docx");
  const pdfFiles = files.filter((filePath) => path.extname(filePath).toLowerCase() === ".pdf");
  const questionSources = [
    {
      filenameFragment: "ke toan chi phi",
      groupName: "Quy trình kế toán chi phí"
    },
    {
      filenameFragment: "ke toan cong no phai thu",
      groupName: "Quy trình kế toán công nợ phải thu"
    },
    {
      filenameFragment: "ke toan thue",
      groupName: "Quy trình kế toán thuế"
    }
  ];
  const materialSources = [
    {
      filenameFragment: "qt kt cn 01",
      title: "Kế toán - Quy trình hồ sơ thanh toán và công nợ phải thu"
    },
    {
      filenameFragment: "qt kt cp 01",
      title: "Kế toán - Quy trình chi phí nhân viên"
    },
    {
      filenameFragment: "qt kt t 01",
      title: "Kế toán - Quy trình kế toán thuế"
    }
  ];

  const questionFiles = [];
  const questions = [];
  for (const source of questionSources) {
    const questionFile = docxFiles.find((filePath) =>
      canonicalTitle(path.basename(filePath)).includes(source.filenameFragment)
    );
    if (!questionFile) {
      throw new Error(`Missing accounting question DOCX for ${source.groupName}.`);
    }

    const parsedQuestions = parseGenericQuestions(questionFile, source.groupName);
    if (parsedQuestions.length !== 100) {
      throw new Error(`${path.basename(questionFile)}: expected 100 questions, found ${parsedQuestions.length}.`);
    }

    questionFiles.push(questionFile);
    for (const question of parsedQuestions) {
      questions.push({
        ...question,
        number: questions.length + 1,
        groupName: source.groupName
      });
    }
  }

  const materialItems = materialSources.map((source, index) => {
    const filePath = pdfFiles.find((candidate) =>
      canonicalTitle(path.basename(candidate)).includes(source.filenameFragment)
    );
    if (!filePath) {
      throw new Error(`Missing accounting PDF for ${source.title}.`);
    }

    return {
      filePath,
      title: source.title,
      uploadCode: `KE_TOAN_QUY_TRINH-${index + 1}`,
      materialType: "pdf"
    };
  });

  return {
    family: "KE_TOAN",
    code: "KE_TOAN_QUY_TRINH",
    title: "BÀI KIỂM TRA PHÒNG KẾ TOÁN",
    description: `Ngân hàng 300 câu hỏi được nhập từ ${path.relative(root, bundleRoot)}.`,
    departmentKey: "KE_TOAN",
    configuredQuestionCount: 30,
    durationMinutes: 30,
    requiredCorrectAnswers: 24,
    materialItems,
    questionFiles,
    questions
  };
}

function buildCombinedKtvpBundle() {
  const level1Root = inputDirectoryByCanonicalTitle("ktvp level 1");
  if (!level1Root) {
    throw new Error("Missing input folder for KTVP Level 1.");
  }

  const level1QuestionFile = walkFiles(level1Root).find((filePath) => path.extname(filePath).toLowerCase() === ".xlsx");
  if (!level1QuestionFile) {
    throw new Error(`Missing question XLSX in ${path.relative(root, level1Root)}.`);
  }

  const procedureBundle = buildGenericProcedureBundle({
    family: "KTVP",
    code: "KTVP_QUY_TRINH_QUY_DINH",
    folderTitle: "quy trinh quy dinh ktvp",
    departmentKey: "KTVP",
    materialTitlePrefix: "KTVP"
  });
  const level1Questions = parseKtvpLevel1Questions(level1QuestionFile);
  const procedureQuestions = procedureBundle.questions.map((question) => ({
    ...question,
    number: question.number + level1Questions.length
  }));

  return {
    family: "KTVP",
    code: "KTVP_VAN_PHONG",
    title: "B\u00c0I KI\u1ec2M TRA K\u1ef8 THU\u1eacT V\u0102N PH\u00d2NG",
    description: `Imported from ${path.relative(root, level1Root)} and ${path.relative(
      root,
      inputDirectoryByCanonicalTitle("quy trinh quy dinh ktvp")
    )}.`,
    departmentKey: "KTVP",
    allowMissingDepartment: true,
    configuredQuestionCount: 30,
    durationMinutes: 30,
    materialItems: [
      {
        filePath: level1QuestionFile,
        title: "KTVP Level 1 - Cau hoi trac nghiem",
        uploadCode: "KTVP_VAN_PHONG-LEVEL-1",
        materialType: "slide"
      },
      ...procedureBundle.materialFiles.map((filePath, index) => ({
        filePath,
        title: materialTitleForBundle(procedureBundle, filePath),
        uploadCode: `KTVP_VAN_PHONG-QUY-TRINH-${index + 1}`,
        materialType: materialTypeForFile(filePath)
      }))
    ],
    questionFiles: [level1QuestionFile, ...questionFilesForBundle(procedureBundle)],
    questions: [...level1Questions, ...procedureQuestions],
    supersedesCodes: ["KTVP_OM", "KTVP_QUY_TRINH_QUY_DINH"]
  };
}

function buildGenericProcedureBundles(only = "procedures") {
  const configs = [
    {
      key: "dieuphoi",
      family: "DIEUPHOI",
      code: "DIEU_PHOI_QUY_TRINH_QUY_DINH",
      folderTitle: "phong dieu phoi",
      departmentKey: "DIEUPHOI",
      materialTitlePrefix: "Điều phối"
    },
    {
      key: "ktvp",
      family: "KTVP",
      code: "KTVP_QUY_TRINH_QUY_DINH",
      folderTitle: "quy trinh quy dinh ktvp",
      departmentKey: "KTVP",
      materialTitlePrefix: "KTVP"
    }
  ];

  return configs
    .filter((config) => only === "procedures" || only === config.key)
    .map((config) => buildGenericProcedureBundle(config));
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex").slice(0, 12);
}

async function copyMaterialFile(sourceFile, code, dryRun) {
  const extension = path.extname(sourceFile).toLowerCase();
  const hash = await hashFile(sourceFile);
  const filename = `${slugify(code)}-${hash}${extension}`;
  const targetPath = path.join(uploadDir, filename);

  if (!dryRun) {
    await mkdir(uploadDir, { recursive: true });
    if (!existsSync(targetPath)) {
      await copyFile(sourceFile, targetPath);
    }
  }

  return `${publicUploadPath}/${filename}`;
}

async function copyQuestionImage(image, code, dryRun) {
  const extension = /^\.[a-z0-9]+$/i.test(image.extension) ? image.extension : ".png";
  const hash = createHash("sha256").update(image.bytes).digest("hex").slice(0, 12);
  const sourceName = slugify(path.basename(image.target, path.extname(image.target)));
  const filename = `${slugify(code)}-${sourceName}-${hash}${extension}`;
  const targetPath = path.join(questionImageUploadDir, filename);

  if (!dryRun) {
    await mkdir(questionImageUploadDir, { recursive: true });
    if (!existsSync(targetPath)) {
      await writeFile(targetPath, image.bytes);
    }
  }

  return `${publicQuestionImagePath}/${filename}`;
}

async function prepareQuestionImages(bundle, dryRun) {
  for (const question of bundle.questions) {
    if (question.imageRefs?.length) {
      question.imageUrl = await copyQuestionImage(question.imageRefs[0], bundle.code, dryRun);
    }
  }
}

async function getDepartmentIds(connection) {
  const [rows] = await connection.query("SELECT id, code, name FROM departments");
  const byCode = new Map(rows.map((row) => [String(row.code), Number(row.id)]));
  const byName = new Map(rows.map((row) => [canonicalTitle(row.name), Number(row.id)]));

  return {
    HCNS:
      byCode.get("HCNS") ??
      byCode.get("HANH_CHINH_NHAN_SU") ??
      byName.get("hanh chinh nhan su") ??
      null,
    QHSE: byCode.get("QHSE") ?? byCode.get("HSE") ?? byName.get("qhse") ?? byName.get("hse") ?? null,
    KTVP: byCode.get("KTVP") ?? byName.get("ky thuat van phong") ?? null,
    DIEUPHOI: byCode.get("DIEUPHOI") ?? byName.get("dieu phoi") ?? null,
    KE_TOAN: byCode.get("KE_TOAN") ?? byName.get("ke toan") ?? null
  };
}

async function getCreatorId(connection) {
  const [adminRows] = await connection.query(
    `
    SELECT e.id
    FROM employees e
    JOIN employee_roles er ON er.employee_id = e.id
    JOIN roles r ON r.id = er.role_id
    WHERE r.code = 'admin'
    ORDER BY e.id
    LIMIT 1
    `
  );

  if (adminRows[0]?.id) {
    return Number(adminRows[0].id);
  }

  const [employeeRows] = await connection.query("SELECT id FROM employees ORDER BY id LIMIT 1");
  return employeeRows[0]?.id ? Number(employeeRows[0].id) : null;
}

async function ensureMaterial(connection, material, departmentId, creatorId) {
  const [existingRows] = await connection.query("SELECT id FROM training_materials WHERE content_url = ? LIMIT 1", [
    material.contentUrl
  ]);

  if (existingRows[0]?.id) {
    const materialId = Number(existingRows[0].id);
    await connection.execute(
      `
      UPDATE training_materials
      SET title = ?, material_type = ?, content_text = NULL, department_id = ?,
          version_label = '1.0', is_active = 1, uploaded_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [material.title, material.materialType, departmentId, creatorId, materialId]
    );
    return materialId;
  }

  const [result] = await connection.execute(
    `
    INSERT INTO training_materials
      (title, material_type, content_url, content_text, department_id, version_label, is_active, uploaded_by)
    VALUES (?, ?, ?, NULL, ?, '1.0', 1, ?)
    `,
    [material.title, material.materialType, material.contentUrl, departmentId, creatorId]
  );
  return result.insertId;
}

async function ensureTest(connection, bundle, departmentId, creatorId) {
  const questionCount = bundle.configuredQuestionCount ?? bundle.questions.length;
  const durationMinutes = bundle.durationMinutes ?? Math.max(20, Math.ceil(questionCount * 0.6));
  const [existingTests] = await connection.query(
    "SELECT required_correct_answers FROM tests WHERE code = ? LIMIT 1",
    [bundle.code]
  );
  const existingRequiredCorrectAnswers = Number(existingTests[0]?.required_correct_answers);
  const bundleRequiredCorrectAnswers = Number(bundle.requiredCorrectAnswers);
  const configuredRequiredCorrectAnswers =
    Number.isInteger(bundleRequiredCorrectAnswers) && bundleRequiredCorrectAnswers > 0
      ? Math.min(bundleRequiredCorrectAnswers, questionCount)
      : Number.isInteger(existingRequiredCorrectAnswers) && existingRequiredCorrectAnswers > 0
        ? Math.min(existingRequiredCorrectAnswers, questionCount)
        : null;
  const requiredCorrectAnswers = configuredRequiredCorrectAnswers ?? (questionCount <= 1 ? questionCount : questionCount - 1);
  const passScore = questionCount > 0 ? Number(((requiredCorrectAnswers / questionCount) * 100).toFixed(2)) : 80;

  await connection.execute(
    `
    INSERT INTO tests
      (code, title, department_id, description, question_count, duration_minutes, pass_score, required_correct_answers,
       max_official_attempts, allow_unlimited_practice, randomize_questions, randomize_answers,
       show_practice_answers, show_official_answers, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, 1, 0, 'active', ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      department_id = VALUES(department_id),
      description = VALUES(description),
      question_count = VALUES(question_count),
      duration_minutes = VALUES(duration_minutes),
      pass_score = VALUES(pass_score),
      required_correct_answers = VALUES(required_correct_answers),
      max_official_attempts = VALUES(max_official_attempts),
      allow_unlimited_practice = VALUES(allow_unlimited_practice),
      randomize_questions = VALUES(randomize_questions),
      randomize_answers = VALUES(randomize_answers),
      show_practice_answers = VALUES(show_practice_answers),
      show_official_answers = VALUES(show_official_answers),
      status = VALUES(status),
      created_by = COALESCE(created_by, VALUES(created_by))
    `,
    [
      bundle.code,
      bundle.title,
      departmentId,
      bundle.description,
      questionCount,
      durationMinutes,
      passScore,
      configuredRequiredCorrectAnswers,
      creatorId
    ]
  );

  const [rows] = await connection.query("SELECT id FROM tests WHERE code = ? LIMIT 1", [bundle.code]);
  return Number(rows[0].id);
}

async function replaceTestQuestions(connection, testId, creatorId, questions) {
  await connection.execute("DELETE FROM questions WHERE test_id = ?", [testId]);
  await connection.execute("DELETE FROM question_groups WHERE test_id = ?", [testId]);

  const groupCounts = new Map();
  for (const question of questions) {
    groupCounts.set(question.groupName, (groupCounts.get(question.groupName) ?? 0) + 1);
  }

  const groupIds = new Map();
  let sortOrder = 1;
  for (const [groupName, count] of groupCounts) {
    const [result] = await connection.execute(
      `
      INSERT INTO question_groups (test_id, name, suggested_question_count, sort_order)
      VALUES (?, ?, ?, ?)
      `,
      [testId, groupName, count, sortOrder]
    );
    groupIds.set(groupName, result.insertId);
    sortOrder += 1;
  }

  for (const question of questions) {
    const [questionResult] = await connection.execute(
      `
      INSERT INTO questions
        (test_id, group_id, question_text, image_url, explanation, difficulty, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `,
      [
        testId,
        groupIds.get(question.groupName) ?? null,
        question.questionText,
        question.imageUrl ?? null,
        question.explanation,
        question.difficulty,
        creatorId
      ]
    );

    await connection.query(
      `
      INSERT INTO answer_options
        (question_id, option_label, option_text, image_url, is_correct, sort_order)
      VALUES ?
      `,
      [
        question.options.map((option, index) => [
          questionResult.insertId,
          option.label,
          option.text,
          null,
          option.isCorrect ? 1 : 0,
          index + 1
        ])
      ]
    );
  }
}

async function linkMaterial(connection, testId, materialId) {
  await connection.execute("DELETE FROM test_materials WHERE test_id = ?", [testId]);
  await connection.execute("INSERT INTO test_materials (test_id, material_id, sort_order) VALUES (?, ?, 1)", [
    testId,
    materialId
  ]);
}

async function linkMaterials(connection, testId, materialIds) {
  await connection.execute("DELETE FROM test_materials WHERE test_id = ?", [testId]);

  if (!materialIds.length) {
    return;
  }

  await connection.query("INSERT INTO test_materials (test_id, material_id, sort_order) VALUES ?", [
    materialIds.map((materialId, index) => [testId, materialId, index + 1])
  ]);
}

function materialTypeForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") {
    return "pdf";
  }

  if (imageMaterialExtensions.has(extension)) {
    return "image";
  }

  if (videoMaterialExtensions.has(extension)) {
    return "video";
  }

  if (officeMaterialExtensions.has(extension)) {
    return "slide";
  }

  if (extension === ".txt" || extension === ".csv") {
    return "text";
  }

  return "link";
}

function materialTitleForBundle(bundle, filePath) {
  if (bundle.materialTitle) {
    return bundle.materialTitle;
  }

  if (bundle.family === "HCNS") {
    return `HCNS - ${titleFromHcnsPdf(filePath)}`;
  }

  if (bundle.family === "QHSE") {
    return `QHSE - ${titleFromNumberedPdf(filePath)}`;
  }

  const prefix = bundle.materialTitlePrefix ?? bundle.family;
  return boundedText(`${prefix} - ${titleFromGenericPdf(filePath)}`, 220);
}

function materialItemsForBundle(bundle) {
  if (bundle.materialItems) {
    return bundle.materialItems.map((item, index) => ({
      filePath: item.filePath,
      title: item.title ?? materialTitleForBundle(bundle, item.filePath),
      uploadCode: item.uploadCode ?? `${bundle.code}-${index + 1}`,
      materialType: item.materialType ?? materialTypeForFile(item.filePath)
    }));
  }

  const materialFiles = bundle.materialFiles ?? (bundle.materialFile ? [bundle.materialFile] : []);
  return materialFiles.map((filePath, index) => ({
    filePath,
    title: materialTitleForBundle(bundle, filePath),
    uploadCode: `${bundle.code}-${index + 1}`,
    materialType: materialTypeForFile(filePath)
  }));
}

function questionFilesForBundle(bundle) {
  return bundle.questionFiles ?? (bundle.questionFile ? [bundle.questionFile] : []);
}

async function archiveOldInputTests(connection, keepCodes) {
  if (!keepCodes.length) {
    return 0;
  }

  const [result] = await connection.query(
    `
    UPDATE tests
    SET status = 'archived'
    WHERE status = 'active'
      AND code NOT IN (?)
      AND (code LIKE 'HCNS_%' OR code LIKE 'QHSE_PART_%')
    `,
    [keepCodes]
  );

  return result.affectedRows ?? 0;
}

async function archiveTestsByCodes(connection, codes) {
  const uniqueCodes = [...new Set(codes)].filter(Boolean);
  if (!uniqueCodes.length) {
    return 0;
  }

  const [result] = await connection.query(
    `
    UPDATE tests
    SET status = 'archived'
    WHERE status = 'active'
      AND code IN (?)
    `,
    [uniqueCodes]
  );

  return result.affectedRows ?? 0;
}

async function verifyBundle(connection, code) {
  const [rows] = await connection.query(
    `
    SELECT
      t.id AS testId,
      t.code,
      t.title,
      t.question_count AS configuredQuestions,
      COUNT(DISTINCT q.id) AS questions,
      COUNT(DISTINCT CASE WHEN q.image_url IS NOT NULL AND q.image_url <> '' THEN q.id END) AS questionImages,
      COUNT(DISTINCT ao.id) AS options,
      COUNT(DISTINCT CASE WHEN ao.is_correct = 1 THEN ao.id END) AS correctOptions,
      COUNT(DISTINCT qg.id) AS questionGroups,
      COUNT(DISTINCT tm.material_id) AS materials
    FROM tests t
    LEFT JOIN questions q ON q.test_id = t.id
    LEFT JOIN answer_options ao ON ao.question_id = q.id
    LEFT JOIN question_groups qg ON qg.test_id = t.id
    LEFT JOIN test_materials tm ON tm.test_id = t.id
    WHERE t.code = ?
    GROUP BY t.id, t.code, t.title, t.question_count
    `,
    [code]
  );

  return rows[0] ?? null;
}

async function importBundles(bundles, dryRun, options = {}) {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local");

  for (const bundle of bundles) {
    await prepareQuestionImages(bundle, dryRun);
  }

  if (dryRun) {
    return {
      dryRun,
      items: await Promise.all(
        bundles.map(async (bundle) => {
          const materialItems = materialItemsForBundle(bundle);
          return {
            code: bundle.code,
            title: bundle.title,
            materialFiles: materialItems.map((item) => path.relative(root, item.filePath)),
            materialTypes: materialItems.map((item) => item.materialType),
            questionFiles: questionFilesForBundle(bundle).map((filePath) => path.relative(root, filePath)),
            questions: bundle.questions.length,
            questionImages: bundle.questions.filter((question) => question.imageUrl).length,
            groups: new Set(bundle.questions.map((question) => question.groupName)).size,
            contentUrls: await Promise.all(
              materialItems.map((item) => copyMaterialFile(item.filePath, item.uploadCode, true))
            )
          };
        })
      )
    };
  }

  const connection = await mysql.createConnection(getDatabaseConfig());
  try {
    const departmentIds = await getDepartmentIds(connection);
    const creatorId = await getCreatorId(connection);
    const summaries = [];

    for (const bundle of bundles) {
      const departmentId = departmentIds[bundle.departmentKey] ?? null;
      if (!departmentId && !bundle.allowMissingDepartment) {
        throw new Error(`Missing department for ${bundle.departmentKey}.`);
      }

      const materialItems = materialItemsForBundle(bundle);
      const materialInputs = [];
      for (const item of materialItems) {
        materialInputs.push({
          ...item,
          contentUrl: await copyMaterialFile(item.filePath, item.uploadCode, false)
        });
      }

      await connection.beginTransaction();
      try {
        const materialIds = [];
        for (const item of materialInputs) {
          materialIds.push(await ensureMaterial(connection, item, departmentId, creatorId));
        }

        const testId = await ensureTest(connection, bundle, departmentId, creatorId);
        if (materialIds.length === 1) {
          await linkMaterial(connection, testId, materialIds[0]);
        } else {
          await linkMaterials(connection, testId, materialIds);
        }
        await replaceTestQuestions(connection, testId, creatorId, bundle.questions);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      summaries.push({
        ...(await verifyBundle(connection, bundle.code)),
        contentUrls: materialInputs.map((item) => item.contentUrl),
        materialFiles: materialInputs.map((item) => path.relative(root, item.filePath)),
        questionFiles: questionFilesForBundle(bundle).map((filePath) => path.relative(root, filePath))
      });
    }

    const archivedTests = options.archiveOldInputTests
      ? await archiveOldInputTests(connection, summaries.map((summary) => summary.code))
      : 0;
    const archivedSupersededTests = options.archiveSupersededTests
      ? await archiveTestsByCodes(
          connection,
          bundles.flatMap((bundle) => bundle.supersedesCodes ?? []).filter((code) => !summaries.some((summary) => summary.code === code))
        )
      : 0;

    return { dryRun, archivedTests, archivedSupersededTests, items: summaries };
  } finally {
    await connection.end();
  }
}

function parseArgs(argv) {
  const args = new Set(argv);
  const onlyArg = argv.find((arg) => arg.startsWith("--only="));
  return {
    dryRun: args.has("--dry-run"),
    only: onlyArg ? onlyArg.slice("--only=".length).toLowerCase() : "all",
    combined: args.has("--combined"),
    archiveOldInputTests: args.has("--archive-old-input-tests"),
    archiveSupersededTests: args.has("--archive-superseded")
  };
}

async function main() {
  const {
    dryRun,
    only,
    combined,
    archiveOldInputTests: shouldArchiveOldInputTests,
    archiveSupersededTests: shouldArchiveSupersededTests
  } = parseArgs(process.argv.slice(2));
  let bundles = [];
  try {
    bundles = [
    ...(combined
      ? [
          ...(only === "all" || only === "hcns" ? [buildCombinedHcnsBundle()] : []),
          ...(only === "all" || only === "qhse" ? [buildCombinedQhseBundle()] : [])
        ]
      : [
          ...(only === "all" || only === "hcns" ? buildHcnsBundles() : []),
          ...(only === "all" || only === "qhse" ? buildQhseBundles() : [])
        ]),
    ...(only === "all" || only === "procedures" || only === "dieuphoi" || only === "ktvp"
      ? buildGenericProcedureBundles(only === "all" ? "procedures" : only)
      : []),
      ...(only === "ktvp-combined" ? [buildCombinedKtvpBundle()] : []),
      ...(only === "qhse-department" ? [buildQhseDepartmentBundle()] : []),
      ...(only === "all" || only === "ketoan" ? [buildAccountingBundle()] : [])
    ];

    if (!["all", "hcns", "qhse", "procedures", "dieuphoi", "ktvp", "ktvp-combined", "qhse-department", "ketoan"].includes(only)) {
      throw new Error("--only must be all, hcns, qhse, procedures, dieuphoi, ktvp, ktvp-combined, qhse-department, or ketoan.");
    }

    if (!bundles.length) {
      throw new Error("No bundles to import.");
    }

    const result = await importBundles(bundles, dryRun, {
      archiveOldInputTests: shouldArchiveOldInputTests,
      archiveSupersededTests: shouldArchiveSupersededTests
    });
    console.log(JSON.stringify({ only, combined, ...result }, null, 2));
  } finally {
    for (const directory of bundles.flatMap((bundle) => bundle.temporaryDirectories ?? [])) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await rm(path.join(os.tmpdir(), "noop"), { force: true }).catch(() => {});
  });
