import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Home,
  ListChecks,
  RefreshCw,
  Save,
  ShieldCheck,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canStartOfficialAttempt, isOfficialLocked, isOfficialPassed, officialResultLabel } from "@/lib/test-state";
import type { AssignedTest } from "@/lib/types";
import { QuestionMedia } from "./question-media";
import { InfoTable } from "./shared";

type AnswerOption = {
  id: number;
  option_label: string;
  option_text: string;
  image_url: string | null;
};

type OfficialQuestion = {
  id: number;
  question_text: string;
  image_url: string | null;
  answers: AnswerOption[];
};

type OfficialDetail = {
  attempt: {
    id: number;
    attemptNo: number;
    startedAt: string;
    elapsedSeconds: number;
    remainingSeconds: number;
  };
  savedAnswers: {
    questionId: number;
    selectedOptionId: number | null;
  }[];
  test: {
    id: number;
    title: string;
    duration_minutes: number;
    pass_score: number;
    max_official_attempts: number;
    official_attempts_used: number;
    assignment_status: string | null;
    official_score: number | null;
  };
  questions: OfficialQuestion[];
};

type AttemptResult = {
  attemptId: number;
  totalQuestions: number;
  correctAnswers: number;
  score: number;
  passScore: number;
  resultStatus: string;
};

type DraftSaveState = "idle" | "saving" | "saved" | "error";

function formatRemaining(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function hasPendingRetakeRequest(test: AssignedTest) {
  return test.retakeRequestStatus === "pending";
}

function retakeButtonLabel(test: AssignedTest, isRequesting: boolean, hasPendingRequest: boolean) {
  if (isRequesting) {
    return "Đang gửi";
  }

  if (hasPendingRequest) {
    return "Đã gửi yêu cầu";
  }

  return "Gửi yêu cầu thi lại";
}

export function OfficialScreen({
  test,
  onAttemptStarted,
  onAttemptFinished,
  onHome,
  onRefreshAssignments
}: {
  test: AssignedTest;
  onAttemptStarted?: (testId: number) => void;
  onAttemptFinished?: () => void;
  onHome: () => void;
  onRefreshAssignments: () => Promise<unknown>;
}) {
  const [detail, setDetail] = useState<OfficialDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<number, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(test.minutes * 60);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState("");
  const [retakeMessage, setRetakeMessage] = useState("");
  const [retakeError, setRetakeError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingRetake, setIsRequestingRetake] = useState(false);
  const [hasSubmittedRetakeRequest, setHasSubmittedRetakeRequest] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [answerPulse, setAnswerPulse] = useState<{ questionId: number; answerId: number } | null>(null);
  const autoSubmitRef = useRef(false);
  const deadlineAtRef = useRef<number | null>(null);
  const activeQuestionRef = useRef<HTMLDivElement | null>(null);
  const pendingQuestionFocusRef = useRef(false);
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

  const questions = useMemo(() => detail?.questions ?? [], [detail]);
  const activeQuestion = questions[currentIndex];
  const activeIsFlagged = Boolean(activeQuestion && flaggedQuestions[activeQuestion.id]);
  const answeredCount = useMemo(() => questions.filter((question) => answers[question.id]).length, [answers, questions]);
  const flaggedCount = useMemo(
    () => questions.filter((question) => flaggedQuestions[question.id]).length,
    [flaggedQuestions, questions]
  );
  const unansweredCount = Math.max(0, questions.length - answeredCount);
  const progressPercent = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const durationSeconds = (detail?.test.duration_minutes ?? test.minutes) * 60;
  const timePercent = durationSeconds ? Math.round((remainingSeconds / durationSeconds) * 100) : 0;
  const timeAlertLevel = remainingSeconds <= 60 ? "critical" : remainingSeconds <= 120 ? "warning" : "steady";
  const draftSaveLabel =
    draftSaveState === "saving"
      ? "Đang tự lưu"
      : draftSaveState === "saved"
        ? `Đã lưu ${lastSavedAt}`
        : draftSaveState === "error"
          ? "Lưu nháp lỗi"
          : "Sẵn sàng tự lưu";
  const officialState = detail
    ? {
        status: detail.test.assignment_status,
        officialScore: detail.test.official_score,
        passScore: detail.test.pass_score,
        officialAttemptsUsed: detail.test.official_attempts_used,
        maxOfficialAttempts: detail.test.max_official_attempts
      }
    : test;
  const canStartOfficial = canStartOfficialAttempt(officialState);
  const officialDone = isOfficialLocked(officialState);
  const officialPassed = isOfficialPassed(officialState);
  const noOfficialAttempts = Boolean(detail && !canStartOfficial && !result && !officialDone);
  const pendingRetakeRequestExists = hasSubmittedRetakeRequest || hasPendingRetakeRequest(test);
  const attemptLimitLabel = detail
    ? `${detail.test.official_attempts_used}/${detail.test.max_official_attempts} lượt`
    : `${test.officialAttemptsUsed ?? 0}/${test.maxOfficialAttempts ?? 1} lượt`;

  async function loadOfficial() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/attempts/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          testId: test.id,
          mode: "official"
        })
      });
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 409) {
          onAttemptFinished?.();
        }
        setError(responseData?.error ?? "Không thể tải bài chính thức.");
        return;
      }

      autoSubmitRef.current = false;
      setDetail(responseData);
      onAttemptStarted?.(Number(responseData?.test?.id ?? test.id));
      setAnswers(
        Object.fromEntries(
          (responseData?.savedAnswers ?? [])
            .filter((answer: { questionId: number; selectedOptionId: number | null }) => answer.selectedOptionId)
            .map((answer: { questionId: number; selectedOptionId: number }) => [answer.questionId, answer.selectedOptionId])
        )
      );
      setCurrentIndex(0);
      setResult(null);
      setFlaggedQuestions({});
      setDraftSaveState("idle");
      setLastSavedAt("");
      setAnswerPulse(null);
      const remaining = responseData?.attempt?.remainingSeconds ?? (responseData?.test?.duration_minutes ?? test.minutes) * 60;
      deadlineAtRef.current = Date.now() + remaining * 1000;
      setRemainingSeconds(remaining);
    } catch {
      setError("Không thể kết nối hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }

  const submitOfficial = useCallback(
    async (autoSubmit = false) => {
      if (isSubmitting || result || noOfficialAttempts || questions.length === 0 || !detail?.attempt.id) {
        return;
      }

      setIsSubmitting(true);
      setError(autoSubmit ? "Hết giờ, hệ thống đang nộp bài..." : "");

      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          attemptId: detail.attempt.id,
          mode: "official",
          timeSpentSeconds: autoSubmit ? durationSeconds : Math.max(0, durationSeconds - remainingSeconds),
          answers: questions.map((question) => ({
            questionId: question.id,
            selectedOptionId: answers[question.id] ?? null
          }))
        })
      }).catch(() => null);

      const responseData = await response?.json().catch(() => null);
      setIsSubmitting(false);

      if (!response?.ok) {
        setError(responseData?.error ?? "Không thể nộp bài chính thức.");
        return;
      }

      setResult(responseData);
      onAttemptFinished?.();
      await onRefreshAssignments();
    },
    [
      answers,
      detail?.attempt.id,
      durationSeconds,
      isSubmitting,
      noOfficialAttempts,
      onAttemptFinished,
      onRefreshAssignments,
      questions,
      remainingSeconds,
      result
    ]
  );

  useEffect(() => {
    setHasSubmittedRetakeRequest(false);
    loadOfficial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test.id]);

  useEffect(() => {
    if (officialDone || noOfficialAttempts) {
      onAttemptFinished?.();
    }
  }, [noOfficialAttempts, officialDone, onAttemptFinished]);

  useEffect(() => {
    if (!detail || result || noOfficialAttempts || questions.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      const deadlineAt = deadlineAtRef.current;
      if (!deadlineAt) {
        return;
      }

      setRemainingSeconds(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [detail, noOfficialAttempts, questions.length, result]);

  useEffect(() => {
    if (remainingSeconds > 0 || autoSubmitRef.current || result || noOfficialAttempts || questions.length === 0) {
      return;
    }

    autoSubmitRef.current = true;
    void submitOfficial(true);
  }, [noOfficialAttempts, questions.length, remainingSeconds, result, submitOfficial]);

  useEffect(() => {
    if (!pendingQuestionFocusRef.current || !activeQuestion) {
      return;
    }

    pendingQuestionFocusRef.current = false;
    focusActiveQuestion();
  }, [activeQuestion, focusActiveQuestion]);

  const goToQuestion = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(questions.length - 1, index));
      pendingQuestionFocusRef.current = true;

      if (nextIndex === currentIndex) {
        pendingQuestionFocusRef.current = false;
        focusActiveQuestion();
        return;
      }

      setCurrentIndex(nextIndex);
    },
    [currentIndex, focusActiveQuestion, questions.length]
  );

  function handleSubmitOfficial() {
    if (unansweredCount > 0) {
      const confirmed = window.confirm(
        `Bạn còn ${unansweredCount} câu chưa trả lời. Các câu trống sẽ được tính là sai. Vẫn nộp bài?`
      );

      if (!confirmed) {
        return;
      }
    }

    void submitOfficial();
  }

  const selectOfficialAnswer = useCallback((questionId: number, answerId: number) => {
    setAnswers((current) => ({ ...current, [questionId]: answerId }));
    setAnswerPulse({ questionId, answerId });

    window.setTimeout(() => {
      setAnswerPulse((current) =>
        current?.questionId === questionId && current.answerId === answerId ? null : current
      );
    }, 620);

    if (!detail?.attempt.id) {
      return;
    }

    setDraftSaveState("saving");
    fetch("/api/attempts/draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        attemptId: detail.attempt.id,
        questionId,
        selectedOptionId: answerId
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          const responseData = await response.json().catch(() => null);
          setDraftSaveState("error");
          setError(responseData?.error ?? "Không thể lưu nháp đáp án.");
          return;
        }

        setDraftSaveState("saved");
        setLastSavedAt(
          new Intl.DateTimeFormat("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }).format(new Date())
        );
      })
      .catch(() => {
        setDraftSaveState("error");
        setError("Không thể lưu nháp đáp án.");
      });
  }, [detail?.attempt.id]);

  function toggleQuestionFlag(questionId: number) {
    setFlaggedQuestions((current) => ({
      ...current,
      [questionId]: !current[questionId]
    }));
  }

  function getJumpClassName(question: OfficialQuestion, index: number) {
    const classes = [];

    if (index === currentIndex) {
      classes.push("current");
    }

    if (answers[question.id]) {
      classes.push("answered");
    }

    if (flaggedQuestions[question.id]) {
      classes.push("flagged");
    }

    return classes.join(" ");
  }

  useEffect(() => {
    if (!activeQuestion || result || noOfficialAttempts || isSubmitting) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;

      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || tagName === "BUTTON") {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToQuestion(currentIndex - 1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToQuestion(currentIndex + 1);
        return;
      }

      const optionIndex = Number(event.key) - 1;
      const option = Number.isInteger(optionIndex) ? activeQuestion.answers[optionIndex] : null;
      if (option) {
        event.preventDefault();
        selectOfficialAnswer(activeQuestion.id, option.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeQuestion, currentIndex, goToQuestion, isSubmitting, noOfficialAttempts, questions.length, result, selectOfficialAnswer]);

  async function requestRetake() {
    if (pendingRetakeRequestExists) {
      setRetakeMessage("Yêu cầu thi lại của bài này đã được gửi và đang chờ duyệt.");
      setRetakeError("");
      return;
    }

    setRetakeMessage("");
    setRetakeError("");
    setIsRequestingRetake(true);

    const response = await fetch("/api/retake-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        testId: test.id,
        reason: `Xin mở lại lượt thi chính thức cho bài ${detail?.test.title ?? test.title}.`
      })
    }).catch(() => null);
    const responseData = await response?.json().catch(() => null);
    setIsRequestingRetake(false);

    if (!response?.ok) {
      setRetakeError(responseData?.error ?? "Không thể gửi yêu cầu thi lại.");
      return;
    }

    setHasSubmittedRetakeRequest(true);
    setRetakeMessage(responseData?.message ?? "Yêu cầu thi lại đã được gửi và đang chờ duyệt.");
    await onRefreshAssignments();
  }

  if (result) {
    const passed = result.score >= result.passScore;

    return (
      <section className="official-exam official-exam-page">
        <article className={`panel result-card official-result-shell ${passed ? "pass" : "fail"}`}>
          <h3>
            {passed ? <CheckCircle2 size={21} /> : <X size={21} />}
            Kết quả: {passed ? "Đạt" : "Chưa đạt"}
          </h3>
          <p>
            Bài chính thức đã được ghi nhận vào hệ thống. Điểm đạt yêu cầu là ≥{" "}
            {result.passScore}.
          </p>
          <InfoTable
            rows={[
              ["Bài thi", detail?.test.title ?? test.title],
              ["Điểm số", `${Math.round(result.score)}/100`],
              ["Số câu đúng", `${result.correctAnswers}/${result.totalQuestions}`],
              ["Trạng thái", passed ? "Đạt" : "Chưa đạt"]
            ]}
          />
          {!passed && (
            <>
              {retakeError && <p className="login-error">{retakeError}</p>}
              {retakeMessage && <p className="success-message">{retakeMessage}</p>}
            </>
          )}
          <div>
            {!passed && (
              <button className="outline-button" onClick={requestRetake} disabled={isRequestingRetake || pendingRetakeRequestExists}>
                <RefreshCw size={17} /> {retakeButtonLabel(test, isRequestingRetake, pendingRetakeRequestExists)}
              </button>
            )}
            <button className="primary-button" onClick={onHome}>
              <Home size={17} /> Về trang chủ
            </button>
          </div>
        </article>
      </section>
    );
  }

  if (officialDone) {
    return (
      <section className="official-exam official-exam-page">
        <article className={`panel result-card official-result-shell official-locked-result ${officialPassed ? "pass" : "fail"}`}>
          <h3>
            {officialPassed ? <CheckCircle2 size={21} /> : <X size={21} />}
            {officialResultLabel(officialState)}
          </h3>
          <p>Bài chính thức đã được ghi nhận. Bạn không thể làm chính thức lại.</p>
          <InfoTable
            rows={[
              ["Bài thi", detail?.test.title ?? test.title],
              ["Điểm chính thức", officialState.officialScore !== null && officialState.officialScore !== undefined ? `${Math.round(officialState.officialScore)}/100` : "--"],
              ["Trạng thái", officialPassed ? "Đạt" : "Chưa đạt"]
            ]}
          />
          {!officialPassed && (
            <>
              {retakeError && <p className="login-error">{retakeError}</p>}
              {retakeMessage && <p className="success-message">{retakeMessage}</p>}
            </>
          )}
          <div>
            {!officialPassed && (
              <button className="outline-button" onClick={requestRetake} disabled={isRequestingRetake || pendingRetakeRequestExists}>
                <RefreshCw size={17} /> {retakeButtonLabel(test, isRequestingRetake, pendingRetakeRequestExists)}
              </button>
            )}
            <button className="primary-button" onClick={onHome}>
              <Home size={17} /> Về trang chủ
            </button>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="official-exam official-exam-page">
      <div className="official-exam-layout">
        <div className="exam-card official-main-card">
          <header className="official-header">
            <div>
              <span className="eyebrow">Làm chính thức</span>
              <h2>{detail?.test.title ?? test.title}</h2>
              <p>Điểm của lượt này sẽ được ghi vào kết quả bài test.</p>
            </div>
            <div className={`timer ${remainingSeconds <= 120 ? "urgent" : ""} ${timeAlertLevel}`}>
              <Clock3 size={26} />
              <span>{formatRemaining(remainingSeconds)}</span>
            </div>
          </header>

          <div className="exam-meta-row">
            <span>
              <ListChecks size={16} /> {questions.length || test.questions} câu
            </span>
            <span>
              <Clock3 size={16} /> {detail?.test.duration_minutes ?? test.minutes} phút
            </span>
            <span>
              <ShieldCheck size={16} /> Lượt chính thức: {attemptLimitLabel}
            </span>
            <span className={`draft-save-status ${draftSaveState}`}>
              <Save size={16} /> {draftSaveLabel}
            </span>
          </div>

          {error && <p className="login-error">{error}</p>}
          {isLoading && <p>Đang tải câu hỏi...</p>}

          {noOfficialAttempts && (
            <section className="notice-panel official-lock-notice">
              <div>
                <ShieldCheck size={20} />
                <strong>Đã hết lượt làm chính thức</strong>
                <span>Vui lòng liên hệ HR/Quản lý nếu cần mở thêm lượt thi.</span>
              </div>
            </section>
          )}

          {!noOfficialAttempts && activeQuestion && (
            <>
              <div className="quiz-progress large official-progress">
                <span>
                  Đã trả lời {answeredCount}/{questions.length}
                </span>
                <i>
                  <b style={{ width: `${progressPercent}%` }} />
                </i>
                <span>{progressPercent}%</span>
              </div>

              <div
                ref={activeQuestionRef}
                key={activeQuestion.id}
                className="question-box official-question-box question-card-enter"
                tabIndex={-1}
              >
                <div className="official-question-heading">
                  <h3>
                    Câu {currentIndex + 1}. {activeQuestion.question_text}
                  </h3>
                  <button
                    type="button"
                    className={`flag-button ${activeIsFlagged ? "active" : ""}`}
                    onClick={() => toggleQuestionFlag(activeQuestion.id)}
                  >
                    <Flag size={15} /> {activeIsFlagged ? "Đã đánh dấu" : "Đánh dấu"}
                  </button>
                </div>
                <QuestionMedia
                  src={activeQuestion.image_url}
                  alt={`Ảnh câu hỏi ${currentIndex + 1}`}
                  variant="question"
                />
                {activeQuestion.answers.map((answer) => (
                  <label
                    key={answer.id}
                    className={`${answers[activeQuestion.id] === answer.id ? "selected" : ""} ${
                      answerPulse?.questionId === activeQuestion.id && answerPulse.answerId === answer.id
                        ? "official-answer-pop"
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name={`official-${activeQuestion.id}`}
                      checked={answers[activeQuestion.id] === answer.id}
                      onChange={() => selectOfficialAnswer(activeQuestion.id, answer.id)}
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

              <footer className="official-footer">
                <button
                  className="outline-button"
                  onClick={() => goToQuestion(currentIndex - 1)}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft size={17} /> Câu trước
                </button>
                <button
                  className="outline-button"
                  onClick={() => goToQuestion(currentIndex + 1)}
                  disabled={currentIndex >= questions.length - 1}
                >
                  Câu sau <ChevronRight size={17} />
                </button>
              </footer>
            </>
          )}

          {!isLoading && !noOfficialAttempts && !activeQuestion && (
            <section className="notice-panel official-lock-notice">
              <div>
                <AlertTriangle size={20} />
                <strong>Chưa có câu hỏi</strong>
                <span>Bài test này chưa có câu hỏi đang hoạt động.</span>
              </div>
            </section>
          )}
        </div>

        <aside className="official-sidebar">
          <section className="official-sidebar-card">
            <h3>Danh sách câu hỏi</h3>
            <p>Chọn số câu để chuyển nhanh khi đang làm bài. Đánh dấu câu còn phân vân để quay lại.</p>
            <div className="question-jump-grid official-jumps">
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
                <i className="legend-done" /> Đã trả lời
              </span>
              <span>
                <i className="legend-flag" /> Đánh dấu {flaggedCount ? `(${flaggedCount})` : ""}
              </span>
            </div>
          </section>

          <section className="official-sidebar-card official-submit-zone">
            <div>
              <strong>{answeredCount}/{questions.length || test.questions} câu đã trả lời</strong>
              <span>{unansweredCount > 0 ? `Còn ${unansweredCount} câu trống` : "Đã trả lời đủ câu"}</span>
            </div>
            <button
              className="primary-button"
              onClick={handleSubmitOfficial}
              disabled={isSubmitting || noOfficialAttempts || questions.length === 0}
            >
              <CheckCircle2 size={17} /> {isSubmitting ? "Đang nộp bài" : "Nộp bài chính thức"}
            </button>
            {unansweredCount > 0 && <p>Có thể nộp khi còn câu trống, hệ thống sẽ tính các câu đó là sai.</p>}
          </section>

          <section className={`official-sidebar-card official-time-card ${timeAlertLevel}`}>
            <div>
              <Clock3 size={18} />
              <strong>Thời gian còn lại</strong>
            </div>
            <div className="time-track">
              <span style={{ width: `${Math.max(0, Math.min(100, timePercent))}%` }} />
            </div>
            <p>Hết giờ hệ thống sẽ tự nộp bài theo các câu đã chọn.</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
