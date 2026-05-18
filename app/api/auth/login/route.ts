import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import {
  createSessionToken,
  getSessionCookieOptions,
  getUserByCredentials,
  SESSION_COOKIE_NAME
} from "@/lib/auth";
import { executeQuery } from "@/lib/db";
import {
  clearLoginRateLimit,
  getLoginRateLimitKey,
  getLoginRateLimitStatus,
  recordFailedLogin
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const rateLimitKey = getLoginRateLimitKey(request, username);
  const rateLimit = getLoginRateLimitStatus(rateLimitKey);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Thử đăng nhập quá nhiều lần. Vui lòng chờ rồi thử lại." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Username và mật khẩu là bắt buộc." }, { status: 400 });
  }

  const employee = await getUserByCredentials(username, password);
  if (!employee) {
    recordFailedLogin(rateLimitKey);
    return NextResponse.json({ error: "Thông tin đăng nhập không hợp lệ." }, { status: 401 });
  }

  clearLoginRateLimit(rateLimitKey);
  await executeQuery<ResultSetHeader>("UPDATE employees SET last_login_at = NOW() WHERE id = ?", [employee.id]);

  const response = NextResponse.json({ employee });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(employee.id), getSessionCookieOptions());

  return response;
}
