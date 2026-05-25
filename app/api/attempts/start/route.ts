import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth";
import { toNumber, withTransaction } from "@/lib/db";

type AssignmentLockRow = RowDataPacket & {
  assignment_id: number;
  employee_id: number;
  test_id: number;
  title: string;
  question_count: number;
  duration_minutes: number;
  pass_score: string | number;
  max_official_attempts: number;
  approved_retake_count: number;
  randomize_questions: number;
  randomize_answers: number;
  show_official_answers: number;
  test_status: string;
  assignment_status: string;
  official_attempts_used: number;
  official_score: string | number | null;
};

type AttemptRow = RowDataPacket & {
  id: number;
  attempt_no: number;
  started_at: string;
  elapsed_seconds: number;
};

type CountRow = RowDataPacket & {
  total: number;
};

type QuestionIdRow = RowDataPacket & {
  id: number;
  group_name: string | null;
  question_text: string;
  image_url: string | null;
  explanation: string | null;
  difficulty: string;
};

type OptionIdRow = RowDataPacket & {
  id: number;
  question_id: number;
  option_label: string;
  option_text: string;
  image_url: string | null;
  is_correct: number;
};

type AttemptQuestionRow = RowDataPacket & {
  id: number;
  group_name: string | null;
  question_text: string;
  image_url: string | null;
  explanation: string | null;
  difficulty: string;
};

type AttemptOptionRow = RowDataPacket & {
  id: number;
  question_id: number;
  option_label: string;
  option_text: string;
  image_url: string | null;
};

type SavedAnswerRow = RowDataPacket & {
  question_id: number;
  selected_option_id: number | null;
};

function getOfficialAttemptLimit(assignment: Pick<AssignmentLockRow, "max_official_attempts" | "approved_retake_count">) {
  return Number(assignment.max_official_attempts) + Number(assignment.approved_retake_count ?? 0);
}

function getQuestionLimit(value: number | string | null | undefined) {
  const questionCount = Math.floor(Number(value));
  return Number.isFinite(questionCount) ? Math.max(1, questionCount) : 1;
}

function getDisplayOptionLabel(index: number) {
  return String.fromCharCode(65 + index);
}

async function getAttemptRow(connection: PoolConnection, attemptId: number) {
  const [attemptRows] = await connection.query<AttemptRow[]>(
    `
    SELECT
      id,
      attempt_no,
      DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
      TIMESTAMPDIFF(SECOND, started_at, NOW()) AS elapsed_seconds
    FROM test_attempts
    WHERE id = ?
    LIMIT 1
    `,
    [attemptId]
  );

  return attemptRows[0] ?? null;
}

async function buildAttemptPayload(connection: PoolConnection, assignment: AssignmentLockRow, attempt: AttemptRow) {
  const [questionRows] = await connection.query<AttemptQuestionRow[]>(
    `
    SELECT
      aq.question_id AS id,
      aq.group_name_snapshot AS group_name,
      COALESCE(aq.question_text_snapshot, CONCAT('Câu hỏi #', aq.question_id)) AS question_text,
      aq.image_url_snapshot AS image_url,
      aq.explanation_snapshot AS explanation,
      COALESCE(aq.difficulty_snapshot, 'medium') AS difficulty
    FROM attempt_questions aq
    WHERE aq.attempt_id = ?
    ORDER BY aq.question_order
    `,
    [attempt.id]
  );

  const [optionRows] = await connection.query<AttemptOptionRow[]>(
    `
    SELECT
      aqo.option_id AS id,
      aqo.question_id,
      COALESCE(aqo.option_label_snapshot, '') AS option_label,
      COALESCE(aqo.option_text_snapshot, '') AS option_text,
      aqo.option_image_url_snapshot AS image_url
    FROM attempt_question_options aqo
    WHERE aqo.attempt_id = ?
    ORDER BY aqo.question_id, aqo.option_order
    `,
    [attempt.id]
  );

  const [savedAnswerRows] = await connection.query<SavedAnswerRow[]>(
    `
    SELECT question_id, selected_option_id
    FROM attempt_answers
    WHERE attempt_id = ?
    ORDER BY question_id
    `,
    [attempt.id]
  );

  const durationSeconds = Number(assignment.duration_minutes) * 60;
  const elapsedSeconds = Math.max(0, Number(attempt.elapsed_seconds ?? 0));
  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);

  return {
    attempt: {
      id: Number(attempt.id),
      attemptNo: Number(attempt.attempt_no),
      startedAt: attempt.started_at,
      elapsedSeconds,
      remainingSeconds
    },
    savedAnswers: savedAnswerRows.map((answer) => ({
      questionId: Number(answer.question_id),
      selectedOptionId: answer.selected_option_id === null ? null : Number(answer.selected_option_id)
    })),
    test: {
      id: Number(assignment.test_id),
      title: assignment.title,
      duration_minutes: Number(assignment.duration_minutes),
      pass_score: toNumber(assignment.pass_score),
      max_official_attempts: getOfficialAttemptLimit(assignment),
      official_attempts_used: Number(assignment.official_attempts_used),
      assignment_status: assignment.assignment_status,
      official_score: toNumber(assignment.official_score),
      show_official_answers: Boolean(assignment.show_official_answers)
    },
    questions: questionRows.map((question) => ({
      ...question,
      answers: optionRows
        .filter((option) => Number(option.question_id) === Number(question.id))
        .map((option, index) => ({
          id: Number(option.id),
          option_label: getDisplayOptionLabel(index),
          option_text: option.option_text,
          image_url: option.image_url
        }))
    }))
  };
}

export async function POST(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const testId = Number(body?.testId);
  const mode = body?.mode === "official" ? "official" : null;

  if (!testId || mode !== "official") {
    return NextResponse.json({ error: "Thiếu bài test hoặc chế độ thi chính thức." }, { status: 400 });
  }

  const result = await withTransaction(async (connection) => {
    const [assignmentRows] = await connection.query<AssignmentLockRow[]>(
      `
      SELECT
        ta.id AS assignment_id,
        ta.employee_id,
        ta.test_id,
        t.title,
        t.question_count,
        t.duration_minutes,
        t.pass_score,
        t.max_official_attempts,
        COALESCE(retake.approved_retake_count, 0) AS approved_retake_count,
        t.randomize_questions,
        t.randomize_answers,
        t.show_official_answers,
        t.status AS test_status,
        ta.status AS assignment_status,
        ta.official_attempts_used,
        ta.official_score
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

    if (assignment.test_status !== "active") {
      return { status: 409 as const, body: { error: "Bài test đã được lưu trữ, không thể làm bài." } };
    }

    if (assignment.assignment_status === "passed") {
      return { status: 409 as const, body: { error: "Bài chính thức đã được ghi nhận, không thể làm lại." } };
    }

    const [existingAttemptRows] = await connection.query<AttemptRow[]>(
      `
      SELECT
        id,
        attempt_no,
        DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
        TIMESTAMPDIFF(SECOND, started_at, NOW()) AS elapsed_seconds
      FROM test_attempts
      WHERE assignment_id = ?
        AND employee_id = ?
        AND test_id = ?
        AND mode = 'official'
        AND submitted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
      `,
      [assignment.assignment_id, employee.id, testId]
    );

    if (existingAttemptRows[0]) {
      return {
        status: 200 as const,
        body: await buildAttemptPayload(connection, assignment, existingAttemptRows[0])
      };
    }

    const officialAttemptLimit = getOfficialAttemptLimit(assignment);

    if (Number(assignment.official_attempts_used) >= officialAttemptLimit) {
      return { status: 409 as const, body: { error: "Bài chính thức đã hết lượt làm." } };
    }

    const [questionRows] = await connection.query<QuestionIdRow[]>(
      `
      SELECT
        q.id,
        qg.name AS group_name,
        q.question_text,
        q.image_url,
        q.explanation,
        q.difficulty
      FROM questions q
      LEFT JOIN question_groups qg ON qg.id = q.group_id
      WHERE q.test_id = ? AND q.is_active = 1
      ORDER BY ${assignment.randomize_questions ? "RAND()" : "q.id"}
      LIMIT ${getQuestionLimit(assignment.question_count)}
      `,
      [testId]
    );

    if (!questionRows.length) {
      return { status: 400 as const, body: { error: "Bài test này chưa có câu hỏi đang hoạt động." } };
    }

    const [attemptCountRows] = await connection.query<CountRow[]>(
      "SELECT COUNT(*) + 1 AS total FROM test_attempts WHERE assignment_id = ? AND mode = 'official'",
      [assignment.assignment_id]
    );
    const attemptNo = Number(attemptCountRows[0]?.total ?? 1);

    const [attemptResult] = await connection.execute<ResultSetHeader>(
      `
      INSERT INTO test_attempts
        (assignment_id, employee_id, test_id, mode, attempt_no, total_questions, is_recorded)
      VALUES (?, ?, ?, 'official', ?, ?, 0)
      `,
      [assignment.assignment_id, employee.id, testId, attemptNo, questionRows.length]
    );

    const attemptId = Number(attemptResult.insertId);
    const questionIds = questionRows.map((question) => Number(question.id));

    await connection.query(
      `
      INSERT INTO attempt_questions
        (attempt_id, question_id, question_order, question_text_snapshot, image_url_snapshot, explanation_snapshot, difficulty_snapshot, group_name_snapshot)
      VALUES ?
      `,
      [
        questionRows.map((question, index) => [
          attemptId,
          Number(question.id),
          index + 1,
          question.question_text,
          question.image_url,
          question.explanation,
          question.difficulty,
          question.group_name
        ])
      ]
    );

    const [optionRows] = await connection.query<OptionIdRow[]>(
      `
      SELECT
        ao.id,
        ao.question_id,
        ao.option_label,
        ao.option_text,
        ao.image_url,
        ao.is_correct
      FROM answer_options ao
      JOIN questions q ON q.id = ao.question_id
      WHERE q.id IN (?)
      ORDER BY ao.question_id, ${assignment.randomize_answers ? "RAND()" : "ao.sort_order, ao.id"}
      `,
      [questionIds]
    );

    if (optionRows.length) {
      const optionOrderByQuestion = new Map<number, number>();
      const optionInsertRows = optionRows.map((option) => {
        const questionId = Number(option.question_id);
        const optionOrder = (optionOrderByQuestion.get(questionId) ?? 0) + 1;
        optionOrderByQuestion.set(questionId, optionOrder);
        return [
          attemptId,
          questionId,
          Number(option.id),
          optionOrder,
          option.option_label,
          option.option_text,
          option.image_url,
          Number(option.is_correct) ? 1 : 0
        ];
      });

      await connection.query(
        `
        INSERT INTO attempt_question_options
          (attempt_id, question_id, option_id, option_order, option_label_snapshot, option_text_snapshot, option_image_url_snapshot, is_correct_snapshot)
        VALUES ?
        `,
        [optionInsertRows]
      );
    }

    const createdAttempt = await getAttemptRow(connection, attemptId);
    if (!createdAttempt) {
      return { status: 500 as const, body: { error: "Không thể tạo lượt thi chính thức." } };
    }

    return {
      status: 200 as const,
      body: await buildAttemptPayload(connection, assignment, createdAttempt)
    };
  });

  return NextResponse.json(result.body, { status: result.status });
}
