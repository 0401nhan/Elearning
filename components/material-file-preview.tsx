"use client";

import { Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";

const imageExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const videoExtensions = new Set([".mov", ".mp4", ".webm"]);
const browserTextExtensions = new Set([".csv", ".txt"]);
const officeExtensions = new Set([".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"]);

type PreviewMode = "image" | "video" | "browser" | "office" | "link" | "unsupported";

function getFileExtension(url: string) {
  const cleanUrl = url.split(/[?#]/)[0] ?? "";
  const lastSlash = cleanUrl.lastIndexOf("/");
  const filename = lastSlash >= 0 ? cleanUrl.slice(lastSlash + 1) : cleanUrl;
  const lastDot = filename.lastIndexOf(".");

  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
}

function getPreviewMode(materialType: string | undefined, url: string): PreviewMode {
  const extension = getFileExtension(url);

  if (materialType === "image" || imageExtensions.has(extension)) return "image";
  if (materialType === "video" || videoExtensions.has(extension)) return "video";
  if (materialType === "pdf" || extension === ".pdf" || browserTextExtensions.has(extension)) return "browser";
  if (materialType === "slide" || officeExtensions.has(extension)) return "office";
  if (materialType === "link") return "link";

  return "unsupported";
}

function getAbsoluteUrl(url: string) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("/") && !url.startsWith("//") && typeof window !== "undefined") {
    return `${window.location.origin}${url}`;
  }

  return null;
}

function isLocalAddress(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function getOfficeViewerUrl(url: string) {
  const absoluteUrl = getAbsoluteUrl(url);
  if (!absoluteUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(absoluteUrl);
    if (isLocalAddress(parsedUrl.hostname.toLowerCase())) {
      return null;
    }
  } catch {
    return null;
  }

  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`;
}

export function MaterialFilePreview({
  title,
  url,
  materialType,
  onOpen
}: {
  title: string;
  url: string;
  materialType?: string;
  onOpen?: () => void;
}) {
  const mode = getPreviewMode(materialType, url);
  const [officeViewerUrl, setOfficeViewerUrl] = useState<string | null>(null);
  const openButton = (
    <a className="primary-button" href={url} target="_blank" rel="noreferrer" download onClick={onOpen}>
      <Download size={16} /> Tải file gốc
    </a>
  );

  useEffect(() => {
    setOfficeViewerUrl(mode === "office" ? getOfficeViewerUrl(url) : null);
  }, [mode, url]);

  if (mode === "image") {
    return (
      <div className="material-preview-stack">
        <div className="material-preview-toolbar">{openButton}</div>
        <div className="material-browser-preview image-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={title} />
        </div>
      </div>
    );
  }

  if (mode === "video") {
    return (
      <div className="material-preview-stack">
        <div className="material-preview-toolbar">{openButton}</div>
        <div className="material-browser-preview video-preview">
          <video src={url} controls preload="metadata">
            {title}
          </video>
        </div>
      </div>
    );
  }

  if (mode === "browser") {
    return (
      <div className="material-preview-stack">
        <div className="material-preview-toolbar">{openButton}</div>
        <div className="material-browser-preview">
          <iframe src={url} title={title} />
        </div>
      </div>
    );
  }

  if (officeViewerUrl) {
    return (
      <div className="material-preview-stack">
        <div className="material-preview-toolbar">{openButton}</div>
        <div className="material-browser-preview">
          <iframe src={officeViewerUrl} title={title} />
        </div>
      </div>
    );
  }

  return (
    <div className="material-preview-fallback">
      <FileText size={34} />
      <strong>{title}</strong>
      <span>Không thể hiển thị bản xem trước cho định dạng này.</span>
      <div className="material-preview-actions">{openButton}</div>
    </div>
  );
}
