import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { canManageQuestions, getCurrentUser } from "@/lib/auth";
import { executeQuery, withTransaction } from "@/lib/db";
import { normalizeImageUrl } from "@/lib/question-images";

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
  imageUrl: string | null;
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
    return { options: [] as ParsedOption[], errors: [] as string[] };
  }

  const options = new Map<string, ParsedOption>();
  const errors: string[] = [];

  value.forEach((item, index) => {
    const fallbackLabel = String.fromCharCode(65 + index);
    const label = String(item?.label ?? fallbackLabel).trim().toUpperCase().slice(0, 1);
    const text = String(item?.text ?? "").trim();
    const image = normalizeImageUrl(item?.imageUrl, `Ảnh đáp án ${label || fallbackLabel}`);

    if (image.error) {
      errors.push(image.error);
    }

    if (!label || (!text && !image.url)) {
      return;
    }

    options.set(label, {
      label,
      text,
      imageUrl: image.url,
      isCorrect: Boolean(item?.isCorrect)
    });
  });

  return {
    options: [...options.values()].sort((left, right) => left.label.localeCompare(right.label)),
    errors
  };
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

async function requireQuestionManager(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && canManageQuestions(currentUser) ? currentUser : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireQuestionManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền sửa câu hỏi." }, { status: 403 });
  }

  const { id } = await context.params;
  const questionId = Number(id);
  const body = await request.json().catch(() => null);
  const testId = Number(body?.testId);
  const groupId = Number(body?.groupId) > 0 ? Number(body?.groupId) : null;
  const questionText = String(body?.questionText ?? "").trim();
  const questionImage = normalizeImageUrl(body?.questionImageUrl, "Ảnh câu hỏi");
  const explanation = cleanText(body?.explanation);
  const difficulty = getDifficulty(body?.difficulty);
  const isActive = body?.isActive === undefined ? true : Boolean(body.isActive);
  const parsedOptions = parseOptions(body?.options);
  const options = parsedOptions.options;
  const optionError = validateOptions(options);

  if (!questionId || !testId || !questionText) {
    return NextResponse.json({ error: "Bài test và nội dung câu hỏi là bắt buộc." }, { status: 400 });
  }

  if (optionError) {
    return NextResponse.json({ error: optionError }, { status: 400 });
  }

  if (questionImage.error || parsedOptions.errors.length) {
    return NextResponse.json({ error: questionImage.error ?? parsedOptions.errors[0] }, { status: 400 });
  }

  await withTransaction(async (connection) => {
    await connection.execute<ResultSetHeader>(
      `
      UPDATE questions
      SET test_id = ?,
          group_id = ?,
          question_text = ?,
          image_url = ?,
          explanation = ?,
          difficulty = ?,
          is_active = ?
      WHERE id = ?
      `,
      [testId, groupId, questionText, questionImage.url, explanation, difficulty, isActive ? 1 : 0, questionId]
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
                image_url = ?,
                is_correct = ?,
                sort_order = ?
            WHERE id = ?
            `,
            [option.text, option.imageUrl, option.isCorrect ? 1 : 0, index + 1, optionId]
          );
        }

        return connection.execute<ResultSetHeader>(
          `
          INSERT INTO answer_options
            (question_id, option_label, option_text, image_url, is_correct, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [questionId, option.label, option.text, option.imageUrl, option.isCorrect ? 1 : 0, index + 1]
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
  const currentUser = await requireQuestionManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền tắt câu hỏi." }, { status: 403 });
  }

  const { id } = await context.params;
  const questionId = Number(id);

  if (!questionId) {
    return NextResponse.json({ error: "Câu hỏi không hợp lệ." }, { status: 400 });
  }

  await executeQuery<ResultSetHeader>("UPDATE questions SET is_active = 0 WHERE id = ?", [questionId]);

  return NextResponse.json({ ok: true });
}
