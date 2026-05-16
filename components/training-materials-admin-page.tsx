import {
  Archive,
  BookOpen,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Filter,
  Image as ImageIcon,
  Link,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Upload
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

type MaterialType = "pdf" | "image" | "slide" | "text" | "video" | "link";

type TrainingMaterial = {
  id: number;
  title: string;
  materialType: MaterialType;
  contentUrl: string | null;
  contentText: string | null;
  departmentId: number | null;
  departmentName: string | null;
  versionLabel: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  testIds: number[];
  testTitles: string[];
};

type Department = {
  id: number;
  name: string;
};

type TestOption = {
  id: number;
  title: string;
};

type MaterialsResponse = {
  materials: TrainingMaterial[];
  departments: Department[];
  tests: TestOption[];
  summary: {
    total: number;
    active: number;
    inactive: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type MaterialForm = {
  id?: number;
  title: string;
  materialType: MaterialType;
  departmentId: string;
  versionLabel: string;
  isActive: boolean;
  contentUrl: string;
  currentUrl: string;
  contentText: string;
  testIds: number[];
  file: File | null;
};

const MATERIAL_PAGE_SIZE = 10;

const materialTypeLabels: Record<MaterialType, string> = {
  pdf: "PDF",
  image: "Hình ảnh",
  slide: "Slide",
  text: "Text",
  video: "Video",
  link: "Tệp/Link"
};

const emptyForm: MaterialForm = {
  title: "",
  materialType: "pdf",
  departmentId: "",
  versionLabel: "1.0",
  isActive: true,
  contentUrl: "",
  currentUrl: "",
  contentText: "",
  testIds: [],
  file: null
};

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

function materialIcon(type: MaterialType) {
  if (type === "image") return ImageIcon;
  if (type === "video") return PlayCircle;
  if (type === "text") return BookOpen;
  if (type === "link") return Link;
  return FileText;
}

function materialTone(type: MaterialType) {
  if (type === "image") return "purple";
  if (type === "video") return "orange";
  if (type === "text") return "green";
  if (type === "link") return "blue";
  return "blue";
}

function toForm(material: TrainingMaterial): MaterialForm {
  return {
    id: material.id,
    title: material.title,
    materialType: material.materialType,
    departmentId: material.departmentId ? String(material.departmentId) : "",
    versionLabel: material.versionLabel,
    isActive: material.isActive,
    contentUrl: material.contentUrl ?? "",
    currentUrl: material.contentUrl ?? "",
    contentText: material.contentText ?? "",
    testIds: material.testIds,
    file: null
  };
}

export function TrainingMaterialsAdminPage() {
  const [data, setData] = useState<MaterialsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<MaterialForm>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const pagination = data?.pagination ?? { page, pageSize: MATERIAL_PAGE_SIZE, total: 0, totalPages: 1 };
  const totalPages = Math.max(1, pagination.totalPages);
  const visibleCount = data?.materials.length ?? 0;
  const startItem = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = pagination.total ? Math.min(pagination.total, startItem + visibleCount - 1) : 0;
  const pageNumbers = getPageNumbers(pagination.page, totalPages);

  async function loadMaterials(targetPage = page) {
    setIsLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (departmentId) params.set("departmentId", departmentId);
    if (materialType) params.set("materialType", materialType);
    if (status) params.set("status", status);
    params.set("page", String(targetPage));

    try {
      const response = await fetch(`/api/admin/materials?${params.toString()}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải tài liệu đào tạo.");
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
    loadMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, materialType, page, status]);

  function applyFilters() {
    if (page === 1) {
      loadMaterials(1);
      return;
    }

    setPage(1);
  }

  function openCreateModal() {
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setIsModalOpen(true);
  }

  function openEditModal(material: TrainingMaterial) {
    setForm(toForm(material));
    setError("");
    setSuccess("");
    setIsModalOpen(true);
  }

  function toggleTest(testId: number) {
    setForm((current) => ({
      ...current,
      testIds: current.testIds.includes(testId)
        ? current.testIds.filter((id) => id !== testId)
        : [...current.testIds, testId]
    }));
  }

  function buildFormData() {
    const formData = new FormData();
    formData.set("title", form.title);
    formData.set("materialType", form.materialType);
    formData.set("departmentId", form.departmentId);
    formData.set("versionLabel", form.versionLabel);
    formData.set("isActive", String(form.isActive));
    formData.set("contentUrl", form.contentUrl);
    formData.set("currentUrl", form.currentUrl);
    formData.set("contentText", form.contentText);
    form.testIds.forEach((testId) => formData.append("testIds", String(testId)));
    if (form.file) {
      formData.set("file", form.file);
    }

    return formData;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess("");

    const isEdit = Boolean(form.id);
    const response = await fetch(isEdit ? `/api/admin/materials/${form.id}` : "/api/admin/materials", {
      method: isEdit ? "PATCH" : "POST",
      body: buildFormData()
    }).catch(() => null);

    if (!response) {
      setError("Không thể kết nối hệ thống.");
      setIsSaving(false);
      return;
    }

    const responseData = await response.json().catch(() => null);
    setIsSaving(false);

    if (!response.ok) {
      setError(responseData?.error ?? "Không thể lưu tài liệu đào tạo.");
      return;
    }

    setIsModalOpen(false);
    setSuccess(isEdit ? "Đã cập nhật tài liệu đào tạo." : "Đã upload tài liệu đào tạo.");
    await loadMaterials();
  }

  async function handleArchive(material: TrainingMaterial) {
    const ok = window.confirm(`Tắt tài liệu ${material.title}?`);
    if (!ok) {
      return;
    }

    const response = await fetch(`/api/admin/materials/${material.id}`, { method: "DELETE" }).catch(() => null);
    const responseData = await response?.json().catch(() => null);

    if (!response?.ok) {
      setError(responseData?.error ?? "Không thể tắt tài liệu.");
      return;
    }

    setSuccess("Đã tắt tài liệu đào tạo.");
    await loadMaterials();
  }

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Tài liệu đào tạo</h2>
          <p>Upload PDF, hình ảnh, slide, tệp văn phòng hoặc nhập nội dung text/link để gắn với bài test.</p>
        </div>
        <button className="primary-button" onClick={openCreateModal}>
          <Upload size={18} /> Upload tài liệu
        </button>
      </section>

      <section className="materials-summary">
        <article className="stat-card">
          <span className="stat-icon blue">
            <FileText size={30} />
          </span>
          <div>
            <span>Tổng tài liệu</span>
            <strong>{data?.summary.total ?? 0}</strong>
            <small>Theo bộ lọc hiện tại</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon green">
            <BookOpen size={30} />
          </span>
          <div>
            <span>Đang sử dụng</span>
            <strong>{data?.summary.active ?? 0}</strong>
            <small>Nhân sự có thể xem</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon orange">
            <Archive size={30} />
          </span>
          <div>
            <span>Đã tắt</span>
            <strong>{data?.summary.inactive ?? 0}</strong>
            <small>Không hiển thị cho bài mới</small>
          </div>
        </article>
      </section>

      <section className="materials-toolbar">
        <label>
          <Search size={18} />
          <input
            placeholder="Tìm tài liệu, nội dung, bài test..."
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
          value={materialType}
          onChange={(event) => {
            setMaterialType(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả loại</option>
          {Object.entries(materialTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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
          <option value="active">Đang sử dụng</option>
          <option value="inactive">Đã tắt</option>
        </select>
        <button className="outline-button" onClick={applyFilters} disabled={isLoading}>
          {isLoading ? <RefreshCw size={17} /> : <Filter size={17} />} Lọc
        </button>
      </section>

      {error && <p className="login-error">{error}</p>}
      {success && <p className="success-message">{success}</p>}

      <section className="materials-grid">
        {(data?.materials ?? []).map((material) => {
          const Icon = materialIcon(material.materialType);

          return (
            <article className="document-card material-admin-card" key={material.id}>
              <span className={`test-icon ${materialTone(material.materialType)}`}>
                <Icon size={28} />
              </span>
              <div>
                <h3>{material.title}</h3>
                <p>
                  {material.departmentName ?? "Áp dụng chung"} · {materialTypeLabels[material.materialType]} · v{material.versionLabel}
                </p>
              </div>
              <div className="material-admin-meta">
                <span>{material.testTitles.length ? material.testTitles.join(", ") : "Chưa gắn bài test"}</span>
                <span>Cập nhật {formatDate(material.updatedAt)}</span>
              </div>
              <span className={`status-pill ${material.isActive ? "success" : "neutral"}`}>
                {material.isActive ? "Đang sử dụng" : "Đã tắt"}
              </span>
              <div className="row-actions">
                {material.contentUrl && (
                  <a className="outline-button" href={material.contentUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} /> Mở
                  </a>
                )}
                <button className="outline-button" onClick={() => openEditModal(material)}>
                  <Edit3 size={16} /> Sửa
                </button>
                {material.isActive && (
                  <button className="danger-outline-button" onClick={() => handleArchive(material)}>
                    <Archive size={16} /> Tắt
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {data?.materials.length === 0 && (
          <section className="panel empty-test-panel">
            <FileText size={34} />
            <strong>Chưa có tài liệu phù hợp</strong>
            <span>Thay đổi bộ lọc hoặc upload tài liệu mới.</span>
          </section>
        )}
      </section>

      <section className="panel admin-table-panel">
        <div className="section-title">
          <h3>Danh sách tài liệu đào tạo</h3>
          <button onClick={() => loadMaterials()}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Tài liệu</th>
                <th>Loại</th>
                <th>Phòng ban</th>
                <th>Bài test</th>
                <th>Phiên bản</th>
                <th>Trạng thái</th>
                <th>Cập nhật</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(data?.materials ?? []).map((material) => (
                <tr key={material.id}>
                  <td>{material.title}</td>
                  <td>{materialTypeLabels[material.materialType]}</td>
                  <td>{material.departmentName ?? "Áp dụng chung"}</td>
                  <td>{material.testTitles.length ? material.testTitles.join(", ") : "--"}</td>
                  <td>{material.versionLabel}</td>
                  <td>
                    <span className={`status-pill ${material.isActive ? "success" : "neutral"}`}>
                      {material.isActive ? "Đang sử dụng" : "Đã tắt"}
                    </span>
                  </td>
                  <td>{formatDate(material.updatedAt)}</td>
                  <td>
                    <span className="table-actions">
                      {material.contentUrl && (
                        <a className="table-icon" href={material.contentUrl} target="_blank" rel="noreferrer" aria-label="Mở tài liệu">
                          <Download size={16} />
                        </a>
                      )}
                      <button className="table-icon" onClick={() => openEditModal(material)} aria-label="Sửa tài liệu">
                        <Edit3 size={16} />
                      </button>
                      {material.isActive && (
                        <button className="table-icon danger" onClick={() => handleArchive(material)} aria-label="Tắt tài liệu">
                          <Archive size={16} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {data?.materials.length === 0 && (
                <tr>
                  <td colSpan={8}>Không có tài liệu phù hợp với bộ lọc.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            Hiển thị {startItem}-{endItem} / {pagination.total} tài liệu
          </span>
          <span>10 tài liệu/trang</span>
          <div className="pagination-actions">
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
          </div>
        </div>
      </section>

      {isModalOpen && (
        <div className="modal-backdrop">
          <form className="employee-modal material-modal" onSubmit={handleSubmit}>
            <header>
              <div>
                <h3>{form.id ? "Sửa tài liệu đào tạo" : "Upload tài liệu đào tạo"}</h3>
                <p>File tối đa 30MB. Có thể gắn tài liệu với một hoặc nhiều bài test.</p>
              </div>
              <button className="outline-button" type="button" onClick={() => setIsModalOpen(false)}>
                Đóng
              </button>
            </header>

            <div className="employee-form-grid material-form-grid">
              <label className="field">
                <span>Tên tài liệu</span>
                <div>
                  <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                </div>
              </label>
              <label className="field">
                <span>Loại tài liệu</span>
                <div>
                  <select
                    value={form.materialType}
                    onChange={(event) => setForm({ ...form, materialType: event.target.value as MaterialType })}
                  >
                    {Object.entries(materialTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="field">
                <span>Phòng ban</span>
                <div>
                  <select
                    value={form.departmentId}
                    onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
                  >
                    <option value="">Áp dụng chung</option>
                    {data?.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="field">
                <span>Phiên bản</span>
                <div>
                  <input value={form.versionLabel} onChange={(event) => setForm({ ...form, versionLabel: event.target.value })} />
                </div>
              </label>
              {form.materialType !== "text" && (
                <>
                  <label className="field material-file-field">
                    <span>Upload file</span>
                    <div>
                      <input
                        type="file"
                        onChange={(event) => setForm({ ...form, file: event.target.files?.[0] ?? null })}
                      />
                    </div>
                  </label>
                  <label className="field material-file-field">
                    <span>Hoặc đường dẫn tài liệu</span>
                    <div>
                      <input
                        value={form.contentUrl}
                        onChange={(event) => setForm({ ...form, contentUrl: event.target.value })}
                        placeholder="/materials/file.pdf hoặc https://..."
                      />
                    </div>
                  </label>
                </>
              )}
              {form.materialType === "text" && (
                <label className="field material-text-field">
                  <span>Nội dung text</span>
                  <div>
                    <textarea
                      value={form.contentText}
                      onChange={(event) => setForm({ ...form, contentText: event.target.value })}
                      placeholder="Nhập nội dung tài liệu đào tạo..."
                    />
                  </div>
                </label>
              )}
            </div>

            <div className="material-test-picker">
              <strong>Gắn với bài test</strong>
              <div>
                {data?.tests.map((test) => (
                  <label key={test.id}>
                    <input
                      type="checkbox"
                      checked={form.testIds.includes(test.id)}
                      onChange={() => toggleTest(test.id)}
                    />
                    <span>{test.title}</span>
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
              <span>Đang sử dụng</span>
            </label>

            {error && <p className="login-error">{error}</p>}

            <footer>
              <button className="outline-button" type="button" onClick={() => setIsModalOpen(false)}>
                Hủy
              </button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                <Plus size={17} /> {isSaving ? "Đang lưu" : "Lưu tài liệu"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
