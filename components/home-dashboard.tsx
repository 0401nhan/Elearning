import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  Eye,
  Info,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Star,
  Target,
  X
} from "lucide-react";
import {
  isOfficialLocked,
  isOfficialPassed,
  officialResultLabel,
  officialResultTone
} from "@/lib/test-state";
import type { AssignedTest, SessionUser, Summary } from "@/lib/types";
import { Avatar, ProgressLine, StatCard, StatusPill } from "./shared";

export function HomeDashboard({
  summary,
  tests,
  user,
  onOpenTest,
  onPractice,
  onOfficial
}: {
  summary: Summary;
  tests: AssignedTest[];
  user: SessionUser;
  onOpenTest: (testId: number) => void;
  onPractice: (testId: number) => void;
  onOfficial: (testId: number) => void;
}) {
  const completionRate = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  const pendingRate = summary.total ? Math.round((summary.pending / summary.total) * 100) : 0;
  const readAverage = tests.length ? Math.round(tests.reduce((sum, test) => sum + test.readProgress, 0) / tests.length) : 0;
  const practiceTotal = tests.reduce((sum, test) => sum + test.attempts, 0);
  const bestOfficialScore = tests.reduce((best, test) => Math.max(best, test.officialScore ?? 0), 0);
  const overallStatus = summary.done === summary.total && summary.total > 0 ? "Đã hoàn thành" : "Đang học";

  return (
    <>
      <section className="welcome">
        <div>
          <h2>Xin chào, {user.fullName}!</h2>
          <p>Chúc bạn một ngày học tập hiệu quả!</p>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard icon={BookOpen} label="Tổng bài test" value={summary.total} note="Bài test được giao" tone="blue" />
        <StatCard icon={CheckCircle2} label="Đã hoàn thành" value={summary.done} note={`${completionRate}%`} tone="green" />
        <StatCard icon={Clock3} label="Chưa hoàn thành" value={summary.pending} note={`${pendingRate}%`} tone="orange" />
        <StatCard icon={Star} label="Điểm trung bình" value={`${summary.average}/100`} note="Tất cả bài test" tone="purple" />
      </section>

      <section className="dashboard-columns">
        <div className="panel profile-panel">
          <div className="section-title">
            <h3>Thông tin cá nhân</h3>
            <button>
              <Pencil size={16} /> Sửa
            </button>
          </div>
          <div className="profile-body">
            <Avatar name={user.fullName} initials={user.avatarInitial} />
            <dl>
              <dt>Họ tên</dt>
              <dd>{user.fullName}</dd>
              <dt>Mã nhân viên</dt>
              <dd>{user.code}</dd>
              <dt>Phòng ban</dt>
              <dd>{user.department}</dd>
              <dt>Vị trí</dt>
              <dd>{user.position ?? "--"}</dd>
            </dl>
          </div>
        </div>

        <div className="panel progress-panel">
          <div className="section-title">
            <h3>Tiến độ học tập chung</h3>
            <BarChart3 size={20} />
          </div>
          <ProgressLine icon={BookOpen} label="Đã đọc tài liệu" value={`${readAverage}%`} percent={readAverage} tone="green" />
          <ProgressLine icon={ShieldCheck} label="Số lần làm thử" value={`${practiceTotal} lần`} percent={Math.min(100, practiceTotal * 12)} tone="blue" />
          <ProgressLine icon={CheckCircle2} label="Điểm chính thức cao nhất" value={`${bestOfficialScore || "--"}/100`} percent={bestOfficialScore} tone="purple" />
          <ProgressLine icon={CheckCircle2} label="Trạng thái chung" value={overallStatus} percent={completionRate} tone="green" />
        </div>
      </section>

      <section className="panel assigned-tests">
        <div className="section-title">
          <h3>Danh sách bài test được giao</h3>
        </div>
        <div className="test-list">
          {tests.map((test, index) => (
            <AssignedTestRow
              key={test.id}
              index={index + 1}
              test={test}
              onOpenTest={onOpenTest}
              onPractice={onPractice}
              onOfficial={onOfficial}
            />
          ))}
        </div>
        <div className="tip-strip">
          <Info size={18} /> Hãy hoàn thành tất cả các bài test để nâng cao kiến thức và đảm bảo tuân thủ quy định của công ty.
          <Target size={52} />
        </div>
      </section>
    </>
  );
}

function AssignedTestRow({
  index,
  test,
  onOpenTest,
  onPractice,
  onOfficial
}: {
  index: number;
  test: AssignedTest;
  onOpenTest: (testId: number) => void;
  onPractice: (testId: number) => void;
  onOfficial: (testId: number) => void;
}) {
  const Icon = test.icon;
  const officialDone = isOfficialLocked(test);
  const officialPassed = isOfficialPassed(test);
  const officialTone = officialResultTone(test);
  const officialButtonClass = officialDone ? `official-result-button ${officialTone}` : "primary-button";

  return (
    <article className={`test-row ${officialDone ? `official-${officialTone}` : ""}`}>
      <span className={`test-icon ${test.tone}`}>
        <Icon size={29} />
      </span>
      <div className="test-main">
        <div className="test-title-line">
          <h4>
            {index}. {test.title}
          </h4>
          <StatusPill status={test.status} />
        </div>
        <div className="test-meta">
          <span>Phòng áp dụng: {test.department}</span>
          <span>{test.questions} câu hỏi</span>
          <span>{test.minutes} phút</span>
          <span>Điểm đạt: ≥{test.passScore}</span>
        </div>
        <div className="mini-progress">
          <span>Đã đọc tài liệu: {test.readProgress}%</span>
          <span>Làm thử: {test.attempts} lần</span>
          <span className={officialDone ? `official-score-status ${officialTone}` : ""}>
            Điểm chính thức: {test.officialScore !== undefined ? `${test.officialScore}/100` : "--"}
          </span>
          {test.dueAt && <span>Hạn: {new Date(`${test.dueAt}T00:00:00`).toLocaleDateString("vi-VN")}</span>}
        </div>
      </div>
      <div className="row-actions">
        <button className="outline-button" onClick={() => onOpenTest(test.id)}>
          <Eye size={16} /> Xem tài liệu
        </button>
        {!officialPassed && test.status !== "CHƯA ĐẠT" && (
          <button className="warm-button" onClick={() => onPractice(test.id)}>
            <Pencil size={16} /> Làm thử
          </button>
        )}
        {test.status === "CHƯA ĐẠT" && (
          <button className="danger-outline-button" onClick={() => onPractice(test.id)}>
            <RotateCcw size={16} /> Làm lại
          </button>
        )}
        <button
          className={officialButtonClass}
          onClick={() => onOfficial(test.id)}
          disabled={officialDone || test.status === "CHƯA LÀM"}
        >
          {officialDone ? officialPassed ? <CheckCircle2 size={16} /> : <X size={16} /> : <ShieldCheck size={16} />}
          {officialDone ? officialResultLabel(test) : "Làm chính thức"}
        </button>
      </div>
    </article>
  );
}
