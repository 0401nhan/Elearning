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

type NotificationTargetRow = RowDataPacket & {
  id: number;
  employee_id: number | null;
};

const NOTIFICATION_TYPES = new Set(["assignment", "material", "result", "retake", "system"]);
const USER_READ_SQL = "CASE WHEN n.employee_id IS NULL THEN COALESCE(nr.is_read, 0) ELSE n.is_read END";

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
  const filters = ["(n.employee_id = ? OR n.employee_id IS NULL)"];
  const values: (string | number)[] = [employee.id];

  if (type && NOTIFICATION_TYPES.has(type)) {
    filters.push("n.type = ?");
    values.push(type);
  }

  if (status === "unread") {
    filters.push(`${USER_READ_SQL} = 0`);
  } else if (status === "read") {
    filters.push(`${USER_READ_SQL} = 1`);
  }

  if (search) {
    filters.push("(n.title LIKE ? OR n.body LIKE ?)");
    const like = `%${search}%`;
    values.push(like, like);
  }

  const whereSql = `WHERE ${filters.join(" AND ")}`;
  const rowValues = [employee.id, ...values];

  const [rows, counts] = await Promise.all([
    queryRows<NotificationRow[]>(
      `
      SELECT
        n.id,
        n.title,
        n.body,
        n.type,
        ${USER_READ_SQL} AS is_read,
        DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM notifications n
      LEFT JOIN notification_reads nr
        ON nr.notification_id = n.id AND nr.employee_id = ?
      ${whereSql}
      ORDER BY is_read ASC, created_at DESC, id DESC
      LIMIT 80
      `,
      rowValues
    ),
    queryRows<CountRow[]>(
      `
      SELECT
        COUNT(*) AS total,
        SUM(${USER_READ_SQL} = 0) AS unread,
        SUM(n.type = 'assignment') AS assignment,
        SUM(n.type = 'material') AS material,
        SUM(n.type = 'result') AS result,
        SUM(n.type = 'retake') AS retake,
        SUM(n.type = 'system') AS system_count
      FROM notifications n
      LEFT JOIN notification_reads nr
        ON nr.notification_id = n.id AND nr.employee_id = ?
      WHERE n.employee_id = ? OR n.employee_id IS NULL
      `,
      [employee.id, employee.id]
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
    const ownResult = await executeQuery<ResultSetHeader>(
      "UPDATE notifications SET is_read = 1 WHERE employee_id = ? AND is_read = 0",
      [employee.id]
    );
    const globalResult = await executeQuery<ResultSetHeader>(
      `
      INSERT INTO notification_reads (notification_id, employee_id, is_read, read_at)
      SELECT id, ?, 1, NOW()
      FROM notifications
      WHERE employee_id IS NULL
      ON DUPLICATE KEY UPDATE
        is_read = 1,
        read_at = NOW()
      `,
      [employee.id]
    );

    return NextResponse.json({ ok: true, affectedRows: ownResult.affectedRows + globalResult.affectedRows });
  }

  if (!notificationId) {
    return NextResponse.json({ error: "Thiếu thông báo." }, { status: 400 });
  }

  const isRead = action === "unread" ? 0 : 1;
  const rows = await queryRows<NotificationTargetRow[]>(
    "SELECT id, employee_id FROM notifications WHERE id = ? AND (employee_id = ? OR employee_id IS NULL) LIMIT 1",
    [notificationId, employee.id]
  );
  const notification = rows[0];

  if (!notification) {
    return NextResponse.json({ error: "Không tìm thấy thông báo." }, { status: 404 });
  }

  if (notification.employee_id === null) {
    const result = await executeQuery<ResultSetHeader>(
      `
      INSERT INTO notification_reads (notification_id, employee_id, is_read, read_at)
      VALUES (?, ?, ?, IF(? = 1, NOW(), NULL))
      ON DUPLICATE KEY UPDATE
        is_read = VALUES(is_read),
        read_at = IF(VALUES(is_read) = 1, NOW(), NULL)
      `,
      [notificationId, employee.id, isRead, isRead]
    );

    return NextResponse.json({ ok: true, affectedRows: result.affectedRows });
  }

  const result = await executeQuery<ResultSetHeader>(
    "UPDATE notifications SET is_read = ? WHERE id = ? AND employee_id = ?",
    [isRead, notificationId, employee.id]
  );

  return NextResponse.json({ ok: true, affectedRows: result.affectedRows });
}
