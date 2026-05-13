import { CheckCircle2, Clock3, Download, Plus, Search, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const sectionCopy: Record<string, { description: string; actions: string[] }> = {
  "Quản lý bài test": {
    description: "Tạo, chỉnh sửa cấu hình bài test, thời gian làm bài, điểm đạt và trạng thái áp dụng.",
    actions: ["Tạo bài test", "Cập nhật cấu hình", "Khóa bài đã hết hạn"]
  },
  "Giao test cho nhân sự": {
    description: "Phân bài test theo phòng ban, vị trí, ngày vào làm hoặc danh sách nhân sự cụ thể.",
    actions: ["Giao theo phòng ban", "Import danh sách", "Gửi nhắc nhở"]
  },
  "Kết quả test": {
    description: "Tra cứu điểm chính thức, lịch sử làm thử, trạng thái đạt/chưa đạt và người duyệt thi lại.",
    actions: ["Lọc kết quả", "Xuất Excel", "Mở lại lượt thi"]
  },
  "Nhân sự": {
    description: "Quản lý thông tin nhân sự dùng cho đăng nhập và phân quyền xem kết quả.",
    actions: ["Thêm nhân sự", "Cập nhật số điện thoại", "Phân quyền"]
  },
  "Ngân hàng câu hỏi": {
    description: "Quản lý câu hỏi, đáp án đúng, giải thích ngắn và nhóm nội dung đào tạo.",
    actions: ["Upload câu hỏi", "Random câu hỏi", "Kiểm tra đáp án"]
  },
  "Tài liệu đào tạo": {
    description: "Upload PDF, slide, hình ảnh hoặc nội dung text để nhân sự đọc trước khi làm test.",
    actions: ["Upload tài liệu", "Gắn với bài test", "Cập nhật phiên bản"]
  },
  "Báo cáo": {
    description: "Tổng hợp tiến độ học, tỷ lệ đạt, câu hỏi sai nhiều và dữ liệu xuất cho HR/HSE.",
    actions: ["Tạo báo cáo", "Xuất Excel", "Lên lịch gửi"]
  },
  "Cài đặt hệ thống": {
    description: "Thiết lập vai trò, phân quyền, cấu hình bảo mật và chính sách backup dữ liệu.",
    actions: ["Phân quyền", "Cấu hình backup", "Nhật ký hệ thống"]
  }
};

export function AdminSectionPage({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  const copy = sectionCopy[title] ?? {
    description: "Quản lý dữ liệu vận hành của hệ thống đào tạo nội bộ.",
    actions: ["Tạo mới", "Cập nhật", "Xuất dữ liệu"]
  };

  return (
    <>
      <section className="page-header">
        <div>
          <h2>{title}</h2>
          <p>{copy.description}</p>
        </div>
        <button className="primary-button">
          <Plus size={18} /> Tạo mới
        </button>
      </section>

      <section className="toolbar-panel">
        <label>
          <Search size={18} />
          <input placeholder={`Tìm kiếm trong ${title.toLowerCase()}...`} />
        </label>
        <button>
          <Download size={18} /> Export Excel
        </button>
      </section>

      <section className="admin-section-grid">
        {copy.actions.map((action, index) => (
          <article className="panel setting-card" key={action}>
            {index === 0 ? <Icon size={28} /> : index === 1 ? <Upload size={28} /> : <CheckCircle2 size={28} />}
            <div>
              <h3>{action}</h3>
              <p>Thao tác nhanh cho mục {title.toLowerCase()}, đồng bộ với dữ liệu dashboard và phân quyền hiện tại.</p>
            </div>
            <span className={index === 2 ? "status-pill learning" : "status-pill success"}>
              {index === 2 ? "Theo dõi" : "Sẵn sàng"}
            </span>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="section-title">
          <h3>Dữ liệu mẫu</h3>
          <Clock3 size={20} />
        </div>
        <div className="compact-list">
          {["HCNS", "HSE", "Kỹ thuật", "Sản xuất"].map((department, index) => (
            <article key={department}>
              <span className={`stat-icon ${index % 2 === 0 ? "blue" : "green"}`}>
                <Icon size={24} />
              </span>
              <div>
                <strong>{department}</strong>
                <span>{18 + index * 7} bản ghi · cập nhật gần nhất 13/05/2026</span>
              </div>
              <button className="outline-button">Chi tiết</button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
