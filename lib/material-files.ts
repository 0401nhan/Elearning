import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "training-materials");
export const PUBLIC_UPLOAD_PATH = "/uploads/training-materials";
export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
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

type MaterialFileErrorCode = "FILE_TOO_LARGE" | "FILE_TYPE_NOT_ALLOWED";

export class MaterialFileError extends Error {
  code: MaterialFileErrorCode;

  constructor(code: MaterialFileErrorCode, message: string) {
    super(message);
    this.name = "MaterialFileError";
    this.code = code;
  }
}

export type SavedMaterialFile = {
  contentUrl: string | null;
};

function safeFileName(name: string) {
  const extension = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const base = path.basename(name, extension).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "tai-lieu"}-${randomUUID()}${extension}`;
}

function toPublicUploadPath(filename: string) {
  return `${PUBLIC_UPLOAD_PATH}/${filename}`;
}

export async function saveUploadedMaterialFile(file: File): Promise<SavedMaterialFile> {
  if (!file.size) {
    return { contentUrl: null };
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new MaterialFileError("FILE_TOO_LARGE", "File upload tối đa 30MB.");
  }

  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new MaterialFileError("FILE_TYPE_NOT_ALLOWED", "Định dạng file upload không được hỗ trợ.");
  }

  const filename = safeFileName(file.name);
  const fullPath = path.join(UPLOAD_DIR, filename);
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

  return {
    contentUrl: toPublicUploadPath(filename)
  };
}
