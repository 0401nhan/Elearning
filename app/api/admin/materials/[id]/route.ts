import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { executeQuery, withTransaction } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MATERIAL_TYPES = new Set(["pdf", "image", "slide", "text", "video", "link"]);
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "training-materials");
const PUBLIC_UPLOAD_PATH = "/uploads/training-materials";
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".gif",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp4",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".txt",
  ".webm",
  ".webp",
  ".xls",
  ".xlsx"
]);

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

function safeFileName(name: string) {
  const extension = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const base = path.basename(name, extension).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "tai-lieu"}-${randomUUID()}${extension}`;
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

async function saveUploadedFile(file: File) {
  if (!file.size) {
    return null;
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new Error("FILE_TYPE_NOT_ALLOWED");
  }

  const filename = safeFileName(file.name);
  const fullPath = path.join(UPLOAD_DIR, filename);
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

  return `${PUBLIC_UPLOAD_PATH}/${filename}`;
}

async function requireAdmin(request: Request) {
  const currentUser = await getCurrentUser(request);
  return currentUser && isAdmin(currentUser) ? currentUser : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Chỉ admin được sửa tài liệu đào tạo." }, { status: 403 });
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
      contentUrl = await saveUploadedFile(file);
    }
  } catch (error) {
    if ((error as Error).message === "FILE_TOO_LARGE") {
      return NextResponse.json({ error: "File upload tối đa 30MB." }, { status: 400 });
    }

    if ((error as Error).message === "FILE_TYPE_NOT_ALLOWED") {
      return NextResponse.json({ error: "Dinh dang file upload khong duoc ho tro." }, { status: 400 });
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
  const currentUser = await requireAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Chỉ admin được tắt tài liệu đào tạo." }, { status: 403 });
  }

  const { id } = await context.params;
  const materialId = Number(id);

  if (!materialId) {
    return NextResponse.json({ error: "Tài liệu không hợp lệ." }, { status: 400 });
  }

  await executeQuery<ResultSetHeader>("UPDATE training_materials SET is_active = 0 WHERE id = ?", [materialId]);

  return NextResponse.json({ ok: true });
}
