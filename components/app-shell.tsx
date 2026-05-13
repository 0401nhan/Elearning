import { Bell, ChevronDown, GraduationCap, Menu } from "lucide-react";
import { navItems } from "@/lib/mock-data";
import type { Screen } from "@/lib/types";
import { Avatar, BrandMark } from "./shared";

export function AppShell({
  currentScreen,
  setScreen,
  children
}: {
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;
  children: React.ReactNode;
}) {
  return (
    <main className="app-layout">
      <aside className="sidebar">
        <BrandMark compact />
        <nav className="side-nav">
          {navItems.map((item) => {
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
        <HeaderBar />
        <div className="content">{children}</div>
      </section>
    </main>
  );
}

function HeaderBar() {
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
      <div className="profile-chip">
        <Avatar name="A" />
        <div>
          <strong>Nguyễn Văn A</strong>
          <span>EB001 - Kỹ thuật hiện trường</span>
        </div>
        <ChevronDown size={18} />
      </div>
    </header>
  );
}
