import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { queryRows, toNumber } from "@/lib/db";

type AssignmentRow = RowDataPacket & {
  assignment_id: number;
  test_id: number;
  title: string;
  department_name: string | null;
  description: string | null;
  question_count: number;
  duration_minutes: number;
  pass_score: string | number;
  allow_unlimited_practice: number;
  due_at: string | null;
  status: string;
  read_progress_percent: string | number;
  practice_attempt_count: number;
  official_attempts_used: number;
  max_official_attempts: number;
  official_score: string | number | null;
  retake_request_count: number;
  retake_request_status: "pending" | "approved" | "rejected" | null;
};

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);

  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const assignments = await queryRows<AssignmentRow[]>(
    `
    SELECT
      ta.id AS assignment_id,
      t.id AS test_id,
      t.title,
      d.name AS department_name,
      t.description,
      t.question_count,
      t.duration_minutes,
      t.pass_score,
      t.allow_unlimited_practice,
      DATE_FORMAT(ta.due_at, '%Y-%m-%d') AS due_at,
      ta.status,
      ta.read_progress_percent,
      ta.practice_attempt_count,
      ta.official_attempts_used,
      (t.max_official_attempts + COALESCE(retake.approved_retake_count, 0)) AS max_official_attempts,
      ta.official_score,
      COALESCE(retake_requests.retake_request_count, 0) AS retake_request_count,
      retake_requests.retake_request_status
    FROM test_assignments ta
    JOIN tests t ON t.id = ta.test_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN (
      SELECT assignment_id, COUNT(*) AS approved_retake_count
      FROM retake_requests
      WHERE status = 'approved'
      GROUP BY assignment_id
    ) retake ON retake.assignment_id = ta.id
    LEFT JOIN (
      SELECT
        assignment_id,
        COUNT(*) AS retake_request_count,
        SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY requested_at DESC, id DESC), ',', 1) AS retake_request_status
      FROM retake_requests
      GROUP BY assignment_id
    ) retake_requests ON retake_requests.assignment_id = ta.id
    WHERE ta.employee_id = ? AND t.status = 'active'
    ORDER BY ta.id
    `,
    [employee.id]
  );

  const total = assignments.length;
  const completed = assignments.filter((item) => item.status === "passed" || item.status === "failed").length;
  const average =
    assignments.reduce((sum, item) => sum + (toNumber(item.official_score) ?? 0), 0) /
    Math.max(1, assignments.filter((item) => item.official_score !== null).length);

  return NextResponse.json({
    employee,
    summary: {
      total,
      done: completed,
      completed,
      pending: total - completed,
      average: Number(average.toFixed(1))
    },
    assignments: assignments.map((item) => ({
      ...item,
      pass_score: toNumber(item.pass_score),
      allow_unlimited_practice: Boolean(item.allow_unlimited_practice),
      read_progress_percent: toNumber(item.read_progress_percent),
      official_score: toNumber(item.official_score),
      retake_request_count: toNumber(item.retake_request_count) ?? 0,
      retake_request_status: item.retake_request_status
    }))
  });
}
