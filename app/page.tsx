"use client";

import { ClipboardCheck, FileText, ShieldCheck, ShieldX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AppShell } from "@/components/app-shell";
import { DocumentsPage } from "@/components/documents-page";
import { HomeDashboard } from "@/components/home-dashboard";
import { LoginScreen } from "@/components/login-screen";
import { NotificationsPage } from "@/components/notifications-page";
import { OfficialScreen } from "@/components/official-screen";
import { PracticeScreen } from "@/components/practice-screen";
import { PracticeLeaderboardPage } from "@/components/practice-leaderboard-page";
import { ProfilePage } from "@/components/profile-page";
import { ResultsPage } from "@/components/results-page";
import { SupportPage } from "@/components/support-page";
import { SystemSettingsPage } from "@/components/system-settings-page";
import { TestDetail } from "@/components/test-detail";
import { TestsPage } from "@/components/tests-page";
import { canAccessAdminUser } from "@/lib/permissions";
import { canStartOfficialAttempt, canStartPracticeAttempt, hasOfficialResult } from "@/lib/test-state";
import type {
  AssignedTest,
  PracticeLeaderboardEntry,
  Screen,
  SessionUser,
  TestStatus,
  ThemeMode,
  UserAssignment,
  UserSummary
} from "@/lib/types";

const THEME_STORAGE_KEY = "eb-theme-mode";
const ACTIVE_OFFICIAL_ATTEMPT_KEY = "eb-active-official-attempt";

type MeResponse = {
  employee: SessionUser;
  summary: UserSummary;
  practiceLeaderboard: PracticeLeaderboardEntry[];
  assignments: UserAssignment[];
};

type StoredOfficialAttempt = {
  userId: number;
  testId: number;
  updatedAt: number;
};

const emptySummary: UserSummary = {
  total: 0,
  done: 0,
  completed: 0,
  pending: 0,
  average: 0
};

function assignmentStatusLabel(status: UserAssignment["status"]): TestStatus {
  if (status === "passed") return "ĐÃ ĐẠT";
  if (status === "failed") return "CHƯA ĐẠT";
  if (status === "studying") return "ĐANG HỌC";
  return "CHƯA LÀM";
}

function mapAssignmentToTest(assignment: UserAssignment, index: number): AssignedTest {
  const status = assignmentStatusLabel(assignment.status);
  const icon = status === "ĐÃ ĐẠT" ? ShieldCheck : status === "CHƯA ĐẠT" ? ShieldX : index % 2 === 0 ? FileText : ClipboardCheck;
  const tone = status === "ĐÃ ĐẠT" ? "green" : status === "CHƯA ĐẠT" ? "purple" : status === "CHƯA LÀM" ? "orange" : "blue";

  return {
    id: assignment.test_id,
    assignmentId: assignment.assignment_id,
    title: assignment.title,
    department: assignment.department_name ?? "Áp dụng chung",
    description: assignment.description,
    questions: assignment.question_count,
    minutes: assignment.duration_minutes,
    passScore: assignment.pass_score,
    allowUnlimitedPractice: assignment.allow_unlimited_practice,
    dueAt: assignment.due_at,
    readProgress: Math.round(assignment.read_progress_percent),
    attempts: assignment.practice_attempt_count,
    officialAttemptsUsed: assignment.official_attempts_used,
    maxOfficialAttempts: assignment.max_official_attempts,
    officialScore: assignment.official_score ?? undefined,
    retakeRequestCount: assignment.retake_request_count,
    retakeRequestStatus: assignment.retake_request_status,
    status,
    icon,
    tone
  };
}

function readActiveOfficialAttempt() {
  const rawValue = window.localStorage.getItem(ACTIVE_OFFICIAL_ATTEMPT_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredOfficialAttempt>;
    const userId = Number(parsed.userId);
    const testId = Number(parsed.testId);
    const updatedAt = Number(parsed.updatedAt);

    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(testId) || testId <= 0) {
      window.localStorage.removeItem(ACTIVE_OFFICIAL_ATTEMPT_KEY);
      return null;
    }

    return {
      userId,
      testId,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
    };
  } catch {
    window.localStorage.removeItem(ACTIVE_OFFICIAL_ATTEMPT_KEY);
    return null;
  }
}

function saveActiveOfficialAttempt(userId: number, testId: number) {
  window.localStorage.setItem(
    ACTIVE_OFFICIAL_ATTEMPT_KEY,
    JSON.stringify({
      userId,
      testId,
      updatedAt: Date.now()
    } satisfies StoredOfficialAttempt)
  );
}

function clearActiveOfficialAttempt() {
  window.localStorage.removeItem(ACTIVE_OFFICIAL_ATTEMPT_KEY);
}

function getRestorableOfficialTest(data: MeResponse) {
  const storedAttempt = readActiveOfficialAttempt();
  if (!storedAttempt || storedAttempt.userId !== data.employee.id) {
    return null;
  }

  const targetTest = data.assignments
    .map((assignment, index) => mapAssignmentToTest(assignment, index))
    .find((test) => test.id === storedAttempt.testId);

  if (!targetTest) {
    clearActiveOfficialAttempt();
    return null;
  }

  if (hasOfficialResult(targetTest) && !canStartOfficialAttempt(targetTest)) {
    clearActiveOfficialAttempt();
    return null;
  }

  return targetTest;
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("login");
  const [screenHistory, setScreenHistory] = useState<Screen[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [userSummary, setUserSummary] = useState<UserSummary>(emptySummary);
  const [practiceLeaderboard, setPracticeLeaderboard] = useState<PracticeLeaderboardEntry[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const userId = user?.id;

  const assignedUserTests = useMemo(
    () => assignments.map((assignment, index) => mapAssignmentToTest(assignment, index)),
    [assignments]
  );
  const selectedTest = assignedUserTests.find((test) => test.id === selectedTestId) ?? assignedUserTests[0] ?? null;

  const summary = useMemo(
    () => ({
      total: userSummary.total,
      done: userSummary.done,
      pending: userSummary.pending,
      average: userSummary.average
    }),
    [userSummary]
  );

  const navigateToScreen = useCallback(
    (nextScreen: Screen) => {
      if (screen === nextScreen) {
        return;
      }

      setScreenHistory((currentHistory) => {
        if (screen === "login" || currentHistory[currentHistory.length - 1] === screen) {
          return currentHistory;
        }

        return [...currentHistory, screen];
      });
      setScreen(nextScreen);
    },
    [screen]
  );

  const resetScreen = useCallback((nextScreen: Screen) => {
    setScreenHistory([]);
    setScreen(nextScreen);
  }, []);

  const goBack = useCallback(() => {
    const previousScreen = screenHistory[screenHistory.length - 1];
    if (!previousScreen) {
      return;
    }

    setScreenHistory((currentHistory) => currentHistory.slice(0, -1));
    setScreen(previousScreen);
  }, [screenHistory]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const applyMeData = useCallback((data: MeResponse) => {
    setUser(data.employee);
    setUserSummary(data.summary ?? emptySummary);
    setPracticeLeaderboard(data.practiceLeaderboard ?? []);
    setAssignments(data.assignments ?? []);
    setSelectedTestId((current) => current ?? data.assignments?.[0]?.test_id ?? null);
  }, []);

  const reloadUserData = useCallback(async () => {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as MeResponse;
    applyMeData(data);
    return data;
  }, [applyMeData]);

  const rememberActiveOfficialAttempt = useCallback(
    (testId: number) => {
      if (userId) {
        saveActiveOfficialAttempt(userId, testId);
      }
    },
    [userId]
  );

  const finishActiveOfficialAttempt = useCallback(() => {
    clearActiveOfficialAttempt();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (!isMounted) {
          return;
        }

        if (response.ok) {
          const data = (await response.json()) as MeResponse;
          applyMeData(data);
          const restorableTest = getRestorableOfficialTest(data);

          if (restorableTest) {
            setSelectedTestId(restorableTest.id);
            resetScreen("official");
          } else {
            resetScreen(canAccessAdminUser(data.employee) ? "admin" : "home");
          }
        } else {
          setUser(null);
          setAssignments([]);
          setUserSummary(emptySummary);
          setPracticeLeaderboard([]);
          resetScreen("login");
        }
      } catch {
        if (isMounted) {
          setUser(null);
          setAssignments([]);
          setUserSummary(emptySummary);
          setPracticeLeaderboard([]);
          resetScreen("login");
        }
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [applyMeData, resetScreen]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const heartbeat = () => {
      fetch("/api/auth/heartbeat", { method: "POST" }).catch(() => null);
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [userId]);

  async function handleLogin(employee: SessionUser) {
    setUser(employee);
    const data = await reloadUserData().catch(() => null);
    const restorableTest = data ? getRestorableOfficialTest(data) : null;

    if (restorableTest) {
      setSelectedTestId(restorableTest.id);
      resetScreen("official");
    } else {
      resetScreen(canAccessAdminUser(employee) ? "admin" : "home");
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    clearActiveOfficialAttempt();
    setUser(null);
    setAssignments([]);
    setUserSummary(emptySummary);
    setPracticeLeaderboard([]);
    setSelectedTestId(null);
    resetScreen("login");
  }

  function openTest(testId: number) {
    setSelectedTestId(testId);
    navigateToScreen("test");
  }

  function openPractice(testId: number) {
    const targetTest = assignedUserTests.find((item) => item.id === testId);
    if (targetTest && !canStartPracticeAttempt(targetTest)) {
      setSelectedTestId(testId);
      navigateToScreen("test");
      return;
    }

    setSelectedTestId(testId);
    navigateToScreen("practice");
  }

  function openOfficial(testId: number) {
    const targetTest = assignedUserTests.find((item) => item.id === testId);
    if (targetTest && hasOfficialResult(targetTest) && !canStartOfficialAttempt(targetTest)) {
      clearActiveOfficialAttempt();
      setSelectedTestId(testId);
      navigateToScreen("test");
      return;
    }

    if (userId) {
      saveActiveOfficialAttempt(userId, testId);
    }
    setSelectedTestId(testId);
    navigateToScreen("official");
  }

  async function requestRetake(test: AssignedTest) {
    if (test.retakeRequestStatus === "pending") {
      throw new Error("Yêu cầu thi lại của bài này đã được gửi và đang chờ duyệt.");
    }

    const response = await fetch("/api/retake-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        testId: test.id,
        reason: `Xin mở lại lượt thi chính thức cho bài ${test.title}.`
      })
    }).catch(() => null);
    const responseData = await response?.json().catch(() => null);

    if (!response?.ok) {
      throw new Error(responseData?.error ?? "Không thể gửi yêu cầu thi lại.");
    }

    await reloadUserData();
    return responseData?.message ?? "Yêu cầu thi lại đã được gửi và đang chờ duyệt.";
  }

  if (isBooting) {
    return (
      <main className="login-page">
        <section className="login-shell">
          <div className="login-card">
            <p>Đang kiểm tra phiên đăng nhập...</p>
          </div>
        </section>
      </main>
    );
  }

  if (screen === "login" || !user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (screen === "admin") {
    return canAccessAdminUser(user) ? (
      <AdminDashboard
        setScreen={navigateToScreen}
        user={user}
        onLogout={handleLogout}
        theme={theme}
        onThemeChange={setTheme}
      />
    ) : (
      <AppShell
        currentScreen="home"
        setScreen={navigateToScreen}
        user={user}
        onLogout={handleLogout}
        onOpenTest={openTest}
        canGoBack={screenHistory.length > 0}
        onBack={goBack}
      >
        <HomeDashboard
          summary={summary}
          tests={assignedUserTests}
          user={user}
          onOpenTest={openTest}
          onPractice={openPractice}
          onOfficial={openOfficial}
          onRequestRetake={requestRetake}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      currentScreen={screen}
      setScreen={navigateToScreen}
      user={user}
      onLogout={handleLogout}
      onOpenTest={openTest}
      canGoBack={screenHistory.length > 0}
      onBack={goBack}
    >
      {screen === "home" && (
        <HomeDashboard
          summary={summary}
          tests={assignedUserTests}
          user={user}
          onOpenTest={openTest}
          onPractice={openPractice}
          onOfficial={openOfficial}
          onRequestRetake={requestRetake}
        />
      )}
      {screen === "documents" && (
        <DocumentsPage
          tests={assignedUserTests}
          onOpenTest={openTest}
          onRefreshAssignments={reloadUserData}
        />
      )}
      {screen === "tests" && (
        <TestsPage
          tests={assignedUserTests}
          onOpenTest={openTest}
          onPractice={openPractice}
          onOfficial={openOfficial}
          onRequestRetake={requestRetake}
        />
      )}
      {screen === "test" && selectedTest && (
        <TestDetail
          test={selectedTest}
          onPractice={() => openPractice(selectedTest.id)}
          onOfficial={() => openOfficial(selectedTest.id)}
          onRefreshAssignments={reloadUserData}
        />
      )}
      {screen === "practice" && selectedTest && (
        <PracticeScreen
          test={selectedTest}
          onReview={() => navigateToScreen("test")}
          onOfficial={() => openOfficial(selectedTest.id)}
          onRefreshAssignments={reloadUserData}
        />
      )}
      {screen === "results" && <ResultsPage onReview={() => navigateToScreen("practice")} />}
      {screen === "leaderboard" && <PracticeLeaderboardPage leaderboard={practiceLeaderboard} user={user} />}
      {screen === "profile" && <ProfilePage user={user} onUserUpdate={setUser} />}
      {screen === "notifications" && <NotificationsPage onOpenTest={openTest} />}
      {screen === "settings" && <SystemSettingsPage theme={theme} onThemeChange={setTheme} />}
      {screen === "support" && <SupportPage />}
      {screen === "official" && selectedTest && (
        <OfficialScreen
          test={selectedTest}
          onAttemptStarted={rememberActiveOfficialAttempt}
          onAttemptFinished={finishActiveOfficialAttempt}
          onHome={() => {
            clearActiveOfficialAttempt();
            navigateToScreen("home");
          }}
          onRefreshAssignments={reloadUserData}
        />
      )}
    </AppShell>
  );
}
