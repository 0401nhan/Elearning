import { Bell, GraduationCap, Menu } from "lucide-react";
import { navItems } from "@/lib/mock-data";
import { canViewPeopleResultsUser } from "@/lib/permissions";
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
  const visibleNavItems = navItems.filter((item) => item.screen !== "admin" || canViewPeopleResultsUser(user));

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
                {item.label === "Thông báo" && <b>3</b>}
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
        <HeaderBar user={user} onLogout={onLogout} />
        <div className="content">{children}</div>
      </section>
    </main>
  );
}

function HeaderBar({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-button">
        <Menu size={22} />
      </button>
      <div className="topbar-spacer" />
      <button className="notification-button">
        <Bell size={21} />
        <span>3</span>
      </button>
      <UserActions user={user} onLogout={onLogout} />
    </header>
  );
}
