import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Info,
  Pencil,
  ShieldCheck,
  Target
} from "lucide-react";
import type { AssignedTest } from "@/lib/types";
import { FeatureLine, InfoTable } from "./shared";

export function TestDetail({
  test,
  onPractice,
  onOfficial
}: {
  test: AssignedTest;
  onPractice: () => void;
  onOfficial: () => void;
}) {
  return (
    <>
      <div className="breadcrumb">Bài test &gt; Chi tiết bài test</div>
      <section className="panel test-hero">
        <span className="detail-illustration">
          <ClipboardCheck size={64} />
          <Pencil size={26} />
        </span>
        <div>
          <h2>Test Quy định HCNS</h2>
          <p>
            Phòng ban áp dụng: <strong>HCNS</strong>
          </p>
          <span className="status-pill learning">ĐANG HỌC</span>
          <p>Bài test giúp bạn nắm vững các quy định, chính sách và quy trình nhân sự đang áp dụng tại Electric Bird.</p>
        </div>
        <div className="test-hero-stats">
          <FeatureLine icon={FileText} label="Số câu hỏi" value={`${test.questions + 15} câu`} />
          <FeatureLine icon={Clock3} label="Thời gian" value="20 phút" />
          <FeatureLine icon={Target} label="Điểm đạt" value="≥ 80 điểm" success />
        </div>
      </section>

      <section className="detail-grid">
        <div className="panel">
          <h3>Thông tin bài test</h3>
          <InfoTable
            rows={[
              ["Tên bài test", "Test Quy định HCNS"],
              ["Phòng ban áp dụng", "HCNS / HSE"],
              ["Tài liệu học", "File PDF, hình ảnh, slide, text"],
              ["Số câu hỏi", "40 câu"],
              ["Thời gian", "20 phút"],
              ["Điểm đạt", "≥ 80 điểm"]
            ]}
          />
        </div>
        <div className="panel">
          <h3>Cấu hình & quy tắc làm bài</h3>
          <RuleList />
        </div>
      </section>

      <section className="notice-panel">
        <div>
          <Info size={20} />
          <strong>Lưu ý</strong>
          <span>Nên đọc tài liệu kỹ trước khi làm bài để đạt kết quả tốt nhất.</span>
        </div>
        <div>
          <CheckCircle2 size={20} />
          <strong>Bài chính thức</strong>
          <span>Chỉ được ghi nhận 1 lần duy nhất, cần đạt từ 80 điểm trở lên.</span>
        </div>
      </section>

      <div className="detail-actions">
        <button className="outline-button">
          <BookOpen size={18} /> Xem tài liệu
        </button>
        <button className="warm-button" onClick={onPractice}>
          <Pencil size={18} /> Làm thử
        </button>
        <button className="primary-button" onClick={onOfficial}>
          <ShieldCheck size={18} /> Làm chính thức
        </button>
      </div>
    </>
  );
}

function RuleList() {
  const rules = [
    ["Làm thử", "Không giới hạn", "ok"],
    ["Làm chính thức", "1 lần", "info"],
    ["Random câu hỏi", "Có", "ok"],
    ["Random đáp án", "Có", "ok"],
    ["Hiển thị đáp án khi làm thử", "Có", "ok"],
    ["Hiển thị đáp án khi làm chính thức", "Không nên hiển thị ngay", "warn"]
  ];

  return (
    <div className="rule-list">
      {rules.map(([label, value, type]) => (
        <div key={label}>
          <span>{label}</span>
          <strong className={type}>{value}</strong>
          <Info size={16} />
        </div>
      ))}
    </div>
  );
}
