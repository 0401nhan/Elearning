import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { executeQuery, withTransaction } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ExistingOptionRow = RowDataPacket & {
  id: number;
  option_label: string;
};

type ParsedOption = {
  label: string;
  text: string;
  isCorrect: boolean;
};

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getDifficulty(value: unknown) {
  const difficulty = String(value ?? "medium").trim();
  return DIFFICULTIES.has(difficulty) ? difficulty : "medium";
}

function parseOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const options = new Map<string, ParsedOption>();

  value.forEach((item, index) => {
    const fallbackLabel = String.fromCharCode(65 + index);
    const label = String(item?.label ?? fallbackLabel).trim().toUpperCase().slice(0, 1);
    const text = String(item?.text ?? "").trim();

    if (!label || !text) {
      return;
    }

    options.set(label, {
      label,
      text,
      isCorrect: Boolean(item?.isCorrect)
    });
  });

  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function validateOptions(options: ParsedOption[]) {
  if (options.length < 2) {
    return "Cần ít nhất 2 đáp án cho mỗi câu hỏi.";
  }

  if (options.filter((option) => option.isCorrect).length !== 1) {
    return "Mỗi câu hỏi phải có đúng 1 đáp án đúng.";
  }

  return null;
}

async function requireAdmin(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && isAdmin(currentUser) ? currentUser : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Chỉ admin được sửa câu hỏi." }, { status: 403 });
  }

  const { id } = await context.params;
  const questionId = Number(id);
  const body = await request.json().catch(() => null);
  const testId = Number(body?.testId);
  const groupId = Number(body?.groupId) > 0 ? Number(body?.groupId) : null;
  const questionText = String(body?.questionText ?? "").trim();
  const explanation = cleanText(body?.explanation);
  const difficulty = getDifficulty(body?.difficulty);
  const isActive = body?.isActive === undefined ? true : Boolean(body.isActive);
  const options = parseOptions(body?.options);
  const optionError = validateOptions(options);

  if (!questionId || !testId || !questionText) {
    return NextResponse.json({ error: "Bài test và nội dung câu hỏi là bắt buộc." }, { status: 400 });
  }

  if (optionError) {
    return NextResponse.json({ error: optionError }, { status: 400 });
  }

  await withTransaction(async (connection) => {
    await connection.execute<ResultSetHeader>(
      `
      UPDATE questions
      SET test_id = ?,
          group_id = ?,
          question_text = ?,
          explanation = ?,
          difficulty = ?,
          is_active = ?
      WHERE id = ?
      `,
      [testId, groupId, questionText, explanation, difficulty, isActive ? 1 : 0, questionId]
    );

    const [existingRows] = await connection.execute<ExistingOptionRow[]>(
      "SELECT id, option_label FROM answer_options WHERE question_id = ?",
      [questionId]
    );
    const existingByLabel = new Map(existingRows.map((row) => [row.option_label, row.id]));

    await Promise.all(
      options.map((option, index) => {
        const optionId = existingByLabel.get(option.label);

        if (optionId) {
          return connection.execute<ResultSetHeader>(
            `
            UPDATE answer_options
            SET option_text = ?,
                is_correct = ?,
                sort_order = ?
            WHERE id = ?
            `,
            [option.text, option.isCorrect ? 1 : 0, index + 1, optionId]
          );
        }

        return connection.execute<ResultSetHeader>(
          `
          INSERT INTO answer_options
            (question_id, option_label, option_text, is_correct, sort_order)
          VALUES (?, ?, ?, ?, ?)
          `,
          [questionId, option.label, option.text, option.isCorrect ? 1 : 0, index + 1]
        );
      })
    );

    const labels = options.map((option) => option.label);
    if (labels.length) {
      await connection.query("DELETE FROM answer_options WHERE question_id = ? AND option_label NOT IN (?)", [
        questionId,
        labels
      ]);
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const currentUser = await requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Chỉ admin được tắt câu hỏi." }, { status: 403 });
  }

  const { id } = await context.params;
  const questionId = Number(id);

  if (!questionId) {
    return NextResponse.json({ error: "Câu hỏi không hợp lệ." }, { status: 400 });
  }

  await executeQuery<ResultSetHeader>("UPDATE questions SET is_active = 0 WHERE id = ?", [questionId]);

  return NextResponse.json({ ok: true });
}
