import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { executeQuery, queryRows } from "@/lib/db";

type AssignmentRow = RowDataPacket & {
  assignment_id: number;
  test_title: string;
  status: string;
  official_attempts_used: number;
  max_official_attempts: number;
  approved_retake_count: number;
};

type PendingRetakeRow = RowDataPacket & {
  id: number;
};

function cleanReason(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getOfficialAttemptLimit(assignment: Pick<AssignmentRow, "max_official_attempts" | "approved_retake_count">) {
  return Number(assignment.max_official_attempts) + Number(assignment.approved_retake_count ?? 0);
}

export async function POST(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const testId = Number(body?.testId);
  const reason = cleanReason(body?.reason);

  if (!Number.isInteger(testId) || testId <= 0) {
    return NextResponse.json({ error: "Thiếu bài test cần xin thi lại." }, { status: 400 });
  }

  const assignmentRows = await queryRows<AssignmentRow[]>(
    `
    SELECT
      ta.id AS assignment_id,
      t.title AS test_title,
      ta.status,
      ta.official_attempts_used,
      t.max_official_attempts,
      COALESCE(retake.approved_retake_count, 0) AS approved_retake_count
    FROM test_assignments ta
    JOIN tests t ON t.id = ta.test_id
    LEFT JOIN (
      SELECT assignment_id, COUNT(*) AS approved_retake_count
      FROM retake_requests
      WHERE status = 'approved'
      GROUP BY assignment_id
    ) retake ON retake.assignment_id = ta.id
    WHERE ta.employee_id = ? AND ta.test_id = ?
    LIMIT 1
    `,
    [employee.id, testId]
  );

  const assignment = assignmentRows[0];
  if (!assignment) {
    return NextResponse.json({ error: "Bạn chưa được giao bài test này." }, { status: 404 });
  }

  if (assignment.status !== "failed") {
    return NextResponse.json({ error: "Chỉ có thể xin thi lại sau khi bài chính thức chưa đạt." }, { status: 409 });
  }

  if (Number(assignment.official_attempts_used) < getOfficialAttemptLimit(assignment)) {
    return NextResponse.json({ error: "Bạn đang có lượt thi chính thức có thể sử dụng." }, { status: 409 });
  }

  const pendingRows = await queryRows<PendingRetakeRow[]>(
    `
    SELECT id
    FROM retake_requests
    WHERE assignment_id = ? AND employee_id = ? AND test_id = ? AND status = 'pending'
    LIMIT 1
    `,
    [assignment.assignment_id, employee.id, testId]
  );

  if (pendingRows[0]) {
    return NextResponse.json({ error: "Yêu cầu thi lại của bài này đang chờ duyệt." }, { status: 409 });
  }

  const result = await executeQuery<ResultSetHeader>(
    `
    INSERT INTO retake_requests (assignment_id, employee_id, test_id, reason)
    VALUES (?, ?, ?, ?)
    `,
    [
      assignment.assignment_id,
      employee.id,
      testId,
      reason ?? `Nhân sự xin mở lại lượt thi chính thức cho bài ${assignment.test_title}.`
    ]
  );

  return NextResponse.json(
    {
      requestId: result.insertId,
      status: "pending",
      message: "Yêu cầu thi lại đã được gửi và đang chờ HR/Quản lý duyệt."
    },
    { status: 201 }
  );
}
