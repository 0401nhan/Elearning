import { useState, type FormEvent } from "react";
import { Info, KeyRound, Lock, ShieldCheck, User } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { BrandMark } from "./shared";

export function LoginScreen({ onLogin }: { onLogin: (employee: SessionUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error ?? "Không thể đăng nhập. Vui lòng thử lại.");
        return;
      }

      onLogin(data.employee);
    } catch {
      setError("Không thể kết nối hệ thống. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        <form className="login-card" onSubmit={handleSubmit}>
          <BrandMark />
          <h1>Electricbird E-Learning</h1>
          <p>Hệ thống đào tạo & kiểm tra nội bộ</p>

          <label className="field">
            <span>Họ và tên nhân viên / Username</span>
            <div>
              <User size={18} />
              <input
                placeholder="Nhập username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
              />
            </div>
          </label>

          <label className="field">
            <span>Mật khẩu</span>
            <div>
              <KeyRound size={18} />
              <input
                type="password"
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
          </label>

          {error && <p className="login-error">{error}</p>}

          <button className="primary-button login-button" type="submit" disabled={isSubmitting}>
            <Lock size={18} />
            {isSubmitting ? "Đang đăng nhập" : "Đăng nhập"}
          </button>

          <p className="note">
            <Info size={16} /> Vui lòng dùng tài khoản đã được cấp bởi HCNS
          </p>
        </form>

        <div className="login-footer">
          <span>
            <ShieldCheck size={17} /> Dữ liệu được bảo mật và chỉ sử dụng nội bộ công ty
          </span>
          <small>© 2026 Electric Bird. All rights reserved.</small>
        </div>
      </section>
    </main>
  );
}
