import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  Mail,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  Star,
  Upload,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminNavItems } from "@/lib/mock-data";
import type { Metric, ResultStatus, Screen, SessionUser, TestStatus } from "@/lib/types";
import { AdminSectionPage } from "./admin-section-page";
import { PeopleAdminPage } from "./people-admin-page";
import { ActionCard, Avatar, Bar, BrandMark, MetricCard, Mistake, StatusPill } from "./shared";
import { UserActions } from "./user-actions";

type AdminDashboardData = {
  metrics: {
    totalAssigned: number;
    completed: number;
    notCompleted: number;
    passed: number;
    failed: number;
    averageScore: number;
    averagePracticeAttempts: number;
  };
  results: {
    assignment_id: number;
    full_name: string;
    phone: string;
    department_name: string;
    position_title: string | null;
    hire_date: string | null;
    test_title: string;
    practice_attempt_count: number;
    official_score: number | null;
    time_spent_minutes: number | null;
    assignment_status: string;
    retake_reviewer: string | null;
  }[];
  wrongQuestions: {
    question_id: number;
    wrong_count: number;
    question_text: string;
  }[];
};

function percent(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function assignmentStatusLabel(status: string): ResultStatus | TestStatus {
  if (status === "passed") return "Đạt";
  if (status === "failed") return "Chưa đạt";
  if (status === "studying") return "ĐANG HỌC";
  return "CHƯA LÀM";
}

export function AdminDashboard({
  setScreen,
  user,
  onLogout
}: {
  setScreen: (screen: Screen) => void;
  user: SessionUser;
  onLogout: () => void;
}) {
  const [activeAdminIndex, setActiveAdminIndex] = useState(0);
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [loadError, setLoadError] = useState("");
  const activeAdminItem = adminNavItems[activeAdminIndex];
  const isFullAdmin = user.roles.includes("admin");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setLoadError("");

      try {
        const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!isMounted) {
          return;
        }

        if (!response.ok) {
          setLoadError(data?.error ?? "Không thể tải dữ liệu dashboard.");
          return;
        }

        setDashboard(data);
      } catch {
        if (isMounted) {
          setLoadError("Không thể kết nối hệ thống.");
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const dashboardMetrics = useMemo<Metric[]>(() => {
    const metrics = dashboard?.metrics;
    const total = metrics?.totalAssigned ?? 0;
    const completed = metrics?.completed ?? 0;
    const notCompleted = metrics?.notCompleted ?? 0;
    const passed = metrics?.passed ?? 0;
    const failed = metrics?.failed ?? 0;
    const averageScore = metrics?.averageScore ?? 0;
    const averagePracticeAttempts = metrics?.averagePracticeAttempts ?? 0;

    return [
      {
        label: "Tổng số nhân sự được giao test",
        value: String(total),
        note: "Theo quyền xem hiện tại",
        percent: "100%",
        icon: Users,
        tone: "purple"
      },
      {
        label: "Đã hoàn thành",
        value: String(completed),
        note: percent(completed, total),
        percent: percent(completed, total),
        icon: CheckCircle2,
        tone: "green"
      },
      {
        label: "Chưa hoàn thành",
        value: String(notCompleted),
        note: percent(notCompleted, total),
        percent: percent(notCompleted, total),
        icon: Clock3,
        tone: "orange"
      },
      {
        label: "Đạt",
        value: String(passed),
        note: percent(passed, total),
        percent: percent(passed, total),
        icon: ShieldCheck,
        tone: "green"
      },
      {
        label: "Chưa đạt",
        value: String(failed),
        note: percent(failed, total),
        percent: percent(failed, total),
        icon: ShieldX,
        tone: "red"
      },
      {
        label: "Điểm trung bình",
        value: averageScore.toFixed(1),
        note: "/100 điểm",
        percent: `${Math.round(averageScore)}%`,
        icon: Star,
        tone: "blue"
      },
      {
        label: "Số lần làm thử trung bình",
        value: averagePracticeAttempts.toFixed(1),
        note: "Lần / bài được giao",
        percent: `${Math.min(100, Math.round(averagePracticeAttempts * 20))}%`,
        icon: Clock3,
        tone: "orange"
      }
    ];
  }, [dashboard]);

  return (
    <main className="admin-layout">
      <aside className="sidebar admin-sidebar">
        <BrandMark compact />
        <nav className="side-nav">
          {adminNavItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={activeAdminIndex === index ? "active" : ""}
                onClick={() => setActiveAdminIndex(index)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-callout report-callout">
          <BarChart3 size={58} />
          <strong>Báo cáo tổng hợp</strong>
          <span>Xuất báo cáo chi tiết theo nhiều tiêu chí</span>
          <button>Tạo báo cáo</button>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-header">
          <button className="icon-button" onClick={() => setScreen("home")}>
            <Menu size={22} />
          </button>
          <div>
            <h1>Admin Dashboard</h1>
            <p>Theo dõi đào tạo & kết quả test</p>
          </div>
          <div className="topbar-spacer" />
          <button className="notification-button">
            <Bell size={21} />
            <span>3</span>
          </button>
          <UserActions
            user={user}
            roleLabel={user.roles.includes("admin") ? "Admin" : "Trưởng phòng"}
            onLogout={onLogout}
          />
        </header>

        <div className="admin-content">
          {activeAdminIndex === 0 ? (
            <>
              <div className="date-filter">
                <CalendarDays size={18} /> 01/05/2026 - 31/05/2026 <ChevronDown size={16} />
              </div>

              <section className="admin-metrics">
                {dashboardMetrics.map((metric) => (
                  <MetricCard key={metric.label} metric={metric} />
                ))}
              </section>

              <section className="filter-row">
            <button>Phòng ban <strong>{isFullAdmin ? "Tất cả" : user.department}</strong><ChevronDown size={16} /></button>
            <button>Trạng thái <strong>Tất cả</strong><ChevronDown size={16} /></button>
            <button>Bài test <strong>Tất cả</strong><ChevronDown size={16} /></button>
            <button>Thời gian <strong>30 ngày qua</strong><ChevronDown size={16} /></button>
            <label>
              <input placeholder="Tìm kiếm nhân sự..." />
              <Search size={17} />
            </label>
            <button>
              <RefreshCw size={17} /> Làm mới
            </button>
            <button className="primary-button">
              <Download size={17} /> Export Excel
            </button>
              </section>

              <section className="panel admin-table-panel">
            <div className="section-title">
              <h3>Danh sách kết quả nhân sự</h3>
            </div>
            {loadError && <p className="login-error">{loadError}</p>}
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Họ tên</th>
                    <th>Số điện thoại</th>
                    <th>Phòng ban</th>
                    <th>Vị trí</th>
                    <th>Ngày vào làm</th>
                    <th>Bài test thực hiện</th>
                    <th>Số lần làm thử</th>
                    <th>Điểm chính thức</th>
                    <th>Thời gian làm bài</th>
                    <th>Trạng thái</th>
                    <th>Người duyệt làm lại</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.results ?? []).map((row, index) => (
                    <tr key={row.assignment_id}>
                      <td>{index + 1}</td>
                      <td>
                        <Avatar name={row.full_name.slice(0, 1)} small /> {row.full_name}
                      </td>
                      <td>{row.phone}</td>
                      <td>{row.department_name}</td>
                      <td>{row.position_title ?? "--"}</td>
                      <td>{formatDate(row.hire_date)}</td>
                      <td>{row.test_title}</td>
                      <td>{row.practice_attempt_count}</td>
                      <td className={(row.official_score ?? 0) >= 80 ? "green-text" : "red-text"}>
                        {row.official_score !== null ? `${row.official_score}/100` : "--"}
                      </td>
                      <td>{row.time_spent_minutes ? `${row.time_spent_minutes} phút` : "--"}</td>
                      <td><StatusPill status={assignmentStatusLabel(row.assignment_status)} /></td>
                      <td>{row.retake_reviewer ?? "-"}</td>
                      <td>
                        <button className="table-icon"><Eye size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {dashboard?.results.length === 0 && (
                    <tr>
                      <td colSpan={13}>Chưa có dữ liệu kết quả.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
              </section>

              <section className="analytics-grid">
            <div className="panel donut-panel">
              <h3>Tỷ lệ đạt / chưa đạt</h3>
              <div className="donut" />
              <strong>73.3%</strong>
              <span>Đạt</span>
            </div>
            <div className="panel bar-panel">
              <h3>Điểm trung bình theo phòng ban</h3>
              <Bar label="HSE" value={87.5} green />
              <Bar label="Kỹ thuật" value={82.1} />
              <Bar label="HCNS" value={78.3} />
              <Bar label="Sản xuất" value={76.8} />
              <Bar label="QA/QC" value={85.2} />
            </div>
            <div className="panel line-panel">
              <h3>Tiến độ hoàn thành test</h3>
              <div className="line-chart">
                <i className="line-done" />
                <i className="line-pending" />
              </div>
            </div>
            <div className="panel mistake-panel">
              <h3>Top câu hỏi sai nhiều nhất</h3>
              {(dashboard?.wrongQuestions ?? []).map((question) => (
                <Mistake
                  key={question.question_id}
                  question={`Câu ${question.question_id}`}
                  percent={question.wrong_count}
                />
              ))}
              {dashboard?.wrongQuestions.length === 0 && <p>Chưa có dữ liệu câu sai.</p>}
            </div>
              </section>

              <section className="quick-actions">
            <ActionCard icon={Download} label="Export Excel" text="Xuất dữ liệu kết quả test" />
            <ActionCard icon={Mail} label="Gửi nhắc nhở" text="Nhắc nhân sự chưa hoàn thành" />
            <ActionCard icon={RefreshCw} label="Mở lại lượt thi" text="Duyệt cho nhân sự thi lại" />
            <ActionCard icon={Upload} label="Upload ngân hàng câu hỏi" text="Cập nhật câu hỏi mới" />
            <ActionCard icon={Upload} label="Upload tài liệu đào tạo" text="Tài liệu học & hướng dẫn" />
              </section>
            </>
          ) : activeAdminItem.label === "Nhân sự" ? (
            isFullAdmin ? (
              <PeopleAdminPage />
            ) : (
              <section className="panel">
                <div className="section-title">
                  <h3>Không có quyền quản lý nhân sự</h3>
                </div>
                <p>Trưởng phòng chỉ được xem kết quả nhân sự thuộc phòng mình.</p>
              </section>
            )
          ) : (
            <AdminSectionPage title={activeAdminItem.label} icon={activeAdminItem.icon} />
          )}
        </div>
      </section>
    </main>
  );
}
