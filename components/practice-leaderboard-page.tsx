import { Trophy } from "lucide-react";
import type { PracticeLeaderboardEntry, SessionUser } from "@/lib/types";
import { Avatar } from "./shared";

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPracticeDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit"
      });
}

export function PracticeLeaderboardPage({
  leaderboard,
  user
}: {
  leaderboard: PracticeLeaderboardEntry[];
  user: SessionUser;
}) {
  const currentEntry = leaderboard.find((entry) => entry.employeeId === user.id) ?? null;

  return (
    <>
      <section className="page-header">
        <div>
          <h2>BXH</h2>
          <p>Xếp hạng theo tổng điểm các lượt làm thử gần đây của nhân sự.</p>
        </div>
      </section>

      <section className="panel practice-leaderboard-panel">
        <div className="section-title">
          <h3>Thành tích của bạn</h3>
          <Trophy size={20} />
        </div>
        <div className="practice-leaderboard-summary">
          <div>
            <span>Tổng điểm của bạn</span>
            <strong>{currentEntry ? formatScore(currentEntry.totalScore) : "--"}/500</strong>
            <small>Điểm xếp hạng</small>
          </div>
          <div>
            <span>Hạng của bạn</span>
            <strong>{currentEntry ? `#${currentEntry.rank}` : "--"}</strong>
            <small>{currentEntry ? `${currentEntry.attemptCount}/5 lượt được tính` : "Chưa có lượt làm thử"}</small>
          </div>
        </div>
      </section>

      <section className="panel practice-leaderboard-panel">
        <div className="section-title">
          <h3>Bảng xếp hạng</h3>
        </div>
        <div className="practice-leaderboard-list">
          {leaderboard.map((entry) => (
            <article className={entry.isCurrentUser ? "current-user" : ""} key={entry.employeeId}>
              <span className="leaderboard-rank">#{entry.rank}</span>
              <Avatar name={entry.fullName} small />
              <div className="leaderboard-person">
                <strong>{entry.fullName}</strong>
                <small>
                  {entry.employeeCode} · {entry.departmentName ?? "Áp dụng chung"}
                </small>
              </div>
              <div className="leaderboard-score">
                <strong>{formatScore(entry.totalScore)}</strong>
                <small>
                  {entry.attemptCount}/5 lượt · cao nhất {formatScore(entry.highestScore)} ·{" "}
                  {formatPracticeDate(entry.latestPracticeAt)}
                </small>
              </div>
            </article>
          ))}
          {leaderboard.length === 0 && (
            <p className="empty-leaderboard">Chưa có dữ liệu làm thử để xếp hạng.</p>
          )}
        </div>
      </section>
    </>
  );
}
