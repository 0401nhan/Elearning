import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_DOCX_PATH = path.join(os.homedir(), "Downloads", "Câu hỏi Demo.docx");
const TEST_CODE = "INTERNAL_RULES_DEMO";
const TEST_TITLE = "Câu hỏi Demo - Quy định nội bộ";
const TEST_DESCRIPTION =
  "Bộ câu hỏi demo về Quy định Nội bộ Electric Bird và quy chế xử phạt nội quy công ty.";

const TABLES_TO_CLEAR = [
  "notification_reads",
  "attempt_answers",
  "attempt_question_options",
  "attempt_questions",
  "test_attempts",
  "retake_requests",
  "test_assignments",
  "test_materials",
  "answer_options",
  "questions",
  "question_groups",
  "notifications",
  "tests"
];

const AUTO_INCREMENT_TABLES = [
  "attempt_answers",
  "attempt_question_options",
  "attempt_questions",
  "test_attempts",
  "retake_requests",
  "test_assignments",
  "answer_options",
  "questions",
  "question_groups",
  "notifications",
  "tests"
];

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
      multipleStatements: true,
      charset: "utf8mb4"
    };
  }

  return {
    host: requireEnv("DATABASE_HOST"),
    port: Number(requireEnv("DATABASE_PORT")),
    user: requireEnv("DATABASE_USER"),
    password: requireEnv("DATABASE_PASSWORD"),
    database: requireEnv("DATABASE_NAME"),
    multipleStatements: true,
    charset: "utf8mb4"
  };
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function extractDocx(inputPath) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "eb-question-docx-"));
  const zipPath = path.join(tempDir, "questions.zip");
  const extractDir = path.join(tempDir, "docx");
  await copyFile(inputPath, zipPath);

  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `New-Item -ItemType Directory -Force -Path ${psQuote(extractDir)} | Out-Null; Expand-Archive -LiteralPath ${psQuote(
        zipPath
      )} -DestinationPath ${psQuote(extractDir)} -Force`
    ],
    { stdio: "pipe" }
  );

  return { tempDir, extractDir };
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

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function collapseWhitespace(value) {
  return cleanText(value).replace(/\s+/g, " ").trim();
}

function readParagraphText(paragraphXml) {
  const parts = [];
  const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;

  for (const match of paragraphXml.matchAll(tokenPattern)) {
    if (match[1] !== undefined) {
      parts.push(decodeXml(match[1]));
    } else if (match[0].startsWith("<w:tab")) {
      parts.push("\t");
    } else {
      parts.push("\n");
    }
  }

  return cleanText(parts.join(""));
}

async function readDocxParagraphs(inputPath) {
  const { tempDir, extractDir } = await extractDocx(inputPath);
  try {
    const documentXml = await readFile(path.join(extractDir, "word", "document.xml"), "utf8");
    return Array.from(documentXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g), (match) =>
      readParagraphText(match[0])
    ).filter(Boolean);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function getQuestionGroupName(questionNumber) {
  if (questionNumber <= 15) {
    return "Quy định nội bộ Electric Bird";
  }

  return "Quy chế xử phạt nội quy công ty";
}

function parseOptions(text, questionNumber) {
  const options = [];
  const optionPattern = /(?:^|\n)\s*([A-D])\.\s*([\s\S]*?)(?=\n\s*[A-D]\.|$)/g;

  for (const match of text.matchAll(optionPattern)) {
    options.push({
      label: match[1],
      text: collapseWhitespace(match[2])
    });
  }

  if (options.length !== 4) {
    throw new Error(`Question ${questionNumber}: expected 4 options, got ${options.length}.`);
  }

  return options;
}

function parseExplanation(paragraphs, startIndex) {
  const explanationParts = [];

  for (let index = startIndex; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (/^Giải thích\s*:/i.test(paragraph)) {
      const inlineExplanation = paragraph.replace(/^Giải thích\s*:/i, "").trim();
      if (inlineExplanation) {
        explanationParts.push(inlineExplanation);
      }
      continue;
    }

    explanationParts.push(paragraph);
  }

  return collapseWhitespace(explanationParts.join("\n"));
}

export async function parseQuestionsFromDocx(inputPath) {
  const paragraphs = await readDocxParagraphs(inputPath);
  const questions = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const questionMatch = /^CÂU\s+(\d+)\s*\n([\s\S]+)$/i.exec(paragraphs[index]);
    if (!questionMatch) {
      continue;
    }

    const questionNumber = Number(questionMatch[1]);
    const groupParagraphs = [];
    let nextIndex = index + 1;
    while (nextIndex < paragraphs.length && !/^CÂU\s+\d+/i.test(paragraphs[nextIndex])) {
      groupParagraphs.push(paragraphs[nextIndex]);
      nextIndex += 1;
    }

    const correctIndex = groupParagraphs.findIndex((paragraph) => /^Đáp án đúng\s*:/i.test(paragraph));
    if (correctIndex === -1) {
      throw new Error(`Question ${questionNumber}: missing correct answer.`);
    }

    const correctMatch = /^Đáp án đúng\s*:\s*([A-D])/i.exec(groupParagraphs[correctIndex]);
    if (!correctMatch) {
      throw new Error(`Question ${questionNumber}: invalid correct answer.`);
    }

    const options = parseOptions(groupParagraphs.slice(0, correctIndex).join("\n"), questionNumber).map(
      (option) => ({
        ...option,
        isCorrect: option.label === correctMatch[1].toUpperCase()
      })
    );
    const explanation = parseExplanation(groupParagraphs, correctIndex + 1);

    questions.push({
      number: questionNumber,
      groupName: getQuestionGroupName(questionNumber),
      difficulty: "medium",
      questionText: collapseWhitespace(questionMatch[2]),
      explanation,
      options
    });

    index = nextIndex - 1;
  }

  if (questions.length === 0) {
    throw new Error("No questions found in DOCX.");
  }

  const numbers = questions.map((question) => question.number);
  const duplicates = numbers.filter((number, index) => numbers.indexOf(number) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate question numbers: ${[...new Set(duplicates)].join(", ")}.`);
  }

  questions.sort((left, right) => left.number - right.number);
  return questions;
}

async function fetchExistingTableNames(connection) {
  const [rows] = await connection.query(
    `
    SELECT TABLE_NAME AS tableName
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
    `
  );
  return new Set(rows.map((row) => row.tableName));
}

async function clearExistingTestData(connection) {
  const existingTables = await fetchExistingTableNames(connection);

  for (const tableName of TABLES_TO_CLEAR) {
    if (existingTables.has(tableName)) {
      await connection.query(`DELETE FROM \`${tableName}\``);
    }
  }

  for (const tableName of AUTO_INCREMENT_TABLES) {
    if (existingTables.has(tableName)) {
      await connection.query(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`);
    }
  }
}

async function getAdminCreatorId(connection) {
  const [rows] = await connection.query(
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

  return rows[0]?.id ?? null;
}

async function createTest(connection, creatorId, questions) {
  const questionCount = questions.length;
  const requiredCorrectAnswers = questionCount <= 1 ? questionCount : questionCount - 1;
  const passScore = Number(((requiredCorrectAnswers / questionCount) * 100).toFixed(2));
  const [result] = await connection.execute(
    `
    INSERT INTO tests
      (code, title, department_id, description, question_count, duration_minutes, pass_score,
       max_official_attempts, allow_unlimited_practice, randomize_questions, randomize_answers,
       show_practice_answers, show_official_answers, status, created_by)
    VALUES (?, ?, NULL, ?, ?, 30, ?, 1, 1, 1, 1, 1, 0, 'active', ?)
    `,
    [TEST_CODE, TEST_TITLE, TEST_DESCRIPTION, questionCount, passScore, creatorId]
  );

  return result.insertId;
}

async function createGroups(connection, testId, questions) {
  const countsByGroup = new Map();
  for (const question of questions) {
    countsByGroup.set(question.groupName, (countsByGroup.get(question.groupName) ?? 0) + 1);
  }

  const groupRows = [...countsByGroup.entries()].map(([groupName, count], index) => [
    testId,
    groupName,
    count,
    index + 1
  ]);

  await connection.query(
    "INSERT INTO question_groups (test_id, name, suggested_question_count, sort_order) VALUES ?",
    [groupRows]
  );

  const [rows] = await connection.query("SELECT id, name FROM question_groups WHERE test_id = ?", [testId]);
  return new Map(rows.map((row) => [row.name, row.id]));
}

async function importQuestions(connection, testId, creatorId, questions, groupIdsByName) {
  for (const question of questions) {
    const groupId = groupIdsByName.get(question.groupName);
    if (!groupId) {
      throw new Error(`Missing question group: ${question.groupName}`);
    }

    const [questionResult] = await connection.execute(
      `
      INSERT INTO questions (test_id, group_id, question_text, explanation, difficulty, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      `,
      [testId, groupId, question.questionText, question.explanation, question.difficulty, creatorId]
    );

    await connection.query(
      "INSERT INTO answer_options (question_id, option_label, option_text, is_correct, sort_order) VALUES ?",
      [
        question.options.map((option, optionIndex) => [
          questionResult.insertId,
          option.label,
          option.text,
          option.isCorrect ? 1 : 0,
          optionIndex + 1
        ])
      ]
    );
  }
}

async function readImportSummary(connection) {
  const [rows] = await connection.query(
    `
    SELECT
      t.id AS testId,
      t.code,
      t.title,
      t.question_count AS questionCount,
      COUNT(DISTINCT q.id) AS importedQuestions,
      COUNT(ao.id) AS importedOptions,
      SUM(ao.is_correct = 1) AS correctOptions
    FROM tests t
    LEFT JOIN questions q ON q.test_id = t.id
    LEFT JOIN answer_options ao ON ao.question_id = q.id
    WHERE t.code = ?
    GROUP BY t.id, t.code, t.title, t.question_count
    `,
    [TEST_CODE]
  );
  const [groupRows] = await connection.query(
    `
    SELECT qg.name, COUNT(q.id) AS questionCount
    FROM question_groups qg
    LEFT JOIN questions q ON q.group_id = qg.id
    JOIN tests t ON t.id = qg.test_id
    WHERE t.code = ?
    GROUP BY qg.id, qg.name
    ORDER BY qg.sort_order
    `,
    [TEST_CODE]
  );

  return {
    test: rows[0] ?? null,
    groups: groupRows
  };
}

export async function main(inputPath = process.env.QUESTION_DOCX_PATH || DEFAULT_DOCX_PATH) {
  const resolvedPath = path.resolve(inputPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`DOCX file not found: ${resolvedPath}`);
  }

  await loadEnvFile(".env");
  await loadEnvFile(".env.local");

  const questions = await parseQuestionsFromDocx(resolvedPath);
  const connection = await mysql.createConnection(getDatabaseConfig());

  try {
    await connection.beginTransaction();

    await clearExistingTestData(connection);
    const creatorId = await getAdminCreatorId(connection);
    const testId = await createTest(connection, creatorId, questions);
    const groupIdsByName = await createGroups(connection, testId, questions);
    await importQuestions(connection, testId, creatorId, questions, groupIdsByName);

    await connection.commit();

    const summary = await readImportSummary(connection);
    console.log(
      JSON.stringify(
        {
          source: resolvedPath,
          importedQuestions: questions.length,
          database: summary
        },
        null,
        2
      )
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((error) => {
    console.error("Failed to import questions from DOCX:");
    console.error(error);
    process.exit(1);
  });
}
