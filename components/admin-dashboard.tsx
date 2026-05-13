import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  Download,
  Eye,
  Mail,
  Menu,
  RefreshCw,
  Search,
  Upload
} from "lucide-react";
import { useState } from "react";
import { adminMetrics, adminNavItems, resultRows } from "@/lib/mock-data";
import type { Screen } from "@/lib/types";
import { AdminSectionPage } from "./admin-section-page";
import { ActionCard, Avatar, Bar, BrandMark, MetricCard, Mistake, StatusPill } from "./shared";

export function AdminDashboard({ setScreen }: { setScreen: (screen: Screen) => void }) {
  const [activeAdminIndex, setActiveAdminIndex] = useState(0);
  const activeAdminItem = adminNavItems[activeAdminIndex];

  return (
    <main className="admin-layout">
      <aside className="sidebar admin-sidebar">
        <BrandMark compact />
        <nav className="side-nav">
          {adminNavItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={activeAdminIndex === index ? "active" : ""}
                onClick={() => setActiveAdminIndex(index)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-callout report-callout">
          <BarChart3 size={58} />
          <strong>Báo cáo tổng hợp</strong>
          <span>Xuất báo cáo chi tiết theo nhiều tiêu chí</span>
          <button>Tạo báo cáo</button>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-header">
          <button className="icon-button" onClick={() => setScreen("home")}>
            <Menu size={22} />
          </button>
          <div>
            <h1>Admin Dashboard</h1>
            <p>Theo dõi đào tạo & kết quả test</p>
          </div>
          <div className="topbar-spacer" />
          <button className="notification-button">
            <Bell size={21} />
            <span>3</span>
          </button>
          <div className="profile-chip">
            <Avatar name="A" />
            <div>
              <strong>Nguyễn Văn A</strong>
              <span>HR Admin</span>
            </div>
            <ChevronDown size={18} />
          </div>
        </header>

        <div className="admin-content">
          {activeAdminIndex === 0 ? (
            <>
              <div className="date-filter">
                <CalendarDays size={18} /> 01/05/2026 - 31/05/2026 <ChevronDown size={16} />
              </div>

              <section className="admin-metrics">
                {adminMetrics.map((metric) => (
                  <MetricCard key={metric.label} metric={metric} />
                ))}
              </section>

              <section className="filter-row">
            <button>Phòng ban <strong>Tất cả</strong><ChevronDown size={16} /></button>
            <button>Trạng thái <strong>Tất cả</strong><ChevronDown size={16} /></button>
            <button>Bài test <strong>Tất cả</strong><ChevronDown size={16} /></button>
            <button>Thời gian <strong>30 ngày qua</strong><ChevronDown size={16} /></button>
            <label>
              <input placeholder="Tìm kiếm nhân sự..." />
              <Search size={17} />
            </label>
            <button>
              <RefreshCw size={17} /> Làm mới
            </button>
            <button className="primary-button">
              <Download size={17} /> Export Excel
            </button>
              </section>

              <section className="panel admin-table-panel">
            <div className="section-title">
              <h3>Danh sách kết quả nhân sự</h3>
            </div>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Họ tên</th>
                    <th>Số điện thoại</th>
                    <th>Phòng ban</th>
                    <th>Vị trí</th>
                    <th>Ngày vào làm</th>
                    <th>Bài test thực hiện</th>
                    <th>Số lần làm thử</th>
                    <th>Điểm chính thức</th>
                    <th>Thời gian làm bài</th>
                    <th>Trạng thái</th>
                    <th>Người duyệt làm lại</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {resultRows.map((row, index) => (
                    <tr key={row.name}>
                      <td>{index + 1}</td>
                      <td>
                        <Avatar name={row.name.slice(0, 1)} small /> {row.name}
                      </td>
                      <td>{row.phone}</td>
                      <td>{row.department}</td>
                      <td>{row.role}</td>
                      <td>{row.date}</td>
                      <td>{row.test}</td>
                      <td>{row.attempts}</td>
                      <td className={row.score >= 80 ? "green-text" : "red-text"}>{row.score}/100</td>
                      <td>{row.time}</td>
                      <td><StatusPill status={row.status} /></td>
                      <td>{row.approver}</td>
                      <td>
                        <button className="table-icon"><Eye size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </section>

              <section className="analytics-grid">
            <div className="panel donut-panel">
              <h3>Tỷ lệ đạt / chưa đạt</h3>
              <div className="donut" />
              <strong>73.3%</strong>
              <span>Đạt</span>
            </div>
            <div className="panel bar-panel">
              <h3>Điểm trung bình theo phòng ban</h3>
              <Bar label="HSE" value={87.5} green />
              <Bar label="Kỹ thuật" value={82.1} />
              <Bar label="HCNS" value={78.3} />
              <Bar label="Sản xuất" value={76.8} />
              <Bar label="QA/QC" value={85.2} />
            </div>
            <div className="panel line-panel">
              <h3>Tiến độ hoàn thành test</h3>
              <div className="line-chart">
                <i className="line-done" />
                <i className="line-pending" />
              </div>
            </div>
            <div className="panel mistake-panel">
              <h3>Top câu hỏi sai nhiều nhất</h3>
              <Mistake question="Câu 12" percent={18} />
              <Mistake question="Câu 07" percent={16} />
              <Mistake question="Câu 03" percent={14} />
              <Mistake question="Câu 15" percent={12} />
              <Mistake question="Câu 09" percent={10} />
            </div>
              </section>

              <section className="quick-actions">
            <ActionCard icon={Download} label="Export Excel" text="Xuất dữ liệu kết quả test" />
            <ActionCard icon={Mail} label="Gửi nhắc nhở" text="Nhắc nhân sự chưa hoàn thành" />
            <ActionCard icon={RefreshCw} label="Mở lại lượt thi" text="Duyệt cho nhân sự thi lại" />
            <ActionCard icon={Upload} label="Upload ngân hàng câu hỏi" text="Cập nhật câu hỏi mới" />
            <ActionCard icon={Upload} label="Upload tài liệu đào tạo" text="Tài liệu học & hướng dẫn" />
              </section>
            </>
          ) : (
            <AdminSectionPage title={activeAdminItem.label} icon={activeAdminItem.icon} />
          )}
        </div>
      </section>
    </main>
  );
}
