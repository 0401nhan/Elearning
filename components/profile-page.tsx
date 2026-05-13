import { Bell, CalendarDays, Edit, Lock, Phone, ShieldCheck, User } from "lucide-react";
import { Avatar, InfoTable } from "./shared";

export function ProfilePage() {
  return (
    <>
      <section className="page-header">
        <div>
          <h2>Hồ sơ cá nhân</h2>
          <p>Thông tin nhân sự dùng cho đăng nhập, phân quyền và ghi nhận kết quả đào tạo.</p>
        </div>
        <button className="outline-button">
          <Edit size={18} /> Cập nhật
        </button>
      </section>

      <section className="profile-layout">
        <article className="panel profile-summary">
          <Avatar name="A" />
          <h3>Nguyễn Văn A</h3>
          <p>EB001 · Kỹ thuật hiện trường</p>
          <span className="status-pill success">Đang hoạt động</span>
        </article>

        <article className="panel">
          <div className="section-title">
            <h3>Thông tin nhân sự</h3>
          </div>
          <InfoTable
            rows={[
              ["Họ tên", "Nguyễn Văn A"],
              ["Mã nhân viên", "EB001"],
              ["Số điện thoại", "0901 234 567"],
              ["Phòng ban", "HSE"],
              ["Vị trí", "Kỹ thuật hiện trường"],
              ["Ngày vào làm", "01/05/2022"]
            ]}
          />
        </article>
      </section>

      <section className="settings-grid">
        <article className="panel setting-card">
          <Phone size={28} />
          <div>
            <h3>Thông tin đăng nhập</h3>
            <p>Username theo họ tên không dấu và số điện thoại đã đăng ký với HCNS.</p>
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
            <p>Vai trò hiện tại: Nhân sự. Chỉ xem tài liệu, làm bài và xem kết quả cá nhân.</p>
          </div>
          <button className="outline-button">Chi tiết</button>
        </article>
      </section>

      <section className="notice-panel">
        <div>
          <User size={20} />
          <strong>Thông tin đăng nhập</strong>
          <span>Nếu số điện thoại chưa đúng, liên hệ HCNS để cập nhật trước khi làm bài chính thức.</span>
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
