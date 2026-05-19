import {
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  HelpCircle,
  Home,
  LibraryBig,
  ListChecks,
  Settings,
  ShieldCheck,
  ShieldX,
  Star,
  User,
  Users
} from "lucide-react";
import type { AssignedTest, Metric, Question, ResultRow, Screen } from "./types";

export const assignedTests: AssignedTest[] = [
  {
    id: 1,
    title: "Quy định chung công ty",
    department: "HCNS",
    questions: 25,
    minutes: 20,
    passScore: 80,
    readProgress: 75,
    attempts: 4,
    status: "ĐANG HỌC",
    icon: FileText,
    tone: "blue"
  },
  {
    id: 2,
    title: "Quy định HSE",
    department: "HSE",
    questions: 30,
    minutes: 25,
    passScore: 80,
    readProgress: 100,
    attempts: 6,
    officialScore: 90,
    status: "ĐÃ ĐẠT",
    icon: ShieldCheck,
    tone: "green"
  },
  {
    id: 3,
    title: "An toàn lao động (ATLĐ)",
    department: "HSE",
    questions: 20,
    minutes: 15,
    passScore: 80,
    readProgress: 100,
    attempts: 3,
    officialScore: 65,
    status: "CHƯA ĐẠT",
    icon: ShieldX,
    tone: "purple"
  },
  {
    id: 4,
    title: "Quy trình làm việc hiện trường",
    department: "HSE",
    questions: 25,
    minutes: 20,
    passScore: 80,
    readProgress: 0,
    attempts: 0,
    status: "CHƯA LÀM",
    icon: ClipboardCheck,
    tone: "orange"
  }
];

export const resultRows: ResultRow[] = [
  {
    name: "Nguyễn Văn A",
    phone: "0901 234 567",
    department: "HSE",
    role: "Kỹ thuật hiện trường",
    date: "01/05/2022",
    test: "Test Quy định HSE",
    attempts: 5,
    score: 85,
    time: "18 phút",
    status: "Đạt",
    approver: "Admin"
  },
  {
    name: "Trần Thị B",
    phone: "0902 345 678",
    department: "HCNS",
    role: "Nhân sự",
    date: "15/03/2023",
    test: "Test Quy định HCNS",
    attempts: 3,
    score: 62,
    time: "16 phút",
    status: "Chưa đạt",
    approver: "Admin"
  },
  {
    name: "Lê Văn C",
    phone: "0903 456 789",
    department: "Kỹ thuật",
    role: "Kỹ sư cơ điện",
    date: "20/11/2021",
    test: "An toàn lao động",
    attempts: 4,
    score: 91,
    time: "19 phút",
    status: "Đạt",
    approver: "-"
  },
  {
    name: "Phạm Thị D",
    phone: "0904 567 890",
    department: "Sản xuất",
    role: "Tổ trưởng",
    date: "10/07/2022",
    test: "An toàn lao động",
    attempts: 2,
    score: 58,
    time: "15 phút",
    status: "Chưa đạt",
    approver: "Admin"
  },
  {
    name: "Hoàng Văn E",
    phone: "0905 678 901",
    department: "HSE",
    role: "Chuyên viên HSE",
    date: "05/01/2023",
    test: "Test Quy định HSE",
    attempts: 6,
    score: 95,
    time: "17 phút",
    status: "Đạt",
    approver: "-"
  }
];

export const navItems = [
  { label: "Trang chủ", icon: Home, screen: "home" as Screen },
  { label: "Tài liệu học", icon: BookOpen, screen: "documents" as Screen },
  { label: "Bài test", icon: ClipboardCheck, screen: "tests" as Screen },
  { label: "Kết quả", icon: BarChart3, screen: "results" as Screen },
  { label: "Hồ sơ cá nhân", icon: User, screen: "profile" as Screen },
  { label: "Thông báo", icon: Bell, screen: "notifications" as Screen },
  { label: "Cài đặt hệ thống", icon: Settings, screen: "settings" as Screen },
  { label: "Hỗ trợ", icon: HelpCircle, screen: "support" as Screen },
  { label: "Admin", icon: Settings, screen: "admin" as Screen }
];

export const adminNavItems = [
  { label: "Tổng quan", icon: Home },
  { label: "Quản lý bài test", icon: ClipboardCheck },
  { label: "Giao test cho nhân sự", icon: FileText },
  { label: "Kết quả test", icon: BarChart3 },
  { label: "Nhân sự", icon: Users },
  { label: "Ngân hàng câu hỏi", icon: ListChecks },
  { label: "Tài liệu đào tạo", icon: LibraryBig },
  { label: "Báo cáo", icon: Download },
  { label: "Cài đặt hệ thống", icon: Settings }
];

export const adminMetrics: Metric[] = [
  {
    label: "Tổng số nhân sự được giao test",
    value: "120",
    note: "100%",
    percent: "100%",
    icon: Users,
    tone: "purple"
  },
  {
    label: "Đã hoàn thành",
    value: "95",
    note: "79.2%",
    percent: "79%",
    icon: CheckCircle2,
    tone: "green"
  },
  {
    label: "Chưa hoàn thành",
    value: "25",
    note: "20.8%",
    percent: "21%",
    icon: Clock3,
    tone: "orange"
  },
  {
    label: "Đạt",
    value: "88",
    note: "73.3%",
    percent: "73%",
    icon: ShieldCheck,
    tone: "green"
  },
  {
    label: "Chưa đạt",
    value: "12",
    note: "10.0%",
    percent: "10%",
    icon: ShieldX,
    tone: "red"
  },
  {
    label: "Điểm trung bình",
    value: "84.5",
    note: "/100 điểm",
    percent: "84%",
    icon: Star,
    tone: "blue"
  },
  {
    label: "Số lần làm thử nhiều nhất",
    value: "4.2",
    note: "18% nhân viên sai",
    percent: "18%",
    icon: Clock3,
    tone: "orange"
  }
];

export const questions: Question[] = [
  {
    id: 1,
    title: "Khi phát hiện sự cố mất an toàn, việc đầu tiên bạn cần làm là gì?",
    answers: [
      "Tiếp tục công việc và báo cáo sau",
      "Báo cáo ngay cho quản lý trực tiếp và bộ phận HSE",
      "Tự xử lý sự cố",
      "Chờ người khác xử lý"
    ],
    correct: 1
  },
  {
    id: 2,
    title: "PPE bắt buộc tại khu vực hiện trường gồm những gì?",
    answers: [
      "Mũ bảo hộ, giày bảo hộ và áo phản quang",
      "Áo khoác cá nhân",
      "Điện thoại và thẻ xe",
      "Không bắt buộc"
    ],
    correct: 0
  }
];
