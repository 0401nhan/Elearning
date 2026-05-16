import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "./shared";

type AssignmentStatus = "not_started" | "studying" | "passed" | "failed";

type AssignmentTest = {
  id: number;
  title: string;
  pass_score: number | null;
  department_id: number | null;
  department_name: string | null;
};

type Department = {
  id: number;
  name: string;
};

type AssignableEmployee = {
  id: number;
  employeeCode: string;
  fullName: string;
  phone: string;
  departmentId: number;
  departmentName: string;
  positionTitle: string | null;
  workArea: string | null;
  assignmentId: number | null;
  assignmentStatus: AssignmentStatus | null;
  assignedAt: string | null;
  dueAt: string | null;
  readProgressPercent: number | null;
  practiceAttemptCount: number;
  officialScore: number | null;
};

type AssignmentResponse = {
  tests: AssignmentTest[];
  departments: Department[];
  selectedTestId: number | null;
  selectedTestPassScore: number | null;
  employees: AssignableEmployee[];
  summary: {
    totalEmployees: number;
    assignedCount: number;
    unassignedCount: number;
    notStartedCount: number;
    studyingCount: number;
    passedCount: number;
    failedCount: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const ASSIGNMENT_PAGE_SIZE = 10;

function getPageNumbers(currentPage: number, totalPages: number) {
  const end = Math.min(totalPages, Math.max(currentPage + 2, 5));
  const start = Math.max(1, Math.min(currentPage - 2, end - 4));

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function statusLabel(status: AssignmentStatus | null) {
  if (!status) return "Chưa giao";
  if (status === "not_started") return "Chưa làm";
  if (status === "studying") return "Đang học";
  if (status === "passed") return "Đạt";
  return "Chưa đạt";
}

function statusClass(status: AssignmentStatus | null) {
  if (status === "passed") return "success";
  if (status === "failed") return "danger";
  if (status === "studying") return "learning";
  return "neutral";
}

function scoreClass(score: number | null, passScore: number | null) {
  if (score === null) return "";
  return passScore !== null && score >= passScore ? "green-text" : "red-text";
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

export function AssignmentManagementPage() {
  const [data, setData] = useState<AssignmentResponse | null>(null);
  const [testId, setTestId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("unassigned");
  const [search, setSearch] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [sendNotification, setSendNotification] = useState(true);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTestId = testId || (data?.selectedTestId ? String(data.selectedTestId) : "");
  const selectedPassScore =
    data?.selectedTestPassScore ?? data?.tests.find((test) => String(test.id) === selectedTestId)?.pass_score ?? null;
  const pagination = data?.pagination ?? { page, pageSize: ASSIGNMENT_PAGE_SIZE, total: 0, totalPages: 1 };
  const totalPages = Math.max(1, pagination.totalPages);
  const visibleCount = data?.employees.length ?? 0;
  const startItem = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = pagination.total ? Math.min(pagination.total, startItem + visibleCount - 1) : 0;
  const pageNumbers = getPageNumbers(pagination.page, totalPages);
  const selectedEmployees = data?.employees.filter((employee) => selectedEmployeeIds.includes(employee.id)) ?? [];
  const visibleEmployeeIds = data?.employees.map((employee) => employee.id) ?? [];
  const allVisibleSelected = visibleEmployeeIds.length > 0 && visibleEmployeeIds.every((id) => selectedEmployeeIds.includes(id));

  async function loadAssignments(targetPage = page) {
    setIsLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (selectedTestId) params.set("testId", selectedTestId);
    if (departmentId) params.set("departmentId", departmentId);
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    params.set("page", String(targetPage));

    try {
      const response = await fetch(`/api/admin/assignments?${params.toString()}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải danh sách giao test.");
        return;
      }

      setData(responseData);
      if (!testId && responseData?.selectedTestId) {
        setTestId(String(responseData.selectedTestId));
      }
      if (responseData?.pagination?.page && responseData.pagination.page !== page) {
        setPage(responseData.pagination.page);
      }
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, page, status, testId]);

  function applyFilters() {
    if (page === 1) {
      loadAssignments(1);
      return;
    }

    setPage(1);
  }

  function toggleEmployee(employeeId: number) {
    setSelectedEmployeeIds((current) =>
      current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId]
    );
  }

  function toggleVisibleEmployees() {
    setSelectedEmployeeIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleEmployeeIds.includes(id));
      }

      return [...new Set([...current, ...visibleEmployeeIds])];
    });
  }

  function selectUnassignedVisible() {
    const ids = (data?.employees ?? []).filter((employee) => !employee.assignmentId).map((employee) => employee.id);
    setSelectedEmployeeIds((current) => [...new Set([...current, ...ids])]);
  }

  async function submitAction(action: "assign" | "remind") {
    setIsSubmitting(true);
    setError("");
    setSuccess("");

    const response = await fetch("/api/admin/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        testId: Number(selectedTestId),
        employeeIds: selectedEmployeeIds,
        dueAt,
        sendNotification
      })
    }).catch(() => null);

    if (!response) {
      setError("Không thể kết nối hệ thống.");
      setIsSubmitting(false);
      return;
    }

    const responseData = await response.json().catch(() => null);
    setIsSubmitting(false);

    if (!response.ok) {
      setError(responseData?.error ?? "Không thể thực hiện thao tác.");
      return;
    }

    setSuccess(
      action === "assign"
        ? `Đã giao bài test cho ${responseData.assignedCount ?? selectedEmployeeIds.length} nhân sự.`
        : `Đã gửi nhắc nhở cho ${responseData.remindedCount ?? selectedEmployeeIds.length} nhân sự.`
    );
    setSelectedEmployeeIds([]);
    await loadAssignments();
  }

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Giao test cho nhân sự</h2>
          <p>Chọn bài test, lọc nhân sự, tick người cần giao và gửi nhắc nhở bằng thông báo nội bộ.</p>
        </div>
      </section>

      <section className="assignment-summary">
        <article className="stat-card">
          <span className="stat-icon blue">
            <Users size={30} />
          </span>
          <div>
            <span>Nhân sự theo bộ lọc</span>
            <strong>{data?.summary.totalEmployees ?? 0}</strong>
            <small>Có tài khoản hoạt động</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon green">
            <UserCheck size={30} />
          </span>
          <div>
            <span>Đã giao</span>
            <strong>{data?.summary.assignedCount ?? 0}</strong>
            <small>Đã có bài test này</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon orange">
            <Clock3 size={30} />
          </span>
          <div>
            <span>Chưa giao</span>
            <strong>{data?.summary.unassignedCount ?? 0}</strong>
            <small>Có thể chọn nhanh</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon purple">
            <Bell size={30} />
          </span>
          <div>
            <span>Đang học</span>
            <strong>{data?.summary.studyingCount ?? 0}</strong>
            <small>Cần theo dõi tiến độ</small>
          </div>
        </article>
      </section>

      <section className="assignment-control-panel panel">
        <label className="field">
          <span>Bài test cần giao</span>
          <div>
            <select
              value={selectedTestId}
              onChange={(event) => {
                setTestId(event.target.value);
                setSelectedEmployeeIds([]);
                setPage(1);
              }}
            >
              {data?.tests.map((test) => (
                <option key={test.id} value={test.id}>
                  {test.title}
                  {test.department_name ? ` - ${test.department_name}` : ""}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label className="field">
          <span>Hạn hoàn thành</span>
          <div>
            <input min={todayDateInput()} type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </div>
        </label>
        <label className="assignment-notify-toggle">
          <input
            type="checkbox"
            checked={sendNotification}
            onChange={(event) => setSendNotification(event.target.checked)}
          />
          <span>Gửi thông báo khi giao</span>
        </label>
      </section>

      <section className="assignment-toolbar">
        <label>
          <Search size={18} />
          <input
            placeholder="Tìm mã, tên, số điện thoại..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyFilters();
              }
            }}
          />
        </label>
        <select
          value={departmentId}
          onChange={(event) => {
            setDepartmentId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả phòng ban</option>
          {data?.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="unassigned">Chưa giao</option>
          <option value="assigned">Đã giao</option>
          <option value="not_started">Chưa làm</option>
          <option value="studying">Đang học</option>
          <option value="passed">Đạt</option>
          <option value="failed">Chưa đạt</option>
        </select>
        <button className="outline-button" onClick={applyFilters} disabled={isLoading}>
          {isLoading ? <RefreshCw size={17} /> : <Filter size={17} />} Lọc
        </button>
      </section>

      {error && <p className="login-error">{error}</p>}
      {success && <p className="success-message">{success}</p>}

      <section className="assignment-actions panel">
        <div>
          <strong>{selectedEmployeeIds.length} nhân sự đã chọn</strong>
          <span>
            {selectedEmployees.slice(0, 3).map((employee) => employee.fullName).join(", ")}
            {selectedEmployeeIds.length > 3 ? ` và ${selectedEmployeeIds.length - 3} người khác` : ""}
          </span>
        </div>
        <button className="outline-button" onClick={toggleVisibleEmployees} disabled={!visibleEmployeeIds.length}>
          {allVisibleSelected ? "Bỏ chọn trang này" : "Chọn trang này"}
        </button>
        <button className="outline-button" onClick={selectUnassignedVisible} disabled={!visibleEmployeeIds.length}>
          Chọn chưa giao
        </button>
        <button className="primary-button" onClick={() => submitAction("assign")} disabled={isSubmitting || !selectedEmployeeIds.length}>
          <Send size={17} /> Giao test
        </button>
        <button className="warm-button" onClick={() => submitAction("remind")} disabled={isSubmitting || !selectedEmployeeIds.length}>
          <Bell size={17} /> Gửi nhắc nhở
        </button>
      </section>

      <section className="panel admin-table-panel">
        <div className="section-title">
          <h3>Danh sách nhân sự</h3>
          <button onClick={() => loadAssignments()}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="assignment-table">
            <thead>
              <tr>
                <th>Chọn</th>
                <th>Nhân sự</th>
                <th>Liên hệ</th>
                <th>Phòng ban</th>
                <th>Vị trí</th>
                <th>Trạng thái test</th>
                <th>Hạn hoàn thành</th>
                <th>Tiến độ</th>
                <th>Làm thử</th>
                <th>Điểm chính thức</th>
              </tr>
            </thead>
            <tbody>
              {(data?.employees ?? []).map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedEmployeeIds.includes(employee.id)}
                      onChange={() => toggleEmployee(employee.id)}
                    />
                  </td>
                  <td>
                    <span className="person-cell">
                      <Avatar name={employee.fullName} small />
                      <span className="person-meta">
                        <strong>{employee.fullName}</strong>
                        <small>{employee.employeeCode}</small>
                      </span>
                    </span>
                  </td>
                  <td>{employee.phone}</td>
                  <td>{employee.departmentName}</td>
                  <td>{employee.positionTitle ?? "--"}</td>
                  <td>
                    <span className={`status-pill ${statusClass(employee.assignmentStatus)}`}>
                      {statusLabel(employee.assignmentStatus)}
                    </span>
                  </td>
                  <td>{formatDate(employee.dueAt)}</td>
                  <td>{employee.readProgressPercent !== null ? `${employee.readProgressPercent}%` : "--"}</td>
                  <td>{employee.practiceAttemptCount}</td>
                  <td className={scoreClass(employee.officialScore, selectedPassScore)}>
                    {employee.officialScore !== null ? `${employee.officialScore}/100` : "--"}
                  </td>
                </tr>
              ))}
              {data?.employees.length === 0 && (
                <tr>
                  <td colSpan={10}>Không có nhân sự phù hợp với bộ lọc.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            Hiển thị {startItem}-{endItem} / {pagination.total} nhân sự
          </span>
          <span>10 nhân sự/trang</span>
          <div className="pagination-actions">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={pagination.page <= 1}
            >
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
    </>
  );
}
