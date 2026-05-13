import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { queryRows, toNumber } from "@/lib/db";

type EmployeeRow = RowDataPacket & {
  id: number;
  employee_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  department_name: string;
  position_title: string | null;
  hire_date: string | null;
  avatar_initial: string | null;
};

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
  const { searchParams } = new URL(request.url);
  const employeeId = Number(searchParams.get("employeeId") ?? 1);

  const employees = await queryRows<EmployeeRow[]>(
    `
    SELECT
      e.id,
      e.employee_code,
      e.full_name,
      e.phone,
      e.email,
      d.name AS department_name,
      e.position_title,
      e.hire_date,
      e.avatar_initial
    FROM employees e
    JOIN departments d ON d.id = e.department_id
    WHERE e.id = ?
    LIMIT 1
    `,
    [employeeId]
  );

  if (!employees[0]) {
    return NextResponse.json({ error: "Không tìm thấy nhân sự." }, { status: 404 });
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
    [employeeId]
  );

  const total = assignments.length;
  const completed = assignments.filter((item) => item.status === "passed" || item.status === "failed").length;
  const average =
    assignments.reduce((sum, item) => sum + (toNumber(item.official_score) ?? 0), 0) /
    Math.max(1, assignments.filter((item) => item.official_score !== null).length);

  return NextResponse.json({
    employee: employees[0],
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
