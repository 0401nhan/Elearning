import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { canManageAssignments, getCurrentUser } from "@/lib/auth";
import { queryRows, withTransaction } from "@/lib/db";

type TestRow = RowDataPacket & {
  id: number;
  title: string;
  pass_score: string | number;
  department_id: number | null;
  department_name: string | null;
};

type DepartmentRow = RowDataPacket & {
  id: number;
  name: string;
};

type EmployeeAssignmentRow = RowDataPacket & {
  id: number;
  employee_code: string;
  full_name: string;
  phone: string;
  department_id: number;
  department_name: string;
  position_title: string | null;
  work_area: string | null;
  assignment_id: number | null;
  assignment_status: string | null;
  assigned_at: string | null;
  due_at: string | null;
  read_progress_percent: string | number | null;
  practice_attempt_count: number | null;
  official_score: string | number | null;
};

type CountRow = RowDataPacket & {
  total: number;
};

type SummaryRow = RowDataPacket & {
  total_employees: number;
  assigned_count: number | null;
  unassigned_count: number | null;
  not_started_count: number | null;
  studying_count: number | null;
  passed_count: number | null;
  failed_count: number | null;
};

const ASSIGNMENT_STATUSES = new Set(["not_started", "studying", "passed", "failed"]);

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

function parseEmployeeIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  return [...new Set(ids)];
}

function parseDueAt(value: unknown) {
  const text = cleanText(value);
  if (!text) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  return `${text} 23:59:59`;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function mapEmployee(row: EmployeeAssignmentRow) {
  return {
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    phone: row.phone,
    departmentId: row.department_id,
    departmentName: row.department_name,
    positionTitle: row.position_title,
    workArea: row.work_area,
    assignmentId: row.assignment_id,
    assignmentStatus: row.assignment_status,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    readProgressPercent: toNumber(row.read_progress_percent),
    practiceAttemptCount: row.practice_attempt_count ?? 0,
    officialScore: toNumber(row.official_score)
  };
}

async function requireAssignmentManager(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && canManageAssignments(currentUser) ? currentUser : null;
}

export async function GET(request: Request) {
  const currentUser = await requireAssignmentManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền giao bài test." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedTestId = Number(searchParams.get("testId") ?? 0);
  const departmentId = Number(searchParams.get("departmentId") ?? 0);
  const search = cleanText(searchParams.get("search"));
  const status = searchParams.get("status") ?? "";
  const requestedPage = getIntegerParam(searchParams.get("page"), 1, 1, 10000);
  const pageSize = 10;

  const [tests, departments] = await Promise.all([
    queryRows<TestRow[]>(
      `
      SELECT
        t.id,
        t.title,
        t.pass_score,
        t.department_id,
        d.name AS department_name
      FROM tests t
      LEFT JOIN departments d ON d.id = t.department_id
      WHERE t.status = 'active'
      ORDER BY d.id, t.title
      `
    ),
    queryRows<DepartmentRow[]>("SELECT id, name FROM departments ORDER BY id")
  ]);

  const selectedTest = tests.find((test) => test.id === requestedTestId) ?? tests[0] ?? null;
  const selectedTestId = selectedTest?.id ?? 0;

  if (!selectedTestId) {
    return NextResponse.json({
      tests: tests.map((test) => ({ ...test, pass_score: toNumber(test.pass_score) })),
      departments,
      selectedTestId: null,
      selectedTestPassScore: null,
      employees: [],
      summary: {
        totalEmployees: 0,
        assignedCount: 0,
        unassignedCount: 0,
        notStartedCount: 0,
        studyingCount: 0,
        passedCount: 0,
        failedCount: 0
      },
      pagination: {
        page: 1,
        pageSize,
        total: 0,
        totalPages: 1
      }
    });
  }

  const baseWhere = [
    "e.is_active = 1",
    `NOT EXISTS (
      SELECT 1
      FROM employee_roles admin_er
      JOIN roles admin_role ON admin_role.id = admin_er.role_id
      WHERE admin_er.employee_id = e.id AND admin_role.code = 'admin'
    )`
  ];
  const baseValues: (string | number)[] = [];

  if (departmentId > 0) {
    baseWhere.push("e.department_id = ?");
    baseValues.push(departmentId);
  }

  if (search) {
    baseWhere.push("(e.employee_code LIKE ? OR e.full_name LIKE ? OR e.phone LIKE ? OR e.username LIKE ?)");
    const like = `%${search}%`;
    baseValues.push(like, like, like, like);
  }

  const statusWhere: string[] = [];
  if (status === "assigned") {
    statusWhere.push("ta.id IS NOT NULL");
  } else if (status === "unassigned") {
    statusWhere.push("ta.id IS NULL");
  } else if (ASSIGNMENT_STATUSES.has(status)) {
    statusWhere.push("ta.status = ?");
    baseValues.push(status);
  }

  const whereSql = [...baseWhere, ...statusWhere].length ? `WHERE ${[...baseWhere, ...statusWhere].join(" AND ")}` : "";
  const joinSql = "LEFT JOIN test_assignments ta ON ta.employee_id = e.id AND ta.test_id = ?";
  const queryValues = [selectedTestId, ...baseValues];

  const countRows = await queryRows<CountRow[]>(
    `
    SELECT COUNT(*) AS total
    FROM employees e
    JOIN departments d ON d.id = e.department_id
    ${joinSql}
    ${whereSql}
    `,
    queryValues
  );

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const [summaryRows, employeeRows] = await Promise.all([
    queryRows<SummaryRow[]>(
      `
      SELECT
        COUNT(*) AS total_employees,
        SUM(ta.id IS NOT NULL) AS assigned_count,
        SUM(ta.id IS NULL) AS unassigned_count,
        SUM(ta.status = 'not_started') AS not_started_count,
        SUM(ta.status = 'studying') AS studying_count,
        SUM(ta.status = 'passed') AS passed_count,
        SUM(ta.status = 'failed') AS failed_count
      FROM employees e
      JOIN departments d ON d.id = e.department_id
      ${joinSql}
      WHERE ${baseWhere.join(" AND ")}
      `,
      [selectedTestId, ...baseValues.slice(0, baseValues.length - (ASSIGNMENT_STATUSES.has(status) ? 1 : 0))]
    ),
    queryRows<EmployeeAssignmentRow[]>(
      `
      SELECT
        e.id,
        e.employee_code,
        e.full_name,
        e.phone,
        e.department_id,
        d.name AS department_name,
        e.position_title,
        e.work_area,
        ta.id AS assignment_id,
        ta.status AS assignment_status,
        ta.assigned_at,
        ta.due_at,
        ta.read_progress_percent,
        ta.practice_attempt_count,
        ta.official_score
      FROM employees e
      JOIN departments d ON d.id = e.department_id
      ${joinSql}
      ${whereSql}
      ORDER BY
        ta.id IS NULL DESC,
        d.id ASC,
        e.full_name ASC
      LIMIT ${pageSize} OFFSET ${offset}
      `,
      queryValues
    )
  ]);

  const summary = summaryRows[0];

  return NextResponse.json({
    tests: tests.map((test) => ({ ...test, pass_score: toNumber(test.pass_score) })),
    departments,
    selectedTestId,
    selectedTestPassScore: toNumber(selectedTest.pass_score),
    employees: employeeRows.map(mapEmployee),
    summary: {
      totalEmployees: Number(summary?.total_employees ?? 0),
      assignedCount: Number(summary?.assigned_count ?? 0),
      unassignedCount: Number(summary?.unassigned_count ?? 0),
      notStartedCount: Number(summary?.not_started_count ?? 0),
      studyingCount: Number(summary?.studying_count ?? 0),
      passedCount: Number(summary?.passed_count ?? 0),
      failedCount: Number(summary?.failed_count ?? 0)
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
  const currentUser = await requireAssignmentManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền giao bài test hoặc gửi nhắc nhở." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "assign");
  const testId = Number(body?.testId);
  const employeeIds = parseEmployeeIds(body?.employeeIds);
  const dueAt = parseDueAt(body?.dueAt);
  const sendNotification = Boolean(body?.sendNotification);

  if (!testId || !employeeIds.length) {
    return NextResponse.json({ error: "Vui lòng chọn bài test và ít nhất 1 nhân sự." }, { status: 400 });
  }

  const testRows = await queryRows<(RowDataPacket & { title: string })[]>(
    "SELECT title FROM tests WHERE id = ? AND status = 'active' LIMIT 1",
    [testId]
  );
  const testTitle = testRows[0]?.title;

  if (!testTitle) {
    return NextResponse.json({ error: "Bài test không tồn tại hoặc chưa được áp dụng." }, { status: 400 });
  }

  const result = await withTransaction(async (connection) => {
    if (action === "remind") {
      await connection.query("INSERT INTO notifications (employee_id, title, body, type) VALUES ?", [
        employeeIds.map((employeeId) => [
          employeeId,
          `Nhắc hoàn thành ${testTitle}`,
          `Bạn có bài test ${testTitle} cần hoàn thành. Vui lòng đọc tài liệu và làm bài theo hạn được giao.`,
          "assignment"
        ])
      ]);

      return { assignedCount: 0, remindedCount: employeeIds.length };
    }

    await connection.query(
      `
      INSERT INTO test_assignments
        (employee_id, test_id, assigned_by, due_at, status)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        assigned_by = VALUES(assigned_by),
        due_at = VALUES(due_at),
        updated_at = CURRENT_TIMESTAMP
      `,
      [employeeIds.map((employeeId) => [employeeId, testId, currentUser.id, dueAt, "not_started"])]
    );

    if (sendNotification) {
      await connection.query("INSERT INTO notifications (employee_id, title, body, type) VALUES ?", [
        employeeIds.map((employeeId) => [
          employeeId,
          `Bạn có bài test ${testTitle} cần hoàn thành`,
          dueAt
            ? `Hạn hoàn thành: ${String(body?.dueAt)}. Vui lòng đọc tài liệu trước khi làm chính thức.`
            : "Vui lòng đọc tài liệu trước khi làm chính thức.",
          "assignment"
        ])
      ]);
    }

    return { assignedCount: employeeIds.length, remindedCount: sendNotification ? employeeIds.length : 0 };
  });

  return NextResponse.json(result);
}
