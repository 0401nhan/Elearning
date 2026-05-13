import { BarChart3, CheckCircle2, Clock3, Eye, Trophy, X } from "lucide-react";
import { resultRows } from "@/lib/mock-data";
import { InfoTable, StatusPill, StatCard } from "./shared";

const personalRows = resultRows.slice(0, 4);

export function ResultsPage({ onReview }: { onReview: () => void }) {
  return (
    <>
      <section className="page-header">
        <div>
          <h2>Kết quả cá nhân</h2>
          <p>Xem điểm chính thức, lịch sử làm thử và trạng thái hoàn thành bài test.</p>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard icon={Trophy} label="Điểm cao nhất" value="95/100" note="Test Quy định HSE" tone="orange" />
        <StatCard icon={CheckCircle2} label="Bài đã đạt" value="3" note="Đã ghi nhận" tone="green" />
        <StatCard icon={X} label="Chưa đạt" value="1" note="Cần học lại" tone="red" />
        <StatCard icon={Clock3} label="Lượt làm thử" value="18" note="Tổng lịch sử" tone="blue" />
      </section>

      <section className="detail-grid">
        <article className="panel result-card pass">
          <h3>
            <CheckCircle2 size={21} /> Kết quả gần nhất: Đạt
          </h3>
          <p>Kết quả đã được ghi nhận vào hệ thống đào tạo nội bộ.</p>
          <InfoTable
            rows={[
              ["Bài thi", "Test Quy định HSE"],
              ["Điểm số", "85/100"],
              ["Thời gian", "18 phút"],
              ["Trạng thái", "Đạt"]
            ]}
          />
          <div>
            <button className="primary-button" onClick={onReview}>
              <Eye size={17} /> Xem chi tiết
            </button>
          </div>
        </article>
        <article className="panel">
          <div className="section-title">
            <h3>Biểu đồ tiến độ</h3>
            <BarChart3 size={20} />
          </div>
          <div className="line-chart result-line">
            <i className="line-done" />
            <i className="line-pending" />
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
                <th>Số lần làm thử</th>
                <th>Điểm chính thức</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {personalRows.map((row, index) => (
                <tr key={`${row.name}-${row.test}`}>
                  <td>{index + 1}</td>
                  <td>{row.test}</td>
                  <td>{row.attempts}</td>
                  <td className={row.score >= 80 ? "green-text" : "red-text"}>{row.score}/100</td>
                  <td>{row.time}</td>
                  <td><StatusPill status={row.status} /></td>
                  <td>
                    <button className="table-icon" onClick={onReview}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
