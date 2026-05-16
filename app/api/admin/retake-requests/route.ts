import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { canViewPeopleResults, getCurrentUser, isAdmin } from "@/lib/auth";
import { queryRows, toNumber, withTransaction } from "@/lib/db";

type RetakeRequestRow = RowDataPacket & {
  id: number;
  assignment_id: number;
  employee_id: number;
  test_id: number;
  full_name: string;
  phone: string;
  department_id: number;
  department_name: string;
  test_title: string;
  official_score: string | number | null;
  official_attempts_used: number;
  approved_retake_count: number;
  reason: string | null;
  status: string;
  requested_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

type ReviewTargetRow = RowDataPacket & {
  id: number;
  assignment_id: number;
  employee_id: number;
  test_id: number;
  status: string;
  full_name: string;
  department_id: number;
  test_title: string;
};

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getStatus(value: string | null) {
  const status = String(value ?? "pending");
  return new Set(["pending", "approved", "rejected"]).has(status) ? status : "pending";
}

function mapRequest(row: RetakeRequestRow) {
  return {
    id: Number(row.id),
    assignmentId: Number(row.assignment_id),
    employeeId: Number(row.employee_id),
    testId: Number(row.test_id),
    fullName: row.full_name,
    phone: row.phone,
    departmentId: Number(row.department_id),
    departmentName: row.department_name,
    testTitle: row.test_title,
    officialScore: toNumber(row.official_score),
    officialAttemptsUsed: Number(row.official_attempts_used),
    approvedRetakeCount: Number(row.approved_retake_count ?? 0),
    reason: row.reason,
    status: row.status,
    requestedAt: row.requested_at,
    reviewedByName: row.reviewed_by_name,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note
  };
}

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  if (!canViewPeopleResults(employee)) {
    return NextResponse.json({ error: "Không có quyền xem yêu cầu thi lại." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = getStatus(searchParams.get("status"));
  const whereSql = isAdmin(employee) ? "WHERE rr.status = ?" : "WHERE rr.status = ? AND e.department_id = ?";
  const values = isAdmin(employee) ? [status] : [status, employee.departmentId];

  const rows = await queryRows<RetakeRequestRow[]>(
    `
    SELECT
      rr.id,
      rr.assignment_id,
      rr.employee_id,
      rr.test_id,
      e.full_name,
      e.phone,
      d.id AS department_id,
      d.name AS department_name,
      t.title AS test_title,
      ta.official_score,
      ta.official_attempts_used,
      COALESCE(approved.approved_retake_count, 0) AS approved_retake_count,
      rr.reason,
      rr.status,
      DATE_FORMAT(rr.requested_at, '%Y-%m-%d %H:%i') AS requested_at,
      reviewer.full_name AS reviewed_by_name,
      DATE_FORMAT(rr.reviewed_at, '%Y-%m-%d %H:%i') AS reviewed_at,
      rr.review_note
    FROM retake_requests rr
    JOIN test_assignments ta ON ta.id = rr.assignment_id
    JOIN employees e ON e.id = rr.employee_id
    JOIN departments d ON d.id = e.department_id
    JOIN tests t ON t.id = rr.test_id
    LEFT JOIN employees reviewer ON reviewer.id = rr.reviewed_by
    LEFT JOIN (
      SELECT assignment_id, COUNT(*) AS approved_retake_count
      FROM retake_requests
      WHERE status = 'approved'
      GROUP BY assignment_id
    ) approved ON approved.assignment_id = rr.assignment_id
    ${whereSql}
    ORDER BY rr.requested_at DESC, rr.id DESC
    LIMIT 50
    `,
    values
  );

  return NextResponse.json({ requests: rows.map(mapRequest) });
}

export async function PATCH(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  if (!canViewPeopleResults(employee)) {
    return NextResponse.json({ error: "Không có quyền duyệt yêu cầu thi lại." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const requestId = Number(body?.requestId);
  const action = String(body?.action ?? "");
  const reviewNote = cleanText(body?.reviewNote);
  const nextStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : null;

  if (!Number.isInteger(requestId) || requestId <= 0 || !nextStatus) {
    return NextResponse.json({ error: "Yêu cầu duyệt thi lại không hợp lệ." }, { status: 400 });
  }

  const result = await withTransaction(async (connection) => {
    const [targetRows] = await connection.query<ReviewTargetRow[]>(
      `
      SELECT
        rr.id,
        rr.assignment_id,
        rr.employee_id,
        rr.test_id,
        rr.status,
        e.full_name,
        e.department_id,
        t.title AS test_title
      FROM retake_requests rr
      JOIN employees e ON e.id = rr.employee_id
      JOIN tests t ON t.id = rr.test_id
      WHERE rr.id = ?
      FOR UPDATE
      `,
      [requestId]
    );

    const target = targetRows[0];
    if (!target) {
      return { status: 404 as const, body: { error: "Không tìm thấy yêu cầu thi lại." } };
    }

    if (!isAdmin(employee) && Number(target.department_id) !== Number(employee.departmentId)) {
      return { status: 403 as const, body: { error: "Không có quyền duyệt yêu cầu của phòng ban này." } };
    }

    if (target.status !== "pending") {
      return { status: 409 as const, body: { error: "Yêu cầu thi lại này đã được xử lý." } };
    }

    await connection.execute<ResultSetHeader>(
      `
      UPDATE retake_requests
      SET status = ?,
          reviewed_by = ?,
          reviewed_at = NOW(),
          review_note = ?
      WHERE id = ?
      `,
      [nextStatus, employee.id, reviewNote, requestId]
    );

    await connection.execute<ResultSetHeader>(
      `
      INSERT INTO notifications (employee_id, title, body, type)
      VALUES (?, ?, ?, 'retake')
      `,
      [
        target.employee_id,
        nextStatus === "approved" ? "Yêu cầu thi lại đã được duyệt" : "Yêu cầu thi lại chưa được duyệt",
        nextStatus === "approved"
          ? `HR/Quản lý đã mở thêm 1 lượt thi chính thức cho bài ${target.test_title}.`
          : `Yêu cầu thi lại bài ${target.test_title} chưa được duyệt.${reviewNote ? ` Lý do: ${reviewNote}` : ""}`
      ]
    );

    return {
      status: 200 as const,
      body: {
        ok: true,
        requestId,
        status: nextStatus
      }
    };
  });

  return NextResponse.json(result.body, { status: result.status });
}
