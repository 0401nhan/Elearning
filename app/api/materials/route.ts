import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { executeQuery, queryRows, toNumber } from "@/lib/db";

type MaterialRow = RowDataPacket & {
  id: number;
  title: string;
  material_type: string;
  content_url: string | null;
  content_text: string | null;
  department_name: string | null;
  version_label: string;
  updated_at: string;
  read_progress_percent: string | number | null;
  test_ids: string | null;
  test_titles: string | null;
};

type TestMaterialRow = RowDataPacket & {
  test_id: number;
};

function cleanText(value: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function splitNumberList(value: string | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => Number(item))
    .filter((item) => item > 0);
}

function splitTextList(value: string | null) {
  return String(value ?? "")
    .split("|||")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = cleanText(searchParams.get("search"));
  const values: (string | number)[] = [employee.id, employee.id];
  const filters = ["m.is_active = 1"];

  if (search) {
    filters.push("(m.title LIKE ? OR m.content_text LIKE ? OR t.title LIKE ?)");
    const like = `%${search}%`;
    values.push(like, like, like);
  }

  const rows = await queryRows<MaterialRow[]>(
    `
    SELECT
      m.id,
      m.title,
      m.material_type,
      m.content_url,
      m.content_text,
      d.name AS department_name,
      m.version_label,
      DATE_FORMAT(m.updated_at, '%Y-%m-%d') AS updated_at,
      COALESCE(mp.read_progress_percent, 0) AS read_progress_percent,
      GROUP_CONCAT(DISTINCT t.id ORDER BY t.id) AS test_ids,
      GROUP_CONCAT(DISTINCT t.title ORDER BY t.id SEPARATOR '|||') AS test_titles
    FROM test_assignments ta
    JOIN test_materials tm ON tm.test_id = ta.test_id
    JOIN training_materials m ON m.id = tm.material_id
    JOIN tests t ON t.id = ta.test_id
    LEFT JOIN departments d ON d.id = m.department_id
    LEFT JOIN material_progress mp ON mp.material_id = m.id AND mp.employee_id = ?
    WHERE ta.employee_id = ? AND t.status = 'active' AND ${filters.join(" AND ")}
    GROUP BY
      m.id,
      m.title,
      m.material_type,
      m.content_url,
      m.content_text,
      d.name,
      m.version_label,
      m.updated_at,
      mp.read_progress_percent
    ORDER BY m.updated_at DESC, m.id DESC
    `,
    values
  );

  return NextResponse.json({
    materials: rows.map((row) => ({
      id: row.id,
      title: row.title,
      materialType: row.material_type,
      contentUrl: row.content_url,
      contentText: row.content_text,
      departmentName: row.department_name,
      versionLabel: row.version_label,
      updatedAt: row.updated_at,
      readProgressPercent: toNumber(row.read_progress_percent) ?? 0,
      testIds: splitNumberList(row.test_ids),
      testTitles: splitTextList(row.test_titles)
    }))
  });
}

export async function POST(request: Request) {
  const employee = await getCurrentUser(request);
  if (!employee) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const materialId = Number(body?.materialId);
  const progress = Math.max(0, Math.min(100, Number(body?.progress ?? 100)));

  if (!materialId) {
    return NextResponse.json({ error: "Thiếu tài liệu." }, { status: 400 });
  }

  const relatedTests = await queryRows<TestMaterialRow[]>(
    `
    SELECT DISTINCT tm.test_id
    FROM test_materials tm
    JOIN test_assignments ta ON ta.test_id = tm.test_id
    JOIN training_materials m ON m.id = tm.material_id
    JOIN tests t ON t.id = ta.test_id
    WHERE ta.employee_id = ? AND tm.material_id = ? AND m.is_active = 1 AND t.status = 'active'
    `,
    [employee.id, materialId]
  );

  if (!relatedTests.length) {
    return NextResponse.json({ error: "Bạn chưa được giao tài liệu này." }, { status: 403 });
  }

  await executeQuery<ResultSetHeader>(
    `
    INSERT INTO material_progress
      (employee_id, material_id, read_progress_percent, first_viewed_at, last_viewed_at, completed_at)
    VALUES (?, ?, ?, NOW(), NOW(), IF(? >= 100, NOW(), NULL))
    ON DUPLICATE KEY UPDATE
      read_progress_percent = GREATEST(read_progress_percent, VALUES(read_progress_percent)),
      first_viewed_at = COALESCE(first_viewed_at, VALUES(first_viewed_at)),
      last_viewed_at = NOW(),
      completed_at = IF(GREATEST(read_progress_percent, VALUES(read_progress_percent)) >= 100, COALESCE(completed_at, NOW()), completed_at)
    `,
    [employee.id, materialId, progress, progress]
  );

  const testIds = relatedTests.map((row) => row.test_id);
  const testPlaceholders = testIds.map(() => "?").join(",");

  await executeQuery<ResultSetHeader>(
    `
    UPDATE test_assignments ta
    SET ta.read_progress_percent = (
      SELECT COALESCE(ROUND(AVG(COALESCE(mp.read_progress_percent, 0)), 2), 0)
      FROM test_materials tm
      JOIN training_materials m ON m.id = tm.material_id AND m.is_active = 1
      LEFT JOIN material_progress mp
        ON mp.material_id = tm.material_id AND mp.employee_id = ta.employee_id
      WHERE tm.test_id = ta.test_id
    ),
    ta.status = IF(ta.status = 'not_started', 'studying', ta.status)
    WHERE ta.employee_id = ? AND ta.test_id IN (${testPlaceholders})
    `,
    [employee.id, ...testIds]
  );

  return NextResponse.json({ ok: true });
}
