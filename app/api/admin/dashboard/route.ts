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
  practice_attempt_count: number;
  official_score: string | number | null;
  time_spent_seconds: number | null;
  assignment_status: string;
  retake_reviewer: string | null;
};

type WrongQuestionRow = RowDataPacket & {
  question_id: number;
  wrong_count: number;
  question_text: string;
};

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  if (!canViewPeopleResults(employee)) {
    return NextResponse.json({ error: "Không có quyền xem kết quả nhân sự." }, { status: 403 });
  }

  const departmentFilter = isAdmin(employee) ? "" : "WHERE e.department_id = ?";
  const wrongQuestionFilter = isAdmin(employee) ? "WHERE aa.is_correct = 0" : "WHERE aa.is_correct = 0 AND e.department_id = ?";
  const filterValues = isAdmin(employee) ? [] : [employee.departmentId];

  const [metricsRows, resultRows, wrongQuestions] = await Promise.all([
    queryRows<MetricsRow[]>(
      `
      SELECT
        COUNT(*) AS total_assigned,
        SUM(status IN ('passed','failed')) AS completed,
        SUM(status IN ('not_started','studying')) AS not_completed,
        SUM(status = 'passed') AS passed,
        SUM(status = 'failed') AS failed,
        AVG(official_score) AS average_score,
        AVG(practice_attempt_count) AS average_practice_attempts
      FROM test_assignments
      JOIN employees e ON e.id = test_assignments.employee_id
      ${departmentFilter}
      `,
      filterValues
    ),
    queryRows<ResultRow[]>(
      `
      SELECT
        ta.id AS assignment_id,
        e.full_name,
        e.phone,
        d.name AS department_name,
        e.position_title,
        e.hire_date,
        t.title AS test_title,
        ta.practice_attempt_count,
        ta.official_score,
        latest.time_spent_seconds,
        ta.status AS assignment_status,
        reviewer.full_name AS retake_reviewer
      FROM test_assignments ta
      JOIN employees e ON e.id = ta.employee_id
      JOIN departments d ON d.id = e.department_id
      JOIN tests t ON t.id = ta.test_id
      LEFT JOIN (
        SELECT assignment_id, MAX(id) AS latest_attempt_id
        FROM test_attempts
        WHERE mode = 'official'
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
      ${departmentFilter}
      ORDER BY ta.id
      LIMIT 50
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
      JOIN employees e ON e.id = attempt.employee_id
      JOIN questions q ON q.id = aa.question_id
      ${wrongQuestionFilter}
      GROUP BY q.id, q.question_text
      ORDER BY wrong_count DESC, q.id
      LIMIT 5
      `,
      filterValues
    )
  ]);

  const metrics = metricsRows[0];

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
    results: resultRows.map((row) => ({
      ...row,
      official_score: toNumber(row.official_score),
      time_spent_minutes: row.time_spent_seconds ? Math.round(row.time_spent_seconds / 60) : null
    })),
    wrongQuestions
  });
}
