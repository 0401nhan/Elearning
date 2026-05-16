import { BookOpen, Download, Eye, FileText, Image, PlayCircle, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import type { AssignedTest } from "@/lib/types";

type UserMaterial = {
  id: number;
  title: string;
  materialType: string;
  contentUrl: string | null;
  contentText: string | null;
  departmentName: string | null;
  versionLabel: string;
  updatedAt: string;
  readProgressPercent: number;
  testIds: number[];
  testTitles: string[];
};

type MaterialsResponse = {
  materials: UserMaterial[];
};

const materialTypeLabels: Record<string, string> = {
  pdf: "PDF",
  image: "Ảnh",
  slide: "Slide",
  text: "Text",
  video: "Video",
  link: "Link"
};

function materialIcon(type: string) {
  if (type === "image") return Image;
  if (type === "video") return PlayCircle;
  if (type === "text") return BookOpen;
  return FileText;
}

function materialTone(type: string) {
  if (type === "image") return "purple";
  if (type === "text") return "orange";
  if (type === "video") return "green";
  return "blue";
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

export function DocumentsPage({
  tests,
  onOpenTest,
  onRefreshAssignments
}: {
  tests: AssignedTest[];
  onOpenTest: (testId: number) => void;
  onRefreshAssignments: () => Promise<unknown>;
}) {
  const [materials, setMaterials] = useState<UserMaterial[]>([]);
  const [search, setSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<UserMaterial | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function loadMaterials() {
    setIsLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());

    try {
      const response = await fetch(`/api/materials?${params.toString()}`, { cache: "no-store" });
      const responseData = (await response.json().catch(() => null)) as MaterialsResponse | { error?: string } | null;

      if (!response.ok) {
        setError(responseData && "error" in responseData ? responseData.error ?? "Không thể tải tài liệu." : "Không thể tải tài liệu.");
        return;
      }

      setMaterials((responseData as MaterialsResponse)?.materials ?? []);
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markAsRead(material: UserMaterial) {
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
    await Promise.all([loadMaterials(), onRefreshAssignments()]);
  }

  return (
    <>
      <PageHeader
        title="Tài liệu học"
        description="Tổng hợp tài liệu được giao theo phòng ban và bài test liên quan."
      />

      <section className="toolbar-panel">
        <label>
          <Search size={18} />
          <input
            placeholder="Tìm tài liệu, phòng ban, bài test..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                loadMaterials();
              }
            }}
          />
        </label>
        <button onClick={loadMaterials} disabled={isLoading}>
          {isLoading ? <RefreshCw size={18} /> : <SlidersHorizontal size={18} />} Lọc
        </button>
      </section>

      {error && <p className="login-error">{error}</p>}
      {success && <p className="success-message">{success}</p>}

      <section className="material-grid">
        {materials.map((material) => {
          const Icon = materialIcon(material.materialType);
          const progress = Math.round(material.readProgressPercent);

          return (
            <article className="document-card" key={material.id}>
              <span className={`test-icon ${materialTone(material.materialType)}`}>
                <Icon size={28} />
              </span>
              <div>
                <h3>{material.title}</h3>
                <p>
                  {material.departmentName ?? "Áp dụng chung"} · {materialTypeLabels[material.materialType] ?? material.materialType} · Cập nhật {formatDate(material.updatedAt)}
                </p>
              </div>
              <div className="progress-track">
                <i className={progress === 100 ? "green" : "blue"} style={{ width: `${progress}%` }} />
              </div>
              <strong>Đã đọc {progress}%</strong>
              <div className="row-actions">
                <button className="outline-button" onClick={() => setSelectedMaterial(material)}>
                  <Eye size={16} /> Xem tài liệu
                </button>
                {material.contentUrl && (
                  <a className="outline-button" href={material.contentUrl} target="_blank" rel="noreferrer">
                    <Download size={16} /> Mở file
                  </a>
                )}
                <button className="primary-button" onClick={() => markAsRead(material)} disabled={isSaving || progress === 100}>
                  <BookOpen size={16} /> Đã đọc
                </button>
              </div>
            </article>
          );
        })}
        {!materials.length && (
          <section className="panel empty-test-panel">
            <FileText size={34} />
            <strong>Chưa có tài liệu được giao</strong>
            <span>Tài liệu sẽ xuất hiện khi bài test được gắn tài liệu đào tạo.</span>
          </section>
        )}
      </section>

      <section className="panel">
        <div className="section-title">
          <h3>Tài liệu theo bài test</h3>
        </div>
        <div className="compact-list">
          {tests.map((test) => {
            const Icon = test.icon;
            return (
              <article key={test.id}>
                <span className={`test-icon ${test.tone}`}>
                  <Icon size={24} />
                </span>
                <div>
                  <strong>{test.title}</strong>
                  <span>{test.department} · {test.questions} câu · Điểm đạt ≥{test.passScore}</span>
                </div>
                <button className="outline-button" onClick={() => onOpenTest(test.id)}>
                  <Eye size={16} /> Mở
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {selectedMaterial && (
        <div className="modal-backdrop">
          <section className="employee-modal material-view-modal">
            <header>
              <div>
                <h3>{selectedMaterial.title}</h3>
                <p>{selectedMaterial.testTitles.length ? selectedMaterial.testTitles.join(", ") : "Tài liệu đào tạo"}</p>
              </div>
              <button className="outline-button" onClick={() => setSelectedMaterial(null)}>
                Đóng
              </button>
            </header>
            {selectedMaterial.contentText ? (
              <div className="material-text-preview">{selectedMaterial.contentText}</div>
            ) : selectedMaterial.contentUrl ? (
              <div className="material-link-preview">
                <FileText size={34} />
                <strong>{selectedMaterial.title}</strong>
                <a className="primary-button" href={selectedMaterial.contentUrl} target="_blank" rel="noreferrer">
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
              <button className="primary-button" onClick={() => markAsRead(selectedMaterial)} disabled={isSaving}>
                <BookOpen size={16} /> Đánh dấu đã đọc
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <section className="page-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
