import { Bell, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { navItems } from "@/lib/mock-data";
import { canAccessAdminUser } from "@/lib/permissions";
import type { Screen, SessionUser } from "@/lib/types";
import { BrandMark } from "./shared";
import { UserActions } from "./user-actions";

export function AppShell({
  currentScreen,
  setScreen,
  user,
  onLogout,
  children
}: {
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;
  user: SessionUser;
  onLogout: () => void;
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
  onOpenNotifications
}: {
  user: SessionUser;
  unreadCount: number;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-spacer" />
      <button className="notification-button" onClick={onOpenNotifications}>
        <Bell size={21} />
        {unreadCount > 0 && <span>{unreadCount}</span>}
      </button>
      <UserActions user={user} onLogout={onLogout} onOpenProfile={onOpenProfile} />
    </header>
  );
}
