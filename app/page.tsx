"use client";

import { useMemo, useState } from "react";
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
import type { Screen } from "@/lib/types";

export default function Page() {
  const [screen, setScreen] = useState<Screen>("login");
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

  if (screen === "login") {
    return <LoginScreen onLogin={() => setScreen("home")} />;
  }

  if (screen === "admin") {
    return <AdminDashboard setScreen={setScreen} />;
  }

  return (
    <AppShell currentScreen={screen} setScreen={setScreen}>
      {screen === "home" && (
        <HomeDashboard
          summary={summary}
          tests={assignedTests}
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
      {screen === "profile" && <ProfilePage />}
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
