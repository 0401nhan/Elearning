import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { queryRows, toNumber } from "@/lib/db";

type AssignmentRow = RowDataPacket & {
  assignment_id: number;
  test_id: number;
  title: string;
  department_name: string | null;
  question_count: number;
  duration_minutes: number;
  pass_score: string | number;
  status: string;
  read_progress_percent: string | number;
  practice_attempt_count: number;
  official_score: string | number | null;
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
      t.question_count,
      t.duration_minutes,
      t.pass_score,
      ta.status,
      ta.read_progress_percent,
      ta.practice_attempt_count,
      ta.official_score
    FROM test_assignments ta
    JOIN tests t ON t.id = ta.test_id
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE ta.employee_id = ?
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
      completed,
      pending: total - completed,
      average: Number(average.toFixed(1))
    },
    assignments: assignments.map((item) => ({
      ...item,
      pass_score: toNumber(item.pass_score),
      read_progress_percent: toNumber(item.read_progress_percent),
      official_score: toNumber(item.official_score)
    }))
  });
}
