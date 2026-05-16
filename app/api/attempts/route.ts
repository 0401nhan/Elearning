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
  approved_retake_count: number;
  official_attempts_used: number;
  official_score: string | number | null;
  status: string;
};

type CountRow = RowDataPacket & {
  total: number;
};

type ActiveQuestionRow = RowDataPacket & {
  id: number;
};

type AnswerOptionRow = RowDataPacket & {
  question_id: number;
  option_id: number;
  is_correct: number;
};

type OfficialAttemptLockRow = RowDataPacket & {
  attempt_id: number;
  assignment_id: number;
  employee_id: number;
  test_id: number;
  started_at: string;
  submitted_at: string | null;
  elapsed_seconds: number;
  duration_minutes: number;
  pass_score: string | number;
  max_official_attempts: number;
  approved_retake_count: number;
  official_attempts_used: number;
  official_score: string | number | null;
  status: string;
};

type AttemptQuestionRow = RowDataPacket & {
  question_id: number;
};

type SavedAttemptAnswerRow = RowDataPacket & {
  question_id: number;
  selected_option_id: number | null;
};

type AttemptError = {
  status: 400 | 404 | 409;
  body: { error: string };
};

function getOfficialAttemptLimit(
  assignment: Pick<AssignmentLockRow | OfficialAttemptLockRow, "max_official_attempts" | "approved_retake_count">
) {
  return Number(assignment.max_official_attempts) + Number(assignment.approved_retake_count ?? 0);
}

function getPassScore(value: string | number | null | undefined) {
  const passScore = Number(value ?? 80);
  return Number.isFinite(passScore) ? passScore : 80;
}

function getResultStatus(score: number, passScoreValue: string | number | null | undefined) {
  const passScore = getPassScore(passScoreValue);

  if (score >= Math.max(95, passScore)) return "excellent";
  if (score >= passScore) return "passed";
  if (score >= Math.max(0, passScore - 10)) return "review_required";
  return "failed";
}

function isOfficialMode(mode: string) {
  return mode === "official";
}

function normalizeSubmittedAnswers(value: unknown) {
  if (!Array.isArray(value)) {
    return { answers: [], error: "Thiếu bài test hoặc đáp án." };
  }

  const answers: SubmittedAnswer[] = [];

  for (const item of value) {
    const rawItem = item as { questionId?: unknown; selectedOptionId?: unknown };
    const questionId = Number(rawItem?.questionId);
    const selectedOptionValue = rawItem?.selectedOptionId;
    const selectedOptionId =
      selectedOptionValue === null || selectedOptionValue === undefined || selectedOptionValue === ""
        ? null
        : Number(selectedOptionValue);

    if (!Number.isInteger(questionId) || questionId <= 0) {
      return { answers: [], error: "Câu hỏi trong bài nộp không hợp lệ." };
    }

    if (selectedOptionId !== null && (!Number.isInteger(selectedOptionId) || selectedOptionId <= 0)) {
      return { answers: [], error: "Đáp án trong bài nộp không hợp lệ." };
    }

    answers.push({ questionId, selectedOptionId });
  }

  return { answers, error: null };
}

function validateSubmittedAnswers(
  submittedAnswers: SubmittedAnswer[],
  activeQuestionIds: number[],
  validOptionsByQuestion: Map<number, Set<number>>
): AttemptError | null {
  if (!activeQuestionIds.length) {
    return { status: 400, body: { error: "Bài test này chưa có câu hỏi đang hoạt động." } };
  }

  if (submittedAnswers.length !== activeQuestionIds.length) {
    return { status: 400, body: { error: "Bài nộp phải bao gồm đầy đủ tất cả câu hỏi đang hoạt động." } };
  }

  const activeQuestionSet = new Set(activeQuestionIds);
  const submittedQuestionSet = new Set<number>();

  for (const answer of submittedAnswers) {
    if (submittedQuestionSet.has(answer.questionId)) {
      return { status: 400, body: { error: "Bài nộp có câu hỏi bị trùng." } };
    }

    if (!activeQuestionSet.has(answer.questionId)) {
      return { status: 400, body: { error: "Bài nộp có câu hỏi không thuộc bài test hoặc đã bị tắt." } };
    }

    submittedQuestionSet.add(answer.questionId);

    if (answer.selectedOptionId !== null && !validOptionsByQuestion.get(answer.questionId)?.has(answer.selectedOptionId)) {
      return { status: 400, body: { error: "Bài nộp có đáp án không thuộc câu hỏi tương ứng." } };
    }
  }

  const missingQuestion = activeQuestionIds.find((questionId) => !submittedQuestionSet.has(questionId));
  if (missingQuestion) {
    return { status: 400, body: { error: "Bài nộp còn thiếu câu hỏi đang hoạt động." } };
  }

  return null;
}

async function submitOfficialAttempt(
  employeeId: number,
  attemptId: number,
  submittedAnswers: SubmittedAnswer[],
  requestedTimeSpentSeconds: number | null
) {
  return withTransaction(async (connection) => {
    const [attemptRows] = await connection.query<OfficialAttemptLockRow[]>(
      `
      SELECT
        attempt.id AS attempt_id,
        attempt.assignment_id,
        attempt.employee_id,
        attempt.test_id,
        DATE_FORMAT(attempt.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
        DATE_FORMAT(attempt.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
        TIMESTAMPDIFF(SECOND, attempt.started_at, NOW()) AS elapsed_seconds,
        t.duration_minutes,
        t.pass_score,
        t.max_official_attempts,
        COALESCE(retake.approved_retake_count, 0) AS approved_retake_count,
        ta.official_attempts_used,
        ta.official_score,
        ta.status
      FROM test_attempts attempt
      JOIN test_assignments ta ON ta.id = attempt.assignment_id
      JOIN tests t ON t.id = attempt.test_id
      LEFT JOIN (
        SELECT assignment_id, COUNT(*) AS approved_retake_count
        FROM retake_requests
        WHERE status = 'approved'
        GROUP BY assignment_id
      ) retake ON retake.assignment_id = ta.id
      WHERE attempt.id = ?
        AND attempt.employee_id = ?
        AND attempt.mode = 'official'
      FOR UPDATE
      `,
      [attemptId, employeeId]
    );

    const attempt = attemptRows[0];
    if (!attempt) {
      return { status: 404 as const, body: { error: "Không tìm thấy lượt thi chính thức." } };
    }

    if (attempt.submitted_at) {
      return { status: 409 as const, body: { error: "Lượt thi chính thức này đã được nộp." } };
    }

    if (attempt.status === "passed") {
      return { status: 409 as const, body: { error: "Bài chính thức đã được ghi nhận, không thể nộp lại." } };
    }

    if (Number(attempt.official_attempts_used) >= getOfficialAttemptLimit(attempt)) {
      return { status: 409 as const, body: { error: "Bài chính thức đã hết lượt làm." } };
    }

    const [attemptQuestionRows] = await connection.query<AttemptQuestionRow[]>(
      `
      SELECT question_id
      FROM attempt_questions
      WHERE attempt_id = ?
      ORDER BY question_order
      `,
      [attemptId]
    );

    const attemptQuestionIds = attemptQuestionRows.map((row) => Number(row.question_id));
    const [optionRows] = await connection.query<AnswerOptionRow[]>(
      `
      SELECT
        aqo.question_id,
        aqo.option_id,
        ao.is_correct
      FROM attempt_question_options aqo
      JOIN answer_options ao ON ao.id = aqo.option_id
      WHERE aqo.attempt_id = ?
      ORDER BY aqo.question_id, aqo.option_order
      `,
      [attemptId]
    );

    const validOptionsByQuestion = new Map<number, Set<number>>();
    const correctMap = new Map<string, number>();
    for (const row of optionRows) {
      const questionId = Number(row.question_id);
      const optionId = Number(row.option_id);
      const validOptions = validOptionsByQuestion.get(questionId) ?? new Set<number>();
      validOptions.add(optionId);
      validOptionsByQuestion.set(questionId, validOptions);
      correctMap.set(`${questionId}:${optionId}`, Number(row.is_correct));
    }

    const maxDurationSeconds = Number(attempt.duration_minutes) * 60;
    const elapsedSeconds = Math.max(0, Number(attempt.elapsed_seconds ?? 0));
    const isExpired = elapsedSeconds > maxDurationSeconds;
    let finalAnswers = submittedAnswers;

    if (isExpired) {
      const [savedAnswerRows] = await connection.query<SavedAttemptAnswerRow[]>(
        `
        SELECT question_id, selected_option_id
        FROM attempt_answers
        WHERE attempt_id = ?
        ORDER BY question_id
        `,
        [attemptId]
      );
      const savedAnswersByQuestion = new Map(
        savedAnswerRows.map((answer) => [
          Number(answer.question_id),
          answer.selected_option_id === null ? null : Number(answer.selected_option_id)
        ])
      );

      finalAnswers = attemptQuestionIds.map((questionId) => ({
        questionId,
        selectedOptionId: savedAnswersByQuestion.get(questionId) ?? null
      }));
    }

    const validationError = validateSubmittedAnswers(finalAnswers, attemptQuestionIds, validOptionsByQuestion);
    if (validationError) {
      return validationError;
    }

    if (!isExpired) {
      await connection.query(
        `
        INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, is_correct)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          selected_option_id = VALUES(selected_option_id),
          is_correct = VALUES(is_correct),
          answered_at = NOW()
        `,
        [
          finalAnswers.map((answer) => [
            attemptId,
            answer.questionId,
            answer.selectedOptionId,
            correctMap.get(`${answer.questionId}:${answer.selectedOptionId}`) ? 1 : 0
          ])
        ]
      );
    }

    const totalQuestions = attemptQuestionIds.length;
    const correctAnswers = finalAnswers.reduce((sum, answer) => {
      return sum + (correctMap.get(`${answer.questionId}:${answer.selectedOptionId}`) ? 1 : 0);
    }, 0);
    const score = Number(((correctAnswers / totalQuestions) * 100).toFixed(2));
    const resultStatus = getResultStatus(score, attempt.pass_score);
    const timeSpentSeconds = Math.min(
      maxDurationSeconds,
      Math.max(0, requestedTimeSpentSeconds ?? elapsedSeconds)
    );

    await connection.execute(
      `
      UPDATE test_attempts
      SET submitted_at = NOW(),
          time_spent_seconds = ?,
          total_questions = ?,
          correct_answers = ?,
          score = ?,
          result_status = ?,
          is_recorded = 1
      WHERE id = ?
      `,
      [timeSpentSeconds, totalQuestions, correctAnswers, score, resultStatus, attemptId]
    );

    await connection.execute(
      `
      UPDATE test_assignments
      SET official_attempts_used = official_attempts_used + 1,
          official_score = ?,
          status = ?,
          completed_at = NOW()
      WHERE id = ?
      `,
      [score, score >= Number(attempt.pass_score) ? "passed" : "failed", attempt.assignment_id]
    );

    return {
      status: 200 as const,
      body: {
        attemptId,
        mode: "official",
        totalQuestions,
        correctAnswers,
        score,
        resultStatus
      }
    };
  });
}

export async function POST(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const testId = Number(body?.testId);
  const attemptId = Number(body?.attemptId);
  const mode: string = body?.mode === "official" ? "official" : "practice";
  const normalized = normalizeSubmittedAnswers(body?.answers);
  const submittedAnswers = normalized.answers;
  const timeSpentSeconds = Math.max(0, Math.round(Number(body?.timeSpentSeconds ?? 0))) || null;

  if (submittedAnswers.length === 0 || normalized.error) {
    return NextResponse.json({ error: normalized.error ?? "Thiếu bài test hoặc đáp án." }, { status: 400 });
  }

  if (isOfficialMode(mode)) {
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return NextResponse.json({ error: "Thiếu lượt thi chính thức." }, { status: 400 });
    }

    const officialResult = await submitOfficialAttempt(employee.id, attemptId, submittedAnswers, timeSpentSeconds);
    return NextResponse.json(officialResult.body, { status: officialResult.status });
  }

  if (!testId) {
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
        COALESCE(retake.approved_retake_count, 0) AS approved_retake_count,
        ta.official_attempts_used,
        ta.official_score,
        ta.status
      FROM test_assignments ta
      JOIN tests t ON t.id = ta.test_id
      LEFT JOIN (
        SELECT assignment_id, COUNT(*) AS approved_retake_count
        FROM retake_requests
        WHERE status = 'approved'
        GROUP BY assignment_id
      ) retake ON retake.assignment_id = ta.id
      WHERE ta.employee_id = ? AND ta.test_id = ?
      FOR UPDATE
      `,
      [employee.id, testId]
    );

    const assignment = assignmentRows[0];
    if (!assignment) {
      return { status: 404 as const, body: { error: "Nhân sự chưa được giao bài test này." } };
    }

    if (mode === "official" && assignment.status === "passed") {
      return { status: 409 as const, body: { error: "Bài chính thức đã được ghi nhận, không thể làm lại." } };
    }

    if (mode === "official" && assignment.official_attempts_used >= getOfficialAttemptLimit(assignment)) {
      return { status: 409 as const, body: { error: "Bài chính thức đã hết lượt làm." } };
    }

    const [activeQuestionRows] = await connection.query<ActiveQuestionRow[]>(
      `
      SELECT id
      FROM questions
      WHERE test_id = ? AND is_active = 1
      ORDER BY id
      `,
      [testId]
    );

    const activeQuestionIds = activeQuestionRows.map((row) => Number(row.id));
    const [optionRows] = await connection.query<AnswerOptionRow[]>(
      `
      SELECT
        ao.question_id,
        ao.id AS option_id,
        ao.is_correct
      FROM answer_options ao
      JOIN questions q ON q.id = ao.question_id
      WHERE q.test_id = ? AND q.is_active = 1
      ORDER BY ao.question_id, ao.sort_order, ao.id
      `,
      [testId]
    );

    const validOptionsByQuestion = new Map<number, Set<number>>();
    const correctMap = new Map<string, number>();
    for (const row of optionRows) {
      const questionId = Number(row.question_id);
      const optionId = Number(row.option_id);
      const validOptions = validOptionsByQuestion.get(questionId) ?? new Set<number>();
      validOptions.add(optionId);
      validOptionsByQuestion.set(questionId, validOptions);
      correctMap.set(`${questionId}:${optionId}`, Number(row.is_correct));
    }

    const validationError = validateSubmittedAnswers(submittedAnswers, activeQuestionIds, validOptionsByQuestion);
    if (validationError) {
      return validationError;
    }

    const totalQuestions = activeQuestionIds.length;
    const correctAnswers = submittedAnswers.reduce((sum, answer) => {
      return sum + (correctMap.get(`${answer.questionId}:${answer.selectedOptionId}`) ? 1 : 0);
    }, 0);
    const score = Number(((correctAnswers / totalQuestions) * 100).toFixed(2));
    const resultStatus = getResultStatus(score, assignment.pass_score);

    const [attemptCountRows] = await connection.query<CountRow[]>(
      "SELECT COUNT(*) + 1 AS total FROM test_attempts WHERE assignment_id = ? AND mode = ?",
      [assignment.assignment_id, mode]
    );
    const attemptNo = attemptCountRows[0]?.total ?? 1;

    const [attemptResult] = await connection.execute<ResultSetHeader>(
      `
      INSERT INTO test_attempts
        (assignment_id, employee_id, test_id, mode, attempt_no, submitted_at, time_spent_seconds, total_questions, correct_answers, score, result_status, is_recorded)
      VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
      `,
      [
        assignment.assignment_id,
        employee.id,
        testId,
        mode,
        attemptNo,
        timeSpentSeconds,
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
