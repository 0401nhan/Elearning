import { BarChart3, CheckCircle2, Clock3, Eye, RefreshCw, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { InfoTable, StatCard } from "./shared";

type PersonalResultRow = {
  assignmentId: number;
  testId: number;
  testTitle: string;
  passScore: number | null;
  departmentName: string | null;
  practiceAttemptCount: number;
  officialScore: number | null;
  assignmentStatus: string;
  assignmentStatusLabel: "Đạt" | "Chưa đạt" | "Đang học" | "Chưa làm";
  completedAt: string | null;
  timeSpentMinutes: number | null;
  totalQuestions: number | null;
  correctAnswers: number | null;
};

type AttemptRow = {
  id: number;
  testTitle: string;
  passScore: number | null;
  mode: string;
  attemptNo: number;
  submittedAt: string | null;
  timeSpentMinutes: number | null;
  totalQuestions: number;
  correctAnswers: number;
  score: number | null;
  resultStatus: string | null;
  isRecorded: boolean;
};

type ResultsResponse = {
  summary: {
    highestScore: number | null;
    passed: number;
    failed: number;
    practiceAttempts: number;
  };
  rows: PersonalResultRow[];
  attempts: AttemptRow[];
};

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value.includes(" ") ? value.replace(" ", "T") : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return value.includes(" ") ? date.toLocaleString("vi-VN") : date.toLocaleDateString("vi-VN");
}

function isPassingScore(score: number | null | undefined, passScore: number | null | undefined) {
  return score !== null && score !== undefined && passScore !== null && passScore !== undefined && score >= passScore;
}

function resultStatusLabel(attempt: AttemptRow | null): "Đạt" | "Chưa đạt" {
  return isPassingScore(attempt?.score, attempt?.passScore) ? "Đạt" : "Chưa đạt";
}

export function ResultsPage({ onReview }: { onReview: () => void }) {
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const latestOfficial = useMemo(() => data?.attempts.find((attempt) => attempt.mode === "official") ?? null, [data]);
  const latestOfficialPassed = isPassingScore(latestOfficial?.score, latestOfficial?.passScore);

  async function loadResults() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/results", { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải kết quả cá nhân.");
        return;
      }

      setData(responseData);
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadResults();
  }, []);

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Kết quả cá nhân</h2>
          <p>Xem điểm chính thức, lịch sử làm thử và trạng thái hoàn thành bài test.</p>
        </div>
        <button className="outline-button" onClick={loadResults} disabled={isLoading}>
          <RefreshCw size={17} /> Làm mới
        </button>
      </section>

      {error && <p className="login-error">{error}</p>}

      <section className="stats-grid">
        <StatCard icon={Trophy} label="Điểm cao nhất" value={data?.summary.highestScore !== null && data?.summary.highestScore !== undefined ? `${data.summary.highestScore}/100` : "--"} note="Điểm chính thức" tone="orange" />
        <StatCard icon={CheckCircle2} label="Bài đã đạt" value={data?.summary.passed ?? 0} note="Đã ghi nhận" tone="green" />
        <StatCard icon={X} label="Chưa đạt" value={data?.summary.failed ?? 0} note="Cần học lại" tone="red" />
        <StatCard icon={Clock3} label="Lượt làm thử" value={data?.summary.practiceAttempts ?? 0} note="Tổng lịch sử" tone="blue" />
      </section>

      <section className="detail-grid">
        <article className={`panel result-card ${latestOfficialPassed ? "pass" : "fail"}`}>
          <h3>
            {latestOfficialPassed ? <CheckCircle2 size={21} /> : <X size={21} />}
            Kết quả gần nhất: {latestOfficial ? resultStatusLabel(latestOfficial) : "--"}
          </h3>
          <p>Kết quả chính thức được ghi nhận vào hệ thống đào tạo nội bộ.</p>
          <InfoTable
            rows={[
              ["Bài thi", latestOfficial?.testTitle ?? "--"],
              ["Điểm số", latestOfficial?.score !== null && latestOfficial?.score !== undefined ? `${latestOfficial.score}/100` : "--"],
              ["Thời gian", latestOfficial?.timeSpentMinutes ? `${latestOfficial.timeSpentMinutes} phút` : "--"],
              ["Ngày nộp", formatDate(latestOfficial?.submittedAt ?? null)]
            ]}
          />
          <div>
            <button className="primary-button" onClick={onReview}>
              <Eye size={17} /> Ôn lại bài
            </button>
          </div>
        </article>
        <article className="panel">
          <div className="section-title">
            <h3>Tiến độ bài test</h3>
            <BarChart3 size={20} />
          </div>
          <div className="compact-list result-progress-list">
            {(data?.rows ?? []).slice(0, 4).map((row) => (
              <article key={row.assignmentId}>
                <span className="test-icon blue">
                  <BarChart3 size={22} />
                </span>
                <div>
                  <strong>{row.testTitle}</strong>
                  <span>{row.officialScore !== null ? `${row.officialScore}/100` : "Chưa có điểm"} · {row.assignmentStatusLabel}</span>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="panel admin-table-panel">
        <div className="section-title">
          <h3>Lịch sử làm bài</h3>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>STT</th>
                <th>Bài test</th>
                <th>Chế độ</th>
                <th>Lần</th>
                <th>Điểm</th>
                <th>Số câu đúng</th>
                <th>Thời gian</th>
                <th>Ngày nộp</th>
                <th>Ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              {(data?.attempts ?? []).map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{row.testTitle}</td>
                  <td>{row.mode === "official" ? "Chính thức" : "Làm thử"}</td>
                  <td>{row.attemptNo}</td>
                  <td className={row.score === null ? "" : isPassingScore(row.score, row.passScore) ? "green-text" : "red-text"}>
                    {row.score !== null ? `${row.score}/100` : "--"}
                  </td>
                  <td>
                    {row.correctAnswers}/{row.totalQuestions}
                  </td>
                  <td>{row.timeSpentMinutes ? `${row.timeSpentMinutes} phút` : "--"}</td>
                  <td>{formatDate(row.submittedAt)}</td>
                  <td>{row.isRecorded ? "Chính thức" : "Tham khảo"}</td>
                </tr>
              ))}
              {data?.attempts.length === 0 && (
                <tr>
                  <td colSpan={9}>Chưa có lịch sử làm bài.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
