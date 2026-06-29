import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const DEFAULT_EMPLOYEE_PASSWORD = "abc@123456";
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

const HEADER_ALIASES = {
  password: ["mk dang nhap"],
  employeeCode: ["emp id"],
  fullName: ["ho va ten"],
  businessUnit: ["khoi"],
  departmentName: ["phong ban"],
  positionTitle: ["chuc danh"],
  workArea: ["dia diem lam viec"],
  hireDate: ["ngay vao lam"],
  isManager: ["is manager"]
};

const TABLES_FOR_BACKUP = ["departments", "employees", "employee_roles"];

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "eb-employee-sync-"));
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

function normalizeLookup(value) {
  return cleanText(value)
    .replace(/[Đđ]/g, "D")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function headerIndexes(header) {
  const normalizedHeader = header.map((item) => normalizeLookup(item));
  const result = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalizedHeader.findIndex((value) => aliases.includes(value));
    result[field] = index === -1 ? null : index;
  }

  return result;
}

function excelSerialDateToIso(value) {
  const text = cleanText(value);
  if (!text) {
    return null;
  }

  const serial = Number(text);
  if (!Number.isNaN(serial) && serial > 0) {
    const milliseconds = Math.round((serial - 25569) * 86400 * 1000);
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeDepartmentName(departmentName, businessUnit) {
  const department = cleanText(departmentName) || FALLBACK_DEPARTMENT_NAME;
  const normalizedDepartment = normalizeLookup(department);
  const normalizedBusinessUnit = normalizeLookup(businessUnit);

  if (normalizedDepartment === "ky thuat van phong") {
    return "Kỹ thuật văn phòng";
  }

  if (normalizedDepartment === "ky thuat hien truong") {
    return "Kỹ thuật hiện trường";
  }

  if (normalizedDepartment === "ky thuat") {
    if (normalizedBusinessUnit === "van phong") {
      return "Kỹ thuật văn phòng";
    }

    if (normalizedBusinessUnit === "hien truong") {
      return "Kỹ thuật hiện trường";
    }
  }

  return department;
}

function avatarInitial(fullName) {
  const words = cleanText(fullName).split(" ").filter(Boolean);
  const lastWord = words.at(-1) ?? fullName;
  return Array.from(lastWord)[0]?.toUpperCase() ?? "A";
}

function roleCodeFor(employee) {
  const isManagerText = normalizeLookup(employee.isManager);
  const positionText = normalizeLookup(employee.positionTitle);
  return isManagerText === "y" || positionText.includes("truong phong") ? "department_manager" : "employee";
}

function parseEmployeesFromRows(sheetName, rows) {
  const [header, ...dataRows] = rows;
  const indexes = headerIndexes(header ?? []);
  const missingHeaders = ["employeeCode", "fullName"].filter((field) => indexes[field] === null);
  if (missingHeaders.length > 0) {
    throw new Error(`Sheet ${sheetName} is missing required headers: ${missingHeaders.join(", ")}`);
  }

  const employees = [];
  const skipped = [];

  dataRows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const employeeCode = cleanText(row[indexes.employeeCode]);
    const fullName = cleanText(row[indexes.fullName]);

    if (!employeeCode && !fullName) {
      return;
    }

    if (!employeeCode) {
      skipped.push({
        sheetName,
        excelRow,
        fullName,
        reason: "missing Emp_ID"
      });
      return;
    }

    if (!fullName) {
      skipped.push({
        sheetName,
        excelRow,
        employeeCode,
        reason: "missing full name"
      });
      return;
    }

    if (employeeCode.toLowerCase() === "admin") {
      throw new Error(`Excel data must not contain reserved admin username at ${sheetName} row ${excelRow}.`);
    }

    employees.push({
      sourceSheet: sheetName,
      excelRow,
      employeeCode,
      username: employeeCode.toLowerCase(),
      fullName,
      password: cleanText(row[indexes.password]) || DEFAULT_EMPLOYEE_PASSWORD,
      departmentName: normalizeDepartmentName(row[indexes.departmentName], row[indexes.businessUnit]),
      workArea: cleanText(row[indexes.workArea]) || null,
      positionTitle: cleanText(row[indexes.positionTitle]) || null,
      hireDate: excelSerialDateToIso(row[indexes.hireDate]),
      isManager: cleanText(row[indexes.isManager]),
      avatarInitial: avatarInitial(fullName)
    });
  });

  return { employees, skipped };
}

async function parseWorkbook(inputPath, sheetFilters) {
  const { tempDir, extractDir } = await extractWorkbook(inputPath);
  try {
    const sharedStrings = await readSharedStrings(extractDir);
    const sheets = await readWorkbookSheets(extractDir);
    const normalizedSheetFilters = sheetFilters.map((sheetName) => normalizeLookup(sheetName));
    const employeeSheets = sheets.filter((sheet) => {
      const normalizedName = normalizeLookup(sheet.name);
      if (!normalizedName.startsWith("employees")) {
        return false;
      }

      return normalizedSheetFilters.length === 0 || normalizedSheetFilters.includes(normalizedName);
    });
    if (employeeSheets.length === 0) {
      throw new Error(
        normalizedSheetFilters.length === 0
          ? "Workbook does not contain any Employees sheets."
          : `Workbook does not contain matching Employees sheets: ${sheetFilters.join(", ")}`
      );
    }

    const employees = [];
    const skipped = [];
    for (const sheet of employeeSheets) {
      const rows = await readSheetRows(extractDir, sheet.target, sharedStrings);
      if (rows.length === 0) {
        continue;
      }

      const parsed = parseEmployeesFromRows(sheet.name, rows);
      employees.push(...parsed.employees);
      skipped.push(...parsed.skipped);
    }

    const seenUsernames = new Map();
    const duplicates = [];
    for (const employee of employees) {
      const existing = seenUsernames.get(employee.username);
      if (existing) {
        duplicates.push({
          username: employee.username,
          first: `${existing.sourceSheet} row ${existing.excelRow}`,
          duplicate: `${employee.sourceSheet} row ${employee.excelRow}`
        });
      } else {
        seenUsernames.set(employee.username, employee);
      }
    }

    if (duplicates.length > 0) {
      throw new Error(`Duplicate Emp_ID values in workbook: ${JSON.stringify(duplicates, null, 2)}`);
    }

    return { employees, skipped, sheetNames: employeeSheets.map((sheet) => sheet.name) };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `
    SELECT COUNT(*) AS total
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `,
    [tableName]
  );
  return Number(rows[0]?.total ?? 0) > 0;
}

async function ensureSchema(connection) {
  if (await tableExists(connection, "employees")) {
    return false;
  }

  const schemaSql = await readFile(path.join(root, "db", "schema.sql"), "utf8");
  await connection.query(schemaSql);
  return true;
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

async function backupTables(connection, existingTables) {
  const backup = {
    createdAt: new Date().toISOString(),
    tables: {}
  };

  for (const tableName of TABLES_FOR_BACKUP) {
    if (!existingTables.has(tableName)) {
      backup.tables[tableName] = null;
      continue;
    }

    const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
    backup.tables[tableName] = rows;
  }

  const outputDir = path.join(root, "backups");
  await mkdir(outputDir, { recursive: true });
  const timestamp = backup.createdAt.replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `employee-sync-backup-${timestamp}.json`);
  await writeFile(outputPath, JSON.stringify(backup, null, 2), "utf8");
  return outputPath;
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
      email = VALUES(email),
      department_id = VALUES(department_id),
      work_area = VALUES(work_area),
      position_title = VALUES(position_title),
      hire_date = VALUES(hire_date),
      avatar_initial = VALUES(avatar_initial),
      is_active = 1
    `,
    [adminPasswordHash, systemDepartmentId]
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

function buildDepartmentCodes(existingCodes, departmentNames) {
  const usedCodes = new Set(existingCodes);
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

async function ensureDepartments(connection, employees) {
  const departmentNames = [...new Set(employees.map((employee) => employee.departmentName))].sort((a, b) =>
    a.localeCompare(b, "vi")
  );
  const [existingRows] = await connection.query("SELECT id, code, name FROM departments");
  const existingByName = new Map(existingRows.map((row) => [cleanText(row.name), row]));
  const existingCodes = existingRows.map((row) => row.code);
  const newNames = departmentNames.filter((name) => !existingByName.has(name));
  const newDepartmentCodes = buildDepartmentCodes(existingCodes, newNames);

  for (const departmentName of departmentNames) {
    const existing = existingByName.get(departmentName);
    if (existing) {
      continue;
    }

    await connection.execute(
      `
      INSERT INTO departments (code, name, description)
      VALUES (?, ?, NULL)
      `,
      [newDepartmentCodes.get(departmentName), departmentName]
    );
  }

  const [rows] = await connection.query("SELECT id, name FROM departments");
  return {
    departmentIdsByName: new Map(rows.map((row) => [cleanText(row.name), row.id])),
    addedDepartments: newNames
  };
}

async function fetchRoleIds(connection) {
  const [rows] = await connection.query("SELECT id, code FROM roles");
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function fetchExistingEmployees(connection) {
  const [rows] = await connection.query(
    `
    SELECT id, employee_code, username, full_name, is_active
    FROM employees
    WHERE username <> 'admin'
    `
  );
  return rows;
}

async function readSummary(connection) {
  const [employeeRows] = await connection.query(
    `
    SELECT
      COUNT(*) AS totalEmployees,
      SUM(e.is_active = 1) AS activeEmployees,
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

  return {
    totalEmployees: Number(employeeRows[0].totalEmployees),
    activeEmployees: Number(employeeRows[0].activeEmployees),
    adminAccounts: Number(employeeRows[0].adminAccounts),
    totalDepartments: Number(departmentRows[0].totalDepartments),
    roles: roleRows.map((row) => ({
      code: row.code,
      employeeCount: Number(row.employeeCount)
    }))
  };
}

async function syncEmployees(connection, employees, options) {
  const existingTables = await fetchExistingTableNames(connection);
  const backupPath = options.dryRun ? null : await backupTables(connection, existingTables);

  if (options.dryRun) {
    const existingEmployees = existingTables.has("employees") ? await fetchExistingEmployees(connection) : [];
    const existingByUsername = new Map(existingEmployees.map((employee) => [employee.username.toLowerCase(), employee]));
    const sourceUsernames = new Set(employees.map((employee) => employee.username));
    return {
      backupPath,
      added: employees.filter((employee) => !existingByUsername.has(employee.username)).map((employee) => employee.username),
      updated: options.updateExisting
        ? employees.filter((employee) => existingByUsername.has(employee.username)).map((employee) => employee.username)
        : [],
      inactivated: existingEmployees
        .filter((employee) => Number(employee.is_active) === 1 && !sourceUsernames.has(employee.username.toLowerCase()))
        .map((employee) => employee.username),
      kept: employees.filter((employee) => existingByUsername.has(employee.username)).map((employee) => employee.username),
      addedDepartments: []
    };
  }

  await connection.beginTransaction();
  try {
    await ensureBaselineRoles(connection);
    const systemDepartmentId = await ensureSystemDepartment(connection);
    await ensureAdminAccount(connection, systemDepartmentId);
    const { departmentIdsByName, addedDepartments } = await ensureDepartments(connection, employees);
    const roleIds = await fetchRoleIds(connection);
    const existingEmployees = await fetchExistingEmployees(connection);
    const existingByUsername = new Map(existingEmployees.map((employee) => [employee.username.toLowerCase(), employee]));
    const sourceUsernames = new Set(employees.map((employee) => employee.username));
    const toAdd = employees.filter((employee) => !existingByUsername.has(employee.username));
    const toUpdate = options.updateExisting
      ? employees.filter((employee) => existingByUsername.has(employee.username))
      : [];
    const toInactivate = existingEmployees.filter(
      (employee) => Number(employee.is_active) === 1 && !sourceUsernames.has(employee.username.toLowerCase())
    );

    if (toInactivate.length > 0) {
      await connection.query("UPDATE employees SET is_active = 0 WHERE id IN (?)", [toInactivate.map((employee) => employee.id)]);
    }

    for (const employee of toAdd) {
      const departmentId = departmentIdsByName.get(employee.departmentName);
      if (!departmentId) {
        throw new Error(`Department was not inserted: ${employee.departmentName}`);
      }

      const roleCode = roleCodeFor(employee);
      const roleId = roleIds.get(roleCode) ?? roleIds.get("employee");
      if (!roleId) {
        throw new Error(`Role was not inserted: ${roleCode}`);
      }

      const [result] = await connection.execute(
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
        VALUES (?, ?, ?, '', ?, NULL, ?, ?, ?, ?, ?, 1)
        `,
        [
          employee.employeeCode,
          employee.username,
          employee.fullName,
          hashPassword(employee.password),
          departmentId,
          employee.workArea,
          employee.positionTitle,
          employee.hireDate,
          employee.avatarInitial
        ]
      );

      await connection.execute("INSERT INTO employee_roles (employee_id, role_id) VALUES (?, ?)", [result.insertId, roleId]);
    }

    for (const employee of toUpdate) {
      const existingEmployee = existingByUsername.get(employee.username);
      const departmentId = departmentIdsByName.get(employee.departmentName);
      if (!departmentId) {
        throw new Error(`Department was not inserted: ${employee.departmentName}`);
      }

      const roleCode = roleCodeFor(employee);
      const roleId = roleIds.get(roleCode) ?? roleIds.get("employee");
      if (!roleId) {
        throw new Error(`Role was not inserted: ${roleCode}`);
      }

      await connection.execute(
        `
        UPDATE employees
        SET employee_code = ?,
            full_name = ?,
            password_hash = ?,
            department_id = ?,
            work_area = ?,
            position_title = ?,
            hire_date = ?,
            avatar_initial = ?,
            is_active = 1
        WHERE id = ?
        `,
        [
          employee.employeeCode,
          employee.fullName,
          hashPassword(employee.password),
          departmentId,
          employee.workArea,
          employee.positionTitle,
          employee.hireDate,
          employee.avatarInitial,
          existingEmployee.id
        ]
      );

      await connection.execute("DELETE FROM employee_roles WHERE employee_id = ?", [existingEmployee.id]);
      await connection.execute("INSERT INTO employee_roles (employee_id, role_id) VALUES (?, ?)", [
        existingEmployee.id,
        roleId
      ]);
    }

    await connection.commit();
    return {
      backupPath,
      added: toAdd.map((employee) => employee.username),
      updated: toUpdate.map((employee) => employee.username),
      inactivated: toInactivate.map((employee) => employee.username),
      kept: employees.filter((employee) => existingByUsername.has(employee.username)).map((employee) => employee.username),
      addedDepartments
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let updateExisting = false;
  const sheetFilters = [];
  let inputPath = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--update-existing") {
      updateExisting = true;
      continue;
    }

    if (arg === "--sheet") {
      const sheetName = args[index + 1];
      if (!sheetName || sheetName.startsWith("--")) {
        throw new Error("--sheet requires a sheet name.");
      }
      sheetFilters.push(sheetName);
      index += 1;
      continue;
    }

    if (arg.startsWith("--sheet=")) {
      sheetFilters.push(arg.slice("--sheet=".length));
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    inputPath = arg;
  }

  if (!inputPath) {
    throw new Error(
      "Usage: node scripts/sync-employees-from-excel.mjs <path-to-xlsx> [--sheet <sheet-name>] [--dry-run]"
    );
  }

  return {
    dryRun,
    inputPath: path.resolve(inputPath),
    sheetFilters,
    updateExisting
  };
}

async function main() {
  const { dryRun, inputPath, sheetFilters, updateExisting } = parseArgs();
  if (!existsSync(inputPath)) {
    throw new Error(`Excel file not found: ${inputPath}`);
  }

  await loadEnvFile(".env");
  await loadEnvFile(".env.local");

  const parsedWorkbook = await parseWorkbook(inputPath, sheetFilters);
  const defaultPasswordCount = parsedWorkbook.employees.filter(
    (employee) => employee.password === DEFAULT_EMPLOYEE_PASSWORD
  ).length;
  const connection = await mysql.createConnection(getDatabaseConfig());
  try {
    const initializedSchema = dryRun ? false : await ensureSchema(connection);
    const changes = await syncEmployees(connection, parsedWorkbook.employees, { dryRun, updateExisting });
    const database = dryRun || !(await tableExists(connection, "employees")) ? null : await readSummary(connection);

    console.log(
      JSON.stringify(
        {
          dryRun,
          initializedSchema,
          source: {
            sheets: parsedWorkbook.sheetNames,
            employees: parsedWorkbook.employees.length,
            skippedRows: parsedWorkbook.skipped,
            defaultPasswordCount
          },
          changes: {
            addedCount: changes.added.length,
            updatedCount: changes.updated.length,
            inactivatedCount: changes.inactivated.length,
            keptCount: changes.kept.length,
            addedDepartments: changes.addedDepartments,
            addedSample: changes.added.slice(0, 20),
            updatedSample: changes.updated.slice(0, 20),
            inactivatedSample: changes.inactivated.slice(0, 20)
          },
          backupPath: changes.backupPath,
          database
        },
        null,
        2
      )
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Failed to sync employees:");
  console.error(error);
  process.exit(1);
});
