import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth";
import { executeQuery, toNumber, withTransaction } from "@/lib/db";

type AssignmentLockRow = RowDataPacket & {
  assignment_id: number;
  employee_id: number;
  test_id: number;
  title: string;
  duration_minutes: number;
  pass_score: string | number;
  max_official_attempts: number;
  approved_retake_count: number;
  randomize_questions: number;
  randomize_answers: number;
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
};

type OptionIdRow = RowDataPacket & {
  id: number;
  question_id: number;
};

type AttemptQuestionRow = RowDataPacket & {
  id: number;
  group_name: string | null;
  question_text: string;
  difficulty: string;
};

type AttemptOptionRow = RowDataPacket & {
  id: number;
  question_id: number;
  option_label: string;
  option_text: string;
};

type SavedAnswerRow = RowDataPacket & {
  question_id: number;
  selected_option_id: number | null;
};

function getOfficialAttemptLimit(assignment: Pick<AssignmentLockRow, "max_official_attempts" | "approved_retake_count">) {
  return Number(assignment.max_official_attempts) + Number(assignment.approved_retake_count ?? 0);
}

async function ensureAttemptQuestionOptionsTable() {
  await executeQuery<ResultSetHeader>(`
    CREATE TABLE IF NOT EXISTS attempt_question_options (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      attempt_id BIGINT UNSIGNED NOT NULL,
      question_id BIGINT UNSIGNED NOT NULL,
      option_id BIGINT UNSIGNED NOT NULL,
      option_order INT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_attempt_question_options_order (attempt_id, question_id, option_order),
      UNIQUE KEY uq_attempt_question_options_option (attempt_id, question_id, option_id),
      CONSTRAINT fk_attempt_question_options_attempt
        FOREIGN KEY (attempt_id) REFERENCES test_attempts(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_attempt_question_options_question
        FOREIGN KEY (question_id) REFERENCES questions(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_attempt_question_options_option
        FOREIGN KEY (option_id) REFERENCES answer_options(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
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
      q.id,
      qg.name AS group_name,
      q.question_text,
      q.difficulty
    FROM attempt_questions aq
    JOIN questions q ON q.id = aq.question_id
    LEFT JOIN question_groups qg ON qg.id = q.group_id
    WHERE aq.attempt_id = ?
    ORDER BY aq.question_order
    `,
    [attempt.id]
  );

  const [optionRows] = await connection.query<AttemptOptionRow[]>(
    `
    SELECT
      ao.id,
      aqo.question_id,
      ao.option_label,
      ao.option_text
    FROM attempt_question_options aqo
    JOIN answer_options ao ON ao.id = aqo.option_id
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
      show_official_answers: false
    },
    questions: questionRows.map((question) => ({
      ...question,
      answers: optionRows
        .filter((option) => Number(option.question_id) === Number(question.id))
        .map((option) => ({
          id: Number(option.id),
          option_label: option.option_label,
          option_text: option.option_text
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

  await ensureAttemptQuestionOptionsTable();

  const result = await withTransaction(async (connection) => {
    const [assignmentRows] = await connection.query<AssignmentLockRow[]>(
      `
      SELECT
        ta.id AS assignment_id,
        ta.employee_id,
        ta.test_id,
        t.title,
        t.duration_minutes,
        t.pass_score,
        t.max_official_attempts,
        COALESCE(retake.approved_retake_count, 0) AS approved_retake_count,
        t.randomize_questions,
        t.randomize_answers,
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
      SELECT id
      FROM questions
      WHERE test_id = ? AND is_active = 1
      ORDER BY ${assignment.randomize_questions ? "RAND()" : "id"}
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

    await connection.query("INSERT INTO attempt_questions (attempt_id, question_id, question_order) VALUES ?", [
      questionRows.map((question, index) => [attemptId, question.id, index + 1])
    ]);

    const [optionRows] = await connection.query<OptionIdRow[]>(
      `
      SELECT ao.id, ao.question_id
      FROM answer_options ao
      JOIN questions q ON q.id = ao.question_id
      WHERE q.test_id = ? AND q.is_active = 1
      ORDER BY ao.question_id, ${assignment.randomize_answers ? "RAND()" : "ao.sort_order, ao.id"}
      `,
      [testId]
    );

    if (optionRows.length) {
      const optionOrderByQuestion = new Map<number, number>();
      const optionInsertRows = optionRows.map((option) => {
        const questionId = Number(option.question_id);
        const optionOrder = (optionOrderByQuestion.get(questionId) ?? 0) + 1;
        optionOrderByQuestion.set(questionId, optionOrder);
        return [attemptId, questionId, Number(option.id), optionOrder];
      });

      await connection.query(
        "INSERT INTO attempt_question_options (attempt_id, question_id, option_id, option_order) VALUES ?",
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
