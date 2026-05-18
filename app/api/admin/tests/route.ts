import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { canManageAssignments, getCurrentUser } from "@/lib/auth";
import { queryRows, toNumber, withTransaction } from "@/lib/db";

type TestRow = RowDataPacket & {
  id: number;
  code: string;
  title: string;
  department_id: number | null;
  department_name: string | null;
  description: string | null;
  question_count: number;
  duration_minutes: number;
  pass_score: string | number;
  max_official_attempts: number;
  allow_unlimited_practice: number;
  randomize_questions: number;
  randomize_answers: number;
  show_practice_answers: number;
  show_official_answers: number;
  status: string;
  created_at: string;
  updated_at: string;
  active_question_count: number;
  material_count: number;
  material_types: string | null;
  material_ids: string | null;
  assignment_count: number;
};

type DepartmentRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
};

type MaterialRow = RowDataPacket & {
  id: number;
  title: string;
  material_type: string;
  department_id: number | null;
  department_name: string | null;
};

type CountRow = RowDataPacket & {
  total: number;
};

type SummaryRow = RowDataPacket & {
  total: number;
  active: number | null;
  draft: number | null;
  archived: number | null;
  total_questions: number | null;
};

const TEST_STATUSES = new Set(["draft", "active", "archived"]);

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

function getIntegerField(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(numberValue, min), max);
}

function getDecimalField(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(numberValue, min), max);
}

function getStatus(value: unknown) {
  const status = String(value ?? "active").trim();
  return TEST_STATUSES.has(status) ? status : "active";
}

function parseMaterialIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  return [...new Set(ids)];
}

function mapTest(row: TestRow) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    departmentId: row.department_id,
    departmentName: row.department_name,
    description: row.description,
    questionCount: row.question_count,
    durationMinutes: row.duration_minutes,
    passScore: toNumber(row.pass_score) ?? 80,
    maxOfficialAttempts: row.max_official_attempts,
    allowUnlimitedPractice: Boolean(row.allow_unlimited_practice),
    randomizeQuestions: Boolean(row.randomize_questions),
    randomizeAnswers: Boolean(row.randomize_answers),
    showPracticeAnswers: Boolean(row.show_practice_answers),
    showOfficialAnswers: Boolean(row.show_official_answers),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeQuestionCount: Number(row.active_question_count ?? 0),
    materialCount: Number(row.material_count ?? 0),
    materialTypes: row.material_types ? row.material_types.split(",").filter(Boolean) : [],
    materialIds: row.material_ids ? row.material_ids.split(",").map(Number).filter(Boolean) : [],
    assignmentCount: Number(row.assignment_count ?? 0)
  };
}

async function requireTestManager(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && canManageAssignments(currentUser) ? currentUser : null;
}

export async function GET(request: Request) {
  const currentUser = await requireTestManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền quản lý bài test." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = cleanText(searchParams.get("search"));
  const departmentId = Number(searchParams.get("departmentId") ?? 0);
  const status = searchParams.get("status") ?? "";
  const requestedPage = getIntegerParam(searchParams.get("page"), 1, 1, 10000);
  const pageSize = 10;

  const where: string[] = [];
  const values: (string | number)[] = [];

  if (search) {
    where.push("(t.code LIKE ? OR t.title LIKE ? OR t.description LIKE ?)");
    const like = `%${search}%`;
    values.push(like, like, like);
  }

  if (departmentId > 0) {
    where.push("t.department_id = ?");
    values.push(departmentId);
  }

  if (TEST_STATUSES.has(status)) {
    where.push("t.status = ?");
    values.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows, summaryRows, departments, materials] = await Promise.all([
    queryRows<CountRow[]>(`SELECT COUNT(*) AS total FROM tests t ${whereSql}`, values),
    queryRows<SummaryRow[]>(
      `
      SELECT
        COUNT(*) AS total,
        SUM(t.status = 'active') AS active,
        SUM(t.status = 'draft') AS draft,
        SUM(t.status = 'archived') AS archived,
        SUM(t.question_count) AS total_questions
      FROM tests t
      ${whereSql}
      `,
      values
    ),
    queryRows<DepartmentRow[]>("SELECT id, code, name FROM departments ORDER BY id"),
    queryRows<MaterialRow[]>(
      `
      SELECT
        m.id,
        m.title,
        m.material_type,
        m.department_id,
        d.name AS department_name
      FROM training_materials m
      LEFT JOIN departments d ON d.id = m.department_id
      WHERE m.is_active = 1
      ORDER BY d.id, m.title
      `
    )
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const tests = await queryRows<TestRow[]>(
    `
    SELECT
      t.id,
      t.code,
      t.title,
      t.department_id,
      d.name AS department_name,
      t.description,
      t.question_count,
      t.duration_minutes,
      t.pass_score,
      t.max_official_attempts,
      t.allow_unlimited_practice,
      t.randomize_questions,
      t.randomize_answers,
      t.show_practice_answers,
      t.show_official_answers,
      t.status,
      t.created_at,
      t.updated_at,
      COUNT(DISTINCT CASE WHEN q.is_active = 1 THEN q.id END) AS active_question_count,
      COUNT(DISTINCT tm.material_id) AS material_count,
      GROUP_CONCAT(DISTINCT m.material_type ORDER BY m.material_type) AS material_types,
      GROUP_CONCAT(DISTINCT tm.material_id ORDER BY tm.material_id) AS material_ids,
      COUNT(DISTINCT ta.id) AS assignment_count
    FROM tests t
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN questions q ON q.test_id = t.id
    LEFT JOIN test_materials tm ON tm.test_id = t.id
    LEFT JOIN training_materials m ON m.id = tm.material_id
    LEFT JOIN test_assignments ta ON ta.test_id = t.id
    ${whereSql}
    GROUP BY
      t.id,
      t.code,
      t.title,
      t.department_id,
      d.name,
      t.description,
      t.question_count,
      t.duration_minutes,
      t.pass_score,
      t.max_official_attempts,
      t.allow_unlimited_practice,
      t.randomize_questions,
      t.randomize_answers,
      t.show_practice_answers,
      t.show_official_answers,
      t.status,
      t.created_at,
      t.updated_at
    ORDER BY
      FIELD(t.status, 'active', 'draft', 'archived'),
      t.updated_at DESC,
      t.id DESC
    LIMIT ${pageSize} OFFSET ${offset}
    `,
    values
  );

  const summary = summaryRows[0];

  return NextResponse.json({
    tests: tests.map(mapTest),
    departments,
    materials,
    summary: {
      total: Number(summary?.total ?? 0),
      active: Number(summary?.active ?? 0),
      draft: Number(summary?.draft ?? 0),
      archived: Number(summary?.archived ?? 0),
      totalQuestions: Number(summary?.total_questions ?? 0)
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
  const currentUser = await requireTestManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền tạo bài test." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const code = String(body?.code ?? "").trim().toUpperCase();
  const title = String(body?.title ?? "").trim();
  const departmentId = Number(body?.departmentId) > 0 ? Number(body?.departmentId) : null;
  const description = cleanText(body?.description);
  const questionCount = getIntegerField(body?.questionCount, 40, 1, 300);
  const durationMinutes = getIntegerField(body?.durationMinutes, 20, 1, 600);
  const passScore = getDecimalField(body?.passScore, 80, 0, 100);
  const maxOfficialAttempts = getIntegerField(body?.maxOfficialAttempts, 1, 1, 20);
  const status = getStatus(body?.status);
  const materialIds = parseMaterialIds(body?.materialIds);

  if (!code || !title) {
    return NextResponse.json({ error: "Mã bài test và tên bài test là bắt buộc." }, { status: 400 });
  }

  try {
    const testId = await withTransaction(async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `
        INSERT INTO tests
          (code, title, department_id, description, question_count, duration_minutes, pass_score,
           max_official_attempts, allow_unlimited_practice, randomize_questions, randomize_answers,
           show_practice_answers, show_official_answers, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          code,
          title,
          departmentId,
          description,
          questionCount,
          durationMinutes,
          passScore,
          maxOfficialAttempts,
          body?.allowUnlimitedPractice ? 1 : 0,
          body?.randomizeQuestions ? 1 : 0,
          body?.randomizeAnswers ? 1 : 0,
          body?.showPracticeAnswers ? 1 : 0,
          body?.showOfficialAnswers ? 1 : 0,
          status,
          currentUser.id
        ]
      );

      if (materialIds.length) {
        await connection.query("INSERT INTO test_materials (test_id, material_id, sort_order) VALUES ?", [
          materialIds.map((materialId, index) => [result.insertId, materialId, index + 1])
        ]);
      }

      return result.insertId;
    });

    return NextResponse.json({ testId }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "Mã bài test đã tồn tại." }, { status: 409 });
    }

    throw error;
  }
}
