import {
  BarChart3,
  Building2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  HelpCircle,
  RefreshCw,
  Search
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isAdminUser } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import { AdminDataLoading } from "./admin-data-loading";
import { AdminToast } from "./admin-feedback";

type ReportType = "results" | "department_summary" | "test_summary" | "wrong_questions";

type ReportColumn = {
  key: string;
  label: string;
};

type ReportResponse = {
  reportType: ReportType;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  rowCount: number;
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

const reportTypes: {
  value: ReportType;
  title: string;
  description: string;
  icon: typeof FileSpreadsheet;
}[] = [
  {
    value: "results",
    title: "Chi tiết kết quả",
    description: "Từng nhân sự, bài test, điểm, thời gian và trạng thái.",
    icon: FileSpreadsheet
  },
  {
    value: "department_summary",
    title: "Theo phòng ban",
    description: "Tổng hợp số lượt giao, hoàn thành, đạt/chưa đạt theo phòng ban.",
    icon: Building2
  },
  {
    value: "test_summary",
    title: "Theo bài test",
    description: "So sánh mức hoàn thành và điểm trung bình của từng bài test.",
    icon: ClipboardList
  },
  {
    value: "wrong_questions",
    title: "Câu hỏi sai nhiều",
    description: "Xem câu hỏi nào đang có nhiều lượt trả lời sai nhất.",
    icon: HelpCircle
  }
];

const statusOptions = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "not_started", label: "Chưa làm" },
  { value: "studying", label: "Đang học" },
  { value: "passed", label: "Đạt" },
  { value: "failed", label: "Chưa đạt" }
];

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function formatCellValue(key: string, value: string | number | null) {
  if (value === null || value === "") {
    return "--";
  }

  if (key === "time_spent_minutes") {
    return `${value} phút`;
  }

  if (typeof value === "number") {
    return value.toLocaleString("vi-VN");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDate(value);
  }

  return value;
}

function readFilename(contentDisposition: string | null, fallback: string) {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

export function ReportsAdminPage({ user }: { user: SessionUser }) {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [reportType, setReportType] = useState<ReportType>("results");
  const [departmentId, setDepartmentId] = useState("");
  const [testId, setTestId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const isFullAdmin = isAdminUser(user);

  const selectedReport = useMemo(
    () => reportTypes.find((item) => item.value === reportType) ?? reportTypes[0],
    [reportType]
  );

  function buildParams(format: "json" | "csv") {
    const params = new URLSearchParams({ reportType, format });

    if (departmentId) params.set("departmentId", departmentId);
    if (testId) params.set("testId", testId);
    if (status) params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (search.trim()) params.set("search", search.trim());

    return params;
  }

  async function loadReport() {
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/admin/reports?${buildParams("json").toString()}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải báo cáo.");
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
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, refreshKey, reportType, status, testId]);

  function applyFilters() {
    loadReport();
  }

  async function downloadReport() {
    setIsDownloading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/admin/reports?${buildParams("csv").toString()}`);

      if (!response.ok) {
        const responseData = await response.json().catch(() => null);
        setError(responseData?.error ?? "Không thể tải báo cáo.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = readFilename(response.headers.get("Content-Disposition"), "bao-cao.csv");
      anchor.click();
      URL.revokeObjectURL(url);
      setSuccess("Đã tạo file báo cáo theo bộ lọc hiện tại.");
    } catch {
      setError("Không thể tải báo cáo.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Báo cáo</h2>
          <p>Tải báo cáo CSV theo phòng ban, bài test, trạng thái, thời gian hoặc xem nhanh dữ liệu trước khi tải.</p>
        </div>
        <button className="primary-button" onClick={downloadReport} disabled={isDownloading || isLoading}>
          <Download size={18} /> {isDownloading ? "Đang tải" : "Tải CSV"}
        </button>
      </section>

      <section className="report-type-grid">
        {reportTypes.map((item) => {
          const Icon = item.icon;

          return (
            <button
              className={`report-type-card ${reportType === item.value ? "active" : ""}`}
              key={item.value}
              type="button"
              onClick={() => setReportType(item.value)}
            >
              <span className="stat-icon blue">
                <Icon size={28} />
              </span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </button>
          );
        })}
      </section>

      <section className="reports-toolbar">
        <select
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
          disabled={!isFullAdmin}
        >
          <option value="">{isFullAdmin ? "Tất cả phòng ban" : user.department}</option>
          {data?.filters.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <select value={testId} onChange={(event) => setTestId(event.target.value)}>
          <option value="">Tất cả bài test</option>
          {data?.filters.tests.map((test) => (
            <option key={test.id} value={test.id}>
              {test.title}
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
        <div className="date-range-filter">
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
        <label>
          <Search size={18} />
          <input
            placeholder="Tìm nhân sự, SĐT, bài test..."
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
          {isLoading ? <RefreshCw size={17} /> : <Search size={17} />} Xem trước
        </button>
        <button className="outline-button" onClick={() => setRefreshKey((value) => value + 1)}>
          <RefreshCw size={17} /> Làm mới
        </button>
      </section>

      {error && <p className="login-error">{error}</p>}
      <AdminToast message={success} onDismiss={() => setSuccess("")} />
      {isLoading && <AdminDataLoading label="Đang tải dữ liệu báo cáo..." floating={Boolean(data)} />}

      <section className="reports-summary">
        <article className="stat-card">
          <span className="stat-icon purple">
            <BarChart3 size={30} />
          </span>
          <div>
            <span>Loại báo cáo</span>
            <strong>{selectedReport.title}</strong>
            <small>Đang xem trước 20 dòng đầu</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon green">
            <FileSpreadsheet size={30} />
          </span>
          <div>
            <span>Dòng dữ liệu</span>
            <strong>{data?.rowCount ?? 0}</strong>
            <small>File CSV tải tối đa 10.000 dòng</small>
          </div>
        </article>
      </section>

      <section className="panel admin-table-panel reports-preview-panel">
        <div className="section-title">
          <h3>Xem trước báo cáo</h3>
          <button onClick={downloadReport} disabled={isDownloading || isLoading}>
            <Download size={16} /> Tải CSV
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="reports-preview-table">
            <thead>
              <tr>
                {(data?.columns ?? []).map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row, index) => (
                <tr key={index}>
                  {(data?.columns ?? []).map((column) => (
                    <td key={column.key}>{formatCellValue(column.key, row[column.key])}</td>
                  ))}
                </tr>
              ))}
              {!isLoading && data?.rows.length === 0 && (
                <tr>
                  <td colSpan={Math.max(1, data.columns.length)}>Không có dữ liệu phù hợp với bộ lọc.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
