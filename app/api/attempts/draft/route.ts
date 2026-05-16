import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";

type DraftAttemptRow = RowDataPacket & {
  attempt_id: number;
  duration_minutes: number;
  elapsed_seconds: number;
  submitted_at: string | null;
};

type DraftOptionRow = RowDataPacket & {
  question_id: number;
  option_id: number;
  is_correct: number;
};

export async function POST(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const attemptId = Number(body?.attemptId);
  const questionId = Number(body?.questionId);
  const selectedOptionId = Number(body?.selectedOptionId);

  if (
    !Number.isInteger(attemptId) ||
    attemptId <= 0 ||
    !Number.isInteger(questionId) ||
    questionId <= 0 ||
    !Number.isInteger(selectedOptionId) ||
    selectedOptionId <= 0
  ) {
    return NextResponse.json({ error: "Đáp án nháp không hợp lệ." }, { status: 400 });
  }

  const result = await withTransaction(async (connection) => {
    const [attemptRows] = await connection.query<DraftAttemptRow[]>(
      `
      SELECT
        attempt.id AS attempt_id,
        t.duration_minutes,
        TIMESTAMPDIFF(SECOND, attempt.started_at, NOW()) AS elapsed_seconds,
        DATE_FORMAT(attempt.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at
      FROM test_attempts attempt
      JOIN tests t ON t.id = attempt.test_id
      WHERE attempt.id = ?
        AND attempt.employee_id = ?
        AND attempt.mode = 'official'
      FOR UPDATE
      `,
      [attemptId, employee.id]
    );

    const attempt = attemptRows[0];
    if (!attempt) {
      return { status: 404 as const, body: { error: "Không tìm thấy lượt thi chính thức." } };
    }

    if (attempt.submitted_at) {
      return { status: 409 as const, body: { error: "Lượt thi này đã được nộp." } };
    }

    if (Number(attempt.elapsed_seconds) > Number(attempt.duration_minutes) * 60) {
      return { status: 409 as const, body: { error: "Đã hết thời gian làm bài." } };
    }

    const [optionRows] = await connection.query<DraftOptionRow[]>(
      `
      SELECT
        aqo.question_id,
        aqo.option_id,
        ao.is_correct
      FROM attempt_question_options aqo
      JOIN answer_options ao ON ao.id = aqo.option_id
      WHERE aqo.attempt_id = ?
        AND aqo.question_id = ?
        AND aqo.option_id = ?
      LIMIT 1
      `,
      [attemptId, questionId, selectedOptionId]
    );

    const option = optionRows[0];
    if (!option) {
      return { status: 400 as const, body: { error: "Đáp án không thuộc câu hỏi của lượt thi." } };
    }

    await connection.execute<ResultSetHeader>(
      `
      INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, is_correct, answered_at)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        selected_option_id = VALUES(selected_option_id),
        is_correct = VALUES(is_correct),
        answered_at = NOW()
      `,
      [attemptId, questionId, selectedOptionId, Number(option.is_correct) ? 1 : 0]
    );

    return {
      status: 200 as const,
      body: {
        ok: true,
        attemptId,
        questionId,
        selectedOptionId
      }
    };
  });

  return NextResponse.json(result.body, { status: result.status });
}
