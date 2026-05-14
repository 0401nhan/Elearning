import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { queryRows } from "@/lib/db";

type NotificationRow = RowDataPacket & {
  id: number;
  title: string;
  body: string;
  type: string;
  is_read: number;
  created_at: string;
};

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const rows = await queryRows<NotificationRow[]>(
    `
    SELECT id, title, body, type, is_read, created_at
    FROM notifications
    WHERE employee_id = ? OR employee_id IS NULL
    ORDER BY created_at DESC
    LIMIT 50
    `,
    [employee.id]
  );

  return NextResponse.json({
    notifications: rows.map((row) => ({
      ...row,
      is_read: Boolean(row.is_read)
    }))
  });
}
