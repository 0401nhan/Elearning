import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function useAdminDialogEscape(open: boolean, onDismiss: () => void, disabled = false) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabled) onDismissRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, open]);
}

export function AdminToast({
  message,
  onDismiss,
  duration = 3600
}: {
  message: string;
  onDismiss: () => void;
  duration?: number;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => onDismissRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [duration, message]);

  if (!message) return null;

  return (
    <div className="admin-toast" role="status" aria-live="polite">
      <CheckCircle2 size={20} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Đóng thông báo">
        <X size={17} />
      </button>
    </div>
  );
}

export function AdminConfirmDialog({
  open,
  title,
  description,
  error = "",
  confirmLabel = "Xác nhận",
  isSubmitting = false,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  error?: string;
  confirmLabel?: string;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onCancelRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop admin-confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel();
      }}
    >
      <section
        className="employee-modal admin-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-description"
      >
        <span className="admin-confirm-icon" aria-hidden="true">
          <AlertTriangle size={25} />
        </span>
        <div>
          <h3 id="admin-confirm-title">{title}</h3>
          <p id="admin-confirm-description">{description}</p>
        </div>
        {error && <p className="login-error admin-confirm-error">{error}</p>}
        <footer>
          <button className="outline-button" type="button" onClick={onCancel} disabled={isSubmitting}>
            Hủy
          </button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={isSubmitting} autoFocus>
            {isSubmitting ? "Đang xử lý..." : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
