import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { canManageQuestions, getCurrentUser } from "@/lib/auth";
import { buildCsv } from "@/lib/csv";
import { queryRows, withTransaction } from "@/lib/db";

type TestRow = RowDataPacket & {
  id: number;
};

type GroupRow = RowDataPacket & {
  id: number;
  name: string;
};

type ExportQuestionRow = RowDataPacket & {
  id: number;
  group_name: string | null;
  difficulty: "easy" | "medium" | "hard";
  is_active: number;
  question_text: string;
  explanation: string | null;
  option_label: string | null;
  option_text: string | null;
  is_correct: number | null;
};

type ExistingQuestionRow = RowDataPacket & {
  question_text: string;
};

type ImportQuestion = {
  rowNumber: number;
  groupName: string | null;
  difficulty: "easy" | "medium" | "hard";
  isActive: boolean;
  questionText: string;
  explanation: string | null;
  options: {
    label: string;
    text: string;
    isCorrect: boolean;
  }[];
};

type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

const REQUIRED_HEADERS = [
  "group_name",
  "difficulty",
  "is_active",
  "question_text",
  "explanation",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option"
];

const OPTION_LABELS = ["A", "B", "C", "D"];

const CSV_HEADERS = [
  "group_name",
  "difficulty",
  "is_active",
  "question_text",
  "explanation",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option"
];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeLooseText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeQuestionText(value: string) {
  return normalizeLooseText(value).replace(/\s+/g, " ");
}

function parseDifficulty(value: string) {
  const normalized = normalizeLooseText(value);

  if (!normalized || normalized === "medium" || normalized === "trung binh") {
    return "medium";
  }

  if (normalized === "easy" || normalized === "de") {
    return "easy";
  }

  if (normalized === "hard" || normalized === "kho") {
    return "hard";
  }

  return null;
}

function parseBoolean(value: string) {
  const normalized = normalizeLooseText(value);

  if (!normalized || ["1", "true", "yes", "y", "active", "dang su dung", "co"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "inactive", "da tat", "khong"].includes(normalized)) {
    return false;
  }

  return null;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(content: string): CsvParseResult {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);

    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = cells[index] ?? "";
      return row;
    }, {});
  });

  return { headers, rows };
}

function validateCsvRows(parsed: CsvParseResult) {
  const errors: string[] = [];
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !parsed.headers.includes(header));

  if (missingHeaders.length) {
    errors.push(`Thiếu cột: ${missingHeaders.join(", ")}.`);
  }

  const questions: ImportQuestion[] = [];

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const questionText = cleanText(row.question_text);
    const difficulty = parseDifficulty(row.difficulty ?? "");
    const isActive = parseBoolean(row.is_active ?? "");
    const correctOption = String(row.correct_option ?? "").trim().toUpperCase();
    const options = OPTION_LABELS
      .map((label) => ({
        label,
        text: String(row[`option_${label.toLowerCase()}`] ?? "").trim(),
        isCorrect: label === correctOption
      }))
      .filter((option) => option.text);

    if (!questionText) {
      errors.push(`Dòng ${rowNumber}: thiếu nội dung câu hỏi.`);
    }

    if (!difficulty) {
      errors.push(`Dòng ${rowNumber}: độ khó phải là easy, medium, hard hoặc Dễ, Trung bình, Khó.`);
    }

    if (isActive === null) {
      errors.push(`Dòng ${rowNumber}: trạng thái phải là true/false hoặc 1/0.`);
    }

    if (options.length < 2) {
      errors.push(`Dòng ${rowNumber}: cần ít nhất 2 đáp án.`);
    }

    if (!OPTION_LABELS.includes(correctOption)) {
      errors.push(`Dòng ${rowNumber}: đáp án đúng phải là A, B, C hoặc D.`);
    } else if (!options.some((option) => option.label === correctOption)) {
      errors.push(`Dòng ${rowNumber}: đáp án đúng ${correctOption} đang bị bỏ trống.`);
    }

    if (questionText && difficulty && isActive !== null && options.length >= 2 && options.some((option) => option.isCorrect)) {
      questions.push({
        rowNumber,
        groupName: cleanText(row.group_name),
        difficulty,
        isActive,
        questionText,
        explanation: cleanText(row.explanation),
        options
      });
    }
  });

  return { errors, questions };
}

async function requireQuestionManager(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && canManageQuestions(currentUser) ? currentUser : null;
}

function mapExportRows(rows: ExportQuestionRow[]) {
  const questions = new Map<number, {
    groupName: string | null;
    difficulty: string;
    isActive: number;
    questionText: string;
    explanation: string | null;
    options: Map<string, { text: string; isCorrect: boolean }>;
  }>();

  rows.forEach((row) => {
    const question = questions.get(row.id) ?? {
      groupName: row.group_name,
      difficulty: row.difficulty,
      isActive: Number(row.is_active),
      questionText: row.question_text,
      explanation: row.explanation,
      options: new Map<string, { text: string; isCorrect: boolean }>()
    };

    if (row.option_label && row.option_text) {
      question.options.set(row.option_label, {
        text: row.option_text,
        isCorrect: Boolean(row.is_correct)
      });
    }

    questions.set(row.id, question);
  });

  return [...questions.values()].map((question) => {
    const correctOption = OPTION_LABELS.find((label) => question.options.get(label)?.isCorrect) ?? "";

    return [
      question.groupName,
      question.difficulty,
      question.isActive ? 1 : 0,
      question.questionText,
      question.explanation,
      question.options.get("A")?.text ?? "",
      question.options.get("B")?.text ?? "",
      question.options.get("C")?.text ?? "",
      question.options.get("D")?.text ?? "",
      correctOption
    ];
  });
}

export async function GET(request: Request) {
  const currentUser = await requireQuestionManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền tải mẫu CSV." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const testId = Number(searchParams.get("testId"));

  if (!Number.isInteger(testId) || testId <= 0) {
    return NextResponse.json({ error: "Bài test không hợp lệ." }, { status: 400 });
  }

  const [testRows, questionRows] = await Promise.all([
    queryRows<(TestRow & { title: string; code: string })[]>(
      "SELECT id, title, code FROM tests WHERE id = ? LIMIT 1",
      [testId]
    ),
    queryRows<ExportQuestionRow[]>(
      `
      SELECT
        q.id,
        qg.name AS group_name,
        q.difficulty,
        q.is_active,
        q.question_text,
        q.explanation,
        ao.option_label,
        ao.option_text,
        ao.is_correct
      FROM questions q
      LEFT JOIN question_groups qg ON qg.id = q.group_id
      LEFT JOIN answer_options ao ON ao.question_id = q.id
      WHERE q.test_id = ?
      ORDER BY q.id, ao.sort_order, ao.option_label
      `,
      [testId]
    )
  ]);

  const test = testRows[0];
  if (!test) {
    return NextResponse.json({ error: "Không tìm thấy bài test." }, { status: 404 });
  }

  const dataRows = mapExportRows(questionRows);
  const rows = dataRows.length
    ? [CSV_HEADERS, ...dataRows]
    : [
        CSV_HEADERS,
        [
          "Nhóm mẫu",
          "medium",
          1,
          "Câu hỏi mẫu?",
          "Giải thích ngắn cho câu hỏi.",
          "Đáp án A",
          "Đáp án B",
          "Đáp án C",
          "Đáp án D",
          "A"
        ]
      ];
  const safeCode = test.code.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
  const filename = `mau-cau-hoi-${safeCode || test.id}.csv`;

  return new NextResponse(buildCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

async function getOrCreateGroupId(
  connection: PoolConnection,
  testId: number,
  groupName: string | null,
  groupCache: Map<string, number>
) {
  if (!groupName) {
    return null;
  }

  const normalizedName = normalizeLooseText(groupName);
  const cachedGroupId = groupCache.get(normalizedName);
  if (cachedGroupId) {
    return cachedGroupId;
  }

  const [existingRows] = await connection.query<GroupRow[]>(
    "SELECT id, name FROM question_groups WHERE test_id = ?",
    [testId]
  );
  const existing = existingRows.find((row) => normalizeLooseText(row.name) === normalizedName);
  if (existing) {
    groupCache.set(normalizedName, Number(existing.id));
    return Number(existing.id);
  }

  const [insertResult] = await connection.query<ResultSetHeader>(
    `
    INSERT INTO question_groups (test_id, name, suggested_question_count, sort_order)
    SELECT ?, ?, 1, COALESCE(MAX(sort_order), 0) + 1
    FROM question_groups
    WHERE test_id = ?
    `,
    [testId, groupName, testId]
  );

  groupCache.set(normalizedName, insertResult.insertId);
  return insertResult.insertId;
}

export async function POST(request: Request) {
  const currentUser = await requireQuestionManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền nhập câu hỏi bằng CSV." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const testId = Number(formData?.get("testId"));
  const file = formData?.get("file");

  if (!Number.isInteger(testId) || testId <= 0) {
    return NextResponse.json({ error: "Bài test không hợp lệ." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Cần chọn file CSV." }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "File nhập phải có định dạng .csv." }, { status: 400 });
  }

  if (file.size > 1024 * 1024 * 2) {
    return NextResponse.json({ error: "File CSV tối đa 2MB." }, { status: 400 });
  }

  const content = await file.text();
  const parsed = parseCsv(content);
  const { errors, questions } = validateCsvRows(parsed);

  if (!questions.length && !errors.length) {
    return NextResponse.json({ error: "File CSV chưa có dòng dữ liệu." }, { status: 400 });
  }

  if (errors.length) {
    return NextResponse.json({ error: "CSV chưa đúng định dạng.", errors: errors.slice(0, 20) }, { status: 400 });
  }

  const result = await withTransaction(async (connection) => {
    const [testRows] = await connection.query<TestRow[]>("SELECT id FROM tests WHERE id = ? LIMIT 1", [testId]);
    if (!testRows[0]) {
      return { status: 404 as const, body: { error: "Không tìm thấy bài test." } };
    }

    const [existingRows] = await connection.query<ExistingQuestionRow[]>(
      "SELECT question_text FROM questions WHERE test_id = ?",
      [testId]
    );
    const seenQuestionTexts = new Set(existingRows.map((row) => normalizeQuestionText(row.question_text)));
    const uniqueQuestions = questions.filter((question) => {
      const normalizedQuestionText = normalizeQuestionText(question.questionText);

      if (seenQuestionTexts.has(normalizedQuestionText)) {
        return false;
      }

      seenQuestionTexts.add(normalizedQuestionText);
      return true;
    });
    const skippedDuplicateCount = questions.length - uniqueQuestions.length;

    if (!uniqueQuestions.length) {
      return {
        status: 200 as const,
        body: {
          ok: true,
          importedCount: 0,
          skippedDuplicateCount,
          message: `Không có câu hỏi mới. Đã bỏ qua ${skippedDuplicateCount} câu hỏi trùng.`
        }
      };
    }

    const groupCache = new Map<string, number>();
    let importedCount = 0;

    for (const question of uniqueQuestions) {
      const groupId = await getOrCreateGroupId(connection, testId, question.groupName, groupCache);
      const [questionResult] = await connection.query<ResultSetHeader>(
        `
        INSERT INTO questions
          (test_id, group_id, question_text, explanation, difficulty, is_active, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          testId,
          groupId,
          question.questionText,
          question.explanation,
          question.difficulty,
          question.isActive ? 1 : 0,
          currentUser.id
        ]
      );

      await connection.query(
        `
        INSERT INTO answer_options
          (question_id, option_label, option_text, is_correct, sort_order)
        VALUES ?
        `,
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

      importedCount += 1;
    }

    return {
      status: 201 as const,
      body: {
        ok: true,
        importedCount,
        skippedDuplicateCount,
        message:
          skippedDuplicateCount > 0
            ? `Đã nhập ${importedCount} câu hỏi mới, bỏ qua ${skippedDuplicateCount} câu hỏi trùng.`
            : `Đã nhập ${importedCount} câu hỏi từ CSV.`
      }
    };
  });

  return NextResponse.json(result.body, { status: result.status });
}
