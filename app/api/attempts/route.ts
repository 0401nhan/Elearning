import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";

type SubmittedAnswer = {
  questionId: number;
  selectedOptionId: number | null;
};

type AssignmentLockRow = RowDataPacket & {
  assignment_id: number;
  employee_id: number;
  test_id: number;
  pass_score: string | number;
  max_official_attempts: number;
  official_attempts_used: number;
};

type CountRow = RowDataPacket & {
  total: number;
};

type CorrectRow = RowDataPacket & {
  question_id: number;
  selected_option_id: number | null;
  is_correct: number;
};

function getResultStatus(score: number) {
  if (score >= 95) return "excellent";
  if (score >= 80) return "passed";
  if (score >= 70) return "review_required";
  return "failed";
}

export async function POST(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const testId = Number(body?.testId);
  const mode = body?.mode === "official" ? "official" : "practice";
  const submittedAnswers = Array.isArray(body?.answers) ? (body.answers as SubmittedAnswer[]) : [];

  if (!testId || submittedAnswers.length === 0) {
    return NextResponse.json({ error: "Thiếu bài test hoặc đáp án." }, { status: 400 });
  }

  const result = await withTransaction(async (connection) => {
    const [assignmentRows] = await connection.query<AssignmentLockRow[]>(
      `
      SELECT
        ta.id AS assignment_id,
        ta.employee_id,
        ta.test_id,
        t.pass_score,
        t.max_official_attempts,
        ta.official_attempts_used
      FROM test_assignments ta
      JOIN tests t ON t.id = ta.test_id
      WHERE ta.employee_id = ? AND ta.test_id = ?
      FOR UPDATE
      `,
      [employee.id, testId]
    );

    const assignment = assignmentRows[0];
    if (!assignment) {
      return { status: 404 as const, body: { error: "Nhân sự chưa được giao bài test này." } };
    }

    if (mode === "official" && assignment.official_attempts_used >= assignment.max_official_attempts) {
      return { status: 409 as const, body: { error: "Bài chính thức đã hết lượt làm." } };
    }

    const questionIds = submittedAnswers.map((answer) => answer.questionId);
    const selectedOptionIds = submittedAnswers
      .map((answer) => answer.selectedOptionId)
      .filter((id): id is number => typeof id === "number");

    const [correctRows] = await connection.query<CorrectRow[]>(
      `
      SELECT
        q.id AS question_id,
        ao.id AS selected_option_id,
        COALESCE(ao.is_correct, 0) AS is_correct
      FROM questions q
      LEFT JOIN answer_options ao
        ON ao.question_id = q.id AND ao.id IN (?)
      WHERE q.test_id = ? AND q.id IN (?)
      `,
      [selectedOptionIds.length ? selectedOptionIds : [0], testId, questionIds]
    );

    const correctMap = new Map<string, number>();
    for (const row of correctRows) {
      correctMap.set(`${row.question_id}:${row.selected_option_id}`, row.is_correct);
    }

    const totalQuestions = submittedAnswers.length;
    const correctAnswers = submittedAnswers.reduce((sum, answer) => {
      return sum + (correctMap.get(`${answer.questionId}:${answer.selectedOptionId}`) ? 1 : 0);
    }, 0);
    const score = Number(((correctAnswers / totalQuestions) * 100).toFixed(2));
    const resultStatus = getResultStatus(score);

    const [attemptCountRows] = await connection.query<CountRow[]>(
      "SELECT COUNT(*) + 1 AS total FROM test_attempts WHERE assignment_id = ? AND mode = ?",
      [assignment.assignment_id, mode]
    );
    const attemptNo = attemptCountRows[0]?.total ?? 1;

    const [attemptResult] = await connection.execute<ResultSetHeader>(
      `
      INSERT INTO test_attempts
        (assignment_id, employee_id, test_id, mode, attempt_no, submitted_at, total_questions, correct_answers, score, result_status, is_recorded)
      VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)
      `,
      [
        assignment.assignment_id,
        employee.id,
        testId,
        mode,
        attemptNo,
        totalQuestions,
        correctAnswers,
        score,
        resultStatus,
        mode === "official" ? 1 : 0
      ]
    );

    const attemptId = attemptResult.insertId;

    await connection.query("INSERT INTO attempt_questions (attempt_id, question_id, question_order) VALUES ?", [
      submittedAnswers.map((answer, index) => [attemptId, answer.questionId, index + 1])
    ]);

    await connection.query(
      "INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, is_correct) VALUES ?",
      [
        submittedAnswers.map((answer) => [
          attemptId,
          answer.questionId,
          answer.selectedOptionId,
          correctMap.get(`${answer.questionId}:${answer.selectedOptionId}`) ? 1 : 0
        ])
      ]
    );

    if (mode === "practice") {
      await connection.execute(
        `
        UPDATE test_assignments
        SET practice_attempt_count = practice_attempt_count + 1,
            status = IF(status = 'not_started', 'studying', status)
        WHERE id = ?
        `,
        [assignment.assignment_id]
      );
    } else {
      await connection.execute(
        `
        UPDATE test_assignments
        SET official_attempts_used = official_attempts_used + 1,
            official_score = ?,
            status = ?,
            completed_at = NOW()
        WHERE id = ?
        `,
        [score, score >= Number(assignment.pass_score) ? "passed" : "failed", assignment.assignment_id]
      );
    }

    return {
      status: 200 as const,
      body: {
        attemptId,
        mode,
        totalQuestions,
        correctAnswers,
        score,
        resultStatus
      }
    };
  });

  return NextResponse.json(result.body, { status: result.status });
}
