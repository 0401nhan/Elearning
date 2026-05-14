import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { queryRows, toNumber } from "@/lib/db";

type TestRow = RowDataPacket & {
  id: number;
  code: string;
  title: string;
  department_name: string | null;
  description: string | null;
  question_count: number;
  duration_minutes: number;
  pass_score: string | number;
  status: string;
  assignment_status?: string;
  read_progress_percent?: string | number;
  practice_attempt_count?: number;
  official_score?: string | number | null;
};

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const rows = isAdmin(employee)
    ? await queryRows<TestRow[]>(
        `
        SELECT
          t.id,
          t.code,
          t.title,
          d.name AS department_name,
          t.description,
          t.question_count,
          t.duration_minutes,
          t.pass_score,
          t.status
        FROM tests t
        LEFT JOIN departments d ON d.id = t.department_id
        WHERE t.status = 'active'
        ORDER BY t.id
        `
      )
    : await queryRows<TestRow[]>(
        `
        SELECT
          t.id,
          t.code,
          t.title,
          d.name AS department_name,
          t.description,
          t.question_count,
          t.duration_minutes,
          t.pass_score,
          t.status,
          ta.status AS assignment_status,
          ta.read_progress_percent,
          ta.practice_attempt_count,
          ta.official_score
        FROM test_assignments ta
        JOIN tests t ON t.id = ta.test_id
        LEFT JOIN departments d ON d.id = t.department_id
        WHERE ta.employee_id = ? AND t.status = 'active'
        ORDER BY ta.id
        `,
        [employee.id]
      );

  return NextResponse.json({
    tests: rows.map((row) => ({
      ...row,
      pass_score: toNumber(row.pass_score),
      read_progress_percent: toNumber(row.read_progress_percent),
      official_score: toNumber(row.official_score)
    }))
  });
}
