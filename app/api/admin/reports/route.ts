import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { canViewPeopleResults, getCurrentUser, isAdmin } from "@/lib/auth";
import { buildCsv } from "@/lib/csv";
import { queryRows, toNumber } from "@/lib/db";

type DepartmentOptionRow = RowDataPacket & {
  id: number;
  name: string;
};

type TestOptionRow = RowDataPacket & {
  id: number;
  title: string;
};

type ReportValue = string | number | Date | null;

type ReportRow = RowDataPacket & Record<string, ReportValue>;

type ReportColumn = {
  key: string;
  label: string;
};

const REPORT_TYPES = new Set(["results", "department_summary", "test_summary", "wrong_questions"]);
const STATUSES = new Set(["not_started", "studying", "passed", "failed"]);
const PREVIEW_LIMIT = 20;
const EXPORT_LIMIT = 10000;
const NUMBER_COLUMNS = new Set([
  "affected_employees",
  "average_practice_attempts",
  "average_score",
  "completed",
  "failed",
  "not_completed",
  "official_score",
  "passed",
  "practice_attempt_count",
  "question_id",
  "time_spent_minutes",
  "total_assigned",
  "wrong_count"
]);

function cleanText(value: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function isDateText(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getReportType(value: string | null) {
  const reportType = String(value ?? "results");
  return REPORT_TYPES.has(reportType) ? reportType : "results";
}

function formatStatus(value: string | null) {
  if (value === "passed") return "Đạt";
  if (value === "failed") return "Chưa đạt";
  if (value === "studying") return "Đang học";
  return "Chưa làm";
}

function toCsv(columns: ReportColumn[], rows: Record<string, string | number | null>[]) {
  return buildCsv(
    [
      columns.map((column) => column.label),
      ...rows.map((row) => columns.map((column) => row[column.key]))
    ],
    "\n"
  );
}

function getFilename(reportType: string) {
  const label =
    reportType === "department_summary"
      ? "bao-cao-theo-phong-ban"
      : reportType === "test_summary"
        ? "bao-cao-theo-bai-test"
        : reportType === "wrong_questions"
          ? "bao-cao-cau-hoi-sai"
          : "bao-cao-chi-tiet-ket-qua";

  return `${label}.csv`;
}

function normalizeRows(rows: ReportRow[]) {
  return rows.map((row) => {
    const normalized: Record<string, string | number | null> = {};

    Object.entries(row).forEach(([key, value]) => {
      if (value instanceof Date) {
        normalized[key] = value.toISOString();
      } else if (NUMBER_COLUMNS.has(key)) {
        normalized[key] = toNumber(value);
      } else {
        normalized[key] = value;
      }
    });

    if (typeof normalized.assignment_status === "string") {
      normalized.assignment_status_label = formatStatus(normalized.assignment_status);
    }

    return normalized;
  });
}

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  if (!canViewPeopleResults(employee)) {
    return NextResponse.json({ error: "Không có quyền tải báo cáo." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const reportType = getReportType(searchParams.get("reportType"));
  const format = searchParams.get("format") ?? "json";
  const departmentId = Number(searchParams.get("departmentId") ?? 0);
  const testId = Number(searchParams.get("testId") ?? 0);
  const status = cleanText(searchParams.get("status"));
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const search = cleanText(searchParams.get("search"));
  const limit = format === "csv" ? EXPORT_LIMIT : PREVIEW_LIMIT;

  const filterSql: string[] = [];
  const filterValues: (string | number)[] = [];

  if (isAdmin(employee)) {
    if (departmentId > 0) {
      filterSql.push("e.department_id = ?");
      filterValues.push(departmentId);
    }
  } else {
    filterSql.push("e.department_id = ?");
    filterValues.push(employee.departmentId);
  }

  if (testId > 0) {
    filterSql.push("t.id = ?");
    filterValues.push(testId);
  }

  if (status && STATUSES.has(status)) {
    filterSql.push("ta.status = ?");
    filterValues.push(status);
  }

  if (isDateText(dateFrom)) {
    filterSql.push("COALESCE(ta.completed_at, ta.assigned_at) >= ?");
    filterValues.push(`${dateFrom} 00:00:00`);
  }

  if (isDateText(dateTo)) {
    filterSql.push("COALESCE(ta.completed_at, ta.assigned_at) <= ?");
    filterValues.push(`${dateTo} 23:59:59`);
  }

  if (search) {
    filterSql.push("(e.full_name LIKE ? OR e.phone LIKE ? OR t.title LIKE ?)");
    const like = `%${search}%`;
    filterValues.push(like, like, like);
  }

  const whereSql = filterSql.length ? `WHERE ${filterSql.join(" AND ")}` : "";
  const accessWhereSql = isAdmin(employee) ? "" : "WHERE e.department_id = ?";
  const accessValues = isAdmin(employee) ? [] : [employee.departmentId];

  const [departments, tests] = await Promise.all([
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

  let columns: ReportColumn[] = [];
  let rows: ReportRow[] = [];

  if (reportType === "department_summary") {
    columns = [
      { key: "department_name", label: "Phòng ban" },
      { key: "total_assigned", label: "Tổng lượt giao" },
      { key: "completed", label: "Đã hoàn thành" },
      { key: "not_completed", label: "Chưa hoàn thành" },
      { key: "passed", label: "Đạt" },
      { key: "failed", label: "Chưa đạt" },
      { key: "average_score", label: "Điểm trung bình" },
      { key: "average_practice_attempts", label: "Làm thử trung bình" }
    ];
    rows = await queryRows<ReportRow[]>(
      `
      SELECT
        d.name AS department_name,
        COUNT(*) AS total_assigned,
        SUM(ta.status IN ('passed','failed')) AS completed,
        SUM(ta.status IN ('not_started','studying')) AS not_completed,
        SUM(ta.status = 'passed') AS passed,
        SUM(ta.status = 'failed') AS failed,
        ROUND(AVG(ta.official_score), 1) AS average_score,
        ROUND(AVG(ta.practice_attempt_count), 1) AS average_practice_attempts
      FROM test_assignments ta
      JOIN employees e ON e.id = ta.employee_id
      JOIN departments d ON d.id = e.department_id
      JOIN tests t ON t.id = ta.test_id
      ${whereSql}
      GROUP BY d.id, d.name
      ORDER BY d.id
      LIMIT ${limit}
      `,
      filterValues
    );
  } else if (reportType === "test_summary") {
    columns = [
      { key: "test_title", label: "Bài test" },
      { key: "department_name", label: "Phòng áp dụng" },
      { key: "total_assigned", label: "Tổng lượt giao" },
      { key: "completed", label: "Đã hoàn thành" },
      { key: "not_completed", label: "Chưa hoàn thành" },
      { key: "passed", label: "Đạt" },
      { key: "failed", label: "Chưa đạt" },
      { key: "average_score", label: "Điểm trung bình" },
      { key: "average_practice_attempts", label: "Làm thử trung bình" }
    ];
    rows = await queryRows<ReportRow[]>(
      `
      SELECT
        t.title AS test_title,
        COALESCE(td.name, 'Áp dụng chung') AS department_name,
        COUNT(*) AS total_assigned,
        SUM(ta.status IN ('passed','failed')) AS completed,
        SUM(ta.status IN ('not_started','studying')) AS not_completed,
        SUM(ta.status = 'passed') AS passed,
        SUM(ta.status = 'failed') AS failed,
        ROUND(AVG(ta.official_score), 1) AS average_score,
        ROUND(AVG(ta.practice_attempt_count), 1) AS average_practice_attempts
      FROM test_assignments ta
      JOIN employees e ON e.id = ta.employee_id
      JOIN tests t ON t.id = ta.test_id
      LEFT JOIN departments td ON td.id = t.department_id
      ${whereSql}
      GROUP BY t.id, t.title, td.name
      ORDER BY t.id
      LIMIT ${limit}
      `,
      filterValues
    );
  } else if (reportType === "wrong_questions") {
    columns = [
      { key: "test_title", label: "Bài test" },
      { key: "question_id", label: "Mã câu hỏi" },
      { key: "question_text", label: "Nội dung câu hỏi" },
      { key: "wrong_count", label: "Số lượt sai" },
      { key: "affected_employees", label: "Số nhân sự sai" }
    ];
    rows = await queryRows<ReportRow[]>(
      `
      SELECT
        t.title AS test_title,
        aa.question_id,
        COALESCE(aq.question_text_snapshot, q.question_text, CONCAT('Câu hỏi #', aa.question_id)) AS question_text,
        COUNT(*) AS wrong_count,
        COUNT(DISTINCT attempt.employee_id) AS affected_employees
      FROM attempt_answers aa
      JOIN test_attempts attempt ON attempt.id = aa.attempt_id
      LEFT JOIN attempt_questions aq ON aq.attempt_id = aa.attempt_id AND aq.question_id = aa.question_id
      JOIN test_assignments ta ON ta.id = attempt.assignment_id
      JOIN employees e ON e.id = attempt.employee_id
      JOIN tests t ON t.id = attempt.test_id
      LEFT JOIN questions q ON q.id = aa.question_id
      ${whereSql ? `${whereSql} AND attempt.submitted_at IS NOT NULL AND aa.is_correct = 0` : "WHERE attempt.submitted_at IS NOT NULL AND aa.is_correct = 0"}
      GROUP BY t.id, t.title, aa.question_id, COALESCE(aq.question_text_snapshot, q.question_text, CONCAT('Câu hỏi #', aa.question_id))
      ORDER BY wrong_count DESC, aa.question_id
      LIMIT ${limit}
      `,
      filterValues
    );
  } else {
    columns = [
      { key: "full_name", label: "Họ tên" },
      { key: "phone", label: "Số điện thoại" },
      { key: "department_name", label: "Phòng ban" },
      { key: "position_title", label: "Vị trí" },
      { key: "test_title", label: "Bài test" },
      { key: "assigned_at", label: "Ngày giao" },
      { key: "due_at", label: "Hạn hoàn thành" },
      { key: "practice_attempt_count", label: "Làm thử" },
      { key: "official_score", label: "Điểm chính thức" },
      { key: "time_spent_minutes", label: "Thời gian làm bài" },
      { key: "assignment_status_label", label: "Trạng thái" },
      { key: "retake_reviewer", label: "Người duyệt làm lại" }
    ];
    rows = await queryRows<ReportRow[]>(
      `
      SELECT
        e.full_name,
        e.phone,
        d.name AS department_name,
        e.position_title,
        t.title AS test_title,
        DATE_FORMAT(ta.assigned_at, '%Y-%m-%d') AS assigned_at,
        DATE_FORMAT(ta.due_at, '%Y-%m-%d') AS due_at,
        ta.practice_attempt_count,
        ta.official_score,
        CASE
          WHEN latest.time_spent_seconds IS NULL THEN NULL
          ELSE ROUND(latest.time_spent_seconds / 60)
        END AS time_spent_minutes,
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
        SELECT assignment_id, MAX(reviewed_by) AS reviewed_by
        FROM retake_requests
        WHERE status = 'approved'
        GROUP BY assignment_id
      ) rr ON rr.assignment_id = ta.id
      LEFT JOIN employees reviewer ON reviewer.id = rr.reviewed_by
      ${whereSql}
      ORDER BY ta.id DESC
      LIMIT ${limit}
      `,
      filterValues
    );
  }

  const normalizedRows = normalizeRows(rows);

  if (format === "csv") {
    return new NextResponse(toCsv(columns, normalizedRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${getFilename(reportType)}"`
      }
    });
  }

  return NextResponse.json({
    reportType,
    columns,
    rows: normalizedRows,
    rowCount: normalizedRows.length,
    filters: {
      departments,
      tests
    }
  });
}
