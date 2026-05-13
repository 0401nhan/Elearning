import type { LucideIcon } from "lucide-react";

export type Screen =
  | "login"
  | "home"
  | "documents"
  | "tests"
  | "test"
  | "practice"
  | "official"
  | "results"
  | "profile"
  | "notifications"
  | "support"
  | "admin";

export type TestStatus = "ĐANG HỌC" | "ĐÃ ĐẠT" | "CHƯA ĐẠT" | "CHƯA LÀM";

export type ResultStatus = "Đạt" | "Chưa đạt";

export type AssignedTest = {
  id: number;
  title: string;
  department: string;
  questions: number;
  minutes: number;
  passScore: number;
  readProgress: number;
  attempts: number;
  officialScore?: number;
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
