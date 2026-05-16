import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { ensureAttemptPassScoreSnapshotColumn } from "@/lib/attempt-schema";
import { queryRows, toNumber } from "@/lib/db";

type ResultRow = RowDataPacket & {
  assignment_id: number;
  test_id: number;
  test_title: string;
  pass_score: string | number;
  department_name: string | null;
  practice_attempt_count: number;
  official_score: string | number | null;
  assignment_status: string;
  completed_at: string | null;
  time_spent_seconds: number | null;
  total_questions: number | null;
  correct_answers: number | null;
};

type AttemptRow = RowDataPacket & {
  id: number;
  test_title: string;
  pass_score: string | number;
  mode: string;
  attempt_no: number;
  submitted_at: string | null;
  time_spent_seconds: number | null;
  total_questions: number;
  correct_answers: number;
  score: string | number | null;
  result_status: string | null;
  is_recorded: number;
};

function statusLabel(status: string) {
  if (status === "passed") return "Đạt";
  if (status === "failed") return "Chưa đạt";
  if (status === "studying") return "Đang học";
  return "Chưa làm";
}

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  await ensureAttemptPassScoreSnapshotColumn();

  const [rows, attempts] = await Promise.all([
    queryRows<ResultRow[]>(
      `
      SELECT
        ta.id AS assignment_id,
        t.id AS test_id,
        t.title AS test_title,
        COALESCE(latest.pass_score_snapshot, t.pass_score) AS pass_score,
        d.name AS department_name,
        ta.practice_attempt_count,
        ta.official_score,
        ta.status AS assignment_status,
        DATE_FORMAT(ta.completed_at, '%Y-%m-%d') AS completed_at,
        latest.time_spent_seconds,
        latest.total_questions,
        latest.correct_answers
      FROM test_assignments ta
      JOIN tests t ON t.id = ta.test_id
      LEFT JOIN departments d ON d.id = t.department_id
      LEFT JOIN (
        SELECT assignment_id, MAX(id) AS latest_attempt_id
        FROM test_attempts
        WHERE mode = 'official' AND submitted_at IS NOT NULL
        GROUP BY assignment_id
      ) latest_id ON latest_id.assignment_id = ta.id
      LEFT JOIN test_attempts latest ON latest.id = latest_id.latest_attempt_id
      WHERE ta.employee_id = ?
      ORDER BY ta.id DESC
      `,
      [employee.id]
    ),
    queryRows<AttemptRow[]>(
      `
      SELECT
        attempt.id,
        t.title AS test_title,
        COALESCE(attempt.pass_score_snapshot, t.pass_score) AS pass_score,
        attempt.mode,
        attempt.attempt_no,
        DATE_FORMAT(attempt.submitted_at, '%Y-%m-%d %H:%i') AS submitted_at,
        attempt.time_spent_seconds,
        attempt.total_questions,
        attempt.correct_answers,
        attempt.score,
        attempt.result_status,
        attempt.is_recorded
      FROM test_attempts attempt
      JOIN tests t ON t.id = attempt.test_id
      WHERE attempt.employee_id = ? AND attempt.submitted_at IS NOT NULL
      ORDER BY attempt.id DESC
      LIMIT 30
      `,
      [employee.id]
    )
  ]);

  const normalizedRows = rows.map((row) => ({
    assignmentId: row.assignment_id,
    testId: row.test_id,
    testTitle: row.test_title,
    passScore: toNumber(row.pass_score),
    departmentName: row.department_name,
    practiceAttemptCount: row.practice_attempt_count,
    officialScore: toNumber(row.official_score),
    assignmentStatus: row.assignment_status,
    assignmentStatusLabel: statusLabel(row.assignment_status),
    completedAt: row.completed_at,
    timeSpentMinutes: row.time_spent_seconds ? Math.round(row.time_spent_seconds / 60) : null,
    totalQuestions: row.total_questions,
    correctAnswers: row.correct_answers
  }));

  const officialScores = normalizedRows
    .map((row) => row.officialScore)
    .filter((score): score is number => score !== null);
  const highestScore = officialScores.length ? Math.max(...officialScores) : null;
  const passed = normalizedRows.filter((row) => row.assignmentStatus === "passed").length;
  const failed = normalizedRows.filter((row) => row.assignmentStatus === "failed").length;
  const practiceAttempts = normalizedRows.reduce((sum, row) => sum + row.practiceAttemptCount, 0);

  return NextResponse.json({
    summary: {
      highestScore,
      passed,
      failed,
      practiceAttempts
    },
    rows: normalizedRows,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      testTitle: attempt.test_title,
      passScore: toNumber(attempt.pass_score),
      mode: attempt.mode,
      attemptNo: attempt.attempt_no,
      submittedAt: attempt.submitted_at,
      timeSpentMinutes: attempt.time_spent_seconds ? Math.round(attempt.time_spent_seconds / 60) : null,
      totalQuestions: attempt.total_questions,
      correctAnswers: attempt.correct_answers,
      score: toNumber(attempt.score),
      resultStatus: attempt.result_status,
      isRecorded: Boolean(attempt.is_recorded)
    }))
  });
}
