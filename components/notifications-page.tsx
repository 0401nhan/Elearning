import {
  Bell,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert
} from "lucide-react";
import { useEffect, useState } from "react";

type NotificationType = "assignment" | "material" | "result" | "retake" | "system";

type NotificationItem = {
  id: number;
  title: string;
  body: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  targetTestId: number | null;
};

type NotificationsResponse = {
  summary: {
    total: number;
    unread: number;
    assignment: number;
    material: number;
    result: number;
    retake: number;
    system: number;
  };
  notifications: NotificationItem[];
};

const typeOptions: { value: "" | NotificationType; label: string }[] = [
  { value: "", label: "Tất cả loại" },
  { value: "assignment", label: "Bài test" },
  { value: "material", label: "Tài liệu" },
  { value: "result", label: "Kết quả" },
  { value: "retake", label: "Thi lại" },
  { value: "system", label: "Hệ thống" }
];

const statusOptions = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "unread", label: "Chưa đọc" },
  { value: "read", label: "Đã đọc" }
];

function typeMeta(type: NotificationType) {
  if (type === "assignment") return { icon: ShieldAlert, tone: "red", label: "Bài test" };
  if (type === "material") return { icon: BookOpen, tone: "green", label: "Tài liệu" };
  if (type === "result") return { icon: CheckCircle2, tone: "green", label: "Kết quả" };
  if (type === "retake") return { icon: ShieldAlert, tone: "orange", label: "Thi lại" };
  return { icon: Mail, tone: "purple", label: "Hệ thống" };
}

function formatTime(value: string) {
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN");
}

function notifyBadgeChanged() {
  window.dispatchEvent(new Event("notifications:changed"));
}

export function NotificationsPage({ onOpenTest }: { onOpenTest?: (testId: number) => void }) {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function loadNotifications() {
    setIsLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());

    try {
      const response = await fetch(`/api/notifications?${params.toString()}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải thông báo.");
        return;
      }

      setData(responseData);
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type]);

  async function updateNotification(action: "read" | "unread" | "read_all", notificationId?: number) {
    setIsSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, notificationId })
    }).catch(() => null);

    const responseData = await response?.json().catch(() => null);
    setIsSaving(false);

    if (!response?.ok) {
      setError(responseData?.error ?? "Không thể cập nhật thông báo.");
      return;
    }

    setSuccess(action === "read_all" ? "Đã đánh dấu tất cả thông báo là đã đọc." : "Đã cập nhật thông báo.");
    notifyBadgeChanged();
    await loadNotifications();
  }

  async function openNotificationTest(item: NotificationItem) {
    if (!item.targetTestId || !onOpenTest) {
      return;
    }

    if (!item.isRead) {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "read", notificationId: item.id })
      }).catch(() => null);
      notifyBadgeChanged();
    }

    onOpenTest(item.targetTestId);
  }

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Thông báo</h2>
          <p>Các nhắc nhở học tập, cập nhật tài liệu, kết quả bài test và yêu cầu thi lại.</p>
        </div>
        <button className="outline-button" onClick={() => updateNotification("read_all")} disabled={isSaving || !data?.summary.unread}>
          <Mail size={18} /> Đánh dấu đã đọc
        </button>
      </section>

      <section className="notifications-summary">
        <article className="stat-card">
          <span className="stat-icon blue">
            <Bell size={30} />
          </span>
          <div>
            <span>Tổng thông báo</span>
            <strong>{data?.summary.total ?? 0}</strong>
            <small>Theo tài khoản hiện tại</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon orange">
            <Mail size={30} />
          </span>
          <div>
            <span>Chưa đọc</span>
            <strong>{data?.summary.unread ?? 0}</strong>
            <small>Cần xem</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon green">
            <CheckCircle2 size={30} />
          </span>
          <div>
            <span>Kết quả</span>
            <strong>{data?.summary.result ?? 0}</strong>
            <small>Điểm và trạng thái</small>
          </div>
        </article>
      </section>

      <section className="notifications-toolbar">
        <label>
          <Search size={18} />
          <input
            placeholder="Tìm theo tiêu đề hoặc nội dung..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                loadNotifications();
              }
            }}
          />
        </label>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="outline-button" onClick={loadNotifications} disabled={isLoading}>
          {isLoading ? <RefreshCw size={17} /> : <Filter size={17} />} Lọc
        </button>
      </section>

      {error && <p className="login-error">{error}</p>}
      {success && <p className="success-message">{success}</p>}

      <section className="notification-list">
        {(data?.notifications ?? []).map((item) => {
          const meta = typeMeta(item.type);
          const Icon = meta.icon;

          return (
            <article
              className={`notification-card ${item.isRead ? "read" : "unread"} ${
                item.type === "assignment" ? "urgent-notification" : ""
              }`}
              key={item.id}
            >
              <span className={`stat-icon ${meta.tone}`}>
                <Icon size={26} />
              </span>
              <div>
                <span className={`notification-label ${item.type === "assignment" ? "urgent" : ""}`}>{meta.label}</span>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
              <div className="notification-side">
                <time>{formatTime(item.createdAt)}</time>
                {item.type === "assignment" && item.targetTestId && (
                  <button
                    className="primary-button"
                    onClick={() => openNotificationTest(item)}
                    disabled={isSaving}
                  >
                    <FileText size={17} /> Mở bài test
                  </button>
                )}
                <button
                  className="outline-button"
                  onClick={() => updateNotification(item.isRead ? "unread" : "read", item.id)}
                  disabled={isSaving}
                >
                  {item.isRead ? "Đánh dấu chưa đọc" : "Đã đọc"}
                </button>
              </div>
            </article>
          );
        })}
        {!isLoading && data?.notifications.length === 0 && (
          <section className="panel empty-test-panel">
            <Bell size={34} />
            <strong>Không có thông báo phù hợp</strong>
            <span>Thay đổi bộ lọc hoặc quay lại sau khi có bài test/tài liệu mới.</span>
          </section>
        )}
      </section>

      <section className="settings-grid">
        <article className="panel setting-card">
          <Clock3 size={28} />
          <div>
            <h3>Nhắc trước hạn</h3>
            <p>Tự động nhắc khi bài test gần đến hạn hoàn thành.</p>
          </div>
          <span className="status-pill success">Đang bật</span>
        </article>
        <article className="panel setting-card">
          <Mail size={28} />
          <div>
            <h3>Thông báo nội bộ</h3>
            <p>Ghi nhận thông báo giao bài, cập nhật tài liệu, kết quả và yêu cầu thi lại trong hệ thống.</p>
          </div>
          <span className="status-pill neutral">Theo cấu hình</span>
        </article>
      </section>
    </>
  );
}
