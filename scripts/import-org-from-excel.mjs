import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const FALLBACK_DEPARTMENT_NAME = "Chưa phân phòng";
const SYSTEM_DEPARTMENT = {
  code: "SYSTEM",
  name: "System",
  description: "Tài khoản hệ thống"
};

const ROLE_DEFINITIONS = [
  ["employee", "Nhân sự", "Xem tài liệu, làm thử, làm chính thức, xem kết quả cá nhân"],
  ["department_manager", "Trưởng phòng", "Xem kết quả nhân sự thuộc phòng mình"],
  ["admin", "Admin", "Toàn quyền"]
];

const PERMISSION_DEFINITIONS = [
  ["materials.read", "Xem tài liệu"],
  ["practice.create", "Làm thử"],
  ["official.create", "Làm chính thức"],
  ["results.self.read", "Xem kết quả cá nhân"],
  ["results.department.read", "Xem kết quả theo phòng ban"],
  ["admin.dashboard.read", "Xem dashboard admin"],
  ["questions.manage", "Quản lý ngân hàng câu hỏi"],
  ["materials.manage", "Quản lý tài liệu đào tạo"],
  ["assignments.manage", "Giao bài test"],
  ["system.manage", "Cài đặt hệ thống"]
];

const ROLE_PERMISSIONS = {
  employee: ["materials.read", "practice.create", "official.create", "results.self.read"],
  department_manager: [
    "materials.read",
    "practice.create",
    "official.create",
    "results.self.read",
    "results.department.read"
  ],
  admin: PERMISSION_DEFINITIONS.map(([code]) => code)
};

const TABLES_TO_CLEAR = [
  "notification_reads",
  "attempt_answers",
  "attempt_question_options",
  "attempt_questions",
  "test_attempts",
  "retake_requests",
  "material_progress",
  "test_assignments",
  "test_materials",
  "answer_options",
  "questions",
  "question_groups",
  "support_tickets",
  "notifications",
  "audit_logs",
  "training_materials",
  "tests"
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
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
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

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return {
      uri: process.env.DATABASE_URL,
      multipleStatements: true,
      charset: "utf8mb4"
    };
  }

  return {
    host: requireEnv("DATABASE_HOST"),
    port: Number(requireEnv("DATABASE_PORT")),
    user: requireEnv("DATABASE_USER"),
    password: requireEnv("DATABASE_PASSWORD"),
    database: requireEnv("DATABASE_NAME"),
    multipleStatements: true,
    charset: "utf8mb4"
  };
}

function hashPassword(password, salt = randomBytes(16).toString("base64url")) {
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString(
    "base64url"
  );

  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function extractWorkbook(inputPath) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "eb-org-import-"));
  const zipPath = path.join(tempDir, "workbook.zip");
  const extractDir = path.join(tempDir, "xlsx");
  await copyFile(inputPath, zipPath);

  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `New-Item -ItemType Directory -Force -Path ${psQuote(extractDir)} | Out-Null; Expand-Archive -LiteralPath ${psQuote(
        zipPath
      )} -DestinationPath ${psQuote(extractDir)} -Force`
    ],
    { stdio: "pipe" }
  );

  return { tempDir, extractDir };
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function parseAttributes(xml) {
  const attributes = {};
  for (const match of xml.matchAll(/([\w:]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
}

async function readXml(filePath) {
  return readFile(filePath, "utf8");
}

async function readSharedStrings(extractDir) {
  const sharedStringsPath = path.join(extractDir, "xl", "sharedStrings.xml");
  if (!existsSync(sharedStringsPath)) {
    return [];
  }

  const xml = await readXml(sharedStringsPath);
  const strings = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [];
    for (const textMatch of match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
      parts.push(decodeXml(textMatch[1]));
    }
    strings.push(parts.join(""));
  }
  return strings;
}

async function readWorkbookSheets(extractDir) {
  const workbookXml = await readXml(path.join(extractDir, "xl", "workbook.xml"));
  const relsXml = await readXml(path.join(extractDir, "xl", "_rels", "workbook.xml.rels"));
  const relTargets = new Map();

  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const attributes = parseAttributes(match[0]);
    if (attributes.Id && attributes.Target) {
      relTargets.set(attributes.Id, attributes.Target);
    }
  }

  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const attributes = parseAttributes(match[0]);
    const relationshipId = attributes["r:id"];
    if (attributes.name && relationshipId && relTargets.has(relationshipId)) {
      sheets.push({
        name: attributes.name,
        target: relTargets.get(relationshipId)
      });
    }
  }

  return sheets;
}

function columnIndex(cellRef) {
  const letters = /^[A-Z]+/.exec(cellRef)?.[0] ?? "";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return index;
}

function cellText(cellXml, attributes, sharedStrings) {
  if (attributes.t === "inlineStr") {
    return Array.from(cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (match) => decodeXml(match[1])).join("");
  }

  const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] ?? "";
  if (!value) {
    return "";
  }

  if (attributes.t === "s") {
    return sharedStrings[Number(value)] ?? "";
  }

  return decodeXml(value);
}

async function readSheetRows(extractDir, sheetTarget, sharedStrings) {
  const sheetPath = path.join(extractDir, "xl", sheetTarget);
  const xml = await readXml(sheetPath);
  const rows = [];

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const cellMatch of rowMatch[1].matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      const attributes = parseAttributes(cellMatch[0]);
      const index = columnIndex(attributes.r ?? "");
      if (index > 0) {
        cells.set(index, cellText(cellMatch[0], attributes, sharedStrings));
      }
    }

    if (cells.size === 0) {
      continue;
    }

    const maxColumn = Math.max(...cells.keys());
    const values = [];
    for (let index = 1; index <= maxColumn; index += 1) {
      values.push(cells.get(index) ?? "");
    }

    if (values.join("").trim()) {
      rows.push(values);
    }
  }

  return rows;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForCode(value) {
  return cleanText(value)
    .replace(/[Đđ]/g, "D")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

function buildDepartmentCodes(departmentNames) {
  const usedCodes = new Set([SYSTEM_DEPARTMENT.code]);
  const result = new Map();

  for (const departmentName of departmentNames) {
    const baseCode = normalizeForCode(departmentName) || "DEPARTMENT";
    let code = baseCode;
    let suffix = 2;
    while (usedCodes.has(code)) {
      const suffixText = `_${suffix}`;
      code = `${baseCode.slice(0, 30 - suffixText.length)}${suffixText}`;
      suffix += 1;
    }

    usedCodes.add(code);
    result.set(departmentName, code);
  }

  return result;
}

function avatarInitial(fullName) {
  const words = cleanText(fullName).split(" ").filter(Boolean);
  const lastWord = words.at(-1) ?? fullName;
  return Array.from(lastWord)[0]?.toUpperCase() ?? "A";
}

function isDepartmentManager(title) {
  return cleanText(title).toLocaleLowerCase("vi-VN").includes("trưởng phòng");
}

function parseEmployees(rows) {
  const [header, ...dataRows] = rows;
  const expectedHeader = ["MK đăng nhập", "Emp_ID", "Họ và tên", "Phòng/Ban", "Chức danh"];
  for (let index = 0; index < expectedHeader.length; index += 1) {
    if (cleanText(header?.[index]) !== expectedHeader[index]) {
      throw new Error(`Unexpected Employees header at column ${index + 1}: ${header?.[index] ?? ""}`);
    }
  }

  const employees = [];
  const usernames = new Set();

  dataRows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const password = cleanText(row[0]);
    const username = cleanText(row[1]);
    const fullName = cleanText(row[2]);
    const departmentName = cleanText(row[3]) || FALLBACK_DEPARTMENT_NAME;
    const positionTitle = cleanText(row[4]) || null;
    const workArea = cleanText(row[5]) || null;

    if (!password || !username || !fullName) {
      throw new Error(`Missing password, Emp_ID or name at Excel row ${excelRow}`);
    }
    if (username.toLowerCase() === "admin") {
      throw new Error("Excel data must not contain the reserved admin username.");
    }
    if (username.length > 30) {
      throw new Error(`Emp_ID is longer than employees.employee_code at Excel row ${excelRow}: ${username}`);
    }
    if (usernames.has(username)) {
      throw new Error(`Duplicate Emp_ID in Excel data: ${username}`);
    }

    usernames.add(username);
    employees.push({
      excelRow,
      employeeCode: username,
      username,
      fullName,
      phone: "",
      passwordHash: hashPassword(password),
      email: null,
      departmentName,
      workArea,
      positionTitle,
      hireDate: null,
      avatarInitial: avatarInitial(fullName),
      roleCode: isDepartmentManager(positionTitle) ? "department_manager" : "employee"
    });
  });

  return employees;
}

async function parseWorkbook(inputPath) {
  const { tempDir, extractDir } = await extractWorkbook(inputPath);
  try {
    const sharedStrings = await readSharedStrings(extractDir);
    const sheets = await readWorkbookSheets(extractDir);
    const employeesSheet = sheets.find((sheet) => cleanText(sheet.name).toLowerCase() === "employees");
    if (!employeesSheet) {
      throw new Error("Workbook does not contain an Employees sheet.");
    }

    const rows = await readSheetRows(extractDir, employeesSheet.target, sharedStrings);
    return parseEmployees(rows);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function fetchExistingTableNames(connection) {
  const [rows] = await connection.query(
    `
    SELECT TABLE_NAME AS tableName
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
    `
  );
  return new Set(rows.map((row) => row.tableName));
}

async function ensureBaselineRoles(connection) {
  for (const [code, name, description] of ROLE_DEFINITIONS) {
    await connection.execute(
      `
      INSERT INTO roles (code, name, description)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        description = VALUES(description)
      `,
      [code, name, description]
    );
  }

  for (const [code, name] of PERMISSION_DEFINITIONS) {
    await connection.execute(
      `
      INSERT INTO permissions (code, name)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
      `,
      [code, name]
    );
  }

  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permissionCode of permissionCodes) {
      await connection.execute(
        `
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        JOIN permissions p ON p.code = ?
        WHERE r.code = ?
        ON DUPLICATE KEY UPDATE permission_id = permission_id
        `,
        [permissionCode, roleCode]
      );
    }
  }
}

async function clearOldData(connection, existingTables) {
  for (const tableName of TABLES_TO_CLEAR) {
    if (existingTables.has(tableName)) {
      await connection.query(`DELETE FROM \`${tableName}\``);
    }
  }

  await connection.execute(
    `
    DELETE er
    FROM employee_roles er
    JOIN employees e ON e.id = er.employee_id
    WHERE e.username <> 'admin'
    `
  );
  await connection.execute("DELETE FROM employees WHERE username <> 'admin'");
}

async function ensureSystemDepartment(connection) {
  await connection.execute(
    `
    INSERT INTO departments (code, name, description)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      description = VALUES(description)
    `,
    [SYSTEM_DEPARTMENT.code, SYSTEM_DEPARTMENT.name, SYSTEM_DEPARTMENT.description]
  );

  const [rows] = await connection.execute("SELECT id FROM departments WHERE code = ? LIMIT 1", [
    SYSTEM_DEPARTMENT.code
  ]);
  return rows[0].id;
}

async function ensureAdminAccount(connection, systemDepartmentId) {
  const adminPasswordHash = hashPassword("admin", "ADMIN");

  await connection.execute(
    `
    INSERT INTO employees (
      employee_code,
      username,
      full_name,
      phone,
      password_hash,
      email,
      department_id,
      work_area,
      position_title,
      hire_date,
      avatar_initial,
      is_active
    )
    VALUES ('ADMIN', 'admin', 'Admin', 'admin', ?, 'admin@electricbird.vn', ?, NULL, 'Admin', NULL, 'A', 1)
    ON DUPLICATE KEY UPDATE
      employee_code = VALUES(employee_code),
      full_name = VALUES(full_name),
      phone = VALUES(phone),
      password_hash = VALUES(password_hash),
      email = VALUES(email),
      department_id = VALUES(department_id),
      work_area = VALUES(work_area),
      position_title = VALUES(position_title),
      hire_date = VALUES(hire_date),
      avatar_initial = VALUES(avatar_initial),
      is_active = VALUES(is_active)
    `,
    [adminPasswordHash, systemDepartmentId]
  );

  await connection.execute(
    `
    DELETE er
    FROM employee_roles er
    JOIN employees e ON e.id = er.employee_id
    WHERE e.username = 'admin'
    `
  );
  await connection.execute(
    `
    INSERT INTO employee_roles (employee_id, role_id)
    SELECT e.id, r.id
    FROM employees e
    JOIN roles r ON r.code = 'admin'
    WHERE e.username = 'admin'
    ON DUPLICATE KEY UPDATE role_id = role_id
    `
  );
}

async function replaceDepartments(connection, departmentCodes) {
  await connection.execute("DELETE FROM departments WHERE code <> ?", [SYSTEM_DEPARTMENT.code]);

  for (const [departmentName, departmentCode] of departmentCodes.entries()) {
    await connection.execute(
      `
      INSERT INTO departments (code, name, description)
      VALUES (?, ?, NULL)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        description = VALUES(description)
      `,
      [departmentCode, departmentName]
    );
  }

  const [rows] = await connection.query("SELECT id, code FROM departments");
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function importEmployees(connection, employees, departmentCodes, departmentIds) {
  for (const employee of employees) {
    const departmentCode = departmentCodes.get(employee.departmentName);
    const departmentId = departmentIds.get(departmentCode);
    if (!departmentId) {
      throw new Error(`Department was not inserted: ${employee.departmentName}`);
    }

    await connection.execute(
      `
      INSERT INTO employees (
        employee_code,
        username,
        full_name,
        phone,
        password_hash,
        email,
        department_id,
        work_area,
        position_title,
        hire_date,
        avatar_initial,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        employee.employeeCode,
        employee.username,
        employee.fullName,
        employee.phone,
        employee.passwordHash,
        employee.email,
        departmentId,
        employee.workArea,
        employee.positionTitle,
        employee.hireDate,
        employee.avatarInitial
      ]
    );

    await connection.execute(
      `
      INSERT INTO employee_roles (employee_id, role_id)
      SELECT e.id, r.id
      FROM employees e
      JOIN roles r ON r.code = ?
      WHERE e.username = ?
      `,
      [employee.roleCode, employee.username]
    );
  }
}

async function readImportSummary(connection) {
  const [employeeRows] = await connection.query(
    `
    SELECT
      COUNT(*) AS totalEmployees,
      SUM(e.username = 'admin') AS adminAccounts
    FROM employees e
    `
  );
  const [departmentRows] = await connection.query("SELECT COUNT(*) AS totalDepartments FROM departments");
  const [roleRows] = await connection.query(
    `
    SELECT r.code, COUNT(er.employee_id) AS employeeCount
    FROM roles r
    LEFT JOIN employee_roles er ON er.role_id = r.id
    GROUP BY r.id, r.code
    ORDER BY r.code
    `
  );
  const [managerRows] = await connection.query(
    `
    SELECT e.username, e.full_name AS fullName, d.name AS departmentName, e.position_title AS positionTitle
    FROM employees e
    JOIN departments d ON d.id = e.department_id
    JOIN employee_roles er ON er.employee_id = e.id
    JOIN roles r ON r.id = er.role_id
    WHERE r.code = 'department_manager'
    ORDER BY d.name, e.full_name
    `
  );

  return {
    totalEmployees: Number(employeeRows[0].totalEmployees),
    adminAccounts: Number(employeeRows[0].adminAccounts),
    totalDepartments: Number(departmentRows[0].totalDepartments),
    roles: roleRows,
    managers: managerRows
  };
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : "";
  if (!inputPath) {
    throw new Error("Usage: node scripts/import-org-from-excel.mjs <path-to-xlsx>");
  }
  if (!existsSync(inputPath)) {
    throw new Error(`Excel file not found: ${inputPath}`);
  }

  await loadEnvFile(".env");
  await loadEnvFile(".env.local");

  const employees = await parseWorkbook(inputPath);
  const departmentNames = [...new Set(employees.map((employee) => employee.departmentName))].sort((a, b) =>
    a.localeCompare(b, "vi")
  );
  const departmentCodes = buildDepartmentCodes(departmentNames);
  const managerCount = employees.filter((employee) => employee.roleCode === "department_manager").length;

  const connection = await mysql.createConnection(getDatabaseConfig());
  try {
    await connection.beginTransaction();

    const existingTables = await fetchExistingTableNames(connection);
    await ensureBaselineRoles(connection);
    await clearOldData(connection, existingTables);
    const systemDepartmentId = await ensureSystemDepartment(connection);
    await ensureAdminAccount(connection, systemDepartmentId);
    const departmentIds = await replaceDepartments(connection, departmentCodes);
    await importEmployees(connection, employees, departmentCodes, departmentIds);

    await connection.commit();

    const summary = await readImportSummary(connection);
    console.log(
      JSON.stringify(
        {
          importedEmployees: employees.length,
          importedManagers: managerCount,
          importedDepartments: departmentNames.length,
          database: summary
        },
        null,
        2
      )
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Failed to import organization data:");
  console.error(error);
  process.exit(1);
});
