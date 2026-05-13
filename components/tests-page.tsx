import { BookOpen, ClipboardCheck, Eye, Pencil, ShieldCheck } from "lucide-react";
import type { AssignedTest } from "@/lib/types";
import { StatusPill } from "./shared";

export function TestsPage({
  tests,
  onOpenTest,
  onPractice,
  onOfficial
}: {
  tests: AssignedTest[];
  onOpenTest: () => void;
  onPractice: () => void;
  onOfficial: () => void;
}) {
  return (
    <>
      <section className="page-header">
        <div>
          <h2>Bài test được giao</h2>
          <p>Theo dõi trạng thái học, lượt làm thử và bài chính thức của từng nội dung.</p>
        </div>
        <button className="primary-button" onClick={onOpenTest}>
          <ClipboardCheck size={18} /> Xem bài đang học
        </button>
      </section>

      <section className="test-board">
        {tests.map((test) => {
          const Icon = test.icon;
          return (
            <article className="test-board-card" key={test.id}>
              <div className="test-title-line">
                <span className={`test-icon ${test.tone}`}>
                  <Icon size={28} />
                </span>
                <div>
                  <h3>{test.title}</h3>
                  <p>{test.department} · {test.questions} câu · {test.minutes} phút</p>
                </div>
                <StatusPill status={test.status} />
              </div>
              <div className="test-kpis">
                <span>
                  <strong>{test.readProgress}%</strong>
                  Đã đọc tài liệu
                </span>
                <span>
                  <strong>{test.attempts}</strong>
                  Lượt làm thử
                </span>
                <span>
                  <strong>{test.officialScore ? `${test.officialScore}/100` : "--"}</strong>
                  Điểm chính thức
                </span>
              </div>
              <div className="progress-track">
                <i className={test.readProgress === 100 ? "green" : "blue"} style={{ width: `${test.readProgress}%` }} />
              </div>
              <div className="row-actions">
                <button className="outline-button" onClick={onOpenTest}>
                  <Eye size={16} /> Chi tiết
                </button>
                <button className="warm-button" onClick={onPractice}>
                  <Pencil size={16} /> Làm thử
                </button>
                <button className="primary-button" onClick={onOfficial} disabled={test.status === "CHƯA LÀM"}>
                  <ShieldCheck size={16} /> Chính thức
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="notice-panel">
        <div>
          <BookOpen size={20} />
          <strong>Quy tắc học</strong>
          <span>Đọc tài liệu trước khi làm chính thức để hệ thống ghi nhận tiến độ đầy đủ.</span>
        </div>
        <div>
          <ShieldCheck size={20} />
          <strong>Lượt chính thức</strong>
          <span>Mỗi bài chính thức chỉ ghi nhận 1 lần, nếu chưa đạt cần liên hệ HR/Quản lý.</span>
        </div>
      </section>
    </>
  );
}
