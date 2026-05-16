import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { executeQuery, queryRows, toNumber } from "@/lib/db";

type NotificationRow = RowDataPacket & {
  id: number;
  title: string;
  body: string;
  type: string;
  is_read: number;
  created_at: string;
};

type CountRow = RowDataPacket & {
  total: number;
  unread: number;
  assignment: number;
  material: number;
  result: number;
  retake: number;
  system_count: number;
};

const NOTIFICATION_TYPES = new Set(["assignment", "material", "result", "retake", "system"]);

function cleanText(value: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = cleanText(searchParams.get("type"));
  const status = cleanText(searchParams.get("status"));
  const search = cleanText(searchParams.get("search"));
  const filters = ["(employee_id = ? OR employee_id IS NULL)"];
  const values: (string | number)[] = [employee.id];

  if (type && NOTIFICATION_TYPES.has(type)) {
    filters.push("type = ?");
    values.push(type);
  }

  if (status === "unread") {
    filters.push("is_read = 0");
  } else if (status === "read") {
    filters.push("is_read = 1");
  }

  if (search) {
    filters.push("(title LIKE ? OR body LIKE ?)");
    const like = `%${search}%`;
    values.push(like, like);
  }

  const whereSql = `WHERE ${filters.join(" AND ")}`;

  const [rows, counts] = await Promise.all([
    queryRows<NotificationRow[]>(
      `
      SELECT id, title, body, type, is_read, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM notifications
      ${whereSql}
      ORDER BY is_read ASC, created_at DESC, id DESC
      LIMIT 80
      `,
      values
    ),
    queryRows<CountRow[]>(
      `
      SELECT
        COUNT(*) AS total,
        SUM(is_read = 0) AS unread,
        SUM(type = 'assignment') AS assignment,
        SUM(type = 'material') AS material,
        SUM(type = 'result') AS result,
        SUM(type = 'retake') AS retake,
        SUM(type = 'system') AS system_count
      FROM notifications
      WHERE employee_id = ? OR employee_id IS NULL
      `,
      [employee.id]
    )
  ]);

  const summary = counts[0];

  return NextResponse.json({
    summary: {
      total: toNumber(summary?.total) ?? 0,
      unread: toNumber(summary?.unread) ?? 0,
      assignment: toNumber(summary?.assignment) ?? 0,
      material: toNumber(summary?.material) ?? 0,
      result: toNumber(summary?.result) ?? 0,
      retake: toNumber(summary?.retake) ?? 0,
      system: toNumber(summary?.system_count) ?? 0
    },
    notifications: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at
    }))
  });
}

export async function PATCH(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "read");
  const notificationId = Number(body?.notificationId ?? 0);

  if (action === "read_all") {
    const result = await executeQuery<ResultSetHeader>(
      "UPDATE notifications SET is_read = 1 WHERE employee_id = ? OR employee_id IS NULL",
      [employee.id]
    );

    return NextResponse.json({ ok: true, affectedRows: result.affectedRows });
  }

  if (!notificationId) {
    return NextResponse.json({ error: "Thiếu thông báo." }, { status: 400 });
  }

  const isRead = action === "unread" ? 0 : 1;
  const result = await executeQuery<ResultSetHeader>(
    "UPDATE notifications SET is_read = ? WHERE id = ? AND (employee_id = ? OR employee_id IS NULL)",
    [isRead, notificationId, employee.id]
  );

  if (!result.affectedRows) {
    return NextResponse.json({ error: "Không tìm thấy thông báo." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, affectedRows: result.affectedRows });
}
