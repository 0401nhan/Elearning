import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { getCurrentUser, getUserById } from "@/lib/auth";
import { executeQuery } from "@/lib/db";

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanAvatarInitial(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 3);

  return text || null;
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const fullName = String(body?.fullName ?? "").trim();
  const phone = String(body?.phone ?? "").trim();
  const email = cleanText(body?.email);
  const avatarInitial = cleanAvatarInitial(body?.avatarInitial);

  if (!fullName || !phone) {
    return NextResponse.json({ error: "Họ tên và số điện thoại là bắt buộc." }, { status: 400 });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email không hợp lệ." }, { status: 400 });
  }

  await executeQuery<ResultSetHeader>(
    `
    UPDATE employees
    SET full_name = ?,
        phone = ?,
        email = ?,
        avatar_initial = ?
    WHERE id = ?
    `,
    [fullName, phone, email, avatarInitial, currentUser.id]
  );

  const employee = await getUserById(currentUser.id);

  return NextResponse.json({ employee });
}
