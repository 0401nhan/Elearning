import Image from "next/image";
import { CheckCircle2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metric, ResultStatus, TestStatus } from "@/lib/types";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand brand-compact" : "brand"}>
      <span className="brand-icon">
        <Image
          src="/logo/logo-smallsize.png"
          alt="Electric Bird"
          width={compact ? 34 : 50}
          height={compact ? 34 : 50}
          className="brand-logo"
          priority={!compact}
        />
      </span>
      <span>
        <strong>Electric Bird</strong>
        <small>Uy tín - Chuyên Nghiệp - Hiệu quả</small>
      </span>
    </div>
  );
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function Avatar({ name, initials, small = false }: { name: string; initials?: string | null; small?: boolean }) {
  const displayName = initials?.trim() ? initials.trim().slice(0, 3).toUpperCase() : getInitials(name);

  return (
    <span className={small ? "avatar avatar-small" : "avatar"} title={name} aria-label={name}>
      {displayName}
    </span>
  );
}

export function StatusPill({ status }: { status: TestStatus | ResultStatus }) {
  const className =
    status === "ĐÃ ĐẠT" || status === "Đạt"
      ? "success"
      : status === "CHƯA ĐẠT" || status === "Chưa đạt"
        ? "danger"
        : status === "ĐANG HỌC"
          ? "learning"
          : "neutral";

  return <span className={`status-pill ${className}`}>{status}</span>;
}

export function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="info-table">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  note,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  note: string;
  tone: string;
}) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${tone}`}>
        <Icon size={30} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

export function ProgressLine({
  icon: Icon,
  label,
  value,
  percent,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  percent: number;
  tone: string;
}) {
  return (
    <div className="progress-line">
      <Icon size={18} />
      <span>{label}</span>
      <div className="progress-track">
        <i className={tone} style={{ width: `${percent}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

export function FeatureLine({
  icon: Icon,
  label,
  value,
  success = false
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <div>
      <Icon size={22} />
      <span>{label}</span>
      <strong className={success ? "green-text" : ""}>{value}</strong>
    </div>
  );
}

export function ModeRows({ rows }: { rows: [string, string, boolean][] }) {
  return (
    <div className="mode-rows">
      {rows.map(([label, value, ok]) => (
        <div key={label}>
          <span>{label}</span>
          <strong className={ok ? "ok" : "no"}>{value}</strong>
          {ok ? <CheckCircle2 size={17} /> : <X size={17} />}
        </div>
      ))}
    </div>
  );
}

export function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;
  return (
    <article className="metric-card">
      <span className={`stat-icon ${metric.tone}`}>
        <Icon size={27} />
      </span>
      <div>
        <strong>{metric.value}</strong>
        <span>{metric.label}</span>
        <small>{metric.note}</small>
      </div>
      <i className="metric-track">
        <b className={metric.tone} style={{ width: metric.percent }} />
      </i>
    </article>
  );
}

export function Bar({ label, value, green = false }: { label: string; value: number; green?: boolean }) {
  return (
    <div className="bar-line">
      <span>{label}</span>
      <i>
        <b className={green ? "green" : ""} style={{ width: `${value}%` }} />
      </i>
      <strong>{value}</strong>
    </div>
  );
}

export function Mistake({ question, percent }: { question: string; percent: number }) {
  return (
    <div className="mistake-line">
      <span>{question}</span>
      <i>
        <b style={{ width: `${percent * 4}%` }} />
      </i>
      <strong>{percent}%</strong>
    </div>
  );
}

export function ActionCard({ icon: Icon, label, text }: { icon: LucideIcon; label: string; text: string }) {
  return (
    <button>
      <Icon size={26} />
      <strong>{label}</strong>
      <span>{text}</span>
    </button>
  );
}
