import { BookOpen, Download, Eye, FileText, Image, PlayCircle, Search, SlidersHorizontal } from "lucide-react";
import type { AssignedTest } from "@/lib/types";

const documents = [
  {
    title: "Quy định chung công ty",
    type: "PDF",
    owner: "HCNS",
    updated: "10/05/2026",
    progress: 75,
    icon: FileText,
    tone: "blue"
  },
  {
    title: "Quy định HSE hiện trường",
    type: "Slide",
    owner: "HSE",
    updated: "08/05/2026",
    progress: 100,
    icon: PlayCircle,
    tone: "green"
  },
  {
    title: "Checklist an toàn đầu ngày",
    type: "Ảnh",
    owner: "HSE",
    updated: "03/05/2026",
    progress: 100,
    icon: Image,
    tone: "purple"
  },
  {
    title: "Quy trình làm việc hiện trường",
    type: "Text",
    owner: "HSE",
    updated: "01/05/2026",
    progress: 0,
    icon: BookOpen,
    tone: "orange"
  }
];

export function DocumentsPage({ tests, onOpenTest }: { tests: AssignedTest[]; onOpenTest: () => void }) {
  return (
    <>
      <PageHeader
        title="Tài liệu học"
        description="Tổng hợp tài liệu được giao theo phòng ban và bài test liên quan."
      />

      <section className="toolbar-panel">
        <label>
          <Search size={18} />
          <input placeholder="Tìm tài liệu, phòng ban, bài test..." />
        </label>
        <button>
          <SlidersHorizontal size={18} /> Bộ lọc
        </button>
      </section>

      <section className="material-grid">
        {documents.map((doc) => {
          const Icon = doc.icon;
          return (
            <article className="document-card" key={doc.title}>
              <span className={`test-icon ${doc.tone}`}>
                <Icon size={28} />
              </span>
              <div>
                <h3>{doc.title}</h3>
                <p>{doc.owner} · {doc.type} · Cập nhật {doc.updated}</p>
              </div>
              <div className="progress-track">
                <i className={doc.progress === 100 ? "green" : "blue"} style={{ width: `${doc.progress}%` }} />
              </div>
              <strong>Đã đọc {doc.progress}%</strong>
              <div className="row-actions">
                <button className="outline-button" onClick={onOpenTest}>
                  <Eye size={16} /> Xem tài liệu
                </button>
                <button className="primary-button">
                  <Download size={16} /> Tải xuống
                </button>
              </div>
            </article>
          );
        })}
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
                <button className="outline-button" onClick={onOpenTest}>
                  <Eye size={16} /> Mở
                </button>
              </article>
            );
          })}
        </div>
      </section>
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
