import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  Info,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Target,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { isOfficialLocked, isOfficialPassed, officialResultLabel, officialResultTone } from "@/lib/test-state";
import type { AssignedTest } from "@/lib/types";
import { FeatureLine, InfoTable } from "./shared";

type DetailTest = {
  id: number;
  title: string;
  department_name: string | null;
  description: string | null;
  question_count: number;
  duration_minutes: number;
  pass_score: number;
  max_official_attempts: number;
  allow_unlimited_practice: boolean;
  randomize_questions: boolean;
  randomize_answers: boolean;
  show_practice_answers: boolean;
  show_official_answers: boolean;
  assignment_status: string | null;
  read_progress_percent: number | null;
  practice_attempt_count: number;
  official_attempts_used: number;
  official_score: number | null;
  due_at: string | null;
};

type DetailMaterial = {
  id: number;
  title: string;
  material_type: string;
  content_url: string | null;
  content_text: string | null;
  version_label: string;
  read_progress_percent: number;
};

type DetailResponse = {
  test: DetailTest;
  materials: DetailMaterial[];
};

function statusLabel(status: string | null) {
  if (status === "passed") return "ĐÃ ĐẠT";
  if (status === "failed") return "CHƯA ĐẠT";
  if (status === "studying") return "ĐANG HỌC";
  return "CHƯA LÀM";
}

function statusClass(status: string | null) {
  if (status === "passed") return "success";
  if (status === "failed") return "danger";
  if (status === "studying") return "learning";
  return "neutral";
}

function materialTypeLabel(type: string) {
  if (type === "pdf") return "PDF";
  if (type === "image") return "Ảnh";
  if (type === "slide") return "Slide";
  if (type === "text") return "Text";
  if (type === "video") return "Video";
  return "Link";
}

export function TestDetail({
  test,
  onPractice,
  onOfficial,
  onRefreshAssignments
}: {
  test: AssignedTest;
  onPractice: () => void;
  onOfficial: () => void;
  onRefreshAssignments: () => Promise<unknown>;
}) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<DetailMaterial | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [retakeError, setRetakeError] = useState("");
  const [retakeSuccess, setRetakeSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRequestingRetake, setIsRequestingRetake] = useState(false);
  const activeTest = detail?.test;
  const materials = detail?.materials ?? [];
  const readProgress = Math.round(activeTest?.read_progress_percent ?? test.readProgress);
  const assignmentStatus = activeTest?.assignment_status ?? null;
  const officialState = {
    status: assignmentStatus ?? test.status,
    officialScore: activeTest?.official_score ?? test.officialScore ?? null,
    passScore: activeTest?.pass_score ?? test.passScore,
    officialAttemptsUsed: activeTest?.official_attempts_used ?? test.officialAttemptsUsed ?? null,
    maxOfficialAttempts: activeTest?.max_official_attempts ?? test.maxOfficialAttempts ?? null
  };
  const officialDone = isOfficialLocked(officialState);
  const officialPassed = isOfficialPassed(officialState);
  const officialTone = officialResultTone(officialState);
  const passScore = activeTest?.pass_score ?? test.passScore;

  async function loadDetail() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/test-detail?testId=${test.id}&mode=practice`, { cache: "no-store" });
      const responseData = (await response.json().catch(() => null)) as DetailResponse | { error?: string } | null;

      if (!response.ok) {
        setError(responseData && "error" in responseData ? responseData.error ?? "Không thể tải chi tiết bài test." : "Không thể tải chi tiết bài test.");
        return;
      }

      setDetail(responseData as DetailResponse);
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test.id]);

  async function markMaterialRead(material: DetailMaterial) {
    setIsSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch("/api/materials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ materialId: material.id, progress: 100 })
    }).catch(() => null);

    const responseData = await response?.json().catch(() => null);
    setIsSaving(false);

    if (!response?.ok) {
      setError(responseData?.error ?? "Không thể cập nhật tiến độ tài liệu.");
      return;
    }

    setSuccess("Đã cập nhật tiến độ đọc tài liệu.");
    await Promise.all([loadDetail(), onRefreshAssignments()]);
  }

  async function requestRetake() {
    setRetakeError("");
    setRetakeSuccess("");
    setIsRequestingRetake(true);

    const response = await fetch("/api/retake-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        testId: test.id,
        reason: `Xin mở lại lượt thi chính thức cho bài ${activeTest?.title ?? test.title}.`
      })
    }).catch(() => null);
    const responseData = await response?.json().catch(() => null);
    setIsRequestingRetake(false);

    if (!response?.ok) {
      setRetakeError(responseData?.error ?? "Không thể gửi yêu cầu thi lại.");
      return;
    }

    setRetakeSuccess(responseData?.message ?? "Yêu cầu thi lại đã được gửi và đang chờ duyệt.");
    await onRefreshAssignments();
  }

  return (
    <>
      <div className="breadcrumb">Bài test &gt; Chi tiết bài test</div>
      {error && <p className="login-error">{error}</p>}
      {success && <p className="success-message">{success}</p>}
      {retakeError && <p className="login-error">{retakeError}</p>}
      {retakeSuccess && <p className="success-message">{retakeSuccess}</p>}
      <section className="panel test-hero">
        <span className="detail-illustration">
          <ClipboardCheck size={64} />
          <Pencil size={26} />
        </span>
        <div>
          <h2>{activeTest?.title ?? test.title}</h2>
          <p>
            Phòng ban áp dụng: <strong>{activeTest?.department_name ?? test.department}</strong>
          </p>
          <span className={`status-pill ${statusClass(assignmentStatus)}`}>{statusLabel(assignmentStatus)}</span>
          <p>{activeTest?.description ?? test.description ?? "Bài test giúp bạn nắm vững nội dung đào tạo trước khi làm chính thức."}</p>
        </div>
        <div className="test-hero-stats">
          <FeatureLine icon={FileText} label="Số câu hỏi" value={`${activeTest?.question_count ?? test.questions} câu`} />
          <FeatureLine icon={Clock3} label="Thời gian" value={`${activeTest?.duration_minutes ?? test.minutes} phút`} />
          <FeatureLine icon={Target} label="Điểm đạt" value={`≥ ${passScore} điểm`} success />
        </div>
      </section>

      {officialDone && (
        <section className={`official-completion-banner ${officialTone}`}>
          {officialPassed ? <CheckCircle2 size={24} /> : <X size={24} />}
          <div>
            <strong>{officialResultLabel(officialState)}</strong>
            <span>
              Bài chính thức đã được ghi nhận
              {officialState.officialScore !== null && officialState.officialScore !== undefined
                ? ` với ${Math.round(officialState.officialScore)}/100 điểm`
                : ""}
              . Bạn không thể làm chính thức lại.
            </span>
          </div>
        </section>
      )}

      <section className="detail-grid">
        <div className="panel">
          <h3>Thông tin bài test</h3>
          <InfoTable
            rows={[
              ["Tên bài test", activeTest?.title ?? test.title],
              ["Phòng ban áp dụng", activeTest?.department_name ?? test.department],
              ["Tài liệu học", materials.length ? `${materials.length} tài liệu` : "Chưa gắn tài liệu"],
              ["Tiến độ đọc", `${readProgress}%`],
              ["Số câu hỏi", `${activeTest?.question_count ?? test.questions} câu`],
              ["Thời gian", `${activeTest?.duration_minutes ?? test.minutes} phút`],
              ["Điểm đạt", `≥ ${passScore} điểm`]
            ]}
          />
        </div>
        <div className="panel">
          <h3>Cấu hình & quy tắc làm bài</h3>
          <RuleList test={activeTest} />
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <h3>Tài liệu cần học</h3>
          <button onClick={loadDetail} disabled={isLoading}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
        <div className="compact-list">
          {materials.map((material) => (
            <article key={material.id}>
              <span className="test-icon blue">
                <FileText size={24} />
              </span>
              <div>
                <strong>{material.title}</strong>
                <span>
                  {materialTypeLabel(material.material_type)} · v{material.version_label} · Đã đọc {Math.round(material.read_progress_percent)}%
                </span>
              </div>
              <div className="row-actions">
                <button className="outline-button" onClick={() => setSelectedMaterial(material)}>
                  <BookOpen size={16} /> Xem
                </button>
                {material.content_url && (
                  <a className="outline-button" href={material.content_url} target="_blank" rel="noreferrer">
                    <Download size={16} /> Mở file
                  </a>
                )}
                <button className="primary-button" onClick={() => markMaterialRead(material)} disabled={isSaving || material.read_progress_percent >= 100}>
                  <CheckCircle2 size={16} /> Đã đọc
                </button>
              </div>
            </article>
          ))}
          {!materials.length && <p>Chưa có tài liệu được gắn với bài test này.</p>}
        </div>
      </section>

      <section className="notice-panel">
        <div>
          <Info size={20} />
          <strong>Lưu ý</strong>
          <span>Nên đọc tài liệu kỹ trước khi làm bài để đạt kết quả tốt nhất.</span>
        </div>
        <div>
          <CheckCircle2 size={20} />
          <strong>Bài chính thức</strong>
          <span>Chỉ được ghi nhận 1 lần duy nhất, cần đạt từ {passScore} điểm trở lên.</span>
        </div>
      </section>

      <div className="detail-actions">
        <button className="outline-button" onClick={() => materials[0] && setSelectedMaterial(materials[0])} disabled={!materials.length}>
          <BookOpen size={18} /> Xem tài liệu
        </button>
        <button className="warm-button" onClick={onPractice}>
          <Pencil size={18} /> Làm thử
        </button>
        {officialDone && !officialPassed && (
          <button className="outline-button" onClick={requestRetake} disabled={isRequestingRetake}>
            <RefreshCw size={18} /> {isRequestingRetake ? "Đang gửi" : "Gửi yêu cầu thi lại"}
          </button>
        )}
        <button
          className={officialDone ? `official-result-button ${officialTone}` : "primary-button"}
          onClick={onOfficial}
          disabled={officialDone}
        >
          {officialDone ? officialPassed ? <CheckCircle2 size={18} /> : <X size={18} /> : <ShieldCheck size={18} />}
          {officialDone ? officialResultLabel(officialState) : "Làm chính thức"}
        </button>
      </div>

      {selectedMaterial && (
        <div className="modal-backdrop">
          <section className="employee-modal material-view-modal">
            <header>
              <div>
                <h3>{selectedMaterial.title}</h3>
                <p>{materialTypeLabel(selectedMaterial.material_type)} · v{selectedMaterial.version_label}</p>
              </div>
              <button className="outline-button" onClick={() => setSelectedMaterial(null)}>
                Đóng
              </button>
            </header>
            {selectedMaterial.content_text ? (
              <div className="material-text-preview">{selectedMaterial.content_text}</div>
            ) : selectedMaterial.content_url ? (
              <div className="material-link-preview">
                <FileText size={34} />
                <strong>{selectedMaterial.title}</strong>
                <a className="primary-button" href={selectedMaterial.content_url} target="_blank" rel="noreferrer">
                  <Download size={16} /> Mở tài liệu
                </a>
              </div>
            ) : (
              <p>Tài liệu này chưa có nội dung đính kèm.</p>
            )}
            <footer>
              <button className="outline-button" onClick={() => setSelectedMaterial(null)}>
                Đóng
              </button>
              <button className="primary-button" onClick={() => markMaterialRead(selectedMaterial)} disabled={isSaving}>
                <CheckCircle2 size={16} /> Đánh dấu đã đọc
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function RuleList({ test }: { test: DetailTest | undefined }) {
  const rules = [
    ["Làm thử", test?.allow_unlimited_practice ? "Không giới hạn" : "Theo cấu hình", "ok"],
    ["Làm chính thức", `${test?.max_official_attempts ?? 1} lần`, "info"],
    ["Random câu hỏi", test?.randomize_questions ? "Có" : "Không", test?.randomize_questions ? "ok" : "info"],
    ["Random đáp án", test?.randomize_answers ? "Có" : "Không", test?.randomize_answers ? "ok" : "info"],
    ["Hiển thị đáp án khi làm thử", test?.show_practice_answers ? "Có" : "Không", test?.show_practice_answers ? "ok" : "warn"],
    ["Hiển thị đáp án khi làm chính thức", test?.show_official_answers ? "Có" : "Không hiển thị ngay", test?.show_official_answers ? "ok" : "warn"]
  ];

  return (
    <div className="rule-list">
      {rules.map(([label, value, type]) => (
        <div key={label}>
          <span>{label}</span>
          <strong className={type}>{value}</strong>
          <Info size={16} />
        </div>
      ))}
    </div>
  );
}
