import { HelpCircle, Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";

const faqs = [
  ["Tôi không đăng nhập được?", "Kiểm tra họ tên không dấu và số điện thoại đã đăng ký với HCNS."],
  ["Làm thử có giới hạn số lần không?", "Không. Lượt làm thử dùng để ôn tập và không ghi vào KPI chính thức."],
  ["Không đạt bài chính thức thì làm gì?", "Học lại tài liệu và gửi yêu cầu để HR/Quản lý mở lượt thi mới."],
  ["Có xem đáp án sau bài chính thức không?", "Hệ thống không hiển thị ngay đáp án bài chính thức để đảm bảo đánh giá minh bạch."]
];

const supportLinks = {
  hcns: "https://zalo.me/0356046857",
  hse: "https://zalo.me/0962009795",
  it: "https://zalo.me/0386224353"
};

export function SupportPage() {
  return (
    <>
      <section className="page-header">
        <div>
          <h2>Hỗ trợ</h2>
          <p>Kênh hỗ trợ khi gặp lỗi đăng nhập, tài liệu, bài test hoặc yêu cầu mở lượt thi.</p>
        </div>
      </section>

      <section className="support-grid">
        <article className="panel support-card">
          <Mail size={34} />
          <h3>HCNS</h3>
          <p>Hỗ trợ thông tin nhân sự, quyền làm bài và mở lượt thi lại.</p>
          <a className="primary-button" href={supportLinks.hcns} target="_blank" rel="noreferrer">
            Gửi yêu cầu
          </a>
        </article>
        <article className="panel support-card">
          <ShieldCheck size={34} />
          <h3>HSE</h3>
          <p>Giải đáp tài liệu HSE, checklist hiện trường và quy trình an toàn.</p>
          <a className="outline-button" href={supportLinks.hse} target="_blank" rel="noreferrer">
            Liên hệ HSE
          </a>
        </article>
        <article className="panel support-card">
          <Phone size={34} />
          <h3>IT hỗ trợ</h3>
          <p>Xử lý lỗi hệ thống, trình duyệt, dữ liệu và tài khoản đăng nhập.</p>
          <a className="outline-button" href={supportLinks.it} target="_blank" rel="noreferrer">
            Báo lỗi
          </a>
        </article>
      </section>

      <section className="panel">
        <div className="section-title">
          <h3>Câu hỏi thường gặp</h3>
          <HelpCircle size={20} />
        </div>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <article key={question}>
              <MessageCircle size={20} />
              <div>
                <strong>{question}</strong>
                <p>{answer}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
