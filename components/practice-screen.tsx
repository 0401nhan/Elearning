import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  HelpCircle,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  X
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OFFICIAL_RETAKE_COOLDOWN_MESSAGE,
  getNextOfficialAvailableAt,
  hasOfficialCooldown,
  isOfficialLocked,
  isOfficialPassed,
  officialResultLabel,
  officialResultTone
} from "@/lib/test-state";
import type { AssignedTest } from "@/lib/types";
import { QuestionMedia } from "./question-media";

type AnswerOption = {
  id: number;
  option_label: string;
  option_text: string;
  image_url: string | null;
  is_correct?: boolean;
};

type PracticeQuestion = {
  id: number;
  group_name: string | null;
  question_text: string;
  image_url: string | null;
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
  passScore: number;
  resultStatus: string;
};

type AnswerPulse = {
  questionId: number;
  answerId: number;
  tone: "correct" | "wrong" | "selected";
};

function getSelectedOption(question: PracticeQuestion | undefined, selectedOptionId: number | undefined) {
  return question?.answers.find((answer) => answer.id === selectedOptionId);
}

function getCorrectOption(question: PracticeQuestion | undefined) {
  return question?.answers.find((answer) => answer.is_correct);
}

function formatOptionSummary(option: AnswerOption | undefined) {
  if (!option) {
    return "";
  }

  const text = option.option_text.trim();
  return text ? `${option.option_label}. ${text}` : option.option_label;
}

function getPracticeExplanation(question: PracticeQuestion) {
  const explanation = question.explanation?.trim();
  if (explanation) {
    return explanation.replace(/^Giải thích:\s*/i, "");
  }

  return null;
}

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<number, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [answerPulse, setAnswerPulse] = useState<AnswerPulse | null>(null);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeQuestionRef = useRef<HTMLDivElement | null>(null);
  const activeFeedbackRef = useRef<HTMLDivElement | null>(null);
  const pendingQuestionFocusRef = useRef(false);
  const pendingFeedbackFocusRef = useRef(false);
  const focusActiveQuestion = useCallback(() => {
    window.requestAnimationFrame(() => {
      const element = activeQuestionRef.current;
      if (!element) {
        return;
      }

      element.focus({ preventScroll: true });
      element.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    });
  }, []);
  const focusActiveFeedback = useCallback(() => {
    window.requestAnimationFrame(() => {
      const element = activeFeedbackRef.current;
      if (!element) {
        return;
      }

      const isSmallScreen = window.matchMedia("(max-width: 820px)").matches;
      element.focus({ preventScroll: true });
      element.scrollIntoView({
        behavior: "smooth",
        block: isSmallScreen ? "center" : "nearest",
        inline: "nearest"
      });
    });
  }, []);

  const questions = useMemo(() => detail?.questions ?? [], [detail]);
  const revealPracticeAnswers = Boolean(detail?.test.show_practice_answers);
  const activeQuestion = questions[currentIndex];
  const activeAnswerId = activeQuestion ? answers[activeQuestion.id] : undefined;
  const activeIsChecked = Boolean(activeQuestion && checkedQuestions[activeQuestion.id]);
  const activeIsFlagged = Boolean(activeQuestion && flaggedQuestions[activeQuestion.id]);
  const activeSelectedOption = getSelectedOption(activeQuestion, activeAnswerId);
  const activeCorrectOption = revealPracticeAnswers ? getCorrectOption(activeQuestion) : undefined;
  const activeIsCorrect = revealPracticeAnswers && Boolean(activeSelectedOption?.is_correct);
  const activeExplanation =
    revealPracticeAnswers && activeQuestion
      ? getPracticeExplanation(activeQuestion)
      : null;
  const checkedCount = useMemo(
    () => questions.filter((question) => checkedQuestions[question.id]).length,
    [checkedQuestions, questions]
  );
  const flaggedCount = useMemo(
    () => questions.filter((question) => flaggedQuestions[question.id]).length,
    [flaggedQuestions, questions]
  );
  const completionPercent = questions.length ? Math.round((checkedCount / questions.length) * 100) : 0;
  const canSubmit = questions.length > 0 && checkedCount === questions.length && !isSubmitting;
  const scorePass = result ? result.score >= result.passScore : false;
  const officialDone = isOfficialLocked(test);
  const officialPassed = isOfficialPassed(test);
  const officialTone = officialResultTone(test);
  const officialCooldown = hasOfficialCooldown(test);
  const nextOfficialAt = getNextOfficialAvailableAt(test);
  const canRestartAfterResult = true;
  const ringValue = result ? Math.round(result.score) : completionPercent;
  const ringStyle = { "--ring-progress": `${Math.max(0, Math.min(100, ringValue))}%` } as CSSProperties;
  const streakLabel = correctStreak >= 2 ? `${correctStreak} câu đúng liên tiếp` : "Đang luyện tập";

  async function loadPractice() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/test-detail?testId=${test.id}&mode=practice&startPractice=1`, { cache: "no-store" });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseData?.error ?? "Không thể tải bài làm thử.");
        return;
      }

      setDetail(responseData);
      setAnswers({});
      setCheckedQuestions({});
      setFlaggedQuestions({});
      setCurrentIndex(0);
      setResult(null);
      setStartedAt(Date.now());
      setElapsedSeconds(0);
      setAnswerPulse(null);
      setCorrectStreak(0);
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

  useEffect(() => {
    if (result) {
      return;
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [result, startedAt]);

  useEffect(() => {
    if (!pendingQuestionFocusRef.current || !activeQuestion) {
      return;
    }

    pendingQuestionFocusRef.current = false;
    focusActiveQuestion();
  }, [activeQuestion, focusActiveQuestion]);

  useEffect(() => {
    if (!pendingFeedbackFocusRef.current || !activeQuestion || !activeIsChecked) {
      return;
    }

    pendingFeedbackFocusRef.current = false;
    focusActiveFeedback();
  }, [activeIsChecked, activeQuestion, focusActiveFeedback]);

  async function submitPractice() {
    if (!canSubmit) {
      setError("Bạn cần xác nhận đáp án cho tất cả câu hỏi trước khi hoàn thành bài thử.");
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

    setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000));
    setResult(responseData);
    await onRefreshAssignments();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function restartPractice() {
    setAnswers({});
    setCheckedQuestions({});
    setFlaggedQuestions({});
    setCurrentIndex(0);
    setResult(null);
    setStartedAt(Date.now());
    setElapsedSeconds(0);
    setAnswerPulse(null);
    setCorrectStreak(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectPracticeAnswer(questionId: number, answerId: number) {
    if (checkedQuestions[questionId]) {
      return;
    }

    setError("");
    setAnswers((current) => ({ ...current, [questionId]: answerId }));
    setAnswerPulse({ questionId, answerId, tone: "selected" });

    window.setTimeout(() => {
      setAnswerPulse((current) =>
        current?.questionId === questionId && current.answerId === answerId ? null : current
      );
    }, 420);
  }

  function confirmPracticeAnswer(questionId: number) {
    if (checkedQuestions[questionId]) {
      return;
    }

    const answerId = answers[questionId];
    if (!answerId) {
      setError("Chọn một đáp án rồi bấm xác nhận.");
      return;
    }

    const question = questions.find((item) => item.id === questionId);
    const selectedAnswer = question?.answers.find((answer) => answer.id === answerId);
    const pulseTone = revealPracticeAnswers ? (selectedAnswer?.is_correct ? "correct" : "wrong") : "selected";

    setError("");
    pendingFeedbackFocusRef.current = true;
    setCheckedQuestions((current) => ({ ...current, [questionId]: true }));
    setAnswerPulse({ questionId, answerId, tone: pulseTone });

    if (revealPracticeAnswers) {
      setCorrectStreak((current) => (selectedAnswer?.is_correct ? current + 1 : 0));
    }

    window.setTimeout(() => {
      setAnswerPulse((current) =>
        current?.questionId === questionId && current.answerId === answerId ? null : current
      );
    }, 780);
  }

  function toggleQuestionFlag(questionId: number) {
    setFlaggedQuestions((current) => ({
      ...current,
      [questionId]: !current[questionId]
    }));
  }

  function goToQuestion(index: number) {
    const nextIndex = Math.max(0, Math.min(questions.length - 1, index));
    pendingQuestionFocusRef.current = true;

    if (nextIndex === currentIndex) {
      pendingQuestionFocusRef.current = false;
      focusActiveQuestion();
      return;
    }

    setCurrentIndex(nextIndex);
  }

  function getAnswerClassName(question: PracticeQuestion, answer: AnswerOption) {
    const selected = answers[question.id] === answer.id;
    const checked = Boolean(checkedQuestions[question.id]);
    const classes = [];

    if (selected) {
      classes.push("selected");
    }

    if (answerPulse?.questionId === question.id && answerPulse.answerId === answer.id) {
      classes.push(`answer-pop-${answerPulse.tone}`);
    }

    if (revealPracticeAnswers && checked && answer.is_correct) {
      classes.push("correct-answer");
    }

    if (revealPracticeAnswers && checked && selected && !answer.is_correct) {
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

    if (flaggedQuestions[question.id]) {
      classes.push("flagged");
    }

    if (checked) {
      classes.push("answered");
    } else if (answers[question.id]) {
      classes.push("draft");
    }

    if (checked && revealPracticeAnswers) {
      classes.push(selectedOption?.is_correct ? "checked" : "wrong");
    } else if (checked) {
      classes.push("checked");
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
          <p>
            {revealPracticeAnswers
              ? "Chọn đáp án, bấm xác nhận để xem đúng/sai và giải thích trước khi chuyển câu tiếp theo."
              : "Chọn đáp án, bấm xác nhận cho từng câu và hoàn thành bài thử để xem điểm tổng kết."}
          </p>
          <span className={`quiz-live-badge ${correctStreak >= 3 ? "hot" : ""}`}>
            <Sparkles size={15} />
            {streakLabel}
          </span>
        </div>
        <div className="practice-hero-kpis">
          <span>
            <strong>{questions.length || test.questions}</strong>
            Câu hỏi
          </span>
          <span>
            <strong>{checkedCount}</strong>
            Đã xác nhận
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
              <div className={`score-box practice-result-box ${scorePass ? "is-pass" : "is-review"}`}>
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
                    : revealPracticeAnswers
                      ? "Nên xem lại các câu sai trước khi làm chính thức."
                      : "Nên ôn lại tài liệu trước khi làm chính thức."}
                </p>
              </div>
              <div className="answer-review practice-review-list">
                {questions.map((question, index) => {
                  const selectedOption = getSelectedOption(question, answers[question.id]);
                  const correctOption = revealPracticeAnswers ? getCorrectOption(question) : undefined;
                  const ok = revealPracticeAnswers && Boolean(selectedOption?.is_correct);
                  const explanation = revealPracticeAnswers ? getPracticeExplanation(question) : null;

                  return (
                    <article
                      key={question.id}
                      id={`practice-question-${question.id}`}
                      style={{ "--review-index": index } as CSSProperties}
                    >
                      {revealPracticeAnswers ? ok ? <CheckCircle2 size={22} /> : <X size={22} /> : <HelpCircle size={22} />}
                      <div>
                        <strong>
                          Câu {index + 1}{" "}
                          {revealPracticeAnswers && (
                            <span className={ok ? "green-text" : "red-text"}>{ok ? "Đúng" : "Sai"}</span>
                          )}
                        </strong>
                        <p>{question.question_text}</p>
                        <QuestionMedia
                          src={question.image_url}
                          alt={`Ảnh câu hỏi ${index + 1}`}
                          variant="question"
                        />
                        <span>
                          Bạn chọn:{" "}
                          {selectedOption ? `${selectedOption.option_label}. ${selectedOption.option_text}` : "Chưa chọn"}
                        </span>
                        {revealPracticeAnswers && correctOption && (
                          <span>
                            Đáp án đúng: {formatOptionSummary(correctOption)}
                          </span>
                        )}
                        {selectedOption?.image_url && (
                          <QuestionMedia
                            src={selectedOption.image_url}
                            alt={`Ảnh đáp án đã chọn ${selectedOption.option_label}`}
                            variant="answer"
                          />
                        )}
                        {revealPracticeAnswers && correctOption?.image_url && (
                          <QuestionMedia
                            src={correctOption.image_url}
                            alt={`Ảnh đáp án đúng ${correctOption.option_label}`}
                            variant="answer"
                          />
                        )}
                        {explanation && (
                          <small>
                            <strong>Giải thích:</strong> {explanation}
                          </small>
                        )}
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
                  Đã xác nhận {checkedCount}/{questions.length}
                </span>
                <i>
                  <b style={{ width: `${completionPercent}%` }} />
                </i>
                <span>{completionPercent}%</span>
              </div>

              {isLoading && <p>Đang tải câu hỏi...</p>}

              {activeQuestion && (
                <div
                  ref={activeQuestionRef}
                  key={activeQuestion.id}
                  className="practice-question-item practice-single-question question-card-enter"
                  id={`practice-question-${activeQuestion.id}`}
                  tabIndex={-1}
                >
                  <div className="question-heading">
                    <span>Câu {currentIndex + 1}</span>
                    {activeQuestion.group_name && <small>{activeQuestion.group_name}</small>}
                    <small>
                      {activeIsChecked
                        ? revealPracticeAnswers
                          ? "Đã xem đáp án"
                          : "Đã xác nhận đáp án"
                        : activeAnswerId
                          ? "Đã chọn, chờ xác nhận"
                          : "Chưa chọn đáp án"}
                    </small>
                    <button
                      type="button"
                      className={`flag-button ${activeIsFlagged ? "active" : ""}`}
                      onClick={() => toggleQuestionFlag(activeQuestion.id)}
                    >
                      <Flag size={15} /> {activeIsFlagged ? "Đã đánh dấu" : "Đánh dấu"}
                    </button>
                  </div>
                  <p>{activeQuestion.question_text}</p>
                  <QuestionMedia
                    src={activeQuestion.image_url}
                    alt={`Ảnh câu hỏi ${currentIndex + 1}`}
                    variant="question"
                  />

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
                        <span className="answer-choice-content">
                          <b>{answer.option_label}.</b>
                          {answer.option_text && <span>{answer.option_text}</span>}
                          <QuestionMedia
                            src={answer.image_url}
                            alt={`Ảnh đáp án ${answer.option_label}`}
                            variant="answer"
                          />
                        </span>
                      </label>
                    ))}
                  </div>

                  {revealPracticeAnswers && activeIsChecked && (
                    <div
                      ref={activeFeedbackRef}
                      className={`practice-feedback ${activeIsCorrect ? "correct" : "wrong"}`}
                      tabIndex={-1}
                    >
                      {activeIsCorrect ? <CheckCircle2 size={22} /> : <X size={22} />}
                      <div>
                        <strong>{activeIsCorrect ? "Đúng" : "Chưa đúng"}</strong>
                        {activeCorrectOption && (
                          <p>
                            <strong>Đáp án đúng:</strong> {formatOptionSummary(activeCorrectOption)}
                          </p>
                        )}
                        {activeCorrectOption?.image_url && (
                          <QuestionMedia
                            src={activeCorrectOption.image_url}
                            alt={`Ảnh đáp án đúng ${activeCorrectOption.option_label}`}
                            variant="answer"
                          />
                        )}
                        {activeExplanation && (
                          <p>
                            <strong>Giải thích:</strong> {activeExplanation}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="practice-question-actions">
                    <button className="outline-button" onClick={() => goToQuestion(currentIndex - 1)} disabled={currentIndex === 0}>
                      <ChevronLeft size={17} /> Câu trước
                    </button>
                    {!activeIsChecked ? (
                      <button
                        className="primary-button"
                        onClick={() => confirmPracticeAnswer(activeQuestion.id)}
                        disabled={!activeAnswerId}
                      >
                        <CheckCircle2 size={17} /> Xác nhận đáp án
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
                ? revealPracticeAnswers
                  ? "Xem lại toàn bộ câu đã làm và phần giải thích."
                  : "Xem lại các lựa chọn đã làm trong bài thử."
                : revealPracticeAnswers
                  ? "Xác nhận từng câu để xem kết quả. Có thể đánh dấu câu còn phân vân để quay lại."
                  : "Xác nhận đủ các câu để hoàn thành bài thử. Có thể đánh dấu câu còn phân vân để quay lại."}
            </p>
          </div>
          <div className={`side-progress-ring ${result ? "score-ring" : ""}`} style={ringStyle}>
            <strong>{result ? Math.round(result.score) : completionPercent}</strong>
            <span>{result ? "điểm" : "% hoàn thành"}</span>
          </div>
          <div className="practice-elapsed-timer">
            <Clock3 size={18} />
            <div>
              <strong>{formatElapsed(elapsedSeconds)}</strong>
              <span>{result ? "Thời gian đã làm" : "Thời gian làm bài"}</span>
            </div>
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
          <div className="question-jump-legend">
            <span>
              <i className="legend-done" /> Hoàn thành
            </span>
            <span>
              <i className="legend-draft" /> Chờ xác nhận
            </span>
            <span>
              <i className="legend-flag" /> Đánh dấu {flaggedCount ? `(${flaggedCount})` : ""}
            </span>
          </div>
          <div className="practice-side-actions">
            {result ? (
              <>
                <button className="warm-button" onClick={restartPractice} disabled={!canRestartAfterResult}>
                  <RefreshCw size={17} /> Làm thử lại
                </button>
                <div className="official-action-stack">
                  <button
                    className={officialDone ? `official-result-button ${officialTone}` : "primary-button"}
                    onClick={onOfficial}
                    disabled={officialDone}
                  >
                    {officialDone ? officialPassed ? <CheckCircle2 size={17} /> : <X size={17} /> : <ShieldCheck size={17} />}
                    {officialDone ? officialResultLabel(test) : "Làm chính thức"}
                  </button>
                  {officialCooldown && (
                    <span className="official-cooldown-note">
                      {OFFICIAL_RETAKE_COOLDOWN_MESSAGE}
                      {nextOfficialAt ? ` (${new Date(nextOfficialAt.replace(" ", "T")).toLocaleDateString("vi-VN")})` : ""}
                    </span>
                  )}
                </div>
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
