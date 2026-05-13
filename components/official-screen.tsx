import { CheckCircle2, ChevronDown, Clock3 } from "lucide-react";
import type { Question } from "@/lib/types";

export function OfficialScreen({
  question,
  selectedAnswer,
  setSelectedAnswer,
  onHome
}: {
  question: Question;
  selectedAnswer: number;
  setSelectedAnswer: (answer: number) => void;
  onHome: () => void;
}) {
  return (
    <section className="official-exam">
      <div className="exam-card">
        <header>
          <div>
            <span>Bài thi chính thức</span>
            <h2>Test Quy định HCNS</h2>
          </div>
          <div className="timer">
            <Clock3 size={28} />
            <span>20:00</span>
          </div>
        </header>
        <div className="quiz-progress large">
          <span>Câu 12/40</span>
          <i>
            <b style={{ width: "30%" }} />
          </i>
          <span>30%</span>
        </div>
        <div className="question-box">
          <h3>Câu {question.id + 11}. {question.title}</h3>
          {question.answers.map((answer, index) => (
            <label key={answer} className={selectedAnswer === index ? "selected" : ""}>
              <input
                type="radio"
                checked={selectedAnswer === index}
                onChange={() => setSelectedAnswer(index)}
              />
              <span>{String.fromCharCode(65 + index)}. {answer}</span>
            </label>
          ))}
        </div>
        <footer>
          <button className="outline-button">
            <ChevronDown size={17} /> Câu trước
          </button>
          <button className="primary-button" onClick={onHome}>
            <CheckCircle2 size={17} /> Nộp bài
          </button>
        </footer>
      </div>
    </section>
  );
}
