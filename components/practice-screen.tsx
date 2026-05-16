import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HelpCircle,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trophy,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isOfficialLocked, isOfficialPassed, officialResultLabel, officialResultTone } from "@/lib/test-state";
import type { AssignedTest } from "@/lib/types";

type AnswerOption = {
  id: number;
  option_label: string;
  option_text: string;
  is_correct?: boolean;
};

type PracticeQuestion = {
  id: number;
  group_name: string | null;
  question_text: string;
  explanation: string | null;
  difficulty: string;
  answers: AnswerOption[];
};

type PracticeDetail = {
  test: {
    id: number;
    title: string;
    duration_minutes: number;
    pass_score: number;
    allow_unlimited_practice: boolean;
    show_practice_answers: boolean;
  };
  questions: PracticeQuestion[];
};

type AttemptResult = {
  attemptId: number;
  mode: string;
  totalQuestions: number;
  correctAnswers: number;
  score: number;
  resultStatus: string;
};

function getSelectedOption(question: PracticeQuestion | undefined, selectedOptionId: number | undefined) {
  return question?.answers.find((answer) => answer.id === selectedOptionId);
}

function getCorrectOption(question: PracticeQuestion | undefined) {
  return question?.answers.find((answer) => answer.is_correct);
}

export function PracticeScreen({
  test,
  onReview,
  onOfficial,
  onRefreshAssignments
}: {
  test: AssignedTest;
  onReview: () => void;
  onOfficial: () => void;
  onRefreshAssignments: () => Promise<unknown>;
}) {
  const [detail, setDetail] = useState<PracticeDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checkedQuestions, setCheckedQuestions] = useState<Record<number, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const questions = useMemo(() => detail?.questions ?? [], [detail]);
  const activeQuestion = questions[currentIndex];
  const activeAnswerId = activeQuestion ? answers[activeQuestion.id] : undefined;
  const activeIsChecked = Boolean(activeQuestion && checkedQuestions[activeQuestion.id]);
  const activeSelectedOption = getSelectedOption(activeQuestion, activeAnswerId);
  const activeCorrectOption = getCorrectOption(activeQuestion);
  const activeIsCorrect = Boolean(activeSelectedOption?.is_correct);
  const checkedCount = useMemo(
    () => questions.filter((question) => checkedQuestions[question.id]).length,
    [checkedQuestions, questions]
  );
  const completionPercent = questions.length ? Math.round((checkedCount / questions.length) * 100) : 0;
  const canSubmit = questions.length > 0 && checkedCount === questions.length && !isSubmitting;
  const scorePass = result ? result.score >= (detail?.test.pass_score ?? test.passScore) : false;
  const officialDone = isOfficialLocked(test);
  const officialPassed = isOfficialPassed(test);
  const officialTone = officialResultTone(test);

  async function loadPractice() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/test-detail?testId=${test.id}&mode=practice`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải bài làm thử.");
        return;
      }

      setDetail(responseData);
      setAnswers({});
      setCheckedQuestions({});
      setCurrentIndex(0);
      setResult(null);
      setStartedAt(Date.now());
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPractice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test.id]);

  async function submitPractice() {
    if (!canSubmit) {
      setError("Bạn cần chọn đáp án cho tất cả câu hỏi trước khi hoàn thành bài thử.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const response = await fetch("/api/attempts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        testId: test.id,
        mode: "practice",
        timeSpentSeconds: Math.round((Date.now() - startedAt) / 1000),
        answers: questions.map((question) => ({
          questionId: question.id,
          selectedOptionId: answers[question.id] ?? null
        }))
      })
    }).catch(() => null);

    const responseData = await response?.json().catch(() => null);
    setIsSubmitting(false);

    if (!response?.ok) {
      setError(responseData?.error ?? "Không thể nộp bài làm thử.");
      return;
    }

    setResult(responseData);
    await onRefreshAssignments();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function restartPractice() {
    setAnswers({});
    setCheckedQuestions({});
    setCurrentIndex(0);
    setResult(null);
    setStartedAt(Date.now());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectPracticeAnswer(questionId: number, answerId: number) {
    if (checkedQuestions[questionId]) {
      return;
    }

    setAnswers((current) => ({ ...current, [questionId]: answerId }));
    setCheckedQuestions((current) => ({ ...current, [questionId]: true }));
  }

  function goToQuestion(index: number) {
    setCurrentIndex(Math.max(0, Math.min(questions.length - 1, index)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getAnswerClassName(question: PracticeQuestion, answer: AnswerOption) {
    const selected = answers[question.id] === answer.id;
    const checked = Boolean(checkedQuestions[question.id]);
    const classes = [];

    if (selected) {
      classes.push("selected");
    }

    if (checked && answer.is_correct) {
      classes.push("correct-answer");
    }

    if (checked && selected && !answer.is_correct) {
      classes.push("wrong-answer");
    }

    return classes.join(" ");
  }

  function getJumpClassName(question: PracticeQuestion, index: number) {
    const selectedOption = getSelectedOption(question, answers[question.id]);
    const checked = Boolean(checkedQuestions[question.id]);
    const classes = [];

    if (index === currentIndex) {
      classes.push("current");
    }

    if (answers[question.id]) {
      classes.push("answered");
    }

    if (checked) {
      classes.push(selectedOption?.is_correct ? "checked" : "wrong");
    }

    return classes.join(" ");
  }

  return (
    <section className="practice-exam-page">
      <section className="panel practice-hero">
        <span className="large-illustration warm">
          <BookOpen size={64} />
          <Pencil size={26} />
        </span>
        <div>
          <span className="eyebrow">Làm thử từng câu</span>
          <h2>{detail?.test.title ?? test.title}</h2>
          <p>Chọn đáp án cho từng câu, hệ thống sẽ hiện ngay đúng/sai và giải thích trước khi chuyển câu tiếp theo.</p>
        </div>
        <div className="practice-hero-kpis">
          <span>
            <strong>{questions.length || test.questions}</strong>
            Câu hỏi
          </span>
          <span>
            <strong>{checkedCount}</strong>
            Đã chọn
          </span>
          <span>
            <strong>≥ {detail?.test.pass_score ?? test.passScore}</strong>
            Điểm đạt
          </span>
        </div>
      </section>

      {error && <p className="login-error">{error}</p>}

      <section className="practice-workspace">
        <div className="practice-main-panel">
          {result ? (
            <>
              <div className="score-box practice-result-box">
                <Trophy size={64} />
                <div>
                  <span>Điểm làm thử</span>
                  <strong>
                    {Math.round(result.score)}
                    <small>/100</small>
                  </strong>
                </div>
                <p>
                  Đúng {result.correctAnswers}/{result.totalQuestions} câu.{" "}
                  {scorePass
                    ? "Bạn đã đủ điểm để chuyển sang làm chính thức."
                    : "Nên xem lại các câu sai trước khi làm chính thức."}
                </p>
              </div>
              <div className="answer-review practice-review-list">
                {questions.map((question, index) => {
                  const selectedOption = getSelectedOption(question, answers[question.id]);
                  const correctOption = getCorrectOption(question);
                  const ok = Boolean(selectedOption?.is_correct);

                  return (
                    <article key={question.id} id={`practice-question-${question.id}`}>
                      {ok ? <CheckCircle2 size={22} /> : <X size={22} />}
                      <div>
                        <strong>
                          Câu {index + 1} <span className={ok ? "green-text" : "red-text"}>{ok ? "Đúng" : "Sai"}</span>
                        </strong>
                        <p>{question.question_text}</p>
                        <span>
                          Bạn chọn:{" "}
                          {selectedOption ? `${selectedOption.option_label}. ${selectedOption.option_text}` : "Chưa chọn"}
                        </span>
                        {correctOption && (
                          <span>
                            Đáp án đúng: {correctOption.option_label}. {correctOption.option_text}
                          </span>
                        )}
                        {question.explanation && <small>{question.explanation}</small>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="practice-question-list practice-single-card">
              <div className="quiz-progress practice-progress">
                <span>
                  Đã chọn {checkedCount}/{questions.length}
                </span>
                <i>
                  <b style={{ width: `${completionPercent}%` }} />
                </i>
                <span>{completionPercent}%</span>
              </div>

              {isLoading && <p>Đang tải câu hỏi...</p>}

              {activeQuestion && (
                <div className="practice-question-item practice-single-question" id={`practice-question-${activeQuestion.id}`}>
                  <div className="question-heading">
                    <span>Câu {currentIndex + 1}</span>
                    {activeQuestion.group_name && <small>{activeQuestion.group_name}</small>}
                    <small>{activeIsChecked ? "Đã xem đáp án" : "Chưa chọn đáp án"}</small>
                  </div>
                  <p>{activeQuestion.question_text}</p>

                  <div className="practice-answer-stack">
                    {activeQuestion.answers.map((answer) => (
                      <label key={answer.id} className={getAnswerClassName(activeQuestion, answer)}>
                        <input
                          type="radio"
                          name={`practice-${activeQuestion.id}`}
                          disabled={activeIsChecked}
                          checked={activeAnswerId === answer.id}
                          onChange={() => selectPracticeAnswer(activeQuestion.id, answer.id)}
                        />
                        <span>
                          {answer.option_label}. {answer.option_text}
                        </span>
                      </label>
                    ))}
                  </div>

                  {activeIsChecked && (
                    <div className={`practice-feedback ${activeIsCorrect ? "correct" : "wrong"}`}>
                      {activeIsCorrect ? <CheckCircle2 size={22} /> : <X size={22} />}
                      <div>
                        <strong>{activeIsCorrect ? "Đúng" : "Chưa đúng"}</strong>
                        {activeCorrectOption && (
                          <p>
                            Đáp án đúng: {activeCorrectOption.option_label}. {activeCorrectOption.option_text}
                          </p>
                        )}
                        {activeQuestion.explanation && <p>{activeQuestion.explanation}</p>}
                      </div>
                    </div>
                  )}

                  <div className="practice-question-actions">
                    <button className="outline-button" onClick={() => goToQuestion(currentIndex - 1)} disabled={currentIndex === 0}>
                      <ChevronLeft size={17} /> Câu trước
                    </button>
                    {!activeIsChecked ? (
                      <button className="primary-button" disabled>
                        <CheckCircle2 size={17} /> Chọn đáp án để xem kết quả
                      </button>
                    ) : currentIndex < questions.length - 1 ? (
                      <button className="primary-button" onClick={() => goToQuestion(currentIndex + 1)}>
                        Câu tiếp theo <ChevronRight size={17} />
                      </button>
                    ) : (
                      <button className="primary-button" onClick={submitPractice} disabled={!canSubmit}>
                        <CheckCircle2 size={17} /> {isSubmitting ? "Đang lưu" : "Hoàn thành bài thử"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!isLoading && !questions.length && <p>Bài test này chưa có câu hỏi đang hoạt động.</p>}
            </div>
          )}
        </div>

        <aside className="practice-side-card">
          <div>
            <h3>Tiến độ làm thử</h3>
            <p>
              {result
                ? "Xem lại toàn bộ câu đã làm và phần giải thích."
                : "Chọn đáp án là hệ thống hiện kết quả ngay. Làm đủ các câu để hoàn thành bài thử."}
            </p>
          </div>
          <div className="side-progress-ring">
            <strong>{result ? Math.round(result.score) : completionPercent}</strong>
            <span>{result ? "điểm" : "% hoàn thành"}</span>
          </div>
          <div className="question-jump-grid">
            {questions.map((question, index) => (
              <button
                key={question.id}
                type="button"
                className={getJumpClassName(question, index)}
                onClick={() => goToQuestion(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="practice-side-actions">
            {result ? (
              <>
                <button className="warm-button" onClick={restartPractice}>
                  <RefreshCw size={17} /> Làm thử lại
                </button>
                <button
                  className={officialDone ? `official-result-button ${officialTone}` : "primary-button"}
                  onClick={onOfficial}
                  disabled={officialDone}
                >
                  {officialDone ? officialPassed ? <CheckCircle2 size={17} /> : <X size={17} /> : <ShieldCheck size={17} />}
                  {officialDone ? officialResultLabel(test) : "Làm chính thức"}
                </button>
              </>
            ) : (
              <>
                <button className="primary-button" onClick={submitPractice} disabled={!canSubmit}>
                  <CheckCircle2 size={17} /> {isSubmitting ? "Đang lưu" : "Hoàn thành bài thử"}
                </button>
                <button className="outline-button" onClick={loadPractice}>
                  <RefreshCw size={17} /> Làm lại từ đầu
                </button>
              </>
            )}
            <button className="outline-button" onClick={onReview}>
              <HelpCircle size={17} /> Chi tiết bài test
            </button>
          </div>
          <div className="practice-note">
            <Clock3 size={17} />
            <span>Làm thử không ghi vào điểm chính thức. Bài chính thức sẽ không hiển thị đáp án.</span>
          </div>
        </aside>
      </section>
    </section>
  );
}
