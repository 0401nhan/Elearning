import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { executeQuery, queryRows } from "@/lib/db";

type TicketRow = RowDataPacket & {
  id: number;
  category: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
};

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const tickets = await queryRows<TicketRow[]>(
    `
    SELECT id, category, title, content, status, created_at
    FROM support_tickets
    WHERE employee_id = ?
    ORDER BY created_at DESC
    LIMIT 50
    `,
    [employee.id]
  );

  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const category = String(body?.category ?? "system");
  const title = String(body?.title ?? "").trim();
  const content = String(body?.content ?? "").trim();

  if (!title || !content) {
    return NextResponse.json({ error: "Tiêu đề và nội dung là bắt buộc." }, { status: 400 });
  }

  const result = await executeQuery<ResultSetHeader>(
    `
    INSERT INTO support_tickets (employee_id, category, title, content)
    VALUES (?, ?, ?, ?)
    `,
    [employee.id, category, title, content]
  );

  return NextResponse.json({ ticketId: result.insertId }, { status: 201 });
}
