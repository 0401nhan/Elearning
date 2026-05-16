import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { executeQuery } from "@/lib/db";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  await executeQuery<ResultSetHeader>("UPDATE employees SET last_login_at = NOW() WHERE id = ?", [currentUser.id]);

  return NextResponse.json({ ok: true });
}
