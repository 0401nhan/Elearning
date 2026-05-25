import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { canManageMaterials, getCurrentUser } from "@/lib/auth";
import { queryRows, withTransaction } from "@/lib/db";
import { MaterialFileError, saveUploadedMaterialFile } from "@/lib/material-files";

type MaterialRow = RowDataPacket & {
  id: number;
  title: string;
  material_type: string;
  content_url: string | null;
  content_text: string | null;
  department_id: number | null;
  department_name: string | null;
  version_label: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  test_ids: string | null;
  test_titles: string | null;
};

type DepartmentRow = RowDataPacket & {
  id: number;
  name: string;
};

type TestRow = RowDataPacket & {
  id: number;
  title: string;
};

type CountRow = RowDataPacket & {
  total: number;
};

type SummaryRow = RowDataPacket & {
  total: number;
  active: number | null;
  inactive: number | null;
};

const MATERIAL_TYPES = new Set(["pdf", "image", "slide", "text", "video", "link"]);

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

function getMaterialType(value: unknown) {
  const type = String(value ?? "pdf").trim();
  return MATERIAL_TYPES.has(type) ? type : "pdf";
}

function parseBoolean(value: FormDataEntryValue | null, fallback: boolean) {
  if (value === null) {
    return fallback;
  }

  return String(value) === "true" || String(value) === "1";
}

function parseIds(values: FormDataEntryValue[]) {
  const ids = values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set(ids)];
}

function isAllowedContentUrl(url: string) {
  if (url.startsWith("/") && !url.startsWith("//")) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    return false;
  }
}

function mapMaterial(row: MaterialRow) {
  return {
    id: row.id,
    title: row.title,
    materialType: row.material_type,
    contentUrl: row.content_url,
    contentText: row.content_text,
    departmentId: row.department_id,
    departmentName: row.department_name,
    versionLabel: row.version_label,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    testIds: row.test_ids ? row.test_ids.split(",").map(Number).filter(Boolean) : [],
    testTitles: row.test_titles ? row.test_titles.split("|||").filter(Boolean) : []
  };
}

async function requireMaterialManager(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && canManageMaterials(currentUser) ? currentUser : null;
}

export async function GET(request: Request) {
  const currentUser = await requireMaterialManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền quản lý tài liệu đào tạo." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = cleanText(searchParams.get("search"));
  const departmentId = Number(searchParams.get("departmentId") ?? 0);
  const materialType = searchParams.get("materialType") ?? "";
  const status = searchParams.get("status") ?? "active";
  const requestedPage = getIntegerParam(searchParams.get("page"), 1, 1, 10000);
  const pageSize = 10;

  const where: string[] = [];
  const values: (string | number)[] = [];

  if (search) {
    where.push("(m.title LIKE ? OR m.content_text LIKE ? OR t.title LIKE ?)");
    const like = `%${search}%`;
    values.push(like, like, like);
  }

  if (departmentId > 0) {
    where.push("m.department_id = ?");
    values.push(departmentId);
  }

  if (MATERIAL_TYPES.has(materialType)) {
    where.push("m.material_type = ?");
    values.push(materialType);
  }

  if (status === "active") {
    where.push("m.is_active = 1");
  } else if (status === "inactive") {
    where.push("m.is_active = 0");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows, summaryRows, departments, tests] = await Promise.all([
    queryRows<CountRow[]>(
      `
      SELECT COUNT(DISTINCT m.id) AS total
      FROM training_materials m
      LEFT JOIN test_materials tm ON tm.material_id = m.id
      LEFT JOIN tests t ON t.id = tm.test_id
      ${whereSql}
      `,
      values
    ),
    queryRows<SummaryRow[]>(
      `
      SELECT
        COUNT(DISTINCT m.id) AS total,
        COUNT(DISTINCT CASE WHEN m.is_active = 1 THEN m.id END) AS active,
        COUNT(DISTINCT CASE WHEN m.is_active = 0 THEN m.id END) AS inactive
      FROM training_materials m
      LEFT JOIN test_materials tm ON tm.material_id = m.id
      LEFT JOIN tests t ON t.id = tm.test_id
      ${whereSql}
      `,
      values
    ),
    queryRows<DepartmentRow[]>("SELECT id, name FROM departments ORDER BY id"),
    queryRows<TestRow[]>("SELECT id, title FROM tests ORDER BY FIELD(status, 'active', 'draft', 'archived'), title")
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const materials = await queryRows<MaterialRow[]>(
    `
    SELECT
      m.id,
      m.title,
      m.material_type,
      m.content_url,
      m.content_text,
      m.department_id,
      d.name AS department_name,
      m.version_label,
      m.is_active,
      m.created_at,
      m.updated_at,
      GROUP_CONCAT(DISTINCT t.id ORDER BY t.id) AS test_ids,
      GROUP_CONCAT(DISTINCT t.title ORDER BY t.id SEPARATOR '|||') AS test_titles
    FROM training_materials m
    LEFT JOIN departments d ON d.id = m.department_id
    LEFT JOIN test_materials tm ON tm.material_id = m.id
    LEFT JOIN tests t ON t.id = tm.test_id
    ${whereSql}
    GROUP BY
      m.id,
      m.title,
      m.material_type,
      m.content_url,
      m.content_text,
      m.department_id,
      d.name,
      m.version_label,
      m.is_active,
      m.created_at,
      m.updated_at
    ORDER BY m.updated_at DESC, m.id DESC
    LIMIT ${pageSize} OFFSET ${offset}
    `,
    values
  );

  const summary = summaryRows[0];

  return NextResponse.json({
    materials: materials.map(mapMaterial),
    departments,
    tests,
    summary: {
      total: Number(summary?.total ?? 0),
      active: Number(summary?.active ?? 0),
      inactive: Number(summary?.inactive ?? 0)
    },
    pagination: {
      page,
      pageSize,
      total,
      totalPages
    }
  });
}

export async function POST(request: Request) {
  const currentUser = await requireMaterialManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền upload tài liệu đào tạo." }, { status: 403 });
  }

  const formData = await request.formData();
  const title = String(formData.get("title") ?? "").trim();
  const materialType = getMaterialType(formData.get("materialType"));
  const departmentId = Number(formData.get("departmentId")) > 0 ? Number(formData.get("departmentId")) : null;
  const versionLabel = String(formData.get("versionLabel") ?? "1.0").trim() || "1.0";
  const isActive = parseBoolean(formData.get("isActive"), true);
  const contentText = cleanText(formData.get("contentText"));
  const manualUrl = cleanText(formData.get("contentUrl"));
  const testIds = parseIds(formData.getAll("testIds"));
  const file = formData.get("file");

  if (!title) {
    return NextResponse.json({ error: "Tên tài liệu là bắt buộc." }, { status: 400 });
  }

  let contentUrl = manualUrl;

  try {
    if (file instanceof File) {
      const savedFile = await saveUploadedMaterialFile(file);
      contentUrl = savedFile.contentUrl;
    }
  } catch (error) {
    if (error instanceof MaterialFileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }

  if (materialType !== "text" && !contentUrl) {
    return NextResponse.json({ error: "Vui lòng upload file hoặc nhập đường dẫn tài liệu." }, { status: 400 });
  }

  if (contentUrl && !isAllowedContentUrl(contentUrl)) {
    return NextResponse.json({ error: "Duong dan tai lieu chi ho tro http, https hoac duong dan noi bo." }, { status: 400 });
  }

  if (materialType === "text" && !contentText) {
    return NextResponse.json({ error: "Vui lòng nhập nội dung text cho tài liệu." }, { status: 400 });
  }

  const materialId = await withTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      `
      INSERT INTO training_materials
        (title, material_type, content_url, content_text, department_id, version_label, is_active, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [title, materialType, contentUrl, contentText, departmentId, versionLabel, isActive ? 1 : 0, currentUser.id]
    );

    if (testIds.length) {
      await connection.query("INSERT INTO test_materials (test_id, material_id, sort_order) VALUES ?", [
        testIds.map((testId, index) => [testId, result.insertId, index + 1])
      ]);
    }

    return result.insertId;
  });

  return NextResponse.json({ materialId }, { status: 201 });
}
