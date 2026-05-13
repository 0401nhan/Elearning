import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
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

export async function GET() {
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
      `
    ),
    queryRows<ResultRow[]>(
      `
      SELECT *
      FROM v_admin_results
      ORDER BY assignment_id
      LIMIT 50
      `
    ),
    queryRows<WrongQuestionRow[]>(
      `
      SELECT
        q.id AS question_id,
        COUNT(*) AS wrong_count,
        q.question_text
      FROM attempt_answers aa
      JOIN questions q ON q.id = aa.question_id
      WHERE aa.is_correct = 0
      GROUP BY q.id, q.question_text
      ORDER BY wrong_count DESC, q.id
      LIMIT 5
      `
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
