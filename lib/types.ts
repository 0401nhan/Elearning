import type { LucideIcon } from "lucide-react";

export type Screen =
  | "login"
  | "home"
  | "documents"
  | "tests"
  | "leaderboard"
  | "test"
  | "practice"
  | "official"
  | "results"
  | "profile"
  | "notifications"
  | "settings"
  | "support"
  | "admin";

export type TestStatus = "ĐANG HỌC" | "ĐÃ ĐẠT" | "CHƯA ĐẠT" | "CHƯA LÀM";

export type ResultStatus = "Đạt" | "Chưa đạt";

export type ThemeMode = "light" | "dark";

export type AssignmentStatus = "not_started" | "studying" | "passed" | "failed";

export type RetakeRequestStatus = "pending" | "approved" | "rejected";

export type UserAssignment = {
  assignment_id: number;
  test_id: number;
  title: string;
  department_name: string | null;
  description: string | null;
  question_count: number;
  duration_minutes: number;
  pass_score: number;
  allow_unlimited_practice: boolean;
  due_at: string | null;
  status: AssignmentStatus;
  read_progress_percent: number;
  practice_attempt_count: number;
  official_attempts_used: number;
  max_official_attempts: number;
  official_score: number | null;
  retake_request_count: number;
  retake_request_status: RetakeRequestStatus | null;
};

export type UserSummary = {
  total: number;
  done: number;
  completed: number;
  pending: number;
  average: number;
};

export type PracticeLeaderboardEntry = {
  rank: number;
  employeeId: number;
  employeeCode: string;
  fullName: string;
  departmentName: string | null;
  totalScore: number;
  attemptCount: number;
  averageScore: number;
  highestScore: number;
  latestPracticeAt: string | null;
  isCurrentUser: boolean;
};

export type AssignedTest = {
  id: number;
  assignmentId?: number;
  title: string;
  department: string;
  description?: string | null;
  questions: number;
  minutes: number;
  passScore: number;
  allowUnlimitedPractice?: boolean;
  dueAt?: string | null;
  readProgress: number;
  attempts: number;
  officialAttemptsUsed?: number;
  maxOfficialAttempts?: number;
  officialScore?: number;
  retakeRequestCount?: number;
  retakeRequestStatus?: RetakeRequestStatus | null;
  status: TestStatus;
  icon: LucideIcon;
  tone: "blue" | "green" | "purple" | "orange";
};

export type Metric = {
  label: string;
  value: string;
  note: string;
  percent: string;
  icon: LucideIcon;
  tone: "blue" | "green" | "orange" | "red" | "purple";
};

export type Question = {
  id: number;
  title: string;
  answers: string[];
  correct: number;
};

export type ResultRow = {
  name: string;
  phone: string;
  department: string;
  role: string;
  date: string;
  test: string;
  attempts: number;
  score: number;
  time: string;
  status: ResultStatus;
  approver: string;
};

export type Summary = {
  total: number;
  done: number;
  pending: number;
  average: number;
};

export type SessionUser = {
  id: number;
  code: string;
  username: string;
  fullName: string;
  phone: string;
  email: string | null;
  departmentId: number;
  department: string;
  position: string | null;
  avatarInitial: string | null;
  roles: string[];
  permissions: string[];
};
