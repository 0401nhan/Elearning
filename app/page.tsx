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
import { ProfilePage } from "@/components/profile-page";
import { ResultsPage } from "@/components/results-page";
import { SupportPage } from "@/components/support-page";
import { SystemSettingsPage } from "@/components/system-settings-page";
import { TestDetail } from "@/components/test-detail";
import { TestsPage } from "@/components/tests-page";
import { canViewPeopleResultsUser } from "@/lib/permissions";
import { canStartOfficialAttempt, hasOfficialResult } from "@/lib/test-state";
import type { AssignedTest, Screen, SessionUser, TestStatus, ThemeMode, UserAssignment, UserSummary } from "@/lib/types";

const THEME_STORAGE_KEY = "eb-theme-mode";

type MeResponse = {
  employee: SessionUser;
  summary: UserSummary;
  assignments: UserAssignment[];
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
    dueAt: assignment.due_at,
    readProgress: Math.round(assignment.read_progress_percent),
    attempts: assignment.practice_attempt_count,
    officialAttemptsUsed: assignment.official_attempts_used,
    maxOfficialAttempts: assignment.max_official_attempts,
    officialScore: assignment.official_score ?? undefined,
    status,
    icon,
    tone
  };
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [userSummary, setUserSummary] = useState<UserSummary>(emptySummary);
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
          setScreen(canViewPeopleResultsUser(data.employee) ? "admin" : "home");
        } else {
          setUser(null);
          setAssignments([]);
          setUserSummary(emptySummary);
          setScreen("login");
        }
      } catch {
        if (isMounted) {
          setUser(null);
          setAssignments([]);
          setUserSummary(emptySummary);
          setScreen("login");
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
  }, [applyMeData]);

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
    await reloadUserData().catch(() => null);
    setScreen(canViewPeopleResultsUser(employee) ? "admin" : "home");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setAssignments([]);
    setUserSummary(emptySummary);
    setSelectedTestId(null);
    setScreen("login");
  }

  function openTest(testId: number) {
    setSelectedTestId(testId);
    setScreen("test");
  }

  function openPractice(testId: number) {
    setSelectedTestId(testId);
    setScreen("practice");
  }

  function openOfficial(testId: number) {
    const targetTest = assignedUserTests.find((item) => item.id === testId);
    if (targetTest && hasOfficialResult(targetTest) && !canStartOfficialAttempt(targetTest)) {
      setSelectedTestId(testId);
      setScreen("test");
      return;
    }

    setSelectedTestId(testId);
    setScreen("official");
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
    return canViewPeopleResultsUser(user) ? (
      <AdminDashboard
        setScreen={setScreen}
        user={user}
        onLogout={handleLogout}
        theme={theme}
        onThemeChange={setTheme}
      />
    ) : (
      <AppShell
        currentScreen="home"
        setScreen={setScreen}
        user={user}
        onLogout={handleLogout}
      >
        <HomeDashboard
          summary={summary}
          tests={assignedUserTests}
          user={user}
          onOpenTest={openTest}
          onPractice={openPractice}
          onOfficial={openOfficial}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      currentScreen={screen}
      setScreen={setScreen}
      user={user}
      onLogout={handleLogout}
    >
      {screen === "home" && (
        <HomeDashboard
          summary={summary}
          tests={assignedUserTests}
          user={user}
          onOpenTest={openTest}
          onPractice={openPractice}
          onOfficial={openOfficial}
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
          onReview={() => setScreen("test")}
          onOfficial={() => openOfficial(selectedTest.id)}
          onRefreshAssignments={reloadUserData}
        />
      )}
      {screen === "results" && <ResultsPage onReview={() => setScreen("practice")} />}
      {screen === "profile" && <ProfilePage user={user} onUserUpdate={setUser} />}
      {screen === "notifications" && <NotificationsPage />}
      {screen === "settings" && <SystemSettingsPage theme={theme} onThemeChange={setTheme} />}
      {screen === "support" && <SupportPage />}
      {screen === "official" && selectedTest && (
        <OfficialScreen
          test={selectedTest}
          onHome={() => setScreen("home")}
          onRefreshAssignments={reloadUserData}
        />
      )}
    </AppShell>
  );
}
