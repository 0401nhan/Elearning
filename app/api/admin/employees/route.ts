import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser, hashPassword, isAdmin } from "@/lib/auth";
import { DEFAULT_WORK_AREAS } from "@/lib/constants";
import { queryRows, withTransaction } from "@/lib/db";

type EmployeeRow = RowDataPacket & {
  id: number;
  employee_code: string;
  username: string;
  full_name: string;
  phone: string;
  email: string | null;
  department_id: number;
  department_name: string;
  work_area: string | null;
  position_title: string | null;
  hire_date: string | null;
  is_active: number;
  last_login_at: string | null;
  roles: string | null;
  role_ids: string | null;
};

type DepartmentRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
};

type RoleRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
};

type DistinctRow = RowDataPacket & {
  value: string;
};

type CountRow = RowDataPacket & {
  total: number;
};

function requireAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  return Boolean(user && isAdmin(user));
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getIntegerParam(value: string | null, fallback: number, min: number, max: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(numberValue, min), max);
}

function parseRoleIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [1];
  }

  const ids = value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  return ids.length ? [...new Set(ids)] : [1];
}

function mapEmployee(row: EmployeeRow) {
  return {
    id: row.id,
    employeeCode: row.employee_code,
    username: row.username,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    departmentId: row.department_id,
    departmentName: row.department_name,
    workArea: row.work_area,
    positionTitle: row.position_title,
    hireDate: row.hire_date,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    roles: row.roles ? row.roles.split(",") : [],
    roleIds: row.role_ids ? row.role_ids.split(",").map(Number) : []
  };
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!requireAdmin(currentUser)) {
    return NextResponse.json({ error: "Chỉ admin được quản lý nhân sự." }, { status: currentUser ? 403 : 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = cleanText(searchParams.get("search"));
  const departmentId = Number(searchParams.get("departmentId") ?? 0);
  const workArea = cleanText(searchParams.get("workArea"));
  const positionTitle = cleanText(searchParams.get("positionTitle"));
  const status = searchParams.get("status") ?? "active";
  const requestedPage = getIntegerParam(searchParams.get("page"), 1, 1, 10000);
  const pageSize = 10;

  const where: string[] = [];
  const values: (string | number)[] = [];

  if (status === "active") {
    where.push("e.is_active = 1");
  } else if (status === "inactive") {
    where.push("e.is_active = 0");
  }

  if (search) {
    where.push("(e.employee_code LIKE ? OR e.username LIKE ? OR e.full_name LIKE ? OR e.phone LIKE ? OR e.email LIKE ?)");
    const like = `%${search}%`;
    values.push(like, like, like, like, like);
  }

  if (departmentId > 0) {
    where.push("e.department_id = ?");
    values.push(departmentId);
  }

  if (workArea) {
    where.push("e.work_area = ?");
    values.push(workArea);
  }

  if (positionTitle) {
    where.push("e.position_title = ?");
    values.push(positionTitle);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows, departments, roles, areas, positions] = await Promise.all([
    queryRows<CountRow[]>(`SELECT COUNT(*) AS total FROM employees e ${whereSql}`, values),
    queryRows<DepartmentRow[]>("SELECT id, code, name FROM departments ORDER BY id"),
    queryRows<RoleRow[]>("SELECT id, code, name FROM roles ORDER BY id"),
    queryRows<DistinctRow[]>(
      "SELECT DISTINCT work_area AS value FROM employees WHERE work_area IS NOT NULL AND work_area <> '' ORDER BY work_area"
    ),
    queryRows<DistinctRow[]>(
      "SELECT DISTINCT position_title AS value FROM employees WHERE position_title IS NOT NULL AND position_title <> '' ORDER BY position_title"
    )
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const employees = await queryRows<EmployeeRow[]>(
    `
    SELECT
      e.id,
      e.employee_code,
      e.username,
      e.full_name,
      e.phone,
      e.email,
      e.department_id,
      d.name AS department_name,
      e.work_area,
      e.position_title,
      e.hire_date,
      e.is_active,
      e.last_login_at,
      GROUP_CONCAT(r.name ORDER BY r.id) AS roles,
      GROUP_CONCAT(r.id ORDER BY r.id) AS role_ids
    FROM employees e
    JOIN departments d ON d.id = e.department_id
    LEFT JOIN employee_roles er ON er.employee_id = e.id
    LEFT JOIN roles r ON r.id = er.role_id
    ${whereSql}
    GROUP BY
      e.id,
      e.employee_code,
      e.username,
      e.full_name,
      e.phone,
      e.email,
      e.department_id,
      d.name,
      e.work_area,
      e.position_title,
      e.hire_date,
      e.is_active,
      e.last_login_at
    ORDER BY e.is_active DESC, d.id, e.full_name
    LIMIT ${pageSize} OFFSET ${offset}
    `,
    values
  );

  return NextResponse.json({
    employees: employees.map(mapEmployee),
    departments,
    roles,
    pagination: {
      page,
      pageSize,
      total,
      totalPages
    },
    filters: {
      workAreas: [...new Set([...DEFAULT_WORK_AREAS, ...areas.map((item) => item.value)])],
      positions: positions.map((item) => item.value)
    }
  });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!requireAdmin(currentUser)) {
    return NextResponse.json({ error: "Chỉ admin được thêm nhân sự." }, { status: currentUser ? 403 : 401 });
  }

  const body = await request.json().catch(() => null);
  const employeeCode = String(body?.employeeCode ?? "").trim().toUpperCase();
  const username = String(body?.username ?? "").trim().toLowerCase();
  const fullName = String(body?.fullName ?? "").trim();
  const phone = String(body?.phone ?? "").trim();
  const password = String(body?.password ?? "");
  const email = cleanText(body?.email);
  const departmentId = Number(body?.departmentId);
  const workArea = cleanText(body?.workArea);
  const positionTitle = cleanText(body?.positionTitle);
  const hireDate = cleanText(body?.hireDate);
  const roleIds = parseRoleIds(body?.roleIds);

  if (!employeeCode || !username || !fullName || !phone || !password || !departmentId) {
    return NextResponse.json({ error: "Mã NV, username, họ tên, số điện thoại, mật khẩu và phòng ban là bắt buộc." }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Mật khẩu phải có ít nhất 6 ký tự." }, { status: 400 });
  }

  const result = await withTransaction(async (connection) => {
    const [employeeResult] = await connection.execute<ResultSetHeader>(
      `
      INSERT INTO employees
        (employee_code, username, full_name, phone, password_hash, email, department_id, work_area, position_title, hire_date, avatar_initial)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employeeCode,
        username,
        fullName,
        phone,
        hashPassword(password),
        email,
        departmentId,
        workArea,
        positionTitle,
        hireDate,
        fullName.slice(0, 1).toUpperCase()
      ]
    );

    await connection.query("INSERT INTO employee_roles (employee_id, role_id) VALUES ?", [
      roleIds.map((roleId) => [employeeResult.insertId, roleId])
    ]);

    return employeeResult.insertId;
  });

  return NextResponse.json({ employeeId: result }, { status: 201 });
}
