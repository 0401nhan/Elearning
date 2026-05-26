import { Trophy } from "lucide-react";
import type { PracticeLeaderboardEntry, SessionUser } from "@/lib/types";
import { Avatar } from "./shared";

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function trophyClass(rank: number) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "";
}

function rankLabel(rank: number) {
  if (rank === 1) return "Cúp vàng";
  if (rank === 2) return "Cúp bạc";
  if (rank === 3) return "Cúp đồng";
  return `Hạng ${rank}`;
}

function LeaderboardRank({ rank }: { rank: number }) {
  const className = trophyClass(rank);

  if (className) {
    return (
      <span className={`leaderboard-rank trophy-rank ${className}`} title={rankLabel(rank)} aria-label={rankLabel(rank)}>
        <Trophy size={20} />
      </span>
    );
  }

  return <span className="leaderboard-rank">#{rank}</span>;
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
              <LeaderboardRank rank={entry.rank} />
              <Avatar name={entry.fullName} small />
              <div className="leaderboard-person">
                <strong>{entry.fullName}</strong>
                <small>
                  {entry.employeeCode} · {entry.departmentName ?? "Áp dụng chung"}
                </small>
              </div>
              <div className="leaderboard-score">
                <strong>{formatScore(entry.totalScore)}</strong>
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
