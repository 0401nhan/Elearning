import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { getCurrentUser, hashPassword, isAdmin } from "@/lib/auth";
import { executeQuery, withTransaction } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DEFAULT_ROLE_ID = 1;
const ALLOWED_ROLE_IDS = new Set([1, 2, 6]);

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

  await executeQuery<ResultSetHeader>("UPDATE employees SET is_active = 0 WHERE id = ?", [employeeId]);

  return NextResponse.json({ ok: true });
}
