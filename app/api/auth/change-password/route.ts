import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { executeQuery, queryRows } from "@/lib/db";

type PasswordRow = RowDataPacket & {
  password_hash: string;
};

export async function POST(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");
  const confirmPassword = String(body?.confirmPassword ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json({ error: "Vui lòng nhập đầy đủ thông tin." }, { status: 400 });
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự." }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "Mật khẩu xác nhận không khớp." }, { status: 400 });
  }

  const rows = await queryRows<PasswordRow[]>("SELECT password_hash FROM employees WHERE id = ? LIMIT 1", [
    employee.id
  ]);
  const passwordHash = rows[0]?.password_hash;

  if (!passwordHash || !verifyPassword(currentPassword, passwordHash)) {
    return NextResponse.json({ error: "Mật khẩu hiện tại không đúng." }, { status: 400 });
  }

  if (verifyPassword(newPassword, passwordHash)) {
    return NextResponse.json({ error: "Mật khẩu mới không được trùng mật khẩu hiện tại." }, { status: 400 });
  }

  await executeQuery<ResultSetHeader>("UPDATE employees SET password_hash = ? WHERE id = ?", [
    hashPassword(newPassword),
    employee.id
  ]);

  return NextResponse.json({ ok: true });
}
