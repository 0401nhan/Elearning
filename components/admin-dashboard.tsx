import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  Mail,
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
import type { Metric, ResultStatus, Screen, SessionUser, TestStatus, ThemeMode } from "@/lib/types";
import { AdminSectionPage } from "./admin-section-page";
import { AssignmentManagementPage } from "./assignment-management-page";
import { PeopleAdminPage } from "./people-admin-page";
import { QuestionBankPage } from "./question-bank-page";
import { ReportsAdminPage } from "./reports-admin-page";
import { ActionCard, Avatar, Bar, BrandMark, MetricCard, Mistake, StatusPill } from "./shared";
import { SystemSettingsPage } from "./system-settings-page";
import { TestManagementPage } from "./test-management-page";
import { TestResultsAdminPage } from "./test-results-admin-page";
import { TrainingMaterialsAdminPage } from "./training-materials-admin-page";
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
    pass_score: number | null;
    practice_attempt_count: number;
    official_score: number | null;
    time_spent_minutes: number | null;
    latest_activity_at: string | null;
    latest_activity_mode: string | null;
    latest_activity_is_open: boolean;
    assignment_status: string;
    retake_reviewer: string | null;
  }[];
  resultsPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    departments: {
      id: number;
      name: string;
    }[];
    tests: {
      id: number;
      title: string;
    }[];
  };
  departmentScores: {
    departmentName: string;
    averageScore: number;
  }[];
  completionTrend: {
    date: string;
    completed: number;
    total: number;
  }[];
  wrongQuestions: {
    question_id: number;
    wrong_count: number;
    question_text: string;
  }[];
};

type RetakeRequestRow = {
  id: number;
  assignmentId: number;
  employeeId: number;
  testId: number;
  fullName: string;
  phone: string;
  departmentName: string;
  testTitle: string;
  officialScore: number | null;
  officialAttemptsUsed: number;
  approvedRetakeCount: number;
  reason: string | null;
  status: string;
  requestedAt: string;
};

function percent(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function activityLabel(mode: string | null, isOpen: boolean) {
  if (!mode) return "Chưa có hoạt động";
  if (mode === "official") return isOpen ? "Đang làm chính thức" : "Nộp chính thức";
  return "Làm thử";
}

function assignmentStatusLabel(status: string): ResultStatus | TestStatus {
  if (status === "passed") return "Đạt";
  if (status === "failed") return "Chưa đạt";
  if (status === "studying") return "ĐANG HỌC";
  return "CHƯA LÀM";
}

function scoreClass(score: number | null, passScore: number | null) {
  if (score === null) return "";
  return passScore !== null && score >= passScore ? "green-text" : "red-text";
}

function getPageNumbers(currentPage: number, totalPages: number) {
  const end = Math.min(totalPages, Math.max(currentPage + 2, 5));
  const start = Math.max(1, Math.min(currentPage - 2, end - 4));

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

const RESULTS_PAGE_SIZE = 10;

export function AdminDashboard({
  setScreen,
  user,
  onLogout,
  theme,
  onThemeChange
}: {
  setScreen: (screen: Screen) => void;
  user: SessionUser;
  onLogout: () => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  const [activeAdminIndex, setActiveAdminIndex] = useState(0);
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [retakeRequests, setRetakeRequests] = useState<RetakeRequestRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [noticeError, setNoticeError] = useState("");
  const [resultsPage, setResultsPage] = useState(1);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [testFilter, setTestFilter] = useState("");
  const [timeRange, setTimeRange] = useState("30");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [resultSearch, setResultSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);
  const [isNoticeLoading, setIsNoticeLoading] = useState(false);
  const activeAdminItem = adminNavItems[activeAdminIndex];
  const isFullAdmin = user.roles.includes("admin");
  const resultsNavIndex = adminNavItems.findIndex((item) => item.label === "Kết quả test");
  const retakeNoticeCount = retakeRequests.length;
  const resultsPagination = dashboard?.resultsPagination ?? {
    page: resultsPage,
    pageSize: RESULTS_PAGE_SIZE,
    total: 0,
    totalPages: 1
  };
  const resultsTotalPages = Math.max(1, resultsPagination.totalPages);
  const resultsStartItem = resultsPagination.total
    ? (resultsPagination.page - 1) * resultsPagination.pageSize + 1
    : 0;
  const resultsEndItem = resultsPagination.total
    ? Math.min(resultsPagination.total, resultsStartItem + (dashboard?.results.length ?? 0) - 1)
    : 0;
  const resultPageNumbers = getPageNumbers(resultsPagination.page, resultsTotalPages);
  const completedForRatio = (dashboard?.metrics.passed ?? 0) + (dashboard?.metrics.failed ?? 0);
  const passRate = completedForRatio > 0 ? Math.round(((dashboard?.metrics.passed ?? 0) / completedForRatio) * 100) : 0;
  const maxTrendTotal = Math.max(1, ...(dashboard?.completionTrend ?? []).map((point) => point.total));

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setLoadError("");

      try {
        const params = new URLSearchParams({ page: String(resultsPage) });
        if (departmentFilter) params.set("departmentId", departmentFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (testFilter) params.set("testId", testFilter);
        if (timeRange) params.set("timeRange", timeRange);
        if (timeRange === "custom") {
          if (dateFrom) params.set("dateFrom", dateFrom);
          if (dateTo) params.set("dateTo", dateTo);
        }
        if (resultSearch.trim()) params.set("search", resultSearch.trim());
        const response = await fetch(`/api/admin/dashboard?${params.toString()}`, { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!isMounted) {
          return;
        }

        if (!response.ok) {
          setLoadError(data?.error ?? "Không thể tải dữ liệu dashboard.");
          return;
        }

        setDashboard(data);
        if (data?.resultsPagination?.page && data.resultsPagination.page !== resultsPage) {
          setResultsPage(data.resultsPagination.page);
        }
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
  }, [dateFrom, dateTo, departmentFilter, refreshKey, resultSearch, resultsPage, statusFilter, testFilter, timeRange]);

  async function loadRetakeNotices() {
    setIsNoticeLoading(true);
    setNoticeError("");

    try {
      const response = await fetch("/api/admin/retake-requests?status=pending", { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setNoticeError(responseData?.error ?? "Không thể tải yêu cầu thi lại.");
        return;
      }

      setRetakeRequests(responseData?.requests ?? []);
    } catch {
      setNoticeError("Không thể kết nối hệ thống.");
    } finally {
      setIsNoticeLoading(false);
    }
  }

  useEffect(() => {
    void loadRetakeNotices();
  }, [refreshKey]);

  function resetResultsPage() {
    if (resultsPage !== 1) {
      setResultsPage(1);
    }
  }

  function openRetakeRequestsPage() {
    if (resultsNavIndex >= 0) {
      setActiveAdminIndex(resultsNavIndex);
    }

    setIsNoticeOpen(false);
  }

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
          <div>
            <h1>Admin Dashboard</h1>
            <p>Theo dõi đào tạo & kết quả test</p>
          </div>
          <div className="topbar-spacer" />
          <div className="admin-notice-menu">
            <button
              className={`notification-button ${isNoticeOpen ? "active" : ""}`}
              onClick={() => setIsNoticeOpen((current) => !current)}
              aria-label="Yêu cầu thi lại chờ duyệt"
              type="button"
            >
              <Bell size={21} />
              {retakeNoticeCount > 0 && <span>{retakeNoticeCount}</span>}
            </button>
            {isNoticeOpen && (
              <section className="admin-notice-dropdown">
                <header>
                  <div>
                    <strong>Yêu cầu thi lại</strong>
                    <small>{retakeNoticeCount} yêu cầu chờ duyệt</small>
                  </div>
                  <button className="table-icon" type="button" onClick={loadRetakeNotices} aria-label="Làm mới yêu cầu thi lại">
                    <RefreshCw size={16} />
                  </button>
                </header>

                {noticeError && <p className="login-error">{noticeError}</p>}
                {isNoticeLoading && <p className="notice-muted">Đang tải yêu cầu...</p>}

                <div className="admin-notice-list">
                  {retakeRequests.slice(0, 5).map((request) => (
                    <button key={request.id} type="button" onClick={openRetakeRequestsPage}>
                      <span>
                        <strong>{request.fullName}</strong>
                        <small>{request.departmentName} · {request.phone}</small>
                      </span>
                      <span>
                        <b>{request.testTitle}</b>
                        <small>
                          {request.officialScore !== null ? `${request.officialScore}/100` : "Chưa có điểm"} ·{" "}
                          {formatDateTime(request.requestedAt)}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>

                {!isNoticeLoading && retakeRequests.length === 0 && (
                  <p className="notice-empty">Không có yêu cầu thi lại đang chờ duyệt.</p>
                )}

                {retakeRequests.length > 5 && (
                  <p className="notice-muted">Còn {retakeRequests.length - 5} yêu cầu khác trong trang Kết quả test.</p>
                )}

                <button className="primary-button" type="button" onClick={openRetakeRequestsPage}>
                  Xem và xử lý yêu cầu
                </button>
              </section>
            )}
          </div>
          <UserActions
            user={user}
            roleLabel={user.roles.includes("admin") ? "Admin" : "Trưởng phòng"}
            onLogout={onLogout}
            onOpenProfile={() => setScreen("profile")}
          />
        </header>

        <div className="admin-content">
          {activeAdminIndex === 0 ? (
            <>
              <section className="admin-metrics">
                {dashboardMetrics.map((metric) => (
                  <MetricCard key={metric.label} metric={metric} />
                ))}
              </section>

              <section className="filter-row">
                <select
                  value={departmentFilter}
                  onChange={(event) => {
                    setDepartmentFilter(event.target.value);
                    resetResultsPage();
                  }}
                  disabled={!isFullAdmin}
                >
                  <option value="">{isFullAdmin ? "Tất cả phòng ban" : user.department}</option>
                  {dashboard?.filters.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    resetResultsPage();
                  }}
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="not_started">Chưa làm</option>
                  <option value="studying">Đang học</option>
                  <option value="passed">Đạt</option>
                  <option value="failed">Chưa đạt</option>
                </select>
                <select
                  value={testFilter}
                  onChange={(event) => {
                    setTestFilter(event.target.value);
                    resetResultsPage();
                  }}
                >
                  <option value="">Tất cả bài test</option>
                  {dashboard?.filters.tests.map((test) => (
                    <option key={test.id} value={test.id}>
                      {test.title}
                    </option>
                  ))}
                </select>
                <select
                  value={timeRange}
                  onChange={(event) => {
                    setTimeRange(event.target.value);
                    resetResultsPage();
                  }}
                >
                  <option value="7">7 ngày qua</option>
                  <option value="30">30 ngày qua</option>
                  <option value="custom">Tùy chọn</option>
                </select>
                {timeRange === "custom" && (
                  <div className="date-range-filter">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(event) => {
                        setDateFrom(event.target.value);
                        resetResultsPage();
                      }}
                    />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(event) => {
                        setDateTo(event.target.value);
                        resetResultsPage();
                      }}
                    />
                  </div>
                )}
                <label>
                  <input
                    placeholder="Tìm kiếm nhân sự..."
                    value={resultSearch}
                    onChange={(event) => {
                      setResultSearch(event.target.value);
                      resetResultsPage();
                    }}
                  />
                  <Search size={17} />
                </label>
                <button onClick={() => setRefreshKey((value) => value + 1)}>
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
                    <th>Hoạt động mới nhất</th>
                    <th>Trạng thái</th>
                    <th>Người duyệt làm lại</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.results ?? []).map((row, index) => (
                    <tr key={row.assignment_id}>
                      <td>{resultsStartItem + index}</td>
                      <td>
                        <Avatar name={row.full_name} small /> {row.full_name}
                      </td>
                      <td>{row.phone}</td>
                      <td>{row.department_name}</td>
                      <td>{row.position_title ?? "--"}</td>
                      <td>{formatDate(row.hire_date)}</td>
                      <td>{row.test_title}</td>
                      <td>{row.practice_attempt_count}</td>
                      <td className={scoreClass(row.official_score, row.pass_score)}>
                        {row.official_score !== null ? `${row.official_score}/100` : "--"}
                      </td>
                      <td>{row.time_spent_minutes ? `${row.time_spent_minutes} phút` : "--"}</td>
                      <td>
                        <span className="stacked-cell">
                          <strong>{activityLabel(row.latest_activity_mode, row.latest_activity_is_open)}</strong>
                          <small>{formatDateTime(row.latest_activity_at)}</small>
                        </span>
                      </td>
                      <td><StatusPill status={assignmentStatusLabel(row.assignment_status)} /></td>
                      <td>{row.retake_reviewer ?? "-"}</td>
                      <td>
                        <button className="table-icon"><Eye size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {dashboard?.results.length === 0 && (
                    <tr>
                      <td colSpan={14}>Chưa có dữ liệu kết quả.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span>
                Hiển thị {resultsStartItem}-{resultsEndItem} / {resultsPagination.total} kết quả
              </span>
              <span>10 kết quả/trang</span>
              <div className="pagination-actions">
                <button
                  type="button"
                  onClick={() => setResultsPage((current) => Math.max(1, current - 1))}
                  disabled={resultsPagination.page <= 1}
                >
                  <ChevronLeft size={16} />
                </button>
                {resultPageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={pageNumber === resultsPagination.page ? "active" : ""}
                    onClick={() => setResultsPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setResultsPage((current) => Math.min(resultsTotalPages, current + 1))}
                  disabled={resultsPagination.page >= resultsTotalPages}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
              </section>

              <section className="analytics-grid">
            <div className="panel donut-panel">
              <h3>Tỷ lệ đạt / chưa đạt</h3>
              <div
                className="donut"
                style={{
                  background: completedForRatio
                    ? `conic-gradient(var(--green) 0 ${passRate}%, var(--red) ${passRate}% 100%)`
                    : "conic-gradient(#d8e2f1 0 100%)"
                }}
              />
              <strong>{completedForRatio ? `${passRate}%` : "--"}</strong>
              <span>
                {completedForRatio
                  ? `${dashboard?.metrics.passed ?? 0} đạt · ${dashboard?.metrics.failed ?? 0} chưa đạt`
                  : "Chưa có kết quả"}
              </span>
            </div>
            <div className="panel bar-panel">
              <h3>Điểm trung bình theo phòng ban</h3>
              {(dashboard?.departmentScores ?? []).map((department, index) => (
                <Bar
                  key={department.departmentName}
                  label={department.departmentName}
                  value={Number(department.averageScore.toFixed(1))}
                  green={index === 0}
                />
              ))}
              {(dashboard?.departmentScores ?? []).length === 0 && <p>Chưa có dữ liệu điểm theo phòng ban.</p>}
            </div>
            <div className="panel line-panel">
              <h3>Tiến độ hoàn thành test</h3>
              <div className="line-chart completion-trend-chart">
                {(dashboard?.completionTrend ?? []).map((point) => {
                  const totalPercent = clampPercent((point.total / maxTrendTotal) * 100);
                  const completedPercent = clampPercent((point.completed / maxTrendTotal) * 100);

                  return (
                    <span className="trend-point" key={point.date} title={`${point.completed}/${point.total} hoàn thành`}>
                      <i style={{ height: `${totalPercent}%` }} />
                      <b style={{ height: `${completedPercent}%` }} />
                      <small>{formatShortDate(point.date)}</small>
                    </span>
                  );
                })}
                {(dashboard?.completionTrend ?? []).length === 0 && <em>Chưa có dữ liệu tiến độ.</em>}
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
          ) : activeAdminIndex === 1 ? (
            isFullAdmin ? (
              <TestManagementPage />
            ) : (
              <section className="panel">
                <div className="section-title">
                  <h3>Không có quyền quản lý bài test</h3>
                </div>
                <p>Trưởng phòng chỉ được xem kết quả nhân sự thuộc phòng mình.</p>
              </section>
            )
          ) : activeAdminItem.label === "Giao test cho nhân sự" ? (
            isFullAdmin ? (
              <AssignmentManagementPage />
            ) : (
              <section className="panel">
                <div className="section-title">
                  <h3>Không có quyền giao test</h3>
                </div>
                <p>Trưởng phòng chỉ được xem kết quả nhân sự thuộc phòng mình.</p>
              </section>
            )
          ) : activeAdminItem.label === "Kết quả test" ? (
            <TestResultsAdminPage
              user={user}
              onRetakeRequestsChanged={() => {
                setRefreshKey((value) => value + 1);
                void loadRetakeNotices();
              }}
            />
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
          ) : activeAdminItem.label === "Ngân hàng câu hỏi" ? (
            isFullAdmin ? (
              <QuestionBankPage />
            ) : (
              <section className="panel">
                <div className="section-title">
                  <h3>Không có quyền quản lý ngân hàng câu hỏi</h3>
                </div>
                <p>Trưởng phòng chỉ được xem kết quả nhân sự thuộc phòng mình.</p>
              </section>
            )
          ) : activeAdminItem.label === "Tài liệu đào tạo" ? (
            isFullAdmin ? (
              <TrainingMaterialsAdminPage />
            ) : (
              <section className="panel">
                <div className="section-title">
                  <h3>Không có quyền quản lý tài liệu đào tạo</h3>
                </div>
                <p>Trưởng phòng chỉ được xem kết quả nhân sự thuộc phòng mình.</p>
              </section>
            )
          ) : activeAdminItem.label === "Báo cáo" ? (
            <ReportsAdminPage user={user} />
          ) : activeAdminItem.label === "Cài đặt hệ thống" ? (
            <SystemSettingsPage theme={theme} onThemeChange={onThemeChange} />
          ) : (
            <AdminSectionPage title={activeAdminItem.label} icon={activeAdminItem.icon} />
          )}
        </div>
      </section>
    </main>
  );
}
