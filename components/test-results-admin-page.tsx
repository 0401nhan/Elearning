import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  Star
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isAdminUser } from "@/lib/permissions";
import type { ResultStatus, SessionUser, TestStatus } from "@/lib/types";
import { Avatar, StatusPill } from "./shared";

type ResultRow = {
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
  assignment_status: string;
  retake_reviewer: string | null;
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

type DashboardData = {
  metrics: {
    totalAssigned: number;
    completed: number;
    notCompleted: number;
    passed: number;
    failed: number;
    averageScore: number;
    averagePracticeAttempts: number;
  };
  results: ResultRow[];
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
};

const RESULTS_PAGE_SIZE = 10;

function percent(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
}

function getPageNumbers(currentPage: number, totalPages: number) {
  const end = Math.min(totalPages, Math.max(currentPage + 2, 5));
  const start = Math.max(1, Math.min(currentPage - 2, end - 4));

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
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

function readFilename(contentDisposition: string | null, fallback: string) {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

export function TestResultsAdminPage({
  user,
  onRetakeRequestsChanged
}: {
  user: SessionUser;
  onRetakeRequestsChanged?: () => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [retakeRequests, setRetakeRequests] = useState<RetakeRequestRow[]>([]);
  const [page, setPage] = useState(1);
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [testId, setTestId] = useState("");
  const [timeRange, setTimeRange] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedResult, setSelectedResult] = useState<ResultRow | null>(null);
  const [error, setError] = useState("");
  const [retakeError, setRetakeError] = useState("");
  const [retakeSuccess, setRetakeSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [retakeActionId, setRetakeActionId] = useState<number | null>(null);
  const isFullAdmin = isAdminUser(user);
  const canReviewRetakeRequests = isFullAdmin;
  const pagination = data?.resultsPagination ?? {
    page,
    pageSize: RESULTS_PAGE_SIZE,
    total: 0,
    totalPages: 1
  };
  const totalPages = Math.max(1, pagination.totalPages);
  const startItem = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = pagination.total ? Math.min(pagination.total, startItem + (data?.results.length ?? 0) - 1) : 0;
  const pageNumbers = getPageNumbers(pagination.page, totalPages);

  const summaryCards = useMemo(() => {
    const metrics = data?.metrics;
    const total = metrics?.totalAssigned ?? 0;
    const completed = metrics?.completed ?? 0;
    const notCompleted = metrics?.notCompleted ?? 0;
    const passed = metrics?.passed ?? 0;
    const failed = metrics?.failed ?? 0;
    const averageScore = metrics?.averageScore ?? 0;

    return [
      { label: "Tổng lượt giao", value: total, note: "Theo bộ lọc", icon: BarChart3, tone: "blue" },
      { label: "Đã hoàn thành", value: completed, note: percent(completed, total), icon: CheckCircle2, tone: "green" },
      { label: "Chưa hoàn thành", value: notCompleted, note: percent(notCompleted, total), icon: Clock3, tone: "orange" },
      { label: "Đạt", value: passed, note: percent(passed, total), icon: ShieldCheck, tone: "green" },
      { label: "Chưa đạt", value: failed, note: percent(failed, total), icon: ShieldX, tone: "red" },
      { label: "Điểm trung bình", value: averageScore.toFixed(1), note: "/100 điểm", icon: Star, tone: "purple" }
    ];
  }, [data]);

  function buildParams(targetPage?: number, format?: "json" | "csv") {
    const params = new URLSearchParams();
    if (targetPage) params.set("page", String(targetPage));
    if (format) params.set("format", format);
    if (departmentId) params.set("departmentId", departmentId);
    if (status) params.set("status", status);
    if (testId) params.set("testId", testId);
    if (timeRange) params.set("timeRange", timeRange);
    if (timeRange === "custom") {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    if (search.trim()) params.set("search", search.trim());

    return params;
  }

  async function loadResults(targetPage = page) {
    setIsLoading(true);
    setError("");

    const params = buildParams(targetPage);

    try {
      const response = await fetch(`/api/admin/dashboard?${params.toString()}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải kết quả test.");
        return;
      }

      setData(responseData);
      if (responseData?.resultsPagination?.page && responseData.resultsPagination.page !== page) {
        setPage(responseData.resultsPagination.page);
      }
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRetakeRequests() {
    setRetakeError("");

    try {
      const response = await fetch("/api/admin/retake-requests?status=pending", { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setRetakeError(responseData?.error ?? "Không thể tải yêu cầu thi lại.");
        return;
      }

      setRetakeRequests(responseData?.requests ?? []);
    } catch {
      setRetakeError("Không thể kết nối hệ thống.");
    }
  }

  useEffect(() => {
    loadResults();
    loadRetakeRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, page, refreshKey, status, testId, timeRange]);

  function resetPage() {
    if (page !== 1) {
      setPage(1);
    }
  }

  function applyFilters() {
    if (page === 1) {
      loadResults(1);
      return;
    }

    setPage(1);
  }

  async function exportCsv() {
    setIsExporting(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/dashboard?${buildParams(undefined, "csv").toString()}`);

      if (!response.ok) {
        const responseData = await response.json().catch(() => null);
        setError(responseData?.error ?? "Không thể export CSV.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = readFilename(response.headers.get("Content-Disposition"), "ket-qua-test.csv");
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Không thể export CSV.");
    } finally {
      setIsExporting(false);
    }
  }

  async function reviewRetakeRequest(requestId: number, action: "approve" | "reject") {
    if (!canReviewRetakeRequests) {
      setRetakeError("Chỉ admin được duyệt yêu cầu thi lại.");
      return;
    }

    const reviewNote =
      action === "reject" ? window.prompt("Nhập lý do từ chối yêu cầu thi lại:") : "";

    if (action === "reject" && reviewNote === null) {
      return;
    }

    setRetakeActionId(requestId);
    setRetakeError("");
    setRetakeSuccess("");

    try {
      const response = await fetch("/api/admin/retake-requests", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId,
          action,
          reviewNote
        })
      });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setRetakeError(responseData?.error ?? "Không thể xử lý yêu cầu thi lại.");
        return;
      }

      setRetakeSuccess(action === "approve" ? "Đã duyệt mở thêm 1 lượt thi." : "Đã từ chối yêu cầu thi lại.");
      await Promise.all([loadRetakeRequests(), loadResults(page)]);
      onRetakeRequestsChanged?.();
    } catch {
      setRetakeError("Không thể kết nối hệ thống.");
    } finally {
      setRetakeActionId(null);
    }
  }

  function statusLabelPlain(value: string) {
    if (value === "passed") return "Đạt";
    if (value === "failed") return "Chưa đạt";
    if (value === "studying") return "Đang học";
    return "Chưa làm";
  }

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Kết quả test</h2>
          <p>Tra cứu điểm chính thức, lượt làm thử, thời gian làm bài và trạng thái hoàn thành của nhân sự.</p>
        </div>
        <button className="primary-button" onClick={exportCsv} disabled={isExporting || !pagination.total}>
          <Download size={18} /> {isExporting ? "Đang export" : "Export CSV"}
        </button>
      </section>

      <section className="results-summary">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <article className="stat-card" key={card.label}>
              <span className={`stat-icon ${card.tone}`}>
                <Icon size={30} />
              </span>
              <div>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.note}</small>
              </div>
            </article>
          );
        })}
      </section>

      <section className="results-toolbar">
        <select
          value={departmentId}
          onChange={(event) => {
            setDepartmentId(event.target.value);
            resetPage();
          }}
          disabled={!isFullAdmin}
        >
          <option value="">{isFullAdmin ? "Tất cả phòng ban" : user.department}</option>
          {data?.filters.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            resetPage();
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="not_started">Chưa làm</option>
          <option value="studying">Đang học</option>
          <option value="passed">Đạt</option>
          <option value="failed">Chưa đạt</option>
        </select>
        <select
          value={testId}
          onChange={(event) => {
            setTestId(event.target.value);
            resetPage();
          }}
        >
          <option value="">Tất cả bài test</option>
          {data?.filters.tests.map((test) => (
            <option key={test.id} value={test.id}>
              {test.title}
            </option>
          ))}
        </select>
        <select
          value={timeRange}
          onChange={(event) => {
            setTimeRange(event.target.value);
            resetPage();
          }}
        >
          <option value="">Tất cả</option>
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
                resetPage();
              }}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                resetPage();
              }}
            />
          </div>
        )}
        <label>
          <Search size={18} />
          <input
            placeholder="Tìm nhân sự, số điện thoại, bài test..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyFilters();
              }
            }}
          />
        </label>
        <button className="outline-button" onClick={applyFilters} disabled={isLoading}>
          {isLoading ? <RefreshCw size={17} /> : <Search size={17} />} Lọc
        </button>
        <button className="outline-button" onClick={() => setRefreshKey((value) => value + 1)}>
          <RefreshCw size={17} /> Làm mới
        </button>
      </section>

      {error && <p className="login-error">{error}</p>}

      <section className="panel admin-table-panel">
        <div className="section-title">
          <h3>Yêu cầu thi lại chờ duyệt</h3>
          <button className="outline-button" onClick={loadRetakeRequests}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
        {retakeError && <p className="login-error">{retakeError}</p>}
        {retakeSuccess && <p className="success-message">{retakeSuccess}</p>}
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Phòng ban</th>
                <th>Bài test</th>
                <th>Điểm</th>
                <th>Lượt đã dùng</th>
                <th>Lý do</th>
                <th>Ngày gửi</th>
                <th>{canReviewRetakeRequests ? "Duyệt" : "Trạng thái"}</th>
              </tr>
            </thead>
            <tbody>
              {retakeRequests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <span className="stacked-cell">
                      <strong>{request.fullName}</strong>
                      <small>{request.phone}</small>
                    </span>
                  </td>
                  <td>{request.departmentName}</td>
                  <td>{request.testTitle}</td>
                  <td>{request.officialScore !== null ? `${request.officialScore}/100` : "--"}</td>
                  <td>{request.officialAttemptsUsed}</td>
                  <td>{request.reason ?? "--"}</td>
                  <td>{formatDateTime(request.requestedAt)}</td>
                  <td>
                    {canReviewRetakeRequests ? (
                      <span className="row-actions">
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => reviewRetakeRequest(request.id, "approve")}
                          disabled={retakeActionId === request.id}
                        >
                          <CheckCircle2 size={16} /> Duyệt
                        </button>
                        <button
                          className="outline-button"
                          type="button"
                          onClick={() => reviewRetakeRequest(request.id, "reject")}
                          disabled={retakeActionId === request.id}
                        >
                          <ShieldX size={16} /> Từ chối
                        </button>
                      </span>
                    ) : (
                      <span className="status-pill learning">Chờ admin duyệt</span>
                    )}
                  </td>
                </tr>
              ))}
              {!retakeRequests.length && (
                <tr>
                  <td colSpan={8}>Không có yêu cầu thi lại đang chờ duyệt.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel admin-table-panel">
        <div className="section-title">
          <h3>Danh sách kết quả nhân sự</h3>
        </div>
        <div className="admin-table-wrap">
          <table className="results-admin-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Họ tên</th>
                <th>Số điện thoại</th>
                <th>Phòng ban</th>
                <th>Vị trí</th>
                <th>Ngày vào làm</th>
                <th>Bài test</th>
                <th>Làm thử</th>
                <th>Điểm chính thức</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>Duyệt làm lại</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results ?? []).map((row, index) => (
                <tr key={row.assignment_id}>
                  <td>{startItem + index}</td>
                  <td>
                    <span className="person-cell">
                      <Avatar name={row.full_name} small />
                      <strong>{row.full_name}</strong>
                    </span>
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
                    <StatusPill status={assignmentStatusLabel(row.assignment_status)} />
                  </td>
                  <td>{row.retake_reviewer ?? "--"}</td>
                  <td>
                    <button className="table-icon" onClick={() => setSelectedResult(row)} aria-label="Xem chi tiết">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {data?.results.length === 0 && (
                <tr>
                  <td colSpan={13}>Chưa có dữ liệu kết quả phù hợp với bộ lọc.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            Hiển thị {startItem}-{endItem} / {pagination.total} kết quả
          </span>
          <span>10 kết quả/trang</span>
          <div className="pagination-actions">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={pagination.page <= 1}>
              <ChevronLeft size={16} />
            </button>
            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={pageNumber === pagination.page ? "active" : ""}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={pagination.page >= totalPages}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {selectedResult && (
        <div className="modal-backdrop">
          <section className="employee-modal result-detail-modal">
            <header>
              <div>
                <h3>Chi tiết kết quả</h3>
                <p>{selectedResult.full_name} - {selectedResult.test_title}</p>
              </div>
              <button className="outline-button" type="button" onClick={() => setSelectedResult(null)}>
                Đóng
              </button>
            </header>
            <div className="result-detail-grid">
              <span>
                <small>Nhân sự</small>
                <strong>{selectedResult.full_name}</strong>
              </span>
              <span>
                <small>Số điện thoại</small>
                <strong>{selectedResult.phone}</strong>
              </span>
              <span>
                <small>Phòng ban</small>
                <strong>{selectedResult.department_name}</strong>
              </span>
              <span>
                <small>Vị trí</small>
                <strong>{selectedResult.position_title ?? "--"}</strong>
              </span>
              <span>
                <small>Làm thử</small>
                <strong>{selectedResult.practice_attempt_count} lần</strong>
              </span>
              <span>
                <small>Điểm chính thức</small>
                <strong>{selectedResult.official_score !== null ? `${selectedResult.official_score}/100` : "--"}</strong>
              </span>
              <span>
                <small>Điểm đạt</small>
                <strong>{selectedResult.pass_score !== null ? `${selectedResult.pass_score}/100` : "--"}</strong>
              </span>
              <span>
                <small>Thời gian làm bài</small>
                <strong>{selectedResult.time_spent_minutes ? `${selectedResult.time_spent_minutes} phút` : "--"}</strong>
              </span>
              <span>
                <small>Trạng thái</small>
                <strong>{statusLabelPlain(selectedResult.assignment_status)}</strong>
              </span>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
