import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import {
  createSessionToken,
  getSessionCookieOptions,
  getUserByCredentials,
  SESSION_COOKIE_NAME
} from "@/lib/auth";
import { executeQuery } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return NextResponse.json({ error: "Username và mật khẩu là bắt buộc." }, { status: 400 });
  }

  const employee = await getUserByCredentials(username, password);
  if (!employee) {
    return NextResponse.json({ error: "Thông tin đăng nhập không hợp lệ." }, { status: 401 });
  }

  await executeQuery<ResultSetHeader>("UPDATE employees SET last_login_at = NOW() WHERE id = ?", [employee.id]);

  const response = NextResponse.json({ employee });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(employee.id), getSessionCookieOptions());

  return response;
}
