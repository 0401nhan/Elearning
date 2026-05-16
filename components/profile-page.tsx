import {
  Bell,
  CalendarDays,
  Camera,
  CheckCircle2,
  Edit,
  Lock,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  User,
  X
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { canViewPeopleResultsUser, isAdminUser, isDepartmentManagerUser } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import { Avatar, InfoTable } from "./shared";

export function ProfilePage({
  user,
  onUserUpdate
}: {
  user: SessionUser;
  onUserUpdate: (user: SessionUser) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone);
  const [email, setEmail] = useState(user.email ?? "");
  const [avatarInitial, setAvatarInitial] = useState(user.avatarInitial ?? "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFullName(user.fullName);
    setPhone(user.phone);
    setEmail(user.email ?? "");
    setAvatarInitial(user.avatarInitial ?? "");
  }, [user]);

  const roleText = isAdminUser(user)
    ? "Admin. Toàn quyền hệ thống."
    : isDepartmentManagerUser(user)
      ? "Trưởng phòng. Xem kết quả nhân sự thuộc phòng mình."
      : "Nhân sự. Chỉ xem tài liệu, làm bài và xem kết quả cá nhân.";

  function cancelEdit() {
    setFullName(user.fullName);
    setPhone(user.phone);
    setEmail(user.email ?? "");
    setAvatarInitial(user.avatarInitial ?? "");
    setError("");
    setSuccess("");
    setIsEditing(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fullName,
          phone,
          email,
          avatarInitial
        })
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.employee) {
        setError(data?.error ?? "Không thể cập nhật thông tin.");
        return;
      }

      onUserUpdate(data.employee);
      setSuccess("Cập nhật thông tin thành công.");
      setIsEditing(false);
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Hồ sơ cá nhân</h2>
          <p>Thông tin nhân sự dùng cho đăng nhập, phân quyền và ghi nhận kết quả đào tạo.</p>
        </div>
        {isEditing ? (
          <button className="outline-button" type="button" onClick={cancelEdit}>
            <X size={18} /> Hủy
          </button>
        ) : (
          <button className="outline-button" type="button" onClick={() => setIsEditing(true)}>
            <Edit size={18} /> Cập nhật
          </button>
        )}
      </section>

      {success && (
        <p className="password-success profile-save-status">
          <CheckCircle2 size={16} /> {success}
        </p>
      )}

      {isEditing ? (
        <form className="profile-edit-form" onSubmit={handleSubmit}>
          <section className="profile-layout">
            <article className="panel profile-summary">
              <Avatar name={fullName} initials={avatarInitial} />
              <h3>{fullName || user.fullName}</h3>
              <p>{user.code} · {user.position ?? user.department}</p>
              <span className="status-pill success">Đang hoạt động</span>
            </article>

            <article className="panel profile-form-panel">
              <div className="section-title">
                <h3>Thông tin chung</h3>
              </div>
              <div className="profile-form-grid">
                <label className="field">
                  <span>Avatar</span>
                  <div>
                    <Camera size={18} />
                    <input
                      value={avatarInitial}
                      onChange={(event) => setAvatarInitial(event.target.value.toUpperCase().slice(0, 3))}
                      maxLength={3}
                      placeholder="VD: AD"
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Họ tên</span>
                  <div>
                    <User size={18} />
                    <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
                  </div>
                </label>
                <label className="field">
                  <span>Số điện thoại</span>
                  <div>
                    <Phone size={18} />
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </div>
                </label>
                <label className="field">
                  <span>Email</span>
                  <div>
                    <Mail size={18} />
                    <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </div>
                </label>
              </div>

              {error && <p className="login-error">{error}</p>}
              {success && (
                <p className="password-success">
                  <CheckCircle2 size={16} /> {success}
                </p>
              )}

              <footer className="profile-form-actions">
                <button className="outline-button" type="button" onClick={cancelEdit}>
                  Hủy
                </button>
                <button className="primary-button" type="submit" disabled={isSaving}>
                  <Save size={17} /> {isSaving ? "Đang lưu" : "Lưu thông tin"}
                </button>
              </footer>
            </article>
          </section>
        </form>
      ) : (
        <section className="profile-layout">
          <article className="panel profile-summary">
            <Avatar name={user.fullName} initials={user.avatarInitial} />
            <h3>{user.fullName}</h3>
            <p>{user.code} · {user.position ?? user.department}</p>
            <span className="status-pill success">Đang hoạt động</span>
          </article>

          <article className="panel">
            <div className="section-title">
              <h3>Thông tin nhân sự</h3>
            </div>
            <InfoTable
              rows={[
                ["Họ tên", user.fullName],
                ["Mã nhân viên", user.code],
                ["Số điện thoại", user.phone],
                ["Email", user.email ?? "--"],
                ["Phòng ban", user.department],
                ["Vị trí", user.position ?? "--"],
                ["Quyền xem kết quả nhân sự", canViewPeopleResultsUser(user) ? "Có" : "Không"]
              ]}
            />
          </article>
        </section>
      )}

      <section className="settings-grid">
        <article className="panel setting-card">
          <Phone size={28} />
          <div>
            <h3>Thông tin đăng nhập</h3>
            <p>Username theo tài khoản được cấp và mật khẩu do hệ thống cấp hoặc người dùng tự đổi.</p>
          </div>
          <button className="outline-button">Kiểm tra</button>
        </article>
        <article className="panel setting-card">
          <ShieldCheck size={28} />
          <div>
            <h3>Bảo mật dữ liệu</h3>
            <p>Dữ liệu chỉ dùng cho đào tạo nội bộ và theo dõi kết quả bài test.</p>
          </div>
          <button className="outline-button">Xem quyền</button>
        </article>
        <article className="panel setting-card">
          <Bell size={28} />
          <div>
            <h3>Thông báo học tập</h3>
            <p>Nhận nhắc nhở khi có tài liệu mới hoặc bài test sắp hết hạn.</p>
          </div>
          <button className="outline-button">Thiết lập</button>
        </article>
        <article className="panel setting-card">
          <Lock size={28} />
          <div>
            <h3>Quyền truy cập</h3>
            <p>Vai trò hiện tại: {roleText}</p>
          </div>
          <button className="outline-button">Chi tiết</button>
        </article>
      </section>

      <section className="notice-panel">
        <div>
          <User size={20} />
          <strong>Thông tin đăng nhập</strong>
          <span>Nếu số điện thoại chưa đúng, cập nhật tại hồ sơ cá nhân trước khi làm bài chính thức.</span>
        </div>
        <div>
          <CalendarDays size={20} />
          <strong>Lịch sử đào tạo</strong>
          <span>Điểm chính thức được lưu theo ngày hoàn thành và hiển thị trên dashboard HR.</span>
        </div>
      </section>
    </>
  );
}
