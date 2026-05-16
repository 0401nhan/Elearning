import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { queryRows, withTransaction } from "@/lib/db";

type QuestionRow = RowDataPacket & {
  id: number;
  test_id: number;
  test_title: string;
  group_id: number | null;
  group_name: string | null;
  question_text: string;
  explanation: string | null;
  difficulty: string;
  is_active: number;
  updated_at: string;
  option_id: number | null;
  option_label: string | null;
  option_text: string | null;
  is_correct: number | null;
};

type TestRow = RowDataPacket & {
  id: number;
  code: string;
  title: string;
  status: string;
};

type GroupRow = RowDataPacket & {
  id: number;
  test_id: number;
  name: string;
  suggested_question_count: number;
  sort_order: number;
};

type CountRow = RowDataPacket & {
  total: number;
};

type SummaryRow = RowDataPacket & {
  total: number;
  active: number | null;
  inactive: number | null;
};

type ParsedOption = {
  label: string;
  text: string;
  isCorrect: boolean;
};

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getIntegerParam(value: string | null, fallback: number, min: number, max: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(numberValue, min), max);
}

function getDifficulty(value: unknown) {
  const difficulty = String(value ?? "medium").trim();
  return DIFFICULTIES.has(difficulty) ? difficulty : "medium";
}

function parseOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const options = new Map<string, ParsedOption>();

  value.forEach((item, index) => {
    const fallbackLabel = String.fromCharCode(65 + index);
    const label = String(item?.label ?? fallbackLabel).trim().toUpperCase().slice(0, 1);
    const text = String(item?.text ?? "").trim();

    if (!label || !text) {
      return;
    }

    options.set(label, {
      label,
      text,
      isCorrect: Boolean(item?.isCorrect)
    });
  });

  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function validateOptions(options: ParsedOption[]) {
  if (options.length < 2) {
    return "Cần ít nhất 2 đáp án cho mỗi câu hỏi.";
  }

  if (options.filter((option) => option.isCorrect).length !== 1) {
    return "Mỗi câu hỏi phải có đúng 1 đáp án đúng.";
  }

  return null;
}

function mapQuestions(rows: QuestionRow[]) {
  return Array.from(
    rows
      .reduce((map, row) => {
        const question = map.get(row.id) ?? {
          id: row.id,
          testId: row.test_id,
          testTitle: row.test_title,
          groupId: row.group_id,
          groupName: row.group_name,
          questionText: row.question_text,
          explanation: row.explanation,
          difficulty: row.difficulty,
          isActive: Boolean(row.is_active),
          updatedAt: row.updated_at,
          options: [] as {
            id: number;
            label: string;
            text: string;
            isCorrect: boolean;
          }[]
        };

        if (row.option_id && row.option_label && row.option_text) {
          question.options.push({
            id: row.option_id,
            label: row.option_label,
            text: row.option_text,
            isCorrect: Boolean(row.is_correct)
          });
        }

        map.set(row.id, question);
        return map;
      }, new Map<number, {
        id: number;
        testId: number;
        testTitle: string;
        groupId: number | null;
        groupName: string | null;
        questionText: string;
        explanation: string | null;
        difficulty: string;
        isActive: boolean;
        updatedAt: string;
        options: {
          id: number;
          label: string;
          text: string;
          isCorrect: boolean;
        }[];
      }>())
      .values()
  );
}

async function requireAdmin(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && isAdmin(currentUser) ? currentUser : null;
}

export async function GET(request: Request) {
  const currentUser = await requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Chỉ admin được quản lý ngân hàng câu hỏi." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = cleanText(searchParams.get("search"));
  const testId = Number(searchParams.get("testId") ?? 0);
  const groupId = Number(searchParams.get("groupId") ?? 0);
  const difficulty = searchParams.get("difficulty") ?? "";
  const status = searchParams.get("status") ?? "";
  const requestedPage = getIntegerParam(searchParams.get("page"), 1, 1, 10000);
  const pageSize = 10;

  const where: string[] = [];
  const values: (string | number)[] = [];

  if (search) {
    where.push("(q.question_text LIKE ? OR q.explanation LIKE ? OR qg.name LIKE ?)");
    const like = `%${search}%`;
    values.push(like, like, like);
  }

  if (testId > 0) {
    where.push("q.test_id = ?");
    values.push(testId);
  }

  if (groupId > 0) {
    where.push("q.group_id = ?");
    values.push(groupId);
  }

  if (DIFFICULTIES.has(difficulty)) {
    where.push("q.difficulty = ?");
    values.push(difficulty);
  }

  if (status === "active") {
    where.push("q.is_active = 1");
  } else if (status === "inactive") {
    where.push("q.is_active = 0");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows, summaryRows, tests, groups] = await Promise.all([
    queryRows<CountRow[]>(
      `
      SELECT COUNT(DISTINCT q.id) AS total
      FROM questions q
      JOIN tests t ON t.id = q.test_id
      LEFT JOIN question_groups qg ON qg.id = q.group_id
      ${whereSql}
      `,
      values
    ),
    queryRows<SummaryRow[]>(
      `
      SELECT
        COUNT(DISTINCT q.id) AS total,
        SUM(q.is_active = 1) AS active,
        SUM(q.is_active = 0) AS inactive
      FROM questions q
      JOIN tests t ON t.id = q.test_id
      LEFT JOIN question_groups qg ON qg.id = q.group_id
      ${whereSql}
      `,
      values
    ),
    queryRows<TestRow[]>("SELECT id, code, title, status FROM tests ORDER BY FIELD(status, 'active', 'draft', 'archived'), title"),
    queryRows<GroupRow[]>(
      `
      SELECT id, test_id, name, suggested_question_count, sort_order
      FROM question_groups
      ORDER BY test_id, sort_order, name
      `
    )
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const questionIds = await queryRows<(RowDataPacket & { id: number })[]>(
    `
    SELECT q.id
    FROM questions q
    JOIN tests t ON t.id = q.test_id
    LEFT JOIN question_groups qg ON qg.id = q.group_id
    ${whereSql}
    GROUP BY q.id, q.updated_at
    ORDER BY q.updated_at DESC, q.id DESC
    LIMIT ${pageSize} OFFSET ${offset}
    `,
    values
  );

  const ids = questionIds.map((item) => item.id);
  const rows = ids.length
    ? await queryRows<QuestionRow[]>(
        `
        SELECT
          q.id,
          q.test_id,
          t.title AS test_title,
          q.group_id,
          qg.name AS group_name,
          q.question_text,
          q.explanation,
          q.difficulty,
          q.is_active,
          q.updated_at,
          ao.id AS option_id,
          ao.option_label,
          ao.option_text,
          ao.is_correct
        FROM questions q
        JOIN tests t ON t.id = q.test_id
        LEFT JOIN question_groups qg ON qg.id = q.group_id
        LEFT JOIN answer_options ao ON ao.question_id = q.id
        WHERE q.id IN (?)
        ORDER BY FIELD(q.id, ${ids.join(",")}), ao.sort_order, ao.option_label
        `,
        [ids]
      )
    : [];

  const summary = summaryRows[0];

  return NextResponse.json({
    questions: mapQuestions(rows),
    tests,
    groups: groups.map((group) => ({
      id: group.id,
      testId: group.test_id,
      name: group.name,
      suggestedQuestionCount: group.suggested_question_count,
      sortOrder: group.sort_order
    })),
    summary: {
      total: Number(summary?.total ?? 0),
      active: Number(summary?.active ?? 0),
      inactive: Number(summary?.inactive ?? 0)
    },
    pagination: {
      page,
      pageSize,
      total,
      totalPages
    }
  });
}

export async function POST(request: Request) {
  const currentUser = await requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Chỉ admin được thêm câu hỏi." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const testId = Number(body?.testId);
  const groupId = Number(body?.groupId) > 0 ? Number(body?.groupId) : null;
  const questionText = String(body?.questionText ?? "").trim();
  const explanation = cleanText(body?.explanation);
  const difficulty = getDifficulty(body?.difficulty);
  const isActive = body?.isActive === undefined ? true : Boolean(body.isActive);
  const options = parseOptions(body?.options);
  const optionError = validateOptions(options);

  if (!testId || !questionText) {
    return NextResponse.json({ error: "Bài test và nội dung câu hỏi là bắt buộc." }, { status: 400 });
  }

  if (optionError) {
    return NextResponse.json({ error: optionError }, { status: 400 });
  }

  const questionId = await withTransaction(async (connection) => {
    const [questionResult] = await connection.execute<ResultSetHeader>(
      `
      INSERT INTO questions
        (test_id, group_id, question_text, explanation, difficulty, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [testId, groupId, questionText, explanation, difficulty, isActive ? 1 : 0, currentUser.id]
    );

    await connection.query("INSERT INTO answer_options (question_id, option_label, option_text, is_correct, sort_order) VALUES ?", [
      options.map((option, index) => [
        questionResult.insertId,
        option.label,
        option.text,
        option.isCorrect ? 1 : 0,
        index + 1
      ])
    ]);

    return questionResult.insertId;
  });

  return NextResponse.json({ questionId }, { status: 201 });
}
