import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser, hashPassword, isAdmin } from "@/lib/auth";
import { withTransaction } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DEFAULT_ROLE_ID = 1;
const ALLOWED_ROLE_IDS = new Set([1, 2, 6]);

type EmployeeIdRow = RowDataPacket & {
  id: number;
};

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseRoleIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [DEFAULT_ROLE_ID];
  }

  const roleId = value
    .map((item) => Number(item))
    .find((item) => Number.isInteger(item) && ALLOWED_ROLE_IDS.has(item));

  return [roleId ?? DEFAULT_ROLE_ID];
}

async function requireAdmin(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && isAdmin(currentUser) ? currentUser : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Chỉ admin được sửa nhân sự." }, { status: 403 });
  }

  const { id } = await context.params;
  const employeeId = Number(id);
  const body = await request.json().catch(() => null);
  const employeeCode = String(body?.employeeCode ?? "").trim().toUpperCase();
  const username = String(body?.username ?? "").trim().toLowerCase();
  const fullName = String(body?.fullName ?? "").trim();
  const phone = String(body?.phone ?? "").trim();
  const email = cleanText(body?.email);
  const departmentId = Number(body?.departmentId);
  const workArea = cleanText(body?.workArea);
  const positionTitle = cleanText(body?.positionTitle);
  const hireDate = cleanText(body?.hireDate);
  const isActive = Boolean(body?.isActive);
  const password = String(body?.password ?? "");
  const roleIds = parseRoleIds(body?.roleIds);

  if (!employeeId || !employeeCode || !username || !fullName || !phone || !departmentId) {
    return NextResponse.json({ error: "Thiếu thông tin nhân sự bắt buộc." }, { status: 400 });
  }

  if (password && password.length < 6) {
    return NextResponse.json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự." }, { status: 400 });
  }

  await withTransaction(async (connection) => {
    if (password) {
      await connection.execute<ResultSetHeader>(
        `
        UPDATE employees
        SET employee_code = ?,
            username = ?,
            full_name = ?,
            phone = ?,
            password_hash = ?,
            email = ?,
            department_id = ?,
            work_area = ?,
            position_title = ?,
            hire_date = ?,
            avatar_initial = ?,
            is_active = ?
        WHERE id = ?
        `,
        [
          employeeCode,
          username,
          fullName,
          phone,
          hashPassword(password),
          email,
          departmentId,
          workArea,
          positionTitle,
          hireDate,
          fullName.slice(0, 1).toUpperCase(),
          isActive ? 1 : 0,
          employeeId
        ]
      );
    } else {
      await connection.execute<ResultSetHeader>(
        `
        UPDATE employees
        SET employee_code = ?,
            username = ?,
            full_name = ?,
            phone = ?,
            email = ?,
            department_id = ?,
            work_area = ?,
            position_title = ?,
            hire_date = ?,
            avatar_initial = ?,
            is_active = ?
        WHERE id = ?
        `,
        [
          employeeCode,
          username,
          fullName,
          phone,
          email,
          departmentId,
          workArea,
          positionTitle,
          hireDate,
          fullName.slice(0, 1).toUpperCase(),
          isActive ? 1 : 0,
          employeeId
        ]
      );
    }

    await connection.execute("DELETE FROM employee_roles WHERE employee_id = ?", [employeeId]);
    await connection.query("INSERT INTO employee_roles (employee_id, role_id) VALUES ?", [
      roleIds.map((roleId) => [employeeId, roleId])
    ]);
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const currentUser = await requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Chỉ admin được xóa nhân sự." }, { status: 403 });
  }

  const { id } = await context.params;
  const employeeId = Number(id);

  if (!employeeId) {
    return NextResponse.json({ error: "Nhân sự không hợp lệ." }, { status: 400 });
  }

  if (employeeId === currentUser.id) {
    return NextResponse.json({ error: "Không thể xóa chính tài khoản đang đăng nhập." }, { status: 400 });
  }

  const deletedRows = await withTransaction(async (connection) => {
    const [employeeRows] = await connection.query<EmployeeIdRow[]>(
      "SELECT id FROM employees WHERE id = ? LIMIT 1",
      [employeeId]
    );

    if (!employeeRows.length) {
      return 0;
    }

    await connection.execute("UPDATE tests SET created_by = NULL WHERE created_by = ?", [employeeId]);
    await connection.execute("UPDATE training_materials SET uploaded_by = NULL WHERE uploaded_by = ?", [employeeId]);
    await connection.execute("UPDATE questions SET created_by = NULL WHERE created_by = ?", [employeeId]);
    await connection.execute("UPDATE test_assignments SET assigned_by = NULL WHERE assigned_by = ?", [employeeId]);
    await connection.execute("UPDATE retake_requests SET reviewed_by = NULL WHERE reviewed_by = ?", [employeeId]);
    await connection.execute("UPDATE support_tickets SET assigned_to = NULL WHERE assigned_to = ?", [employeeId]);

    const [deleteResult] = await connection.execute<ResultSetHeader>("DELETE FROM employees WHERE id = ?", [
      employeeId
    ]);
    return deleteResult.affectedRows;
  });

  if (!deletedRows) {
    return NextResponse.json({ error: "Nhân sự không tồn tại hoặc đã được xóa." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
