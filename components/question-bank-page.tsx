import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Filter,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  XCircle
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { QuestionMedia } from "./question-media";

type QuestionDifficulty = "easy" | "medium" | "hard";

type AnswerOption = {
  id?: number;
  label: string;
  text: string;
  imageUrl?: string | null;
  isCorrect: boolean;
};

type BankQuestion = {
  id: number;
  testId: number;
  testTitle: string;
  groupId: number | null;
  groupName: string | null;
  questionText: string;
  imageUrl: string | null;
  explanation: string | null;
  difficulty: QuestionDifficulty;
  isActive: boolean;
  updatedAt: string;
  options: AnswerOption[];
};

type TestOption = {
  id: number;
  code: string;
  title: string;
  status: string;
  questionCount: number;
  activeQuestionCount: number;
  inactiveQuestionCount: number;
};

type QuestionGroup = {
  id: number;
  testId: number;
  name: string;
  suggestedQuestionCount: number;
  sortOrder: number;
};

type QuestionBankResponse = {
  questions: BankQuestion[];
  tests: TestOption[];
  groups: QuestionGroup[];
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

type QuestionForm = {
  id?: number;
  testId: string;
  groupId: string;
  questionText: string;
  questionImageUrl: string;
  explanation: string;
  difficulty: QuestionDifficulty;
  isActive: boolean;
  options: AnswerOption[];
};

const QUESTION_PAGE_SIZE = 10;
const ANSWER_LABELS = ["A", "B", "C", "D"];

function defaultOptions() {
  return ANSWER_LABELS.map((label, index) => ({
    label,
    text: "",
    imageUrl: "",
    isCorrect: index === 0
  }));
}

function emptyForm(testId = ""): QuestionForm {
  return {
    testId,
    groupId: "",
    questionText: "",
    questionImageUrl: "",
    explanation: "",
    difficulty: "medium",
    isActive: true,
    options: defaultOptions()
  };
}

function getPageNumbers(currentPage: number, totalPages: number) {
  const end = Math.min(totalPages, Math.max(currentPage + 2, 5));
  const start = Math.max(1, Math.min(currentPage - 2, end - 4));

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function difficultyLabel(difficulty: string) {
  if (difficulty === "easy") return "Dễ";
  if (difficulty === "hard") return "Khó";
  return "Trung bình";
}

function testStatusLabel(status: string) {
  if (status === "active") return "Đang mở";
  if (status === "draft") return "Bản nháp";
  if (status === "archived") return "Đã lưu trữ";
  return status;
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function toForm(question: BankQuestion): QuestionForm {
  const optionByLabel = new Map(question.options.map((option) => [option.label, option]));

  return {
    id: question.id,
    testId: String(question.testId),
    groupId: question.groupId ? String(question.groupId) : "",
    questionText: question.questionText,
    questionImageUrl: question.imageUrl ?? "",
    explanation: question.explanation ?? "",
    difficulty: question.difficulty,
    isActive: question.isActive,
    options: ANSWER_LABELS.map((label) => {
      const option = optionByLabel.get(label);

      return {
        id: option?.id,
        label,
        text: option?.text ?? "",
        imageUrl: option?.imageUrl ?? "",
        isCorrect: Boolean(option?.isCorrect)
      };
    })
  };
}

function getPayload(form: QuestionForm) {
  return {
    testId: Number(form.testId),
    groupId: form.groupId ? Number(form.groupId) : null,
    questionText: form.questionText,
    questionImageUrl: form.questionImageUrl,
    explanation: form.explanation,
    difficulty: form.difficulty,
    isActive: form.isActive,
    options: form.options
  };
}

function getTemplateFilename(testTitle: string) {
  const safeTitle = testTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `mau-cau-hoi-${safeTitle || "bai-test"}.csv`;
}

export function QuestionBankPage() {
  const [data, setData] = useState<QuestionBankResponse | null>(null);
  const [search, setSearch] = useState("");
  const [filterTestId, setFilterTestId] = useState("");
  const [filterGroupId, setFilterGroupId] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<QuestionForm>(emptyForm());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pagination = data?.pagination ?? { page, pageSize: QUESTION_PAGE_SIZE, total: 0, totalPages: 1 };
  const totalPages = Math.max(1, pagination.totalPages);
  const visibleCount = data?.questions.length ?? 0;
  const startItem = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = pagination.total ? Math.min(pagination.total, startItem + visibleCount - 1) : 0;
  const pageNumbers = getPageNumbers(pagination.page, totalPages);
  const filterGroups = filterTestId
    ? (data?.groups ?? []).filter((group) => group.testId === Number(filterTestId))
    : data?.groups ?? [];
  const formGroups = form.testId
    ? (data?.groups ?? []).filter((group) => group.testId === Number(form.testId))
    : [];
  const selectedTest = filterTestId
    ? data?.tests.find((test) => test.id === Number(filterTestId)) ?? null
    : null;

  async function loadQuestions(targetPage = page) {
    setIsLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (filterTestId) params.set("testId", filterTestId);
    if (filterGroupId) params.set("groupId", filterGroupId);
    if (difficulty) params.set("difficulty", difficulty);
    if (status) params.set("status", status);
    params.set("page", String(targetPage));

    try {
      const response = await fetch(`/api/admin/questions?${params.toString()}`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải ngân hàng câu hỏi.");
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
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, filterGroupId, filterTestId, page, status]);

  function applyFilters() {
    if (page === 1) {
      loadQuestions(1);
      return;
    }

    setPage(1);
  }

  function openTestQuestions(testId: number) {
    setData((current) =>
      current
        ? {
            ...current,
            questions: [],
            summary: { total: 0, active: 0, inactive: 0 },
            pagination: { page: 1, pageSize: QUESTION_PAGE_SIZE, total: 0, totalPages: 1 }
          }
        : current
    );
    setFilterTestId(String(testId));
    setFilterGroupId("");
    setSearch("");
    setDifficulty("");
    setStatus("active");
    setPage(1);
    setError("");
  }

  function closeTestQuestions() {
    setFilterTestId("");
    setFilterGroupId("");
    setSearch("");
    setDifficulty("");
    setStatus("active");
    setPage(1);
    setError("");
  }

  function openCreateModal() {
    setForm(emptyForm(filterTestId));
    setError("");
    setIsModalOpen(true);
  }

  function openEditModal(question: BankQuestion) {
    setForm(toForm(question));
    setError("");
    setIsModalOpen(true);
  }

  function setOptionText(label: string, text: string) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option) => (option.label === label ? { ...option, text } : option))
    }));
  }

  function setOptionImageUrl(label: string, imageUrl: string) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option) => (option.label === label ? { ...option, imageUrl } : option))
    }));
  }

  function setCorrectOption(label: string) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option) => ({ ...option, isCorrect: option.label === label }))
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    const isEdit = Boolean(form.id);
    const response = await fetch(isEdit ? `/api/admin/questions/${form.id}` : "/api/admin/questions", {
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
      setError(responseData?.error ?? "Không thể lưu câu hỏi.");
      return;
    }

    setIsModalOpen(false);
    await loadQuestions();
  }

  async function handleDisable(question: BankQuestion) {
    const ok = window.confirm(`Tắt câu hỏi này khỏi ngân hàng câu hỏi?`);
    if (!ok) {
      return;
    }

    const response = await fetch(`/api/admin/questions/${question.id}`, { method: "DELETE" }).catch(() => null);
    const responseData = await response?.json().catch(() => null);

    if (!response?.ok) {
      setError(responseData?.error ?? "Không thể tắt câu hỏi.");
      return;
    }

    await loadQuestions();
  }

  async function downloadCsvTemplate() {
    if (!selectedTest) {
      return;
    }

    setError("");
    setImportMessage("");

    const response = await fetch(`/api/admin/questions/import?testId=${selectedTest.id}`).catch(() => null);
    if (!response?.ok) {
      const responseData = await response?.json().catch(() => null);
      setError(responseData?.error ?? "Không thể tải mẫu CSV.");
      return;
    }

    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") ?? "";
    const filenameMatch = /filename="([^"]+)"/.exec(disposition);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filenameMatch?.[1] ?? getTemplateFilename(selectedTest.title);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openCsvPicker() {
    setError("");
    setImportMessage("");
    fileInputRef.current?.click();
  }

  async function handleCsvImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !selectedTest) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Chỉ hỗ trợ file .csv.");
      return;
    }

    setIsImporting(true);
    setError("");
    setImportMessage("");

    const formData = new FormData();
    formData.append("testId", String(selectedTest.id));
    formData.append("file", file);

    const response = await fetch("/api/admin/questions/import", {
      method: "POST",
      body: formData
    }).catch(() => null);
    const responseData = await response?.json().catch(() => null);
    setIsImporting(false);

    if (!response?.ok) {
      const details = Array.isArray(responseData?.errors) ? ` ${responseData.errors.join(" ")}` : "";
      setError(`${responseData?.error ?? "Không thể nhập CSV."}${details}`);
      return;
    }

    setImportMessage(responseData?.message ?? "Đã nhập câu hỏi từ CSV.");
    await loadQuestions();
  }

  return (
    <>
      <section className="page-header">
        <div>
          <h2>{selectedTest ? selectedTest.title : "Ngân hàng câu hỏi"}</h2>
          <p>
            {selectedTest
              ? "Quản lý câu hỏi, đáp án đúng, giải thích và nhóm nội dung trong bài test này."
              : "Chọn một bài test để xem và chỉnh sửa các câu hỏi thuộc bài test đó."}
          </p>
        </div>
        {selectedTest ? (
          <div className="page-header-actions">
            <button className="outline-button" onClick={closeTestQuestions}>
              <ChevronLeft size={18} /> Danh sách bài test
            </button>
            <button className="outline-button" onClick={downloadCsvTemplate}>
              <Download size={18} /> Tải mẫu CSV
            </button>
            <button className="outline-button" onClick={openCsvPicker} disabled={isImporting}>
              <Upload size={18} /> {isImporting ? "Đang nhập" : "Nhập CSV"}
            </button>
            <button className="primary-button" onClick={openCreateModal}>
              <Plus size={18} /> Thêm câu hỏi
            </button>
          </div>
        ) : (
          <button className="outline-button" onClick={() => loadQuestions()} disabled={isLoading}>
            <RefreshCw size={17} /> Làm mới
          </button>
        )}
      </section>

      {error && <p className="login-error">{error}</p>}
      {importMessage && <p className="success-message">{importMessage}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={handleCsvImport}
      />

      {!selectedTest && (
        <section className="question-test-grid">
          {data?.tests.map((test) => (
            <article className="question-test-card" key={test.id}>
              <div>
                <span className={`status-pill ${test.status === "active" ? "success" : "neutral"}`}>
                  {testStatusLabel(test.status)}
                </span>
                <strong>{test.title}</strong>
                <small>{test.code}</small>
              </div>
              <dl>
                <div>
                  <dt>Tổng câu</dt>
                  <dd>{test.questionCount}</dd>
                </div>
                <div>
                  <dt>Đang dùng</dt>
                  <dd>{test.activeQuestionCount}</dd>
                </div>
                <div>
                  <dt>Đã tắt</dt>
                  <dd>{test.inactiveQuestionCount}</dd>
                </div>
              </dl>
              <button className="primary-button" type="button" onClick={() => openTestQuestions(test.id)}>
                <ListChecks size={17} /> Quản lý câu hỏi
              </button>
            </article>
          ))}
          {data?.tests.length === 0 && (
            <section className="panel empty-test-panel">
              <ListChecks size={34} />
              <strong>Chưa có bài test</strong>
              <span>Tạo bài test trước, sau đó thêm câu hỏi cho từng bài.</span>
            </section>
          )}
        </section>
      )}

      {!selectedTest ? null : (
        <>

      <section className="question-bank-summary">
        <article className="stat-card">
          <span className="stat-icon blue">
            <ListChecks size={30} />
          </span>
          <div>
            <span>Tổng câu hỏi</span>
            <strong>{data?.summary.total ?? 0}</strong>
            <small>Trong bài test này</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon green">
            <CheckCircle2 size={30} />
          </span>
          <div>
            <span>Đang sử dụng</span>
            <strong>{data?.summary.active ?? 0}</strong>
            <small>Có thể random vào bài test</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon red">
            <XCircle size={30} />
          </span>
          <div>
            <span>Đã tắt</span>
            <strong>{data?.summary.inactive ?? 0}</strong>
            <small>Không đưa vào bài làm mới</small>
          </div>
        </article>
      </section>

      <section className="question-bank-toolbar">
        <label>
          <Search size={18} />
          <input
            placeholder="Tìm nội dung câu hỏi, giải thích, nhóm..."
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
          value={filterGroupId}
          onChange={(event) => {
            setFilterGroupId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả nhóm</option>
          {filterGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(event) => {
            setDifficulty(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả độ khó</option>
          <option value="easy">Dễ</option>
          <option value="medium">Trung bình</option>
          <option value="hard">Khó</option>
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

      <section className="panel admin-table-panel">
        <div className="section-title">
          <h3>Danh sách câu hỏi</h3>
          <button onClick={() => loadQuestions()}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="question-bank-table">
            <thead>
              <tr>
                <th>Câu hỏi</th>
                <th>Nhóm</th>
                <th>Độ khó</th>
                <th>Đáp án đúng</th>
                <th>Trạng thái</th>
                <th>Cập nhật</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(data?.questions ?? []).map((question) => {
                const correctOption = question.options.find((option) => option.isCorrect);

                return (
                  <tr key={question.id}>
                    <td>
                      <span className="question-cell">
                        <strong>{question.questionText}</strong>
                        <QuestionMedia
                          src={question.imageUrl}
                          alt={`Ảnh câu hỏi ${question.id}`}
                          variant="thumbnail"
                        />
                        <small>{question.explanation ?? "Chưa có giải thích"}</small>
                      </span>
                    </td>
                    <td>{question.groupName ?? "--"}</td>
                    <td>{difficultyLabel(question.difficulty)}</td>
                    <td className="green-text">
                      {correctOption ? (
                        <span className="correct-option-cell">
                          <span>{`${correctOption.label}. ${correctOption.text || "Ảnh đáp án"}`}</span>
                          <QuestionMedia
                            src={correctOption.imageUrl}
                            alt={`Ảnh đáp án ${correctOption.label}`}
                            variant="thumbnail"
                          />
                        </span>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${question.isActive ? "success" : "neutral"}`}>
                        {question.isActive ? "Đang sử dụng" : "Đã tắt"}
                      </span>
                    </td>
                    <td>{formatDate(question.updatedAt)}</td>
                    <td>
                      <span className="table-actions">
                        <button className="table-action-button" type="button" onClick={() => openEditModal(question)}>
                          <Edit3 size={16} />
                          <span>Sửa</span>
                        </button>
                        {question.isActive && (
                          <button className="table-icon danger" type="button" onClick={() => handleDisable(question)} aria-label="Tắt câu hỏi">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {data?.questions.length === 0 && (
                <tr>
                  <td colSpan={7}>Không có câu hỏi phù hợp với bộ lọc.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            Hiển thị {startItem}-{endItem} / {pagination.total} câu hỏi
          </span>
          <span>10 câu hỏi/trang</span>
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
      )}

      {isModalOpen && (
        <div className="modal-backdrop">
          <form className="employee-modal question-modal" onSubmit={handleSubmit}>
            <header>
              <div>
                <h3>{form.id ? "Chỉnh sửa câu hỏi" : "Thêm câu hỏi"}</h3>
                <p>Câu hỏi thuộc một bài test cụ thể và có đúng 1 đáp án đúng.</p>
              </div>
              <button className="outline-button" type="button" onClick={() => setIsModalOpen(false)}>
                Đóng
              </button>
            </header>

            <div className="employee-form-grid question-form-grid">
              <label className="field">
                <span>Bài test</span>
                <div className="readonly-field">
                  <strong>{data?.tests.find((test) => test.id === Number(form.testId))?.title ?? selectedTest?.title ?? "--"}</strong>
                </div>
              </label>
              <label className="field">
                <span>Nhóm nội dung</span>
                <div>
                  <select
                    value={form.groupId}
                    onChange={(event) => setForm({ ...form, groupId: event.target.value })}
                  >
                    <option value="">Chưa phân nhóm</option>
                    {formGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="field">
                <span>Độ khó</span>
                <div>
                  <select
                    value={form.difficulty}
                    onChange={(event) => setForm({ ...form, difficulty: event.target.value as QuestionDifficulty })}
                  >
                    <option value="easy">Dễ</option>
                    <option value="medium">Trung bình</option>
                    <option value="hard">Khó</option>
                  </select>
                </div>
              </label>
              <label className="active-toggle question-active-toggle">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                />
                <span>Đang sử dụng</span>
              </label>
              <label className="field question-image-field">
                <span>Ảnh câu hỏi</span>
                <div>
                  <input
                    type="text"
                    value={form.questionImageUrl}
                    onChange={(event) => setForm({ ...form, questionImageUrl: event.target.value })}
                    placeholder="/uploads/question-images/cau-1.png hoặc https://..."
                  />
                </div>
                <QuestionMedia src={form.questionImageUrl} alt="Ảnh câu hỏi" variant="thumbnail" />
              </label>
              <label className="field question-text-field">
                <span>Nội dung câu hỏi</span>
                <div>
                  <textarea
                    value={form.questionText}
                    onChange={(event) => setForm({ ...form, questionText: event.target.value })}
                    placeholder="Nhập nội dung câu hỏi..."
                  />
                </div>
              </label>
              <label className="field question-text-field">
                <span>Giải thích</span>
                <div>
                  <textarea
                    value={form.explanation}
                    onChange={(event) => setForm({ ...form, explanation: event.target.value })}
                    placeholder="Giải thích ngắn sau khi làm thử hoặc xem lại..."
                  />
                </div>
              </label>
            </div>

            <div className="answer-editor">
              <strong>Đáp án</strong>
              <div>
                {form.options.map((option) => (
                  <label key={option.label} className={option.isCorrect ? "correct" : ""}>
                    <input
                      type="radio"
                      name="correct-answer"
                      checked={option.isCorrect}
                      onChange={() => setCorrectOption(option.label)}
                    />
                    <b>{option.label}</b>
                    <span className="answer-option-image-field">
                      <input
                        type="text"
                        value={option.imageUrl ?? ""}
                        onChange={(event) => setOptionImageUrl(option.label, event.target.value)}
                        placeholder={`Ảnh đáp án ${option.label}`}
                      />
                      <QuestionMedia
                        src={option.imageUrl}
                        alt={`Ảnh đáp án ${option.label}`}
                        variant="thumbnail"
                      />
                    </span>
                    <input
                      value={option.text}
                      onChange={(event) => setOptionText(option.label, event.target.value)}
                      placeholder={`Đáp án ${option.label}`}
                    />
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="login-error">{error}</p>}

            <footer>
              <button className="outline-button" type="button" onClick={() => setIsModalOpen(false)}>
                Hủy
              </button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? "Đang lưu" : "Lưu câu hỏi"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
