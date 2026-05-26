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

type PracticeScoreRow = RowDataPacket & {
  attempt_id: number;
  employee_id: number;
  employee_code: string;
  full_name: string;
  department_name: string | null;
  score: string | number;
  submitted_at: string | null;
};

const PRACTICE_ATTEMPT_LIMIT = 5;
const PRACTICE_LEADERBOARD_LIMIT = 10;

function roundScore(value: number) {
  return Number(value.toFixed(1));
}

function buildPracticeLeaderboard(rows: PracticeScoreRow[], currentEmployeeId: number) {
  const scoresByEmployee = new Map<
    number,
    {
      employeeCode: string;
      fullName: string;
      departmentName: string | null;
      scores: {
        score: number;
        submittedAt: string | null;
      }[];
    }
  >();

  for (const row of rows) {
    const score = toNumber(row.score);
    if (score === null) {
      continue;
    }

    const employeeId = Number(row.employee_id);
    const current = scoresByEmployee.get(employeeId) ?? {
      employeeCode: row.employee_code,
      fullName: row.full_name,
      departmentName: row.department_name,
      scores: []
    };

    if (current.scores.length < PRACTICE_ATTEMPT_LIMIT) {
      current.scores.push({
        score,
        submittedAt: row.submitted_at
      });
    }

    scoresByEmployee.set(employeeId, current);
  }

  const ranked = [...scoresByEmployee.entries()]
    .map(([employeeId, item]) => {
      const totalScore = item.scores.reduce((sum, attempt) => sum + attempt.score, 0);
      const highestScore = item.scores.reduce((best, attempt) => Math.max(best, attempt.score), 0);
      const latestPracticeAt =
        item.scores
          .map((attempt) => attempt.submittedAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;

      return {
        employeeId,
        employeeCode: item.employeeCode,
        fullName: item.fullName,
        departmentName: item.departmentName,
        totalScore: roundScore(totalScore),
        attemptCount: item.scores.length,
        averageScore: roundScore(totalScore / Math.max(1, item.scores.length)),
        highestScore: roundScore(highestScore),
        latestPracticeAt
      };
    })
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore;
      if (right.averageScore !== left.averageScore) return right.averageScore - left.averageScore;
      if (right.highestScore !== left.highestScore) return right.highestScore - left.highestScore;
      return left.fullName.localeCompare(right.fullName, "vi");
    })
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      isCurrentUser: item.employeeId === currentEmployeeId
    }));

  const topEntries = ranked.slice(0, PRACTICE_LEADERBOARD_LIMIT);
  const currentEntry = ranked.find((item) => item.employeeId === currentEmployeeId);

  if (currentEntry && !topEntries.some((item) => item.employeeId === currentEmployeeId)) {
    return [...topEntries, currentEntry];
  }

  return topEntries;
}

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);

  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const [assignments, practiceScoreRows] = await Promise.all([
    queryRows<AssignmentRow[]>(
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
    ),
    queryRows<PracticeScoreRow[]>(
      `
      SELECT
        attempt.employee_id,
        attempt.id AS attempt_id,
        e.employee_code,
        e.full_name,
        d.name AS department_name,
        attempt.score,
        DATE_FORMAT(attempt.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at
      FROM test_attempts attempt
      JOIN employees e ON e.id = attempt.employee_id
      JOIN departments d ON d.id = e.department_id
      WHERE attempt.mode = 'practice'
        AND attempt.submitted_at IS NOT NULL
        AND attempt.score IS NOT NULL
        AND e.is_active = 1
      ORDER BY attempt.employee_id, attempt.submitted_at DESC, attempt.id DESC
      `
    )
  ]);

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
    practiceLeaderboard: buildPracticeLeaderboard(practiceScoreRows, employee.id),
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
