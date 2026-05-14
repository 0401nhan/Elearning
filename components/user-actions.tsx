import { CheckCircle2, ChevronDown, KeyRound, LogOut, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { SessionUser } from "@/lib/types";
import { Avatar } from "./shared";

export function UserActions({
  user,
  roleLabel,
  onLogout
}: {
  user: SessionUser;
  roleLabel?: string;
  onLogout: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  function openPasswordModal() {
    setIsMenuOpen(false);
    setIsPasswordModalOpen(true);
  }

  return (
    <div className="profile-menu">
      <button
        className="profile-chip profile-menu-button"
        type="button"
        onClick={() => setIsMenuOpen((value) => !value)}
      >
        <Avatar name={user.fullName.slice(0, 1)} />
        <div>
          <strong>{user.fullName}</strong>
          <span>{roleLabel ?? `${user.code} - ${user.position ?? user.department}`}</span>
        </div>
        <ChevronDown size={18} />
      </button>

      {isMenuOpen && (
        <div className="profile-dropdown">
          <button type="button" onClick={openPasswordModal}>
            <KeyRound size={17} /> Đổi mật khẩu
          </button>
          <button type="button" onClick={onLogout}>
            <LogOut size={17} /> Đăng xuất
          </button>
        </div>
      )}

      {isPasswordModalOpen && (
        <ChangePasswordModal
          onClose={() => setIsPasswordModalOpen(false)}
        />
      )}
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        })
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error ?? "Không thể đổi mật khẩu.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Đổi mật khẩu thành công.");
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="password-modal" onSubmit={handleSubmit}>
        <header>
          <div>
            <h3>Đổi mật khẩu</h3>
            <p>Cập nhật mật khẩu đăng nhập cho tài khoản hiện tại.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </header>

        <label className="field">
          <span>Mật khẩu hiện tại</span>
          <div>
            <KeyRound size={18} />
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
        </label>

        <label className="field">
          <span>Mật khẩu mới</span>
          <div>
            <KeyRound size={18} />
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
        </label>

        <label className="field">
          <span>Nhập lại mật khẩu mới</span>
          <div>
            <KeyRound size={18} />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
        </label>

        {error && <p className="login-error">{error}</p>}
        {success && (
          <p className="password-success">
            <CheckCircle2 size={16} /> {success}
          </p>
        )}

        <footer>
          <button className="outline-button" type="button" onClick={onClose}>
            Đóng
          </button>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Đang lưu" : "Lưu mật khẩu"}
          </button>
        </footer>
      </form>
    </div>
  );
}
