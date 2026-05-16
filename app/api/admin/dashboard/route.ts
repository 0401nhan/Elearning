import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { canViewPeopleResults, getCurrentUser, isAdmin } from "@/lib/auth";
import { queryRows, toNumber } from "@/lib/db";

type MetricsRow = RowDataPacket & {
  total_assigned: number;
  completed: string | number;
  not_completed: string | number;
  passed: string | number;
  failed: string | number;
  average_score: string | number | null;
  average_practice_attempts: string | number | null;
};

type ResultRow = RowDataPacket & {
  assignment_id: number;
  full_name: string;
  phone: string;
  department_name: string;
  position_title: string | null;
  hire_date: string | null;
  test_title: string;
  pass_score: string | number;
  practice_attempt_count: number;
  official_score: string | number | null;
  time_spent_seconds: number | null;
  latest_activity_at: string | null;
  latest_activity_mode: string | null;
  latest_activity_is_open: number | null;
  assignment_status: string;
  retake_reviewer: string | null;
};

type WrongQuestionRow = RowDataPacket & {
  question_id: number;
  wrong_count: number;
  question_text: string;
};

type DepartmentScoreRow = RowDataPacket & {
  department_name: string;
  average_score: string | number | null;
};

type CompletionTrendRow = RowDataPacket & {
  bucket_date: string;
  completed: string | number;
  total: string | number;
};

type CountRow = RowDataPacket & {
  total: number;
};

type DepartmentOptionRow = RowDataPacket & {
  id: number;
  name: string;
};

type TestOptionRow = RowDataPacket & {
  id: number;
  title: string;
};

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function statusLabelPlain(status: string) {
  if (status === "passed") return "Đạt";
  if (status === "failed") return "Chưa đạt";
  if (status === "studying") return "Đang học";
  return "Chưa làm";
}

function activityLabel(mode: string | null, isOpen: number | null) {
  if (!mode) return "";
  if (mode === "official") return isOpen ? "Đang làm chính thức" : "Nộp chính thức";
  return "Làm thử";
}

function toResultsCsv(rows: ResultRow[]) {
  const header = [
    "Ho ten",
    "So dien thoai",
    "Phong ban",
    "Vi tri",
    "Ngay vao lam",
    "Bai test",
    "Diem dat",
    "So lan lam thu",
    "Diem chinh thuc",
    "Thoi gian lam bai",
    "Hoat dong moi nhat",
    "Thoi diem hoat dong",
    "Trang thai",
    "Nguoi duyet lam lai"
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.full_name,
        row.phone,
        row.department_name,
        row.position_title ?? "",
        row.hire_date ?? "",
        row.test_title,
        row.pass_score !== null ? `${toNumber(row.pass_score)}/100` : "",
        row.practice_attempt_count,
        row.official_score !== null ? `${toNumber(row.official_score)}/100` : "",
        row.time_spent_seconds ? `${Math.round(row.time_spent_seconds / 60)} phut` : "",
        activityLabel(row.latest_activity_mode, row.latest_activity_is_open),
        row.latest_activity_at ?? "",
        statusLabelPlain(row.assignment_status),
        row.retake_reviewer ?? ""
      ]
        .map(csvCell)
        .join(",")
    )
  ];

  return `\uFEFF${lines.join("\n")}`;
}

function getIntegerParam(value: string | null, fallback: number, min: number, max: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(numberValue, min), max);
}

function cleanText(value: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function isDateText(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  if (!canViewPeopleResults(employee)) {
    return NextResponse.json({ error: "Không có quyền xem kết quả nhân sự." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";
  const isCsv = format === "csv";
  const requestedPage = getIntegerParam(searchParams.get("page"), 1, 1, 10000);
  const pageSize = 10;
  const departmentId = Number(searchParams.get("departmentId") ?? 0);
  const testId = Number(searchParams.get("testId") ?? 0);
  const status = cleanText(searchParams.get("status"));
  const timeRange = searchParams.get("timeRange") ?? "30";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const search = cleanText(searchParams.get("search"));
  const filterSql: string[] = [];
  const filterValues: (string | number)[] = [];
  const allowedStatuses = new Set(["not_started", "studying", "passed", "failed"]);
  const activityDateExpression =
    "COALESCE((SELECT MAX(COALESCE(activity_attempt.submitted_at, activity_attempt.started_at)) FROM test_attempts activity_attempt WHERE activity_attempt.assignment_id = ta.id), ta.completed_at, ta.assigned_at)";

  if (isAdmin(employee)) {
    if (departmentId > 0) {
      filterSql.push("e.department_id = ?");
      filterValues.push(departmentId);
    }
  } else {
    filterSql.push("e.department_id = ?");
    filterValues.push(employee.departmentId);
  }

  if (status && allowedStatuses.has(status)) {
    filterSql.push("ta.status = ?");
    filterValues.push(status);
  }

  if (testId > 0) {
    filterSql.push("t.id = ?");
    filterValues.push(testId);
  }

  if (timeRange === "7") {
    filterSql.push(`${activityDateExpression} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
  } else if (timeRange === "30") {
    filterSql.push(`${activityDateExpression} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
  } else if (timeRange === "custom") {
    if (isDateText(dateFrom)) {
      filterSql.push(`${activityDateExpression} >= ?`);
      filterValues.push(`${dateFrom} 00:00:00`);
    }

    if (isDateText(dateTo)) {
      filterSql.push(`${activityDateExpression} <= ?`);
      filterValues.push(`${dateTo} 23:59:59`);
    }
  }

  if (search) {
    filterSql.push("(e.full_name LIKE ? OR e.phone LIKE ? OR t.title LIKE ?)");
    const like = `%${search}%`;
    filterValues.push(like, like, like);
  }

  const whereSql = filterSql.length ? `WHERE ${filterSql.join(" AND ")}` : "";
  const wrongQuestionWhereSql = filterSql.length
    ? `WHERE attempt.submitted_at IS NOT NULL AND aa.is_correct = 0 AND ${filterSql.join(" AND ")}`
    : "WHERE attempt.submitted_at IS NOT NULL AND aa.is_correct = 0";
  const accessWhereSql = isAdmin(employee) ? "" : "WHERE e.department_id = ?";
  const accessValues = isAdmin(employee) ? [] : [employee.departmentId];

  const [metricsRows, resultCountRows, wrongQuestions, departmentScores, completionTrend, departments, tests] = await Promise.all([
    queryRows<MetricsRow[]>(
      `
      SELECT
        COUNT(*) AS total_assigned,
        SUM(ta.status IN ('passed','failed')) AS completed,
        SUM(ta.status IN ('not_started','studying')) AS not_completed,
        SUM(ta.status = 'passed') AS passed,
        SUM(ta.status = 'failed') AS failed,
        AVG(ta.official_score) AS average_score,
        AVG(ta.practice_attempt_count) AS average_practice_attempts
      FROM test_assignments ta
      JOIN employees e ON e.id = ta.employee_id
      JOIN tests t ON t.id = ta.test_id
      ${whereSql}
      `,
      filterValues
    ),
    queryRows<CountRow[]>(
      `
      SELECT COUNT(*) AS total
      FROM test_assignments ta
      JOIN employees e ON e.id = ta.employee_id
      JOIN tests t ON t.id = ta.test_id
      ${whereSql}
      `,
      filterValues
    ),
    queryRows<WrongQuestionRow[]>(
      `
      SELECT
        q.id AS question_id,
        COUNT(*) AS wrong_count,
        q.question_text
      FROM attempt_answers aa
      JOIN test_attempts attempt ON attempt.id = aa.attempt_id
      JOIN test_assignments ta ON ta.id = attempt.assignment_id
      JOIN employees e ON e.id = attempt.employee_id
      JOIN tests t ON t.id = attempt.test_id
      JOIN questions q ON q.id = aa.question_id
      ${wrongQuestionWhereSql}
      GROUP BY q.id, q.question_text
      ORDER BY wrong_count DESC, q.id
      LIMIT 5
      `,
      filterValues
    ),
    queryRows<DepartmentScoreRow[]>(
      `
      SELECT
        d.name AS department_name,
        ROUND(AVG(ta.official_score), 1) AS average_score
      FROM test_assignments ta
      JOIN employees e ON e.id = ta.employee_id
      JOIN departments d ON d.id = e.department_id
      JOIN tests t ON t.id = ta.test_id
      ${whereSql}
      GROUP BY d.id, d.name
      HAVING average_score IS NOT NULL
      ORDER BY average_score DESC, d.id
      LIMIT 5
      `,
      filterValues
    ),
    queryRows<CompletionTrendRow[]>(
      `
      SELECT
        DATE_FORMAT(${activityDateExpression}, '%Y-%m-%d') AS bucket_date,
        SUM(ta.status IN ('passed','failed')) AS completed,
        COUNT(*) AS total
      FROM test_assignments ta
      JOIN employees e ON e.id = ta.employee_id
      JOIN tests t ON t.id = ta.test_id
      ${whereSql}
      GROUP BY bucket_date
      ORDER BY bucket_date DESC
      LIMIT 7
      `,
      filterValues
    ),
    queryRows<DepartmentOptionRow[]>(
      `
      SELECT DISTINCT d.id, d.name
      FROM departments d
      JOIN employees e ON e.department_id = d.id
      ${accessWhereSql}
      ORDER BY d.id
      `,
      accessValues
    ),
    queryRows<TestOptionRow[]>(
      `
      SELECT DISTINCT t.id, t.title
      FROM tests t
      JOIN test_assignments ta ON ta.test_id = t.id
      JOIN employees e ON e.id = ta.employee_id
      ${accessWhereSql}
      ORDER BY t.id
      `,
      accessValues
    )
  ]);

  const metrics = metricsRows[0];
  const totalResults = Number(resultCountRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const resultLimitSql = isCsv ? "" : `LIMIT ${pageSize} OFFSET ${offset}`;
  const resultRows = await queryRows<ResultRow[]>(
    `
    SELECT
      ta.id AS assignment_id,
      e.full_name,
      e.phone,
      d.name AS department_name,
      e.position_title,
      e.hire_date,
      t.title AS test_title,
      t.pass_score,
      ta.practice_attempt_count,
      ta.official_score,
      latest.time_spent_seconds,
      DATE_FORMAT(COALESCE(latest_activity.submitted_at, latest_activity.started_at), '%Y-%m-%d %H:%i') AS latest_activity_at,
      latest_activity.mode AS latest_activity_mode,
      CASE WHEN latest_activity.id IS NOT NULL AND latest_activity.submitted_at IS NULL THEN 1 ELSE 0 END AS latest_activity_is_open,
      ta.status AS assignment_status,
      reviewer.full_name AS retake_reviewer
    FROM test_assignments ta
    JOIN employees e ON e.id = ta.employee_id
    JOIN departments d ON d.id = e.department_id
    JOIN tests t ON t.id = ta.test_id
      LEFT JOIN (
        SELECT assignment_id, MAX(id) AS latest_attempt_id
        FROM test_attempts
        WHERE mode = 'official' AND submitted_at IS NOT NULL
        GROUP BY assignment_id
      ) latest_id ON latest_id.assignment_id = ta.id
    LEFT JOIN test_attempts latest ON latest.id = latest_id.latest_attempt_id
    LEFT JOIN (
      SELECT assignment_id, MAX(id) AS latest_attempt_id
      FROM test_attempts
      GROUP BY assignment_id
    ) latest_activity_id ON latest_activity_id.assignment_id = ta.id
    LEFT JOIN test_attempts latest_activity ON latest_activity.id = latest_activity_id.latest_attempt_id
    LEFT JOIN (
      SELECT assignment_id, MAX(reviewed_by) AS reviewed_by
      FROM retake_requests
      WHERE status = 'approved'
      GROUP BY assignment_id
    ) rr ON rr.assignment_id = ta.id
    LEFT JOIN employees reviewer ON reviewer.id = rr.reviewed_by
    ${whereSql}
    ORDER BY COALESCE(latest_activity.submitted_at, latest_activity.started_at, ta.completed_at, ta.assigned_at) DESC, ta.id DESC
    ${resultLimitSql}
    `,
    filterValues
  );

  if (isCsv) {
    return new NextResponse(toResultsCsv(resultRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ket-qua-test.csv"`
      }
    });
  }

  return NextResponse.json({
    metrics: {
      totalAssigned: metrics?.total_assigned ?? 0,
      completed: toNumber(metrics?.completed) ?? 0,
      notCompleted: toNumber(metrics?.not_completed) ?? 0,
      passed: toNumber(metrics?.passed) ?? 0,
      failed: toNumber(metrics?.failed) ?? 0,
      averageScore: toNumber(metrics?.average_score) ?? 0,
      averagePracticeAttempts: toNumber(metrics?.average_practice_attempts) ?? 0
    },
    resultsPagination: {
      page,
      pageSize,
      total: totalResults,
      totalPages
    },
    filters: {
      departments,
      tests
    },
    results: resultRows.map((row) => ({
      ...row,
      pass_score: toNumber(row.pass_score),
      official_score: toNumber(row.official_score),
      time_spent_minutes: row.time_spent_seconds ? Math.round(row.time_spent_seconds / 60) : null,
      latest_activity_is_open: Boolean(row.latest_activity_is_open)
    })),
    departmentScores: departmentScores.map((row) => ({
      departmentName: row.department_name,
      averageScore: toNumber(row.average_score) ?? 0
    })),
    completionTrend: completionTrend
      .slice()
      .reverse()
      .map((row) => ({
        date: row.bucket_date,
        completed: toNumber(row.completed) ?? 0,
        total: toNumber(row.total) ?? 0
      })),
    wrongQuestions
  });
}
