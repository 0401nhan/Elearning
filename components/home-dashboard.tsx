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
  Target
} from "lucide-react";
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
  onOpenTest: () => void;
  onPractice: () => void;
  onOfficial: () => void;
}) {
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
        <StatCard icon={CheckCircle2} label="Đã hoàn thành" value={summary.done} note="50%" tone="green" />
        <StatCard icon={Clock3} label="Chưa hoàn thành" value={summary.pending} note="50%" tone="orange" />
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
            <Avatar name={user.fullName.slice(0, 1)} />
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
          <ProgressLine icon={BookOpen} label="Đã đọc tài liệu" value="75%" percent={75} tone="green" />
          <ProgressLine icon={ShieldCheck} label="Số lần làm thử" value="5 lần" percent={72} tone="blue" />
          <ProgressLine icon={CheckCircle2} label="Điểm chính thức" value="82/100" percent={82} tone="purple" />
          <ProgressLine icon={CheckCircle2} label="Trạng thái chung" value="Đã đạt" percent={100} tone="green" />
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
  onOpenTest: () => void;
  onPractice: () => void;
  onOfficial: () => void;
}) {
  const Icon = test.icon;
  return (
    <article className="test-row">
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
          <span>Điểm chính thức: {test.officialScore ? `${test.officialScore}/100` : "--"}</span>
        </div>
      </div>
      <div className="row-actions">
        <button className="outline-button" onClick={onOpenTest}>
          <Eye size={16} /> Xem tài liệu
        </button>
        {test.status !== "ĐÃ ĐẠT" && (
          <button className="warm-button" onClick={onPractice}>
            <Pencil size={16} /> Làm thử
          </button>
        )}
        {test.status === "CHƯA ĐẠT" ? (
          <button className="danger-outline-button" onClick={onPractice}>
            <RotateCcw size={16} /> Làm lại
          </button>
        ) : (
          <button className="primary-button" onClick={onOfficial} disabled={test.status === "CHƯA LÀM"}>
            <ShieldCheck size={16} /> Làm chính thức
          </button>
        )}
      </div>
    </article>
  );
}
