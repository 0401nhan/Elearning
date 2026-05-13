import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { executeQuery, queryRows } from "@/lib/db";

type LoginRow = RowDataPacket & {
  id: number;
  employee_code: string;
  username: string;
  full_name: string;
  phone: string;
  department_name: string;
  position_title: string | null;
  roles: string | null;
};

function normalizePhone(phone: string) {
  return phone.replace(/\s+/g, "");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(body?.phone ?? ""));

  if (!username || !phone) {
    return NextResponse.json({ error: "Username và số điện thoại là bắt buộc." }, { status: 400 });
  }

  const rows = await queryRows<LoginRow[]>(
    `
    SELECT
      e.id,
      e.employee_code,
      e.username,
      e.full_name,
      e.phone,
      d.name AS department_name,
      e.position_title,
      GROUP_CONCAT(r.code ORDER BY r.code) AS roles
    FROM employees e
    JOIN departments d ON d.id = e.department_id
    LEFT JOIN employee_roles er ON er.employee_id = e.id
    LEFT JOIN roles r ON r.id = er.role_id
    WHERE e.username = ? AND REPLACE(e.phone, ' ', '') = ? AND e.is_active = 1
    GROUP BY e.id
    LIMIT 1
    `,
    [username, phone]
  );

  const employee = rows[0];
  if (!employee) {
    return NextResponse.json({ error: "Thông tin đăng nhập không hợp lệ." }, { status: 401 });
  }

  await executeQuery<ResultSetHeader>("UPDATE employees SET last_login_at = NOW() WHERE id = ?", [employee.id]);

  return NextResponse.json({
    employee: {
      id: employee.id,
      code: employee.employee_code,
      username: employee.username,
      fullName: employee.full_name,
      phone: employee.phone,
      department: employee.department_name,
      position: employee.position_title,
      roles: employee.roles ? employee.roles.split(",") : []
    }
  });
}
