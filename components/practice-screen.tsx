import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Eye,
  Home,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trophy,
  X
} from "lucide-react";
import type { AssignedTest } from "@/lib/types";
import { InfoTable, ModeRows } from "./shared";

export function PracticeScreen({
  test,
  onReview,
  onOfficial
}: {
  test: AssignedTest;
  onReview: () => void;
  onOfficial: () => void;
}) {
  return (
    <section className="test-mode">
      <div className="mode-card practice-card">
        <div className="mode-title">
          <span>01</span>
          <h2>Chế độ 1 - Làm thử</h2>
        </div>
        <div className="mode-summary">
          <span className="large-illustration warm">
            <BookOpen size={74} />
            <Pencil size={30} />
          </span>
          <p>Cho phép làm thử nhiều lần để ôn tập và nắm vững kiến thức.</p>
          <ModeRows
            rows={[
              ["Làm nhiều lần", "Có", true],
              ["Hiện đúng/sai", "Có", true],
              ["Hiện đáp án đúng", "Có", true],
              ["Có giải thích ngắn", "Có", true],
              ["Ghi nhận vào KPI chính thức", "Không", false],
              ["Lưu lịch sử để HR xem", "Có, nhưng chỉ để tham khảo", true]
            ]}
          />
        </div>
        <div className="score-box">
          <Trophy size={64} />
          <div>
            <span>Bạn đạt:</span>
            <strong>72<small>/100 điểm</small></strong>
          </div>
          <p>Bạn đã hoàn thành lượt làm thử. Hãy xem lại phần giải thích để đạt kết quả tốt hơn ở lần sau nhé!</p>
        </div>
        <div className="answer-review">
          <QuestionResult number={1} ok title="Theo quy định của công ty, tất cả nhân viên phải tuân thủ quy trình an toàn khi làm việc trên cao." />
          <QuestionResult number={2} title="Khi phát hiện sự cố an toàn, bạn phải báo cáo ngay cho quản lý trực tiếp và bộ phận HSE." />
          <QuestionResult number={3} ok title="Trang bị bảo hộ cá nhân (PPE) là bắt buộc tại mọi công trường." />
        </div>
        <div className="mode-actions">
          <button className="warm-button" onClick={onReview}>
            <RefreshCw size={17} /> Làm lại
          </button>
          <button className="outline-button" onClick={onOfficial}>
            <BookOpen size={17} /> Làm chính thức
          </button>
        </div>
      </div>

      <div className="mode-card official-card">
        <div className="mode-title blue">
          <span>02</span>
          <h2>Chế độ 2 - Làm chính thức</h2>
          <ShieldCheck size={30} />
        </div>
        <div className="official-info">
          <div>
            <span className="large-illustration blue">
              <ClipboardCheck size={72} />
              <ShieldCheck size={30} />
            </span>
            <p>Bài thi chính thức chỉ được làm 1 lần, có giới hạn thời gian và ghi nhận kết quả cuối cùng.</p>
          </div>
          <ModeRows
            rows={[
              ["Làm 1 lần", "Có", true],
              ["Giới hạn thời gian", "Có", true],
              ["Ghi nhận điểm cuối", "Có", true],
              ["Lưu vào dashboard HR", "Có", true],
              ["Hiện đáp án sau submit", "Không nên hiện ngay", false],
              ["Nếu không đạt", "Yêu cầu học lại", false]
            ]}
          />
        </div>
        <div className="embedded-quiz">
          <div className="quiz-header">
            <strong>Bài thi: {test.title}</strong>
            <span>
              <Clock3 size={22} /> 20:00
            </span>
          </div>
          <div className="quiz-progress">
            <span>Câu 12/40</span>
            <i>
              <b style={{ width: "30%" }} />
            </i>
            <span>30%</span>
          </div>
          <p>Khi phát hiện sự cố mất an toàn, việc đầu tiên bạn cần làm là gì?</p>
          <label>
            <input type="radio" name="demo-question" />
            Tiếp tục công việc và báo cáo sau
          </label>
          <label>
            <input type="radio" name="demo-question" defaultChecked />
            Báo cáo ngay cho quản lý trực tiếp và bộ phận HSE
          </label>
          <label>
            <input type="radio" name="demo-question" />
            Tự xử lý sự cố
          </label>
          <button className="primary-button">Nộp bài</button>
        </div>
        <ResultCards />
      </div>
    </section>
  );
}

function QuestionResult({ number, title, ok = false }: { number: number; title: string; ok?: boolean }) {
  return (
    <article>
      {ok ? <CheckCircle2 size={22} /> : <X size={22} />}
      <div>
        <strong>
          Câu {number} <span className={ok ? "green-text" : "red-text"}>{ok ? "Đúng" : "Sai"}</span>
        </strong>
        {!ok && <span>Đáp án đúng: B</span>}
        <p>{title}</p>
      </div>
      <ChevronDown size={18} />
    </article>
  );
}

function ResultCards() {
  return (
    <div className="result-grid">
      <article className="result-card pass">
        <h3>
          <CheckCircle2 size={21} /> Kết quả: Đạt
        </h3>
        <p>Chúc mừng bạn đã hoàn thành bài kiểm tra chính thức. Kết quả đã được ghi nhận vào hệ thống đào tạo.</p>
        <InfoTable
          rows={[
            ["Bài thi", "Test Quy định HCNS"],
            ["Điểm số", "85/100"],
            ["Trạng thái", "Đạt"]
          ]}
        />
        <div>
          <button className="outline-button">
            <Home size={17} /> Về trang chủ
          </button>
          <button className="primary-button">
            <Eye size={17} /> Xem lại bài làm
          </button>
        </div>
      </article>
      <article className="result-card fail">
        <h3>
          <X size={21} /> Kết quả: Chưa đạt
        </h3>
        <p>Vui lòng liên hệ HR để được hướng dẫn ôn tập và mở lại lượt thi mới.</p>
        <InfoTable
          rows={[
            ["Bài thi", "Test Quy định HCNS"],
            ["Điểm số", "62/100"],
            ["Trạng thái", "Chưa đạt"]
          ]}
        />
        <div>
          <button className="danger-outline-button">
            <BookOpen size={17} /> Quay lại học bài
          </button>
          <button className="danger-outline-button">
            <Mail size={17} /> Gửi yêu cầu thi lại
          </button>
          <button className="danger-outline-button">
            <Clock3 size={17} /> Xem lịch sử làm bài
          </button>
        </div>
      </article>
    </div>
  );
}
