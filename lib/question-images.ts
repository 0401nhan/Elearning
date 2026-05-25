export function normalizeImageUrl(value: unknown, fieldLabel = "Image") {
  const text = String(value ?? "").trim();

  if (!text) {
    return { url: null as string | null, error: null as string | null };
  }

  if (text.length > 500) {
    return { url: null, error: `${fieldLabel} tối đa 500 ký tự.` };
  }

  if (text.startsWith("/") && !text.startsWith("//")) {
    return { url: text, error: null };
  }

  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return { url: url.toString(), error: null };
    }
  } catch {
    // Fall through to the shared validation message.
  }

  return { url: null, error: `${fieldLabel} phải là URL http(s) hoặc đường dẫn public bắt đầu bằng /.` };
}
