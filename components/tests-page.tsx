import { BookOpen, CheckCircle2, ClipboardCheck, Eye, Pencil, ShieldCheck } from "lucide-react";
import {
  OFFICIAL_RETAKE_COOLDOWN_MESSAGE,
  canStartPracticeAttempt,
  getNextOfficialAvailableAt,
  hasOfficialCooldown,
  isOfficialLocked,
  officialResultLabel,
  officialResultTone
} from "@/lib/test-state";
import type { AssignedTest } from "@/lib/types";
import { StatusPill } from "./shared";

export function TestsPage({
  tests,
  onOpenTest,
  onPractice,
  onOfficial
}: {
  tests: AssignedTest[];
  onOpenTest: (testId: number) => void;
  onPractice: (testId: number) => void;
  onOfficial: (testId: number) => void;
}) {
  return (
    <>
      <section className="page-header">
        <div>
          <h2>Bài test được giao</h2>
          <p>Theo dõi trạng thái học, lượt làm thử và bài chính thức của từng nội dung.</p>
        </div>
        <button className="primary-button" onClick={() => tests[0] && onOpenTest(tests[0].id)} disabled={!tests.length}>
          <ClipboardCheck size={18} /> Xem bài đang học
        </button>
      </section>

      <section className="test-board">
        {tests.map((test) => {
          const Icon = test.icon;
          const officialDone = isOfficialLocked(test);
          const officialTone = officialResultTone(test);
          const officialButtonClass = officialDone ? `official-result-button ${officialTone}` : "primary-button";
          const officialCooldown = hasOfficialCooldown(test);
          const nextOfficialAt = getNextOfficialAvailableAt(test);
          const canStartPractice = canStartPracticeAttempt(test);

          return (
            <article className={`test-board-card ${officialDone ? `official-${officialTone}` : ""}`} key={test.id}>
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
                  <strong className={officialDone ? `official-score-status ${officialTone}` : ""}>
                    {test.officialScore !== undefined ? `${test.officialScore}/100` : "--"}
                  </strong>
                  Điểm chính thức
                </span>
              </div>
              <div className="progress-track">
                <i className={test.readProgress === 100 ? "green" : "blue"} style={{ width: `${test.readProgress}%` }} />
              </div>
              <div className="row-actions">
                <button className="outline-button" onClick={() => onOpenTest(test.id)}>
                  <Eye size={16} /> Chi tiết
                </button>
                <button className="warm-button" onClick={() => onPractice(test.id)} disabled={!canStartPractice}>
                  <Pencil size={16} /> Làm thử
                </button>
                <div className="official-action-stack">
                  <button
                    className={officialButtonClass}
                    onClick={() => onOfficial(test.id)}
                    disabled={officialDone || test.status === "CHƯA LÀM"}
                  >
                    {officialDone ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
                    {officialDone ? officialResultLabel(test) : "Chính thức"}
                  </button>
                  {officialCooldown && (
                    <span className="official-cooldown-note">
                      {OFFICIAL_RETAKE_COOLDOWN_MESSAGE}
                      {nextOfficialAt ? ` (${new Date(nextOfficialAt.replace(" ", "T")).toLocaleDateString("vi-VN")})` : ""}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {tests.length === 0 && (
          <section className="panel empty-test-panel">
            <ClipboardCheck size={34} />
            <strong>Chưa có bài test được giao</strong>
            <span>Khi HR giao bài test, danh sách sẽ hiển thị tại đây.</span>
          </section>
        )}
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
          <span>Mỗi tuần được thi chính thức 1 lần. Thi thử không giới hạn.</span>
        </div>
      </section>
    </>
  );
}
