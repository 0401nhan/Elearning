import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { queryRows, toNumber } from "@/lib/db";

type TestRow = RowDataPacket & {
  id: number;
  code: string;
  title: string;
  department_name: string | null;
  description: string | null;
  question_count: number;
  duration_minutes: number;
  pass_score: string | number;
  max_official_attempts: number;
  allow_unlimited_practice: number;
  randomize_questions: number;
  randomize_answers: number;
  show_practice_answers: number;
  show_official_answers: number;
  assignment_id: number | null;
  assignment_status: string | null;
  read_progress_percent: string | number | null;
  practice_attempt_count: number | null;
  official_attempts_used: number | null;
  official_score: string | number | null;
  due_at: string | null;
};

type MaterialRow = RowDataPacket & {
  id: number;
  title: string;
  material_type: string;
  content_url: string | null;
  content_text: string | null;
  version_label: string;
  read_progress_percent: string | number | null;
};

type QuestionRow = RowDataPacket & {
  id: number;
  group_name: string | null;
  question_text: string;
  explanation: string | null;
  difficulty: string;
};

type AnswerRow = RowDataPacket & {
  id: number;
  question_id: number;
  option_label: string;
  option_text: string;
  is_correct: number;
};

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const testId = Number(searchParams.get("testId") ?? 1);
  const mode = searchParams.get("mode") === "official" ? "official" : "practice";

  const tests = await queryRows<TestRow[]>(
    `
    SELECT
      t.id,
      t.code,
      t.title,
      d.name AS department_name,
      t.description,
      t.question_count,
      t.duration_minutes,
      t.pass_score,
      (t.max_official_attempts + COALESCE(retake.approved_retake_count, 0)) AS max_official_attempts,
      t.allow_unlimited_practice,
      t.randomize_questions,
      t.randomize_answers,
      t.show_practice_answers,
      t.show_official_answers,
      ta.id AS assignment_id,
      ta.status AS assignment_status,
      ta.read_progress_percent,
      ta.practice_attempt_count,
      ta.official_attempts_used,
      ta.official_score,
      DATE_FORMAT(ta.due_at, '%Y-%m-%d') AS due_at
    FROM tests t
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN test_assignments ta ON ta.test_id = t.id AND ta.employee_id = ?
    LEFT JOIN (
      SELECT assignment_id, COUNT(*) AS approved_retake_count
      FROM retake_requests
      WHERE status = 'approved'
      GROUP BY assignment_id
    ) retake ON retake.assignment_id = ta.id
    WHERE t.id = ?
    LIMIT 1
    `,
    [employee.id, testId]
  );

  const test = tests[0];
  if (!test) {
    return NextResponse.json({ error: "Không tìm thấy bài test." }, { status: 404 });
  }

  if (!isAdmin(employee)) {
    const assignments = await queryRows<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM test_assignments WHERE employee_id = ? AND test_id = ? LIMIT 1",
      [employee.id, testId]
    );

    if (!assignments[0]) {
      return NextResponse.json({ error: "Bạn chưa được giao bài test này." }, { status: 403 });
    }
  }

  if (mode === "official") {
    return NextResponse.json(
      { error: "Vui lòng bắt đầu lượt thi chính thức để nhận đề cố định." },
      { status: 400 }
    );
  }

  const [materials, questions, answers] = await Promise.all([
    queryRows<MaterialRow[]>(
      `
      SELECT
        m.id,
        m.title,
        m.material_type,
        m.content_url,
        m.content_text,
        m.version_label,
        COALESCE(mp.read_progress_percent, 0) AS read_progress_percent
      FROM test_materials tm
      JOIN training_materials m ON m.id = tm.material_id
      LEFT JOIN material_progress mp ON mp.material_id = m.id AND mp.employee_id = ?
      WHERE tm.test_id = ? AND m.is_active = 1
      ORDER BY tm.sort_order, m.id
      `,
      [employee.id, testId]
    ),
    queryRows<QuestionRow[]>(
      `
      SELECT q.id, qg.name AS group_name, q.question_text, q.explanation, q.difficulty
      FROM questions q
      LEFT JOIN question_groups qg ON qg.id = q.group_id
      WHERE q.test_id = ? AND q.is_active = 1
      ORDER BY ${test.randomize_questions ? "RAND()" : "q.id"}
      `,
      [testId]
    ),
    queryRows<AnswerRow[]>(
      `
      SELECT ao.id, ao.question_id, ao.option_label, ao.option_text, ao.is_correct
      FROM answer_options ao
      JOIN questions q ON q.id = ao.question_id
      WHERE q.test_id = ? AND q.is_active = 1
      ORDER BY ao.question_id, ${test.randomize_answers ? "RAND()" : "ao.sort_order"}
      `,
      [testId]
    )
  ]);

  const shouldRevealAnswers = mode === "practice";

  return NextResponse.json({
    test: {
      ...test,
      pass_score: toNumber(test.pass_score),
      read_progress_percent: toNumber(test.read_progress_percent),
      practice_attempt_count: toNumber(test.practice_attempt_count) ?? 0,
      official_attempts_used: toNumber(test.official_attempts_used) ?? 0,
      official_score: toNumber(test.official_score),
      allow_unlimited_practice: Boolean(test.allow_unlimited_practice),
      randomize_questions: Boolean(test.randomize_questions),
      randomize_answers: Boolean(test.randomize_answers),
      show_practice_answers: true,
      show_official_answers: false
    },
    materials: materials.map((material) => ({
      ...material,
      read_progress_percent: toNumber(material.read_progress_percent) ?? 0
    })),
    questions: questions.map((question) => ({
      ...question,
      explanation: mode === "practice" ? question.explanation : null,
      answers: answers
        .filter((answer) => answer.question_id === question.id)
        .map((answer) => ({
          ...answer,
          is_correct: shouldRevealAnswers ? Boolean(answer.is_correct) : undefined
        }))
    }))
  });
}
