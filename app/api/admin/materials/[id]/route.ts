import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { canManageMaterials, getCurrentUser } from "@/lib/auth";
import { executeQuery, withTransaction } from "@/lib/db";
import { MaterialFileError, saveUploadedMaterialFile } from "@/lib/material-files";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MATERIAL_TYPES = new Set(["pdf", "image", "slide", "text", "video", "link"]);

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
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

async function requireMaterialManager(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && canManageMaterials(currentUser) ? currentUser : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireMaterialManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền sửa tài liệu đào tạo." }, { status: 403 });
  }

  const { id } = await context.params;
  const materialId = Number(id);
  const formData = await request.formData();
  const title = String(formData.get("title") ?? "").trim();
  const materialType = getMaterialType(formData.get("materialType"));
  const departmentId = Number(formData.get("departmentId")) > 0 ? Number(formData.get("departmentId")) : null;
  const versionLabel = String(formData.get("versionLabel") ?? "1.0").trim() || "1.0";
  const isActive = parseBoolean(formData.get("isActive"), true);
  const contentText = cleanText(formData.get("contentText"));
  const manualUrl = cleanText(formData.get("contentUrl"));
  const currentUrl = cleanText(formData.get("currentUrl"));
  const testIds = parseIds(formData.getAll("testIds"));
  const file = formData.get("file");

  if (!materialId || !title) {
    return NextResponse.json({ error: "Tài liệu không hợp lệ hoặc thiếu tên tài liệu." }, { status: 400 });
  }

  let contentUrl = manualUrl ?? currentUrl;

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

  await withTransaction(async (connection) => {
    await connection.execute<ResultSetHeader>(
      `
      UPDATE training_materials
      SET title = ?,
          material_type = ?,
          content_url = ?,
          content_text = ?,
          department_id = ?,
          version_label = ?,
          is_active = ?
      WHERE id = ?
      `,
      [title, materialType, contentUrl, contentText, departmentId, versionLabel, isActive ? 1 : 0, materialId]
    );

    await connection.execute("DELETE FROM test_materials WHERE material_id = ?", [materialId]);
    if (testIds.length) {
      await connection.query("INSERT INTO test_materials (test_id, material_id, sort_order) VALUES ?", [
        testIds.map((testId, index) => [testId, materialId, index + 1])
      ]);
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const currentUser = await requireMaterialManager(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Không có quyền tắt tài liệu đào tạo." }, { status: 403 });
  }

  const { id } = await context.params;
  const materialId = Number(id);

  if (!materialId) {
    return NextResponse.json({ error: "Tài liệu không hợp lệ." }, { status: 400 });
  }

  await executeQuery<ResultSetHeader>("UPDATE training_materials SET is_active = 0 WHERE id = ?", [materialId]);

  return NextResponse.json({ ok: true });
}
