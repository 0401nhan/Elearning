import {
  Archive,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Edit3,
  FileText,
  Filter,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Target
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { QuestionMedia } from "./question-media";

type ManagedTestStatus = "draft" | "active" | "archived";

type ManagedTest = {
  id: number;
  code: string;
  title: string;
  departmentId: number | null;
  departmentName: string | null;
  description: string | null;
  questionCount: number;
  durationMinutes: number;
  passScore: number;
  requiredCorrectAnswers: number;
  usesDefaultPassRule: boolean;
  maxOfficialAttempts: number;
  allowUnlimitedPractice: boolean;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  showPracticeAnswers: boolean;
  showOfficialAnswers: boolean;
  status: ManagedTestStatus;
  createdAt: string;
  updatedAt: string;
  activeQuestionCount: number;
  materialCount: number;
  materialTypes: string[];
  materialIds: number[];
  assignmentCount: number;
};

type Department = {
  id: number;
  code: string;
  name: string;
};

type Material = {
  id: number;
  title: string;
  material_type: string;
  department_id: number | null;
  department_name: string | null;
};

type TestQuestion = {
  id: number;
  groupName: string | null;
  questionText: string;
  imageUrl: string | null;
  explanation: string | null;
  difficulty: string;
  isActive: boolean;
  options: {
    id: number;
    label: string;
    text: string;
    imageUrl: string | null;
    isCorrect: boolean;
  }[];
};

type TestsResponse = {
  tests: ManagedTest[];
  departments: Department[];
  materials: Material[];
  summary: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    totalQuestions: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type TestForm = {
  id?: number;
  code: string;
  title: string;
  departmentId: string;
  description: string;
  questionCount: string;
  durationMinutes: string;
  passScore: string;
  requiredCorrectAnswers: string;
  usesDefaultPassRule: boolean;
  maxOfficialAttempts: string;
  allowUnlimitedPractice: boolean;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  showPracticeAnswers: boolean;
  showOfficialAnswers: boolean;
  status: ManagedTestStatus;
  materialIds: number[];
};

function getQuestionCount(value: string) {
  const questionCount = Math.floor(Number(value));
  return Number.isFinite(questionCount) ? Math.min(300, Math.max(1, questionCount)) : 1;
}

function getDefaultRequiredCorrectAnswers(value: string) {
  const questionCount = getQuestionCount(value);
  return questionCount <= 1 ? questionCount : questionCount - 1;
}

function getRequiredCorrectAnswers(questionCountValue: string, requiredCorrectAnswersValue: string, usesDefaultPassRule: boolean) {
  const questionCount = getQuestionCount(questionCountValue);
  if (usesDefaultPassRule) {
    return getDefaultRequiredCorrectAnswers(questionCountValue);
  }

  const requiredCorrectAnswers = Math.floor(Number(requiredCorrectAnswersValue));
  return Number.isFinite(requiredCorrectAnswers) ? Math.min(questionCount, Math.max(1, requiredCorrectAnswers)) : 1;
}

function getPassScoreForRequiredCorrectAnswers(
  questionCountValue: string,
  requiredCorrectAnswersValue: string,
  usesDefaultPassRule: boolean
) {
  const questionCount = getQuestionCount(questionCountValue);
  const requiredCorrectAnswers = getRequiredCorrectAnswers(
    questionCountValue,
    requiredCorrectAnswersValue,
    usesDefaultPassRule
  );
  const passScore = (requiredCorrectAnswers / questionCount) * 100;
  return passScore.toFixed(2).replace(/\.?0+$/, "");
}

const emptyForm: TestForm = {
  code: "",
  title: "",
  departmentId: "",
  description: "",
  questionCount: "40",
  durationMinutes: "20",
  passScore: getPassScoreForRequiredCorrectAnswers("40", "39", true),
  requiredCorrectAnswers: "39",
  usesDefaultPassRule: true,
  maxOfficialAttempts: "1",
  allowUnlimitedPractice: true,
  randomizeQuestions: true,
  randomizeAnswers: true,
  showPracticeAnswers: true,
  showOfficialAnswers: false,
  status: "active",
  materialIds: []
};

const TEST_PAGE_SIZE = 10;

const materialTypeLabels: Record<string, string> = {
  pdf: "PDF",
  image: "Hình ảnh",
  slide: "Slide",
  text: "Text",
  video: "Video",
  link: "Link"
};

function getPageNumbers(currentPage: number, totalPages: number) {
  const end = Math.min(totalPages, Math.max(currentPage + 2, 5));
  const start = Math.max(1, Math.min(currentPage - 2, end - 4));

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function statusLabel(status: ManagedTestStatus) {
  if (status === "active") return "Đang áp dụng";
  if (status === "draft") return "Nháp";
  return "Đã khóa";
}

function statusClass(status: ManagedTestStatus) {
  if (status === "active") return "success";
  if (status === "draft") return "learning";
  return "neutral";
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function formatMaterialTypes(types: string[]) {
  if (!types.length) {
    return "Chưa gắn tài liệu";
  }

  return types.map((type) => materialTypeLabels[type] ?? type).join(", ");
}

function difficultyLabel(difficulty: string) {
  if (difficulty === "easy") return "Dễ";
  if (difficulty === "hard") return "Khó";
  return "Trung bình";
}

function toForm(test: ManagedTest): TestForm {
  return {
    id: test.id,
    code: test.code,
    title: test.title,
    departmentId: test.departmentId ? String(test.departmentId) : "",
    description: test.description ?? "",
    questionCount: String(test.questionCount),
    durationMinutes: String(test.durationMinutes),
    passScore: String(test.passScore),
    requiredCorrectAnswers: String(test.requiredCorrectAnswers),
    usesDefaultPassRule: test.usesDefaultPassRule,
    maxOfficialAttempts: String(test.maxOfficialAttempts),
    allowUnlimitedPractice: test.allowUnlimitedPractice,
    randomizeQuestions: test.randomizeQuestions,
    randomizeAnswers: test.randomizeAnswers,
    showPracticeAnswers: test.showPracticeAnswers,
    showOfficialAnswers: test.showOfficialAnswers,
    status: test.status,
    materialIds: test.materialIds
  };
}

function getPayload(form: TestForm) {
  return {
    code: form.code,
    title: form.title,
    departmentId: form.departmentId ? Number(form.departmentId) : null,
    description: form.description,
    questionCount: Number(form.questionCount),
    durationMinutes: Number(form.durationMinutes),
    passScore: Number(form.passScore),
    requiredCorrectAnswers: form.usesDefaultPassRule ? null : Number(form.requiredCorrectAnswers),
    maxOfficialAttempts: Number(form.maxOfficialAttempts),
    allowUnlimitedPractice: form.allowUnlimitedPractice,
    randomizeQuestions: form.randomizeQuestions,
    randomizeAnswers: form.randomizeAnswers,
    showPracticeAnswers: form.showPracticeAnswers,
    showOfficialAnswers: form.showOfficialAnswers,
    status: form.status,
    materialIds: form.materialIds
  };
}

function getRules(test: ManagedTest) {
  return [
    ["Làm thử", test.allowUnlimitedPractice ? "Không giới hạn" : "1 lần", test.allowUnlimitedPractice ? "ok" : "info"],
    ["Làm chính thức", `${test.maxOfficialAttempts} lần`, "info"],
    ["Điều kiện đạt", `${test.requiredCorrectAnswers}/${test.questionCount} câu`, "ok"],
    ["Random câu hỏi", test.randomizeQuestions ? "Có" : "Không", test.randomizeQuestions ? "ok" : "warn"],
    ["Random đáp án", test.randomizeAnswers ? "Có" : "Không", test.randomizeAnswers ? "ok" : "warn"],
    ["Đáp án khi làm thử", test.showPracticeAnswers ? "Có" : "Không", test.showPracticeAnswers ? "ok" : "warn"],
    ["Đáp án chính thức", test.showOfficialAnswers ? "Hiển thị" : "Không hiển thị ngay", test.showOfficialAnswers ? "warn" : "ok"]
  ];
}

export function TestManagementPage() {
  const [data, setData] = useState<TestsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<TestForm>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [questionError, setQuestionError] = useState("");

  const pagination = data?.pagination ?? { page, pageSize: TEST_PAGE_SIZE, total: 0, totalPages: 1 };
  const totalPages = Math.max(1, pagination.totalPages);
  const visibleCount = data?.tests.length ?? 0;
  const startItem = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = pagination.total ? Math.min(pagination.total, startItem + visibleCount - 1) : 0;
  const pageNumbers = getPageNumbers(pagination.page, totalPages);

  async function loadTests(targetPage = page) {
    setIsLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (departmentId) params.set("departmentId", departmentId);
    if (status) params.set("status", status);
    params.set("page", String(targetPage));

    try {
      const response = await fetch(`/api/admin/tests?${params.toString()}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải danh sách bài test.");
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
    loadTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, status, page]);

  function applyFilters() {
    if (page === 1) {
      loadTests(1);
      return;
    }

    setPage(1);
  }

  function openCreateModal() {
    setForm(emptyForm);
    setQuestions([]);
    setQuestionError("");
    setError("");
    setIsModalOpen(true);
  }

  function openEditModal(test: ManagedTest) {
    setForm(toForm(test));
    setQuestions([]);
    setQuestionError("");
    setError("");
    setIsModalOpen(true);
    loadTestQuestions(test.id);
  }

  async function loadTestQuestions(testId: number) {
    setIsLoadingQuestions(true);
    setQuestionError("");

    try {
      const response = await fetch(`/api/admin/tests/${testId}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setQuestionError(responseData?.error ?? "Không thể tải danh sách câu hỏi.");
        return;
      }

      setQuestions(responseData?.questions ?? []);
    } catch {
      setQuestionError("Không thể kết nối hệ thống để tải câu hỏi.");
    } finally {
      setIsLoadingQuestions(false);
    }
  }

  function toggleMaterial(materialId: number) {
    setForm((current) => {
      const hasMaterial = current.materialIds.includes(materialId);
      const materialIds = hasMaterial
        ? current.materialIds.filter((id) => id !== materialId)
        : [...current.materialIds, materialId];

      return {
        ...current,
        materialIds
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    const isEdit = Boolean(form.id);
    const response = await fetch(isEdit ? `/api/admin/tests/${form.id}` : "/api/admin/tests", {
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
      setError(responseData?.error ?? "Không thể lưu bài test.");
      return;
    }

    setIsModalOpen(false);
    await loadTests();
  }

  async function handleArchive(test: ManagedTest) {
    const ok = window.confirm(`Khóa bài test ${test.title}? Nhân sự sẽ không thấy bài này trong danh sách active.`);
    if (!ok) {
      return;
    }

    const response = await fetch(`/api/admin/tests/${test.id}`, { method: "DELETE" }).catch(() => null);
    const responseData = await response?.json().catch(() => null);

    if (!response?.ok) {
      setError(responseData?.error ?? "Không thể khóa bài test.");
      return;
    }

    await loadTests();
  }

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Quản lý bài test</h2>
          <p>Tạo và cấu hình bài test theo phòng ban, tài liệu học, thời gian, điểm đạt và quy tắc làm bài.</p>
        </div>
        <button className="primary-button" onClick={openCreateModal}>
          <Plus size={18} /> Tạo bài test
        </button>
      </section>

      <section className="test-admin-summary">
        <article className="stat-card">
          <span className="stat-icon blue">
            <ClipboardCheck size={30} />
          </span>
          <div>
            <span>Tổng bài test</span>
            <strong>{data?.summary.total ?? 0}</strong>
            <small>Theo bộ lọc hiện tại</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon green">
            <CheckCircle2 size={30} />
          </span>
          <div>
            <span>Đang áp dụng</span>
            <strong>{data?.summary.active ?? 0}</strong>
            <small>Nhân sự có thể học và làm</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon orange">
            <Settings size={30} />
          </span>
          <div>
            <span>Bản nháp</span>
            <strong>{data?.summary.draft ?? 0}</strong>
            <small>Chưa phát hành</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon purple">
            <ListChecks size={30} />
          </span>
          <div>
            <span>Số câu đề xuất</span>
            <strong>{data?.summary.totalQuestions ?? 0}</strong>
            <small>Tổng cấu hình câu hỏi</small>
          </div>
        </article>
      </section>

      <section className="test-admin-toolbar">
        <label>
          <Search size={18} />
          <input
            placeholder="Tìm theo mã, tên bài test, mô tả..."
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
          <option value="active">Đang áp dụng</option>
          <option value="draft">Nháp</option>
          <option value="archived">Đã khóa</option>
        </select>
        <button className="outline-button" onClick={applyFilters} disabled={isLoading}>
          {isLoading ? <RefreshCw size={17} /> : <Filter size={17} />} Lọc
        </button>
      </section>

      {error && <p className="login-error">{error}</p>}

      <section className="test-board test-admin-grid">
        {(data?.tests ?? []).map((test) => (
          <article className="test-board-card test-admin-card" key={test.id}>
            <div className="test-title-line">
              <span className="test-icon blue">
                <ClipboardCheck size={28} />
              </span>
              <div>
                <h3>{test.title}</h3>
                <p>{test.code} · {test.departmentName ?? "Áp dụng chung"}</p>
              </div>
              <span className={`status-pill ${statusClass(test.status)}`}>{statusLabel(test.status)}</span>
            </div>

            <p className="test-card-description">
              {test.description ?? "Bài test giúp nhân sự nắm vững tài liệu đào tạo trước khi làm chính thức."}
            </p>

            <div className="test-admin-meta">
              <span>
                <BookOpen size={16} />
                {formatMaterialTypes(test.materialTypes)}
              </span>
              <span>
                <ShieldCheck size={16} />
                {test.assignmentCount} nhân sự được giao
              </span>
              <span>
                <Clock3 size={16} />
                Cập nhật {formatDate(test.updatedAt)}
              </span>
            </div>

            <div className="test-kpis test-admin-kpis">
              <span>
                <strong>{test.questionCount}</strong>
                Số câu đề xuất
              </span>
              <span>
                <strong>{test.activeQuestionCount}</strong>
                Câu hỏi đang bật
              </span>
              <span>
                <strong>{test.durationMinutes}</strong>
                Phút làm bài
              </span>
              <span>
                <strong>≥ {formatScore(test.passScore)}</strong>
                Điểm đạt
              </span>
            </div>

            <div className="rule-list test-admin-rules">
              {getRules(test).map(([label, value, type]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong className={type}>{value}</strong>
                  <Target size={16} />
                </div>
              ))}
            </div>

            <div className="row-actions">
              <button className="outline-button" onClick={() => openEditModal(test)}>
                <Edit3 size={16} /> Chỉnh sửa
              </button>
              {test.status !== "archived" && (
                <button className="danger-outline-button" onClick={() => handleArchive(test)}>
                  <Archive size={16} /> Khóa bài
                </button>
              )}
            </div>
          </article>
        ))}
        {data?.tests.length === 0 && (
          <section className="panel empty-test-panel">
            <FileText size={34} />
            <strong>Chưa có bài test phù hợp</strong>
            <span>Thay đổi bộ lọc hoặc tạo bài test mới.</span>
          </section>
        )}
      </section>

      <section className="panel admin-table-panel">
        <div className="section-title">
          <h3>Danh sách cấu hình bài test</h3>
          <button onClick={() => loadTests()}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="test-admin-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên bài test</th>
                <th>Phòng ban</th>
                <th>Tài liệu</th>
                <th>Số câu</th>
                <th>Thời gian</th>
                <th>Điểm đạt</th>
                <th>Làm chính thức</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(data?.tests ?? []).map((test) => (
                <tr key={test.id}>
                  <td>{test.code}</td>
                  <td>{test.title}</td>
                  <td>{test.departmentName ?? "Áp dụng chung"}</td>
                  <td>{test.materialCount ? `${test.materialCount} tài liệu` : "--"}</td>
                  <td>{test.questionCount} câu</td>
                  <td>{test.durationMinutes} phút</td>
                  <td className="green-text">≥ {formatScore(test.passScore)}</td>
                  <td>{test.maxOfficialAttempts} lần</td>
                  <td>
                    <span className={`status-pill ${statusClass(test.status)}`}>{statusLabel(test.status)}</span>
                  </td>
                  <td>
                    <span className="table-actions">
                      <button className="table-icon" onClick={() => openEditModal(test)} aria-label="Sửa bài test">
                        <Edit3 size={16} />
                      </button>
                      {test.status !== "archived" && (
                        <button className="table-icon danger" onClick={() => handleArchive(test)} aria-label="Khóa bài test">
                          <Archive size={16} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {data?.tests.length === 0 && (
                <tr>
                  <td colSpan={10}>Không có bài test phù hợp với bộ lọc.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            Hiển thị {startItem}-{endItem} / {pagination.total} bài test
          </span>
          <span>10 bài test/trang</span>
          <div className="pagination-actions">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={pagination.page <= 1}
            >
              {"<"}
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
              {">"}
            </button>
          </div>
        </div>
      </section>

      {isModalOpen && (
        <div className="modal-backdrop">
          <form className="employee-modal test-modal" onSubmit={handleSubmit}>
            <header>
              <div>
                <h3>{form.id ? "Chỉnh sửa bài test" : "Tạo bài test"}</h3>
                <p>Cấu hình thông tin, tài liệu học và quy tắc làm bài theo tài liệu vận hành.</p>
              </div>
              <button className="outline-button" type="button" onClick={() => setIsModalOpen(false)}>
                Đóng
              </button>
            </header>

            <div className="employee-form-grid test-form-grid">
              <label className="field">
                <span>Mã bài test</span>
                <div>
                  <input
                    value={form.code}
                    onChange={(event) => setForm({ ...form, code: event.target.value })}
                    placeholder="VD: HCNS_RULES"
                  />
                </div>
              </label>
              <label className="field">
                <span>Tên bài test</span>
                <div>
                  <input
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    placeholder="VD: Test Quy định HCNS"
                  />
                </div>
              </label>
              <label className="field">
                <span>Phòng ban áp dụng</span>
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
                <span>Trạng thái</span>
                <div>
                  <select
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value as ManagedTestStatus })}
                  >
                    <option value="active">Đang áp dụng</option>
                    <option value="draft">Nháp</option>
                    <option value="archived">Đã khóa</option>
                  </select>
                </div>
              </label>
              <label className="field">
                <span>Số câu hỏi</span>
                <div>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={form.questionCount}
                    onChange={(event) => {
                      const questionCount = event.target.value;
                      const requiredCorrectAnswers = getRequiredCorrectAnswers(
                        questionCount,
                        form.requiredCorrectAnswers,
                        form.usesDefaultPassRule
                      );
                      setForm({
                        ...form,
                        questionCount,
                        requiredCorrectAnswers: String(requiredCorrectAnswers),
                        passScore: getPassScoreForRequiredCorrectAnswers(
                          questionCount,
                          String(requiredCorrectAnswers),
                          form.usesDefaultPassRule
                        )
                      });
                    }}
                  />
                </div>
              </label>
              <label className="field">
                <span>Số câu đúng để đạt</span>
                <div>
                  <input
                    type="number"
                    min={1}
                    max={getQuestionCount(form.questionCount)}
                    value={form.requiredCorrectAnswers}
                    disabled={form.usesDefaultPassRule}
                    onChange={(event) => {
                      const requiredCorrectAnswers = getRequiredCorrectAnswers(
                        form.questionCount,
                        event.target.value,
                        false
                      );
                      setForm({
                        ...form,
                        requiredCorrectAnswers: String(requiredCorrectAnswers),
                        usesDefaultPassRule: false,
                        passScore: getPassScoreForRequiredCorrectAnswers(
                          form.questionCount,
                          String(requiredCorrectAnswers),
                          false
                        )
                      });
                    }}
                  />
                  <small>/ {getQuestionCount(form.questionCount)} câu</small>
                </div>
                <small>
                  <input
                    type="checkbox"
                    checked={form.usesDefaultPassRule}
                    onChange={(event) => {
                      const usesDefaultPassRule = event.target.checked;
                      const requiredCorrectAnswers = getRequiredCorrectAnswers(
                        form.questionCount,
                        form.requiredCorrectAnswers,
                        usesDefaultPassRule
                      );
                      setForm({
                        ...form,
                        requiredCorrectAnswers: String(requiredCorrectAnswers),
                        usesDefaultPassRule,
                        passScore: getPassScoreForRequiredCorrectAnswers(
                          form.questionCount,
                          String(requiredCorrectAnswers),
                          usesDefaultPassRule
                        )
                      });
                    }}
                  />
                  Dùng mặc định: sai tối đa 1 câu
                </small>
              </label>
              <label className="field">
                <span>Thời gian làm bài</span>
                <div>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={form.durationMinutes}
                    onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
                  />
                  <small>phút</small>
                </div>
              </label>
              <label className="field">
                <span>Điểm đạt</span>
                <div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={form.passScore}
                    readOnly
                  />
                  <small>điểm</small>
                </div>
              </label>
              <label className="field">
                <span>Lượt làm chính thức</span>
                <div>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={form.maxOfficialAttempts}
                    onChange={(event) => setForm({ ...form, maxOfficialAttempts: event.target.value })}
                  />
                  <small>lần</small>
                </div>
              </label>
              <label className="field test-description-field">
                <span>Mô tả bài test</span>
                <div>
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="Mô tả mục tiêu và phạm vi kiến thức của bài test..."
                  />
                </div>
              </label>
            </div>

            <div className="test-rule-switches">
              <strong>Cấu hình & quy tắc làm bài</strong>
              <div>
                <label>
                  <input
                    type="checkbox"
                    checked={form.allowUnlimitedPractice}
                    onChange={(event) => setForm({ ...form, allowUnlimitedPractice: event.target.checked })}
                  />
                  <span>Làm thử không giới hạn</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.randomizeQuestions}
                    onChange={(event) => setForm({ ...form, randomizeQuestions: event.target.checked })}
                  />
                  <span>Random câu hỏi</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.randomizeAnswers}
                    onChange={(event) => setForm({ ...form, randomizeAnswers: event.target.checked })}
                  />
                  <span>Random đáp án</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.showPracticeAnswers}
                    onChange={(event) => setForm({ ...form, showPracticeAnswers: event.target.checked })}
                  />
                  <span>Hiển thị đáp án khi làm thử</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.showOfficialAnswers}
                    onChange={(event) => setForm({ ...form, showOfficialAnswers: event.target.checked })}
                  />
                  <span>Hiển thị đáp án khi làm chính thức</span>
                </label>
              </div>
            </div>

            <div className="material-picker">
              <strong>Tài liệu học gắn với bài test</strong>
              <div className="material-picker-list">
                {data?.materials.map((material) => (
                  <label key={material.id}>
                    <input
                      type="checkbox"
                      checked={form.materialIds.includes(material.id)}
                      onChange={() => toggleMaterial(material.id)}
                    />
                    <span>
                      <strong>{material.title}</strong>
                      <small>
                        {materialTypeLabels[material.material_type] ?? material.material_type}
                        {material.department_name ? ` · ${material.department_name}` : ""}
                      </small>
                    </span>
                  </label>
                ))}
                {data?.materials.length === 0 && <span>Chưa có tài liệu đào tạo đang hoạt động.</span>}
              </div>
            </div>

            {form.id && (
              <div className="question-review-panel">
                <div className="question-review-heading">
                  <strong>Danh sách câu hỏi trong bài test</strong>
                  <span>{isLoadingQuestions ? "Đang tải..." : `${questions.length} câu hỏi`}</span>
                </div>
                {questionError && <p className="login-error">{questionError}</p>}
                {!isLoadingQuestions && !questionError && questions.length === 0 && (
                  <div className="question-empty-state">
                    <ListChecks size={24} />
                    <span>Chưa có câu hỏi nào được gắn với bài test này.</span>
                  </div>
                )}
                <div className="question-review-list">
                  {questions.map((question, index) => (
                    <article key={question.id} className={!question.isActive ? "inactive" : ""}>
                      <header>
                        <span>Câu {index + 1}</span>
                        <strong>{question.groupName ?? "Chưa phân nhóm"}</strong>
                        <small>{difficultyLabel(question.difficulty)}</small>
                        {!question.isActive && <small>Đã tắt</small>}
                      </header>
                      <p>{question.questionText}</p>
                      <QuestionMedia
                        src={question.imageUrl}
                        alt={`Ảnh câu hỏi ${index + 1}`}
                        variant="question"
                      />
                      <div className="question-option-list">
                        {question.options.map((option) => (
                          <span key={option.id} className={option.isCorrect ? "correct" : ""}>
                            <b>{option.label}</b>
                            <span>{option.text}</span>
                            <QuestionMedia
                              src={option.imageUrl}
                              alt={`Ảnh đáp án ${option.label}`}
                              variant="thumbnail"
                            />
                          </span>
                        ))}
                      </div>
                      {question.explanation && (
                        <footer>
                          <strong>Giải thích:</strong>
                          <span>{question.explanation}</span>
                        </footer>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="login-error">{error}</p>}

            <footer>
              <button className="outline-button" type="button" onClick={() => setIsModalOpen(false)}>
                Hủy
              </button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? "Đang lưu" : "Lưu bài test"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
