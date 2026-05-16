import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Users
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Avatar } from "./shared";

type Employee = {
  id: number;
  employeeCode: string;
  username: string;
  fullName: string;
  phone: string;
  email: string | null;
  departmentId: number;
  departmentName: string;
  workArea: string | null;
  positionTitle: string | null;
  hireDate: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: string[];
  roleIds: number[];
};

type Department = {
  id: number;
  code: string;
  name: string;
};

type Role = {
  id: number;
  code: string;
  name: string;
};

type PeopleResponse = {
  employees: Employee[];
  departments: Department[];
  roles: Role[];
  summary: {
    onlineCount: number;
    onlineThresholdMinutes: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    workAreas: string[];
    positions: string[];
  };
};

type EmployeeForm = {
  id?: number;
  employeeCode: string;
  username: string;
  fullName: string;
  phone: string;
  password: string;
  email: string;
  departmentId: string;
  workArea: string;
  positionTitle: string;
  hireDate: string;
  isActive: boolean;
  roleIds: number[];
};

const emptyForm: EmployeeForm = {
  employeeCode: "",
  username: "",
  fullName: "",
  phone: "",
  password: "",
  email: "",
  departmentId: "",
  workArea: "",
  positionTitle: "",
  hireDate: "",
  isActive: true,
  roleIds: [1]
};

function toForm(employee: Employee): EmployeeForm {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    username: employee.username,
    fullName: employee.fullName,
    phone: employee.phone,
    password: "",
    email: employee.email ?? "",
    departmentId: String(employee.departmentId),
    workArea: employee.workArea ?? "",
    positionTitle: employee.positionTitle ?? "",
    hireDate: employee.hireDate ? employee.hireDate.slice(0, 10) : "",
    isActive: employee.isActive,
    roleIds: employee.roleIds.length ? employee.roleIds : [1]
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function getPayload(form: EmployeeForm) {
  return {
    employeeCode: form.employeeCode,
    username: form.username,
    fullName: form.fullName,
    phone: form.phone,
    password: form.password,
    email: form.email,
    departmentId: Number(form.departmentId),
    workArea: form.workArea,
    positionTitle: form.positionTitle,
    hireDate: form.hireDate,
    isActive: form.isActive,
    roleIds: form.roleIds
  };
}

function getPageNumbers(currentPage: number, totalPages: number) {
  const end = Math.min(totalPages, Math.max(currentPage + 2, 5));
  const start = Math.max(1, Math.min(currentPage - 2, end - 4));

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

const EMPLOYEE_PAGE_SIZE = 10;
const DEFAULT_ONLINE_THRESHOLD_MINUTES = 100;

function getLoginMinutes(lastLoginAt: string | null) {
  if (!lastLoginAt) {
    return null;
  }

  const date = new Date(lastLoginAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function isEmployeeOnline(employee: Employee, thresholdMinutes: number) {
  const minutes = getLoginMinutes(employee.lastLoginAt);

  return employee.isActive && minutes !== null && minutes <= thresholdMinutes;
}

function formatLoginAgo(lastLoginAt: string | null, thresholdMinutes: number) {
  const minutes = getLoginMinutes(lastLoginAt);

  if (minutes === null) {
    return "Chưa đăng nhập";
  }

  if (minutes > thresholdMinutes) {
    return "Offline";
  }

  if (minutes < 1) {
    return "Vừa đăng nhập";
  }

  return `${minutes} phút trước`;
}

export function PeopleAdminPage() {
  const [data, setData] = useState<PeopleResponse | null>(null);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [workArea, setWorkArea] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const pagination = data?.pagination ?? { page, pageSize: EMPLOYEE_PAGE_SIZE, total: 0, totalPages: 1 };
  const onlineThreshold = data?.summary.onlineThresholdMinutes ?? DEFAULT_ONLINE_THRESHOLD_MINUTES;
  const onlineCount = data?.summary.onlineCount ?? 0;
  const totalPages = Math.max(1, pagination.totalPages);
  const visibleCount = data?.employees.length ?? 0;
  const startItem = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = pagination.total ? Math.min(pagination.total, startItem + visibleCount - 1) : 0;
  const pageNumbers = getPageNumbers(pagination.page, totalPages);

  async function loadEmployees(targetPage = page) {
    setIsLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (departmentId) params.set("departmentId", departmentId);
    if (workArea) params.set("workArea", workArea);
    if (status) params.set("status", status);
    params.set("page", String(targetPage));

    try {
      const response = await fetch(`/api/admin/employees?${params.toString()}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải danh sách nhân sự.");
        return;
      }

      setData(responseData);
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
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, workArea, status, page]);

  function applyFilters() {
    if (page === 1) {
      loadEmployees(1);
      return;
    }

    setPage(1);
  }

  function openCreateModal() {
    setForm({
      ...emptyForm,
      departmentId: data?.departments[0] ? String(data.departments[0].id) : ""
    });
    setError("");
    setIsModalOpen(true);
  }

  function openEditModal(employee: Employee) {
    setForm(toForm(employee));
    setError("");
    setIsModalOpen(true);
  }

  function toggleRole(roleId: number) {
    setForm((current) => {
      const hasRole = current.roleIds.includes(roleId);
      const roleIds = hasRole ? current.roleIds.filter((id) => id !== roleId) : [...current.roleIds, roleId];

      return {
        ...current,
        roleIds: roleIds.length ? roleIds : [1]
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    const isEdit = Boolean(form.id);
    const response = await fetch(isEdit ? `/api/admin/employees/${form.id}` : "/api/admin/employees", {
      method: isEdit ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayload(form))
    }).catch(() => null);

    if (!response) {
      setError("Không thể kết nối hệ thống.");
      setIsSaving(false);
      return;
    }

    const responseData = await response.json().catch(() => null);
    setIsSaving(false);

    if (!response.ok) {
      setError(responseData?.error ?? "Không thể lưu nhân sự.");
      return;
    }

    setIsModalOpen(false);
    await loadEmployees();
  }

  async function handleDelete(employee: Employee) {
    const ok = window.confirm(`Xóa nhân sự ${employee.fullName}? Tài khoản sẽ bị khóa và không đăng nhập được.`);
    if (!ok) {
      return;
    }

    const response = await fetch(`/api/admin/employees/${employee.id}`, { method: "DELETE" }).catch(() => null);
    const responseData = await response?.json().catch(() => null);

    if (!response?.ok) {
      setError(responseData?.error ?? "Không thể xóa nhân sự.");
      return;
    }

    await loadEmployees();
  }

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Nhân sự</h2>
          <p>Quản lý tài khoản, phòng ban, khu vực, chức vụ và phân quyền người dùng.</p>
        </div>
        <button className="primary-button" onClick={openCreateModal}>
          <Plus size={18} /> Thêm nhân sự
        </button>
      </section>

      <section className="people-summary">
        <article className="stat-card">
          <span className="stat-icon blue">
            <Users size={30} />
          </span>
          <div>
            <span>Tổng nhân sự</span>
            <strong>{pagination.total}</strong>
            <small>Bản ghi theo bộ lọc</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon green">
            <UserRound size={30} />
          </span>
          <div>
            <span>Đang online</span>
            <strong>{onlineCount}</strong>
            <small>Đăng nhập gần đây</small>
          </div>
        </article>
      </section>

      <section className="people-toolbar">
        <label className="people-search">
          <Search size={18} />
          <input
            placeholder="Tìm theo mã, tên, username, số điện thoại..."
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
          value={workArea}
          onChange={(event) => {
            setWorkArea(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả khu vực</option>
          {data?.filters.workAreas.map((area) => (
            <option key={area} value={area}>
              {area}
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
          <option value="active">Tài khoản hoạt động</option>
          <option value="inactive">Tài khoản đã khóa</option>
          <option value="all">Tất cả tài khoản</option>
        </select>
        <button className="outline-button" onClick={applyFilters} disabled={isLoading}>
          {isLoading ? <RefreshCw size={17} /> : <Filter size={17} />} Lọc
        </button>
      </section>

      {error && <p className="login-error">{error}</p>}

      <section className="panel admin-table-panel">
        <div className="section-title">
          <h3>Bảng nhân sự</h3>
          <button onClick={() => loadEmployees()}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="people-table">
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Username</th>
                <th>Liên hệ</th>
                <th>Phòng ban</th>
                <th>Khu vực</th>
                <th>Chức vụ</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Đăng nhập cuối</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(data?.employees ?? []).map((employee) => {
                const online = isEmployeeOnline(employee, onlineThreshold);
                const statusClass = !employee.isActive ? "neutral" : online ? "success" : "neutral";
                const statusText = !employee.isActive ? "Đã khóa" : online ? "Online" : "Offline";

                return (
                  <tr key={employee.id}>
                    <td>
                      <span className="person-cell">
                        <Avatar name={employee.fullName} small />
                        <span className="person-meta">
                          <strong>{employee.fullName}</strong>
                          <small>{employee.employeeCode}</small>
                        </span>
                      </span>
                    </td>
                    <td>{employee.username}</td>
                    <td>
                      <span className="stacked-cell">
                        <strong>{employee.phone}</strong>
                        <small>{employee.email ?? "--"}</small>
                      </span>
                    </td>
                    <td>{employee.departmentName}</td>
                    <td>{employee.workArea ?? "--"}</td>
                    <td>{employee.positionTitle ?? "--"}</td>
                    <td>{employee.roles.join(", ") || "--"}</td>
                    <td>
                      <span className="stacked-cell status-cell">
                        <span className={`status-pill ${statusClass}`}>{statusText}</span>
                        <small>{formatLoginAgo(employee.lastLoginAt, onlineThreshold)}</small>
                      </span>
                    </td>
                    <td>{employee.lastLoginAt ? formatDate(employee.lastLoginAt) : "--"}</td>
                    <td>
                      <span className="table-actions">
                        <button className="table-icon" onClick={() => openEditModal(employee)} aria-label="Sửa nhân sự">
                          <Edit3 size={16} />
                        </button>
                        <button className="table-icon danger" onClick={() => handleDelete(employee)} aria-label="Xóa nhân sự">
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
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

      {isModalOpen && (
        <div className="modal-backdrop">
          <form className="employee-modal" onSubmit={handleSubmit}>
            <header>
              <div>
                <h3>{form.id ? "Sửa nhân sự" : "Thêm nhân sự"}</h3>
                <p>{form.id ? "Cập nhật hồ sơ và phân quyền." : "Tạo tài khoản đăng nhập mới."}</p>
              </div>
              <button className="outline-button" type="button" onClick={() => setIsModalOpen(false)}>
                Đóng
              </button>
            </header>

            <div className="employee-form-grid">
              <label className="field">
                <span>Mã nhân viên</span>
                <div>
                  <input
                    value={form.employeeCode}
                    onChange={(event) => setForm({ ...form, employeeCode: event.target.value })}
                  />
                </div>
              </label>
              <label className="field">
                <span>Username</span>
                <div>
                  <input
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                  />
                </div>
              </label>
              <label className="field">
                <span>Họ tên</span>
                <div>
                  <input
                    value={form.fullName}
                    onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  />
                </div>
              </label>
              <label className="field">
                <span>Số điện thoại</span>
                <div>
                  <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                </div>
              </label>
              <label className="field">
                <span>Email</span>
                <div>
                  <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                </div>
              </label>
              <label className="field">
                <span>{form.id ? "Đặt lại mật khẩu" : "Mật khẩu ban đầu"}</span>
                <div>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder={form.id ? "Để trống nếu không đổi" : ""}
                  />
                </div>
              </label>
              <label className="field">
                <span>Phòng ban</span>
                <div>
                  <select
                    value={form.departmentId}
                    onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
                  >
                    <option value="">Chọn phòng ban</option>
                    {data?.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="field">
                <span>Khu vực</span>
                <div>
                  <input
                    value={form.workArea}
                    onChange={(event) => setForm({ ...form, workArea: event.target.value })}
                    list="work-area-options"
                  />
                  <datalist id="work-area-options">
                    {data?.filters.workAreas.map((area) => <option key={area} value={area} />)}
                  </datalist>
                </div>
              </label>
              <label className="field">
                <span>Chức vụ</span>
                <div>
                  <input
                    value={form.positionTitle}
                    onChange={(event) => setForm({ ...form, positionTitle: event.target.value })}
                    list="position-options"
                  />
                  <datalist id="position-options">
                    {data?.filters.positions.map((position) => <option key={position} value={position} />)}
                  </datalist>
                </div>
              </label>
              <label className="field">
                <span>Ngày vào làm</span>
                <div>
                  <input
                    type="date"
                    value={form.hireDate}
                    onChange={(event) => setForm({ ...form, hireDate: event.target.value })}
                  />
                </div>
              </label>
            </div>

            <div className="role-picker">
              <strong>Vai trò</strong>
              <div>
                {data?.roles.map((role) => (
                  <label key={role.id}>
                    <input
                      type="checkbox"
                      checked={form.roleIds.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                    />
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="active-toggle">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              <span>Cho phép tài khoản hoạt động</span>
            </label>

            {error && <p className="login-error">{error}</p>}

            <footer>
              <button className="outline-button" type="button" onClick={() => setIsModalOpen(false)}>
                Hủy
              </button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? "Đang lưu" : "Lưu nhân sự"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
