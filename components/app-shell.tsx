import { ArrowLeft, Bell, BookOpen, CheckCircle2, GraduationCap, Mail, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { navItems } from "@/lib/mock-data";
import { canAccessAdminUser } from "@/lib/permissions";
import type { Screen, SessionUser } from "@/lib/types";
import { BrandMark } from "./shared";
import { UserActions } from "./user-actions";

type NotificationType = "assignment" | "material" | "result" | "retake" | "system";

type NotificationPreviewItem = {
  id: number;
  title: string;
  body: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  targetTestId: number | null;
};

type NotificationPreviewResponse = {
  summary: {
    total: number;
    unread: number;
  };
  notifications: NotificationPreviewItem[];
};

function notificationTypeMeta(type: NotificationType) {
  if (type === "assignment") return { icon: ShieldAlert, tone: "red", label: "Bài test" };
  if (type === "material") return { icon: BookOpen, tone: "green", label: "Tài liệu" };
  if (type === "result") return { icon: CheckCircle2, tone: "green", label: "Kết quả" };
  if (type === "retake") return { icon: RefreshCw, tone: "orange", label: "Thi lại" };
  return { icon: Mail, tone: "purple", label: "Hệ thống" };
}

function formatNotificationTime(value: string) {
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  });
}

export function AppShell({
  currentScreen,
  setScreen,
  user,
  onLogout,
  onOpenTest,
  canGoBack = false,
  onBack,
  children
}: {
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;
  user: SessionUser;
  onLogout: () => void;
  onOpenTest: (testId: number) => void;
  canGoBack?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const visibleNavItems = navItems.filter((item) => item.screen !== "admin" || canAccessAdminUser(user));
  const [unreadCount, setUnreadCount] = useState(0);

  async function loadUnreadCount() {
    const response = await fetch("/api/notifications?status=unread", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok) {
      setUnreadCount(data?.summary?.unread ?? 0);
    }
  }

  useEffect(() => {
    loadUnreadCount();

    const handleChanged = () => loadUnreadCount();
    window.addEventListener("notifications:changed", handleChanged);

    return () => window.removeEventListener("notifications:changed", handleChanged);
  }, [currentScreen]);

  return (
    <main className="app-layout">
      <aside className="sidebar">
        <BrandMark compact />
        <button
          className="mobile-bottom-back-button"
          type="button"
          onClick={onBack}
          disabled={!canGoBack || !onBack}
          aria-label="Quay lại màn trước"
          title="Quay lại"
        >
          <ArrowLeft size={20} />
          <span>Quay lại</span>
        </button>
        <nav className="side-nav">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = currentScreen === item.screen;
            return (
              <button
                key={item.label}
                className={active ? "active" : ""}
                onClick={() => setScreen(item.screen)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
                {item.label === "Thông báo" && unreadCount > 0 && <b>{unreadCount}</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-callout">
          <GraduationCap size={54} />
          <strong>Học tập chủ động</strong>
          <span>Nâng cao kiến thức và hiệu quả công việc</span>
        </div>
      </aside>

      <section className="workspace">
        <HeaderBar
          user={user}
          unreadCount={unreadCount}
          onLogout={onLogout}
          onOpenProfile={() => setScreen("profile")}
          onOpenNotifications={() => setScreen("notifications")}
          onOpenTest={onOpenTest}
          canGoBack={canGoBack}
          onBack={onBack}
        />
        <div className="content">{children}</div>
      </section>
    </main>
  );
}

function HeaderBar({
  user,
  unreadCount,
  onLogout,
  onOpenProfile,
  onOpenNotifications,
  onOpenTest,
  canGoBack = false,
  onBack
}: {
  user: SessionUser;
  unreadCount: number;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenTest: (testId: number) => void;
  canGoBack?: boolean;
  onBack?: () => void;
}) {
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);
  const [noticeData, setNoticeData] = useState<NotificationPreviewResponse | null>(null);
  const [noticeError, setNoticeError] = useState("");
  const [isNoticeLoading, setIsNoticeLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadNotificationPreview = useCallback(async () => {
    setIsNoticeLoading(true);
    setNoticeError("");

    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setNoticeError(data?.error ?? "Không thể tải thông báo.");
        return;
      }

      setNoticeData(data);
    } catch {
      setNoticeError("Không thể kết nối hệ thống.");
    } finally {
      setIsNoticeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isNoticeOpen) {
      void loadNotificationPreview();
    }
  }, [isNoticeOpen, loadNotificationPreview]);

  useEffect(() => {
    if (!isNoticeOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsNoticeOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isNoticeOpen]);

  async function markAllRead() {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "read_all" })
    }).catch(() => null);

    if (!response?.ok) {
      setNoticeError("Không thể đánh dấu đã đọc.");
      return;
    }

    window.dispatchEvent(new Event("notifications:changed"));
    await loadNotificationPreview();
  }

  function openNotificationsPage() {
    setIsNoticeOpen(false);
    onOpenNotifications();
  }

  async function openNotificationTarget(item: NotificationPreviewItem) {
    if (!item.isRead) {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "read", notificationId: item.id })
      }).catch(() => null);
      window.dispatchEvent(new Event("notifications:changed"));
    }

    setIsNoticeOpen(false);

    if (item.type === "assignment" && item.targetTestId) {
      onOpenTest(item.targetTestId);
      return;
    }

    onOpenNotifications();
  }

  const previewItems = noticeData?.notifications.slice(0, 6) ?? [];

  return (
    <header className="topbar">
      <button
        className="header-back-button"
        type="button"
        onClick={onBack}
        disabled={!canGoBack || !onBack}
        aria-label="Quay lại màn trước"
        title="Quay lại"
      >
        <ArrowLeft size={18} />
        <span>Quay lại</span>
      </button>
      <div className="topbar-spacer" />
      <div className="admin-notice-menu notification-preview-menu" ref={menuRef}>
        <button
          className={`notification-button ${isNoticeOpen ? "active" : ""} ${unreadCount > 0 ? "has-unread" : ""}`}
          onClick={() => setIsNoticeOpen((current) => !current)}
          aria-label="Xem nhanh thông báo"
          aria-expanded={isNoticeOpen}
          type="button"
        >
          <Bell size={21} />
          {unreadCount > 0 && <span>{unreadCount}</span>}
        </button>

        {isNoticeOpen && (
          <section className="admin-notice-dropdown notification-preview-dropdown">
            <header>
              <div>
                <strong>Thông báo</strong>
                <small>{unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : "Không có thông báo mới"}</small>
              </div>
              <button className="table-icon" type="button" onClick={loadNotificationPreview} aria-label="Làm mới thông báo">
                <RefreshCw size={16} />
              </button>
            </header>

            {noticeError && <p className="login-error">{noticeError}</p>}
            {isNoticeLoading && <p className="notice-muted">Đang tải thông báo...</p>}

            <div className="admin-notice-list notification-preview-list">
              {previewItems.map((item) => {
                const meta = notificationTypeMeta(item.type);
                const Icon = meta.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${item.isRead ? "read" : "unread"} ${item.type === "assignment" ? "urgent" : ""}`}
                    onClick={() => openNotificationTarget(item)}
                  >
                    <span className={`notification-preview-icon ${meta.tone}`}>
                      <Icon size={18} />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {meta.label} · {formatNotificationTime(item.createdAt)}
                      </small>
                      <small>{item.body}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            {!isNoticeLoading && previewItems.length === 0 && (
              <p className="notice-empty">Không có thông báo phù hợp.</p>
            )}

            <div className="notification-preview-actions">
              <button className="outline-button" type="button" onClick={openNotificationsPage}>
                Xem tất cả
              </button>
              <button className="primary-button" type="button" onClick={markAllRead} disabled={unreadCount === 0}>
                Đánh dấu đã đọc
              </button>
            </div>
          </section>
        )}
      </div>
      <UserActions user={user} onLogout={onLogout} onOpenProfile={onOpenProfile} />
    </header>
  );
}
