import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { canManageAssignments, getCurrentUser } from "@/lib/auth";
import { executeQuery, queryRows, withTransaction } from "@/lib/db";
import { getCustomRequiredCorrectAnswers, getPassScoreForRequiredCorrectAnswers } from "@/lib/test-passing";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type TestExistsRow = RowDataPacket & {
  id: number;
};

type QuestionRow = RowDataPacket & {
  id: number;
  group_id: number | null;
  group_name: string | null;
  question_text: string;
  question_image_url: string | null;
  explanation: string | null;
  difficulty: string;
  is_active: number;
  option_id: number | null;
  option_label: string | null;
  option_text: string | null;
  option_image_url: string | null;
  is_correct: number | null;
};

const TEST_STATUSES = new Set(["draft", "active", "archived"]);

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getIntegerField(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(numberValue, min), max);
}

function getStatus(value: unknown) {
  const status = String(value ?? "active").trim();
  return TEST_STATUSES.has(status) ? status : "active";
}

function parseMaterialIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  return [...new Set(ids)];
}

async function requireTestManager(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && canManageAssignments(currentUser) ? currentUser : null;
}

export async function GET(request: Request, context: RouteContext) {
  const currentUser = await requireTestManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền xem chi tiết bài test." }, { status: 403 });
  }

  const { id } = await context.params;
  const testId = Number(id);

  if (!testId) {
    return NextResponse.json({ error: "Bài test không hợp lệ." }, { status: 400 });
  }

  const tests = await queryRows<TestExistsRow[]>("SELECT id FROM tests WHERE id = ? LIMIT 1", [testId]);
  if (!tests[0]) {
    return NextResponse.json({ error: "Không tìm thấy bài test." }, { status: 404 });
  }

  const rows = await queryRows<QuestionRow[]>(
    `
    SELECT
      q.id,
      q.group_id,
      qg.name AS group_name,
      q.question_text,
      q.image_url AS question_image_url,
      q.explanation,
      q.difficulty,
      q.is_active,
      ao.id AS option_id,
      ao.option_label,
      ao.option_text,
      ao.image_url AS option_image_url,
      ao.is_correct
    FROM questions q
    LEFT JOIN question_groups qg ON qg.id = q.group_id
    LEFT JOIN answer_options ao ON ao.question_id = q.id
    WHERE q.test_id = ?
    ORDER BY
      COALESCE(qg.sort_order, 999),
      q.id,
      ao.sort_order,
      ao.option_label
    `,
    [testId]
  );

  const questions = Array.from(
    rows.reduce((map, row) => {
      const question = map.get(row.id) ?? {
        id: row.id,
        groupId: row.group_id,
        groupName: row.group_name,
        questionText: row.question_text,
        imageUrl: row.question_image_url,
        explanation: row.explanation,
        difficulty: row.difficulty,
        isActive: Boolean(row.is_active),
        options: [] as {
          id: number;
          label: string;
          text: string;
          imageUrl: string | null;
          isCorrect: boolean;
        }[]
      };

      if (row.option_id && row.option_label) {
        question.options.push({
          id: row.option_id,
          label: row.option_label,
          text: row.option_text ?? "",
          imageUrl: row.option_image_url,
          isCorrect: Boolean(row.is_correct)
        });
      }

      map.set(row.id, question);
      return map;
    }, new Map<number, {
      id: number;
      groupId: number | null;
      groupName: string | null;
      questionText: string;
      imageUrl: string | null;
      explanation: string | null;
      difficulty: string;
      isActive: boolean;
      options: {
        id: number;
        label: string;
        text: string;
        imageUrl: string | null;
        isCorrect: boolean;
      }[];
    }>())
      .values()
  );

  return NextResponse.json({ questions });
}

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireTestManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền sửa bài test." }, { status: 403 });
  }

  const { id } = await context.params;
  const testId = Number(id);
  const body = await request.json().catch(() => null);

  if (!testId) {
    return NextResponse.json({ error: "Bài test không hợp lệ." }, { status: 400 });
  }

  const code = String(body?.code ?? "").trim().toUpperCase();
  const title = String(body?.title ?? "").trim();
  const departmentId = Number(body?.departmentId) > 0 ? Number(body?.departmentId) : null;
  const description = cleanText(body?.description);
  const questionCount = getIntegerField(body?.questionCount, 40, 1, 300);
  const durationMinutes = getIntegerField(body?.durationMinutes, 20, 1, 600);
  const requiredCorrectAnswers = getCustomRequiredCorrectAnswers(body?.requiredCorrectAnswers, questionCount);
  const passScore = getPassScoreForRequiredCorrectAnswers(questionCount, requiredCorrectAnswers);
  const maxOfficialAttempts = getIntegerField(body?.maxOfficialAttempts, 1, 1, 20);
  const status = getStatus(body?.status);
  const materialIds = parseMaterialIds(body?.materialIds);

  if (!code || !title) {
    return NextResponse.json({ error: "Mã bài test và tên bài test là bắt buộc." }, { status: 400 });
  }

  try {
    await withTransaction(async (connection) => {
      await connection.execute<ResultSetHeader>(
        `
        UPDATE tests
        SET code = ?,
            title = ?,
            department_id = ?,
            description = ?,
            question_count = ?,
            duration_minutes = ?,
            pass_score = ?,
            required_correct_answers = ?,
            max_official_attempts = ?,
            allow_unlimited_practice = ?,
            randomize_questions = ?,
            randomize_answers = ?,
            show_practice_answers = ?,
            show_official_answers = ?,
            status = ?
        WHERE id = ?
        `,
        [
          code,
          title,
          departmentId,
          description,
          questionCount,
          durationMinutes,
          passScore,
          requiredCorrectAnswers,
          maxOfficialAttempts,
          body?.allowUnlimitedPractice ? 1 : 0,
          body?.randomizeQuestions ? 1 : 0,
          body?.randomizeAnswers ? 1 : 0,
          body?.showPracticeAnswers ? 1 : 0,
          body?.showOfficialAnswers ? 1 : 0,
          status,
          testId
        ]
      );

      await connection.execute("DELETE FROM test_materials WHERE test_id = ?", [testId]);

      if (materialIds.length) {
        await connection.query("INSERT INTO test_materials (test_id, material_id, sort_order) VALUES ?", [
          materialIds.map((materialId, index) => [testId, materialId, index + 1])
        ]);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "Mã bài test đã tồn tại." }, { status: 409 });
    }

    throw error;
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const currentUser = await requireTestManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền khóa bài test." }, { status: 403 });
  }

  const { id } = await context.params;
  const testId = Number(id);

  if (!testId) {
    return NextResponse.json({ error: "Bài test không hợp lệ." }, { status: 400 });
  }

  await executeQuery<ResultSetHeader>("UPDATE tests SET status = 'archived' WHERE id = ?", [testId]);

  return NextResponse.json({ ok: true });
}
