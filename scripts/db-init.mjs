import { readFile } from "node:fs/promises";
import { pbkdf2Sync } from "node:crypto";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

const root = process.cwd();
const demoEmployeeStartId = 1001;
const demoEmployeeCount = 96;
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

async function ensureIndex(connection, tableName, indexName, definition) {
  const [indexes] = await connection.query(
    `
    SELECT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
    LIMIT 1
    `,
    [requireEnv("DATABASE_NAME"), tableName, indexName]
  );

  if (indexes.length === 0) {
    const databaseName = requireEnv("DATABASE_NAME").replace(/`/g, "``");
    const safeTableName = tableName.replace(/`/g, "``");
    await connection.query(`ALTER TABLE \`${databaseName}\`.\`${safeTableName}\` ADD ${definition}`);
  }
}

async function dropIndexIfExists(connection, tableName, indexName) {
  const [indexes] = await connection.query(
    `
    SELECT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
    LIMIT 1
    `,
    [requireEnv("DATABASE_NAME"), tableName, indexName]
  );

  if (indexes.length > 0) {
    const databaseName = requireEnv("DATABASE_NAME").replace(/`/g, "``");
    const safeTableName = tableName.replace(/`/g, "``");
    const safeIndexName = indexName.replace(/`/g, "``");
    await connection.query(`ALTER TABLE \`${databaseName}\`.\`${safeTableName}\` DROP INDEX \`${safeIndexName}\``);
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
  const statusCycle = seed % 6;
  const completedStatus =
    statusCycle === 0 ? "failed" : statusCycle <= 2 ? "passed" : statusCycle === 3 ? "studying" : "not_started";
  const score =
    completedStatus === "passed"
      ? 76 + (seed % 23)
      : completedStatus === "failed"
        ? 42 + (seed % 32)
        : null;
  const practiceCount = completedStatus === "not_started" ? 0 : 1 + (seed % 7);
  const readProgress =
    completedStatus === "not_started" ? 0 : completedStatus === "studying" ? 25 + (seed % 60) : 100;
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

function resultStatus(score, passScoreValue = 80) {
  const passScore = Number.isFinite(Number(passScoreValue)) ? Number(passScoreValue) : 80;

  if (score >= Math.max(95, passScore)) return "excellent";
  if (score >= passScore) return "passed";
  if (score >= Math.max(0, passScore - 10)) return "review_required";
  return "failed";
}

function testsForEmployee(employee, index) {
  const tests = new Set([1, 2]);

  if (employee.departmentId === 1) tests.add(7);
  if (employee.departmentId === 2) tests.add(3);
  if (employee.departmentId === 3) tests.add(6);
  if (employee.departmentId === 4) tests.add(5);
  if (employee.departmentId === 5) tests.add(8);
  if (employee.departmentId === 6) tests.add(7);
  if (index % 3 === 0) tests.add(4);
  if (index % 4 === 0) tests.add(5);
  if (index % 5 === 0) tests.add(6);
  if (index % 7 === 0) tests.add(8);

  return [...tests].sort((a, b) => a - b);
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
    employees.map((employee) => [employee.id, employee.isManager ? 2 : 1])
  ]);

  await connection.query("DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM test_attempts WHERE employee_id BETWEEN ? AND ?)", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);
  await connection.query("DELETE FROM attempt_question_options WHERE attempt_id IN (SELECT id FROM test_attempts WHERE employee_id BETWEEN ? AND ?)", [
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
  await connection.query("DELETE FROM retake_requests WHERE employee_id BETWEEN ? AND ?", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);
  await connection.query("DELETE FROM material_progress WHERE employee_id BETWEEN ? AND ?", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);
  await connection.query("DELETE FROM notification_reads WHERE employee_id BETWEEN ? AND ?", [
    demoEmployeeStartId,
    demoEmployeeEndId
  ]);
  await connection.query("DELETE FROM test_assignments WHERE employee_id BETWEEN ? AND ?", [
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
    return testsForEmployee(employee, index).map((testId) => assignmentFor(employee, testId, index));
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

  const [materialAssignments] = await connection.query(
    `
    SELECT
      ta.employee_id,
      ta.test_id,
      tm.material_id,
      ta.read_progress_percent
    FROM test_assignments ta
    JOIN test_materials tm ON tm.test_id = ta.test_id
    WHERE ta.employee_id BETWEEN ? AND ?
    `,
    [demoEmployeeStartId, demoEmployeeEndId]
  );
  const materialRows = materialAssignments.map((row, index) => {
    const progress = Math.max(0, Math.min(100, Number(row.read_progress_percent) - (index % 3) * 10));
    const firstViewedAt = progress > 0 ? `2026-05-${String((index % 24) + 1).padStart(2, "0")} 08:00:00` : null;
    const lastViewedAt = progress > 0 ? `2026-05-${String((index % 24) + 1).padStart(2, "0")} 17:00:00` : null;
    const completedAt = progress >= 100 ? lastViewedAt : null;

    return [row.employee_id, row.material_id, progress, firstViewedAt, lastViewedAt, completedAt];
  });

  if (materialRows.length > 0) {
    await connection.query(
      `
      INSERT INTO material_progress
        (employee_id, material_id, read_progress_percent, first_viewed_at, last_viewed_at, completed_at)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        read_progress_percent = VALUES(read_progress_percent),
        first_viewed_at = VALUES(first_viewed_at),
        last_viewed_at = VALUES(last_viewed_at),
        completed_at = VALUES(completed_at)
      `,
      [materialRows]
    );
  }

  const [completedAssignments] = await connection.query(
    `
    SELECT
      ta.id,
      ta.employee_id,
      ta.test_id,
      ta.official_score,
      ta.completed_at,
      t.pass_score
    FROM test_assignments ta
    JOIN tests t ON t.id = ta.test_id
    WHERE ta.employee_id BETWEEN ? AND ? AND ta.status IN ('passed', 'failed')
    ORDER BY ta.id
    `,
    [demoEmployeeStartId, demoEmployeeEndId]
  );
  const attemptRows = completedAssignments.map((assignment, index) => {
    const score = Number(assignment.official_score);
    const questionCountByTest = {
      1: 40,
      2: 40,
      3: 20,
      4: 25,
      5: 30,
      6: 25,
      7: 20,
      8: 30
    };
    const totalQuestions = questionCountByTest[assignment.test_id] ?? 30;
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
      Number(assignment.pass_score),
      resultStatus(score, assignment.pass_score),
      1
    ];
  });

  if (attemptRows.length > 0) {
    await connection.query(
      `
      INSERT INTO test_attempts
        (assignment_id, employee_id, test_id, mode, attempt_no, started_at, submitted_at, time_spent_seconds, total_questions, correct_answers, score, pass_score_snapshot, result_status, is_recorded)
      VALUES ?
      `,
      [attemptRows]
    );
  }

  const [practiceAssignments] = await connection.query(
    `
    SELECT
      ta.id,
      ta.employee_id,
      ta.test_id,
      ta.practice_attempt_count,
      ta.status,
      t.pass_score
    FROM test_assignments ta
    JOIN tests t ON t.id = ta.test_id
    WHERE ta.employee_id BETWEEN ? AND ? AND ta.practice_attempt_count > 0
    ORDER BY ta.id
    `,
    [demoEmployeeStartId, demoEmployeeEndId]
  );
  const practiceRows = practiceAssignments.map((assignment, index) => {
    const score = 52 + ((assignment.employee_id + assignment.test_id + index) % 43);
    const questionCountByTest = {
      1: 40,
      2: 40,
      3: 20,
      4: 25,
      5: 30,
      6: 25,
      7: 20,
      8: 30
    };
    const totalQuestions = questionCountByTest[assignment.test_id] ?? 30;
    const correctAnswers = Math.round((score / 100) * totalQuestions);
    const day = String(((assignment.employee_id + index) % 24) + 1).padStart(2, "0");
    const submittedAt = `2026-05-${day} ${String(9 + (index % 8)).padStart(2, "0")}:15:00`;

    return [
      assignment.id,
      assignment.employee_id,
      assignment.test_id,
      "practice",
      assignment.practice_attempt_count,
      submittedAt,
      submittedAt,
      420 + ((index % 12) * 40),
      totalQuestions,
      correctAnswers,
      score,
      Number(assignment.pass_score),
      resultStatus(score, assignment.pass_score),
      0
    ];
  });

  if (practiceRows.length > 0) {
    await connection.query(
      `
      INSERT INTO test_attempts
        (assignment_id, employee_id, test_id, mode, attempt_no, started_at, submitted_at, time_spent_seconds, total_questions, correct_answers, score, pass_score_snapshot, result_status, is_recorded)
      VALUES ?
      `,
      [practiceRows]
    );
  }

  const [attemptDetailRows] = await connection.query(
    `
    SELECT id, test_id, score
    FROM test_attempts
    WHERE employee_id BETWEEN ? AND ?
    ORDER BY id
    `,
    [demoEmployeeStartId, demoEmployeeEndId]
  );
  const [questionOptionRows] = await connection.query(
    `
    SELECT
      q.id AS question_id,
      q.test_id,
      q.question_text,
      q.explanation,
      q.difficulty,
      qg.name AS group_name,
      correct.id AS correct_option_id,
      wrong.id AS wrong_option_id
    FROM questions q
    LEFT JOIN question_groups qg ON qg.id = q.group_id
    JOIN answer_options correct ON correct.question_id = q.id AND correct.is_correct = 1
    LEFT JOIN answer_options wrong
      ON wrong.id = (
        SELECT MIN(candidate.id)
        FROM answer_options candidate
        WHERE candidate.question_id = q.id AND candidate.is_correct = 0
      )
    WHERE q.is_active = 1
    ORDER BY q.test_id, q.id
    `
  );
  const [allOptionRows] = await connection.query(
    `
    SELECT
      ao.id AS option_id,
      ao.question_id,
      ao.option_label,
      ao.option_text,
      ao.is_correct
    FROM answer_options ao
    JOIN questions q ON q.id = ao.question_id
    WHERE q.is_active = 1
    ORDER BY ao.question_id, ao.sort_order, ao.id
    `
  );
  const questionsByTest = new Map();
  for (const row of questionOptionRows) {
    const list = questionsByTest.get(row.test_id) ?? [];
    list.push(row);
    questionsByTest.set(row.test_id, list);
  }
  const optionsByQuestion = new Map();
  for (const row of allOptionRows) {
    const list = optionsByQuestion.get(row.question_id) ?? [];
    list.push(row);
    optionsByQuestion.set(row.question_id, list);
  }

  const attemptQuestionRows = [];
  const attemptQuestionOptionRows = [];
  const attemptAnswerRows = [];
  for (const attempt of attemptDetailRows) {
    const testQuestions = questionsByTest.get(attempt.test_id) ?? [];
    const correctTarget = Math.round((Number(attempt.score) / 100) * testQuestions.length);

    testQuestions.forEach((question, index) => {
      const isCorrect = index < correctTarget;
      const selectedOptionId = isCorrect ? question.correct_option_id : (question.wrong_option_id ?? question.correct_option_id);
      attemptQuestionRows.push([
        attempt.id,
        question.question_id,
        index + 1,
        question.question_text,
        question.explanation,
        question.difficulty,
        question.group_name
      ]);
      (optionsByQuestion.get(question.question_id) ?? []).forEach((option, optionIndex) => {
        attemptQuestionOptionRows.push([
          attempt.id,
          question.question_id,
          option.option_id,
          optionIndex + 1,
          option.option_label,
          option.option_text,
          option.is_correct ? 1 : 0
        ]);
      });
      attemptAnswerRows.push([attempt.id, question.question_id, selectedOptionId, isCorrect ? 1 : 0]);
    });
  }

  if (attemptQuestionRows.length > 0) {
    await connection.query(
      `
      INSERT IGNORE INTO attempt_questions
        (attempt_id, question_id, question_order, question_text_snapshot, explanation_snapshot, difficulty_snapshot, group_name_snapshot)
      VALUES ?
      `,
      [attemptQuestionRows]
    );
  }

  if (attemptQuestionOptionRows.length > 0) {
    await connection.query(
      `
      INSERT IGNORE INTO attempt_question_options
        (attempt_id, question_id, option_id, option_order, option_label_snapshot, option_text_snapshot, is_correct_snapshot)
      VALUES ?
      `,
      [attemptQuestionOptionRows]
    );
  }

  if (attemptAnswerRows.length > 0) {
    await connection.query("INSERT IGNORE INTO attempt_answers (attempt_id, question_id, selected_option_id, is_correct) VALUES ?", [
      attemptAnswerRows
    ]);
  }

  const [failedAssignments] = await connection.query(
    `
    SELECT id, employee_id, test_id
    FROM test_assignments
    WHERE employee_id BETWEEN ? AND ? AND status = 'failed'
    ORDER BY id
    `,
    [demoEmployeeStartId, demoEmployeeEndId]
  );
  const retakeRows = failedAssignments.slice(0, 36).map((assignment, index) => {
    const statuses = ["pending", "approved", "rejected"];
    const status = statuses[index % statuses.length];
    const requestedDay = String((index % 24) + 1).padStart(2, "0");
    const reviewedAt = status === "pending" ? null : `2026-05-${requestedDay} 16:30:00`;
    const reviewNote =
      status === "approved"
        ? "Đã mở lại lượt thi sau khi nhân sự học lại tài liệu."
        : status === "rejected"
          ? "Chưa đủ căn cứ mở lại lượt thi, cần hoàn thành tài liệu bổ sung."
          : null;

    return [
      assignment.id,
      assignment.employee_id,
      assignment.test_id,
      "Nhân sự đã học lại tài liệu và đề nghị mở thêm lượt thi chính thức.",
      status,
      `2026-05-${requestedDay} 15:30:00`,
      status === "pending" ? null : 6,
      reviewedAt,
      reviewNote
    ];
  });

  if (retakeRows.length > 0) {
    await connection.query(
      `
      INSERT INTO retake_requests
        (assignment_id, employee_id, test_id, reason, status, requested_at, reviewed_by, reviewed_at, review_note)
      VALUES ?
      `,
      [retakeRows]
    );
  }

  const notificationRows = employees.slice(0, 72).flatMap((employee, index) => {
    const primaryType = index % 4 === 0 ? "assignment" : index % 4 === 1 ? "material" : index % 4 === 2 ? "result" : "retake";
    const primaryTitle =
      primaryType === "assignment"
        ? "Bài test mới được giao"
        : primaryType === "material"
          ? "Cập nhật tài liệu đào tạo"
          : primaryType === "result"
            ? "Kết quả bài test đã được ghi nhận"
            : "Theo dõi yêu cầu thi lại";
    const primaryBody =
      primaryType === "assignment"
        ? "Bạn có bài test nội bộ mới cần hoàn thành trước hạn."
        : primaryType === "material"
          ? "Tài liệu đào tạo liên quan đã được cập nhật phiên bản mới."
          : primaryType === "result"
            ? "Điểm chính thức của bạn đã được ghi nhận vào hệ thống."
            : "Yêu cầu mở lượt thi lại của bạn đang được xử lý.";

    return [
      [employee.id, primaryTitle, primaryBody, primaryType, index % 4 === 0 ? 0 : 1],
      [
        employee.id,
        "Nhắc hoàn thành bài test",
        "Vui lòng kiểm tra các bài test còn đang học và hoàn thành trước hạn.",
        "system",
        index % 5 === 0 ? 0 : 1
      ]
    ];
  });

  if (notificationRows.length > 0) {
    await connection.query(
      "INSERT INTO notifications (employee_id, title, body, type, is_read) VALUES ?",
      [notificationRows]
    );
  }

  const supportRows = employees.filter((_, index) => index % 9 === 0).map((employee, index) => {
    const categories = ["retake", "test", "material", "login", "system"];
    const statuses = ["open", "in_progress", "resolved", "closed"];
    const category = categories[index % categories.length];
    const title =
      category === "retake"
        ? "Yêu cầu mở lượt thi lại"
        : category === "test"
          ? "Cần hỗ trợ khi làm bài"
          : category === "material"
            ? "Không mở được tài liệu"
            : category === "login"
              ? "Cần hỗ trợ đăng nhập"
              : "Góp ý hệ thống đào tạo";
    const content =
      category === "retake"
        ? "Nhân sự đã ôn lại tài liệu và muốn được mở thêm lượt thi chính thức."
        : category === "test"
          ? "Nhân sự gặp vấn đề trong quá trình làm bài test nội bộ."
          : category === "material"
            ? "Tài liệu đào tạo không mở được trên trình duyệt hiện tại."
            : category === "login"
              ? "Nhân sự cần kiểm tra thông tin tài khoản đăng nhập."
              : "Nhân sự góp ý cải thiện trải nghiệm sử dụng hệ thống.";

    return [employee.id, category, title, content, statuses[index % statuses.length], 6];
  });

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
    await ensureIndex(connection, "retake_requests", "idx_retake_assignment", "KEY idx_retake_assignment (assignment_id)");
    await ensureIndex(
      connection,
      "retake_requests",
      "idx_retake_status_assignment",
      "KEY idx_retake_status_assignment (status, assignment_id)"
    );
    await ensureIndex(
      connection,
      "test_attempts",
      "idx_attempts_assignment_mode_submitted",
      "KEY idx_attempts_assignment_mode_submitted (assignment_id, mode, submitted_at, id)"
    );
    await ensureIndex(
      connection,
      "test_attempts",
      "idx_attempts_employee_mode_submitted",
      "KEY idx_attempts_employee_mode_submitted (employee_id, mode, submitted_at)"
    );
    await dropIndexIfExists(connection, "retake_requests", "uq_retake_assignment_once");
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
