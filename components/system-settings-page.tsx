import { CheckCircle2, Moon, Palette, ShieldCheck, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ThemeMode } from "@/lib/types";

export function SystemSettingsPage({
  theme,
  onThemeChange
}: {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  const themeOptions: {
    value: ThemeMode;
    title: string;
    description: string;
    icon: LucideIcon;
  }[] = [
    {
      value: "light",
      title: "Giao diện sáng",
      description: "Nền sáng, độ tương phản nhẹ cho môi trường văn phòng.",
      icon: Sun
    },
    {
      value: "dark",
      title: "Giao diện tối",
      description: "Nền tối, giảm chói khi làm việc lâu hoặc dùng ban đêm.",
      icon: Moon
    }
  ];

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Cài đặt hệ thống</h2>
          <p>Thiết lập giao diện, bảo mật và các cấu hình vận hành chung.</p>
        </div>
      </section>

      <section className="system-settings-grid">
        <article className="panel system-setting-panel">
          <div className="section-title">
            <h3>Giao diện</h3>
            <Palette size={20} />
          </div>
          <div className="theme-options">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={active ? "theme-option active" : "theme-option"}
                  onClick={() => onThemeChange(option.value)}
                  aria-pressed={active}
                >
                  <span className="theme-option-icon">
                    <Icon size={24} />
                  </span>
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  {active && <CheckCircle2 size={20} />}
                </button>
              );
            })}
          </div>
        </article>

        <article className="panel system-setting-panel">
          <div className="section-title">
            <h3>Trạng thái hệ thống</h3>
            <ShieldCheck size={20} />
          </div>
          <div className="settings-status-list">
            <span>
              <strong>Theme hiện tại</strong>
              <small>{theme === "dark" ? "Tối" : "Sáng"}</small>
            </span>
            <span>
              <strong>Lưu cấu hình</strong>
              <small>Tự động trên trình duyệt</small>
            </span>
            <span>
              <strong>Phạm vi áp dụng</strong>
              <small>Toàn bộ hệ thống</small>
            </span>
          </div>
        </article>
      </section>
    </>
  );
}
