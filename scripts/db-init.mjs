import { readFile } from "node:fs/promises";
import { pbkdf2Sync } from "node:crypto";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

const root = process.cwd();
const demoEmployeeStartId = 1001;
const demoEmployeeCount = 72;
const demoEmployeeEndId = demoEmployeeStartId + demoEmployeeCount - 1;
const demoPassword = "123456";
const workAreas = [
  "Miền Trung",
  "Miền Bắc",
  "TPHCM",
  "Bình Dương",
  "Bình Phước",
  "Đồng Nai",
  "Bà Rịa Vũng Tàu",
  "Miền Tây"
];
const firstNames = [
  "Nguyễn",
  "Trần",
  "Lê",
  "Phạm",
  "Hoàng",
  "Võ",
  "Đặng",
  "Bùi",
  "Đỗ",
  "Hồ",
  "Ngô",
  "Dương"
];
const middleNames = ["Văn", "Thị", "Minh", "Thanh", "Quang", "Hữu", "Đức", "Anh", "Bảo", "Gia", "Hoài", "Khánh"];
const lastNames = [
  "An",
  "Bình",
  "Cường",
  "Dung",
  "Em",
  "Giang",
  "Hải",
  "Khoa",
  "Linh",
  "My",
  "Nam",
  "Phúc",
  "Quân",
  "Sơn",
  "Tâm",
  "Uyên",
  "Vy",
  "Yến"
];
const departments = [
  {
    id: 1,
    code: "HCNS",
    positions: ["Chuyên viên nhân sự", "Nhân viên hành chính", "Đào tạo nội bộ", "Tuyển dụng"]
  },
  {
    id: 2,
    code: "HSE",
    positions: ["Chuyên viên HSE", "Giám sát an toàn", "Điều phối HSE", "Trưởng ca HSE"]
  },
  {
    id: 3,
    code: "KTVP",
    positions: ["Kỹ sư thiết kế", "Kỹ sư dự toán", "Kỹ thuật văn phòng", "Kỹ sư hồ sơ"]
  },
  {
    id: 4,
    code: "KTHT",
    positions: ["Kỹ thuật hiện trường", "Giám sát thi công", "Kỹ sư cơ điện", "Tổ trưởng hiện trường"]
  },
  {
    id: 5,
    code: "DIEUPHOI",
    positions: ["Điều phối vận hành", "Điều phối hiện trường", "Nhân viên kế hoạch", "Trực điều phối"]
  },
  {
    id: 6,
    code: "KETOAN",
    positions: ["Kế toán tổng hợp", "Kế toán công nợ", "Kế toán kho", "Kế toán thanh toán"]
  }
];

async function loadEnvFile(filename) {
  try {
    const content = await readFile(path.join(root, filename), "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function hashPassword(password, salt) {
  const iterations = 120000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

await loadEnvFile(".env");

const config = {
  host: requireEnv("DATABASE_HOST"),
  port: Number(requireEnv("DATABASE_PORT")),
  user: requireEnv("DATABASE_USER"),
  password: requireEnv("DATABASE_PASSWORD"),
  multipleStatements: true
};

async function runSqlFile(connection, filename) {
  const filePath = path.join(root, "db", filename);
  const sql = await readFile(filePath, "utf8");
  await connection.query(sql);
}

async function ensureEmployeeColumn(connection, columnName, definition) {
  const [columns] = await connection.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'employees' AND COLUMN_NAME = ?
    `,
    [requireEnv("DATABASE_NAME"), columnName]
  );

  if (columns.length === 0) {
    const databaseName = requireEnv("DATABASE_NAME").replace(/`/g, "``");
    await connection.query(`ALTER TABLE \`${databaseName}\`.employees ADD COLUMN ${definition}`);
  }
}

function buildDemoEmployees() {
  return Array.from({ length: demoEmployeeCount }, (_, index) => {
    const id = demoEmployeeStartId + index;
    const ordinal = index + 1;
    const department = departments[index % departments.length];
    const fullName = `${firstNames[index % firstNames.length]} ${middleNames[index % middleNames.length]} ${lastNames[index % lastNames.length]}`;
    const employeeCode = `EBD${String(ordinal).padStart(3, "0")}`;
    const username = `demo${String(ordinal).padStart(3, "0")}`;
    const phone = `098${String(ordinal).padStart(7, "0")}`;
    const email = `${username}@electricbird.vn`;
    const workArea = workAreas[index % workAreas.length];
    const position = department.positions[Math.floor(index / departments.length) % department.positions.length];
    const hireMonth = (index % 12) + 1;
    const hireDay = (index % 24) + 1;
    const hireDate = `${2021 + (index % 5)}-${String(hireMonth).padStart(2, "0")}-${String(hireDay).padStart(2, "0")}`;

    return {
      id,
      employeeCode,
      username,
      fullName,
      phone,
      passwordHash: hashPassword(demoPassword, employeeCode),
      email,
      departmentId: department.id,
      workArea,
      position,
      hireDate,
      avatarInitial: lastNames[index % lastNames.length].slice(0, 1).toUpperCase(),
      isManager: index < departments.length
    };
  });
}

function assignmentFor(employee, testId, index) {
  const seed = employee.id + testId + index;
  const statusCycle = seed % 5;
  const completedStatus = statusCycle === 0 ? "failed" : statusCycle <= 3 ? "passed" : "studying";
  const score = completedStatus === "passed" ? 78 + (seed % 21) : completedStatus === "failed" ? 48 + (seed % 27) : null;
  const practiceCount = 1 + (seed % 6);
  const readProgress = completedStatus === "studying" ? 35 + (seed % 45) : completedStatus === "failed" ? 100 : 100;
  const officialUsed = completedStatus === "passed" || completedStatus === "failed" ? 1 : 0;
  const completedAt =
    completedStatus === "passed" || completedStatus === "failed"
      ? `2026-05-${String((seed % 20) + 1).padStart(2, "0")} ${String(8 + (seed % 9)).padStart(2, "0")}:30:00`
      : null;

  return [
    employee.id,
    testId,
    7,
    "2026-06-30 23:59:59",
    completedStatus,
    readProgress,
    practiceCount,
    officialUsed,
    score,
    completedAt
  ];
}

function resultStatus(score) {
  if (score >= 95) return "excellent";
  if (score >= 80) return "passed";
  if (score >= 70) return "review_required";
  return "failed";
}

async function seedDemoData(connection) {
  const employees = buildDemoEmployees();
  const employeeRows = employees.map((employee) => [
    employee.id,
    employee.employeeCode,
    employee.username,
    employee.fullName,
    employee.phone,
    employee.passwordHash,
    employee.email,
    employee.departmentId,
    employee.workArea,
    employee.position,
    employee.hireDate,
    employee.avatarInitial,
    1
  ]);

  await connection.query(
    `
    INSERT INTO employees
      (id, employee_code, username, full_name, phone, password_hash, email, department_id, work_area, position_title, hire_date, avatar_initial, is_active)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      full_name = VALUES(full_name),
      phone = VALUES(phone),
      email = VALUES(email),
      department_id = VALUES(department_id),
      work_area = VALUES(work_area),
      position_title = VALUES(position_title),
      hire_date = VALUES(hire_date),
      avatar_initial = VALUES(avatar_initial),
      is_active = VALUES(is_active)
    `,
    [employeeRows]
  );

  await connection.query("DELETE FROM employee_roles WHERE employee_id BETWEEN ? AND ?", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);
  await connection.query("INSERT INTO employee_roles (employee_id, role_id) VALUES ?", [
    employees.flatMap((employee) => (employee.isManager ? [[employee.id, 1], [employee.id, 2]] : [[employee.id, 1]]))
  ]);

  await connection.query("DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM test_attempts WHERE employee_id BETWEEN ? AND ?)", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);
  await connection.query("DELETE FROM attempt_questions WHERE attempt_id IN (SELECT id FROM test_attempts WHERE employee_id BETWEEN ? AND ?)", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);
  await connection.query("DELETE FROM test_attempts WHERE employee_id BETWEEN ? AND ?", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);
  await connection.query("DELETE FROM support_tickets WHERE employee_id BETWEEN ? AND ?", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);
  await connection.query("DELETE FROM notifications WHERE employee_id BETWEEN ? AND ?", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);

  const assignmentRows = employees.flatMap((employee, index) => {
    const tests = [1, 2];
    if (index % 2 === 0) tests.push(3);
    if (index % 3 === 0) tests.push(4);
    return tests.map((testId) => assignmentFor(employee, testId, index));
  });

  await connection.query(
    `
    INSERT INTO test_assignments
      (employee_id, test_id, assigned_by, due_at, status, read_progress_percent, practice_attempt_count, official_attempts_used, official_score, completed_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      due_at = VALUES(due_at),
      status = VALUES(status),
      read_progress_percent = VALUES(read_progress_percent),
      practice_attempt_count = VALUES(practice_attempt_count),
      official_attempts_used = VALUES(official_attempts_used),
      official_score = VALUES(official_score),
      completed_at = VALUES(completed_at)
    `,
    [assignmentRows]
  );

  const [completedAssignments] = await connection.query(
    `
    SELECT id, employee_id, test_id, official_score, completed_at
    FROM test_assignments
    WHERE employee_id BETWEEN ? AND ? AND status IN ('passed', 'failed')
    ORDER BY id
    `,
    [demoEmployeeStartId, demoEmployeeEndId]
  );
  const attemptRows = completedAssignments.map((assignment, index) => {
    const score = Number(assignment.official_score);
    const totalQuestions = assignment.test_id === 3 ? 20 : assignment.test_id === 4 ? 25 : 40;
    const correctAnswers = Math.round((score / 100) * totalQuestions);
    const submittedAt = assignment.completed_at instanceof Date
      ? assignment.completed_at.toISOString().slice(0, 19).replace("T", " ")
      : assignment.completed_at;

    return [
      assignment.id,
      assignment.employee_id,
      assignment.test_id,
      "official",
      1,
      submittedAt,
      submittedAt,
      720 + ((index % 16) * 45),
      totalQuestions,
      correctAnswers,
      score,
      resultStatus(score),
      1
    ];
  });

  if (attemptRows.length > 0) {
    await connection.query(
      `
      INSERT INTO test_attempts
        (assignment_id, employee_id, test_id, mode, attempt_no, started_at, submitted_at, time_spent_seconds, total_questions, correct_answers, score, result_status, is_recorded)
      VALUES ?
      `,
      [attemptRows]
    );
  }

  const notificationRows = employees.slice(0, 30).map((employee, index) => [
    employee.id,
    index % 3 === 0 ? "Bài test mới được giao" : index % 3 === 1 ? "Nhắc hoàn thành bài test" : "Cập nhật tài liệu đào tạo",
    index % 3 === 0
      ? "Bạn có bài test nội bộ mới cần hoàn thành trước hạn."
      : index % 3 === 1
        ? "Vui lòng hoàn thành bài test còn đang học trước ngày hết hạn."
        : "Tài liệu đào tạo liên quan đã được cập nhật phiên bản mới.",
    index % 3 === 0 ? "assignment" : index % 3 === 1 ? "result" : "material",
    index % 4 === 0 ? 1 : 0
  ]);

  if (notificationRows.length > 0) {
    await connection.query(
      "INSERT INTO notifications (employee_id, title, body, type, is_read) VALUES ?",
      [notificationRows]
    );
  }

  const supportRows = employees.filter((_, index) => index % 17 === 0).map((employee, index) => [
    employee.id,
    index % 2 === 0 ? "retake" : "test",
    index % 2 === 0 ? "Yêu cầu mở lượt thi lại" : "Cần hỗ trợ khi làm bài",
    index % 2 === 0
      ? "Nhân sự đã ôn lại tài liệu và muốn được mở thêm lượt thi chính thức."
      : "Nhân sự gặp vấn đề trong quá trình làm bài test nội bộ.",
    index % 2 === 0 ? "open" : "in_progress",
    6
  ]);

  if (supportRows.length > 0) {
    await connection.query(
      "INSERT INTO support_tickets (employee_id, category, title, content, status, assigned_to) VALUES ?",
      [supportRows]
    );
  }
}

async function main() {
  const connection = await mysql.createConnection(config);

  try {
    await runSqlFile(connection, "schema.sql");
    await ensureEmployeeColumn(connection, "password_hash", "password_hash VARCHAR(220) NOT NULL DEFAULT '' AFTER phone");
    await ensureEmployeeColumn(connection, "work_area", "work_area VARCHAR(120) NULL AFTER department_id");
    await runSqlFile(connection, "seed.sql");
    await seedDemoData(connection);
    console.log("Database eb_elearning initialized successfully.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Failed to initialize database:");
  console.error(error);
  process.exit(1);
});
