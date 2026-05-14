"use client";

import { useEffect, useMemo, useState } from "react";
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
import { TestDetail } from "@/components/test-detail";
import { TestsPage } from "@/components/tests-page";
import { assignedTests, questions } from "@/lib/mock-data";
import { canViewPeopleResultsUser } from "@/lib/permissions";
import type { Screen, SessionUser } from "@/lib/types";

export default function Page() {
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [selectedAnswer, setSelectedAnswer] = useState(1);

  const selectedTest = assignedTests[0];
  const activeQuestion = questions[0];

  const summary = useMemo(
    () => ({
      total: assignedTests.length + 2,
      done: 3,
      pending: 3,
      average: 82
    }),
    []
  );

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (!isMounted) {
          return;
        }

        if (response.ok) {
          const data = await response.json();
          setUser(data.employee);
          setScreen(canViewPeopleResultsUser(data.employee) ? "admin" : "home");
        } else {
          setUser(null);
          setScreen("login");
        }
      } catch {
        if (isMounted) {
          setUser(null);
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
  }, []);

  function handleLogin(employee: SessionUser) {
    setUser(employee);
    setScreen(canViewPeopleResultsUser(employee) ? "admin" : "home");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setScreen("login");
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
      <AdminDashboard setScreen={setScreen} user={user} onLogout={handleLogout} />
    ) : (
      <AppShell currentScreen="home" setScreen={setScreen} user={user} onLogout={handleLogout}>
        <HomeDashboard
          summary={summary}
          tests={assignedTests}
          user={user}
          onOpenTest={() => setScreen("test")}
          onPractice={() => setScreen("practice")}
          onOfficial={() => setScreen("official")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell currentScreen={screen} setScreen={setScreen} user={user} onLogout={handleLogout}>
      {screen === "home" && (
        <HomeDashboard
          summary={summary}
          tests={assignedTests}
          user={user}
          onOpenTest={() => setScreen("test")}
          onPractice={() => setScreen("practice")}
          onOfficial={() => setScreen("official")}
        />
      )}
      {screen === "documents" && (
        <DocumentsPage
          tests={assignedTests}
          onOpenTest={() => setScreen("test")}
        />
      )}
      {screen === "tests" && (
        <TestsPage
          tests={assignedTests}
          onOpenTest={() => setScreen("test")}
          onPractice={() => setScreen("practice")}
          onOfficial={() => setScreen("official")}
        />
      )}
      {screen === "test" && (
        <TestDetail
          test={selectedTest}
          onPractice={() => setScreen("practice")}
          onOfficial={() => setScreen("official")}
        />
      )}
      {screen === "practice" && (
        <PracticeScreen
          test={selectedTest}
          onReview={() => setScreen("test")}
          onOfficial={() => setScreen("official")}
        />
      )}
      {screen === "results" && <ResultsPage onReview={() => setScreen("practice")} />}
      {screen === "profile" && <ProfilePage user={user} />}
      {screen === "notifications" && <NotificationsPage />}
      {screen === "support" && <SupportPage />}
      {screen === "official" && (
        <OfficialScreen
          question={activeQuestion}
          selectedAnswer={selectedAnswer}
          setSelectedAnswer={setSelectedAnswer}
          onHome={() => setScreen("home")}
        />
      )}
    </AppShell>
  );
}
