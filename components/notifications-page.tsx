import { Bell, BookOpen, CheckCircle2, Clock3, Mail, ShieldAlert } from "lucide-react";

const notifications = [
  {
    title: "Bạn có bài test Quy định HSE cần hoàn thành",
    text: "Hạn hoàn thành: 31/05/2026. Vui lòng đọc tài liệu trước khi làm chính thức.",
    time: "Hôm nay",
    icon: Bell,
    tone: "blue"
  },
  {
    title: "Tài liệu Checklist an toàn đầu ngày đã được cập nhật",
    text: "Bộ phận HSE bổ sung phiên bản mới cho đội hiện trường.",
    time: "12/05/2026",
    icon: BookOpen,
    tone: "green"
  },
  {
    title: "Kết quả Test Quy định HSE: Đạt",
    text: "Điểm chính thức 85/100 đã được ghi nhận vào hệ thống đào tạo.",
    time: "10/05/2026",
    icon: CheckCircle2,
    tone: "green"
  },
  {
    title: "Bài An toàn lao động: Chưa đạt",
    text: "Vui lòng học lại tài liệu và liên hệ HR/Quản lý để mở lượt thi mới.",
    time: "06/05/2026",
    icon: ShieldAlert,
    tone: "orange"
  }
];

export function NotificationsPage() {
  return (
    <>
      <section className="page-header">
        <div>
          <h2>Thông báo</h2>
          <p>Các nhắc nhở học tập, cập nhật tài liệu và kết quả bài test.</p>
        </div>
        <button className="outline-button">
          <Mail size={18} /> Đánh dấu đã đọc
        </button>
      </section>

      <section className="notification-list">
        {notifications.map((item) => {
          const Icon = item.icon;
          return (
            <article className="notification-card" key={item.title}>
              <span className={`stat-icon ${item.tone}`}>
                <Icon size={26} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
              <time>{item.time}</time>
            </article>
          );
        })}
      </section>

      <section className="settings-grid">
        <article className="panel setting-card">
          <Clock3 size={28} />
          <div>
            <h3>Nhắc trước hạn</h3>
            <p>Tự động nhắc khi bài test còn dưới 3 ngày đến hạn hoàn thành.</p>
          </div>
          <span className="status-pill success">Đang bật</span>
        </article>
        <article className="panel setting-card">
          <Mail size={28} />
          <div>
            <h3>Email nội bộ</h3>
            <p>Gửi kết quả và yêu cầu học lại đến email/phòng ban phụ trách.</p>
          </div>
          <span className="status-pill neutral">Theo cấu hình</span>
        </article>
      </section>
    </>
  );
}
