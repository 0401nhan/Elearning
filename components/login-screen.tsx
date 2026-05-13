import { Info, Lock, Phone, ShieldCheck, User } from "lucide-react";
import { BrandMark } from "./shared";

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-card">
          <BrandMark />
          <h1>Electricbird E-Learning</h1>
          <p>Hệ thống đào tạo & kiểm tra nội bộ</p>

          <label className="field">
            <span>Họ và tên nhân viên / Username</span>
            <div>
              <User size={18} />
              <input placeholder="Nhập họ và tên nhân viên" defaultValue="" />
            </div>
          </label>

          <label className="field">
            <span>Số điện thoại</span>
            <div>
              <Phone size={18} />
              <input placeholder="Nhập số điện thoại" />
            </div>
          </label>

          <button className="primary-button login-button" onClick={onLogin}>
            <Lock size={18} />
            Đăng nhập
          </button>

          <p className="note">
            <Info size={16} /> Vui lòng dùng thông tin đã đăng ký với HCNS
          </p>
        </div>

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
