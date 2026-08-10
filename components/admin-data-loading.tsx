import { LoaderCircle } from "lucide-react";

export function AdminDataLoading({
  label = "Đang tải dữ liệu...",
  compact = false,
  floating = false
}: {
  label?: string;
  compact?: boolean;
  floating?: boolean;
}) {
  return (
    <div
      className={`admin-data-loading${compact ? " compact" : ""}${floating ? " floating" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoaderCircle size={compact ? 19 : 24} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
