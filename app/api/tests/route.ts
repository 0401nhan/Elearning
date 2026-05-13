import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
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
};

export async function GET() {
  const rows = await queryRows<TestRow[]>(
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
  );

  return NextResponse.json({
    tests: rows.map((row) => ({
      ...row,
      pass_score: toNumber(row.pass_score)
    }))
  });
}
