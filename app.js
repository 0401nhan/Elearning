const root = process.cwd();

let createServer;
let readFile;
let path;
let next;
let mysql;

const MIN_PRODUCTION_SESSION_SECRET_LENGTH = 32;
const INSECURE_SESSION_SECRETS = new Set([
  "development-session-secret-change-me",
  "replace_with_a_long_random_secret",
  "change-me",
  "changeme",
  "password",
  "secret"
]);

async function loadRuntimeModules() {
  ({ createServer } = await import("node:http"));
  ({ readFile } = await import("node:fs/promises"));
  path = await import("node:path");

  const mysqlModule = await import("mysql2/promise");
  mysql = mysqlModule.default ?? mysqlModule;
}

async function loadNextModule() {
  next = (await import("next")).default;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  const value = trimmed
    .slice(separatorIndex + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");

  return key ? [key, value] : null;
}

async function loadEnvFile(filename) {
  try {
    const content = await readFile(path.join(root, filename), "utf8");

    for (const line of content.split(/\r?\n/)) {
      const entry = parseEnvLine(line);
      if (!entry) {
        continue;
      }

      const [key, value] = entry;
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

function validateStartupEnv() {
  if (process.env.NODE_ENV === "production") {
    const sessionSecret = requireEnv("SESSION_SECRET");
    const normalizedSecret = sessionSecret.trim().toLowerCase();

    if (
      sessionSecret.length < MIN_PRODUCTION_SESSION_SECRET_LENGTH ||
      INSECURE_SESSION_SECRETS.has(normalizedSecret)
    ) {
      throw new Error(
        `SESSION_SECRET must be a private random string with at least ${MIN_PRODUCTION_SESSION_SECRET_LENGTH} characters in production.`
      );
    }
  }
}

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!databaseName) {
      throw new Error("DATABASE_URL must include a database name.");
    }

    return {
      connection: {
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        multipleStatements: true,
        charset: "utf8mb4"
      },
      databaseName
    };
  }

  return {
    connection: {
      host: requireEnv("DATABASE_HOST"),
      port: Number(requireEnv("DATABASE_PORT")),
      user: requireEnv("DATABASE_USER"),
      password: requireEnv("DATABASE_PASSWORD"),
      multipleStatements: true,
      charset: "utf8mb4"
    },
    databaseName: requireEnv("DATABASE_NAME")
  };
}

function quoteIdentifier(identifier) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

function normalizeSqlDatabaseName(sql, databaseName) {
  const quotedName = quoteIdentifier(databaseName);

  return sql
    .replace(
      /CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+[`"]?eb_elearning[`"]?\s+CHARACTER\s+SET\s+utf8mb4\s+COLLATE\s+utf8mb4_unicode_ci\s*;/i,
      `CREATE DATABASE IF NOT EXISTS ${quotedName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    )
    .replace(/USE\s+[`"]?eb_elearning[`"]?\s*;/gi, `USE ${quotedName};`);
}

function stripDatabaseSelectionSql(sql) {
  return sql
    .replace(
      /CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+[`"]?[^`";\s]+[`"]?\s+CHARACTER\s+SET\s+utf8mb4\s+COLLATE\s+utf8mb4_unicode_ci\s*;/gi,
      ""
    )
    .replace(/USE\s+[`"]?[^`";\s]+[`"]?\s*;/gi, "");
}

async function readDbSql(filename, databaseName, useCurrentDatabase = false) {
  const sql = await readFile(path.join(root, "db", filename), "utf8");
  const normalizedSql = normalizeSqlDatabaseName(sql, databaseName);
  return useCurrentDatabase ? stripDatabaseSelectionSql(normalizedSql) : normalizedSql;
}

async function runSqlFile(connection, filename, databaseName, useCurrentDatabase = false) {
  const sql = await readDbSql(filename, databaseName, useCurrentDatabase);
  await connection.query(sql);
}

async function createDatabase(connection, databaseName) {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}

async function databaseExists(connection, databaseName) {
  const [rows] = await connection.query(
    "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1",
    [databaseName]
  );

  return rows.length > 0;
}

async function getTableNames(connection, databaseName) {
  const [rows] = await connection.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?",
    [databaseName]
  );

  return new Set(rows.map((row) => row.TABLE_NAME));
}

function formatDatabaseAccessError(error, databaseName) {
  if (error?.code === "ER_DBACCESS_DENIED_ERROR" || error?.code === "ER_ACCESS_DENIED_ERROR") {
    return new Error(
      [
        `MySQL user cannot access database "${databaseName}".`,
        "Create this database in MySQL/cPanel and grant the configured user full privileges,",
        "or update DATABASE_NAME/DATABASE_URL to the exact database assigned to this user.",
        `Original MySQL error: ${error.sqlMessage || error.message}`
      ].join(" ")
    );
  }

  return error;
}

function hasRequiredTables(tableNames) {
  const requiredTables = [
    "departments",
    "roles",
    "employees",
    "tests",
    "questions",
    "answer_options",
    "test_assignments",
    "test_attempts",
    "attempt_questions",
    "attempt_answers"
  ];

  return requiredTables.every((tableName) => tableNames.has(tableName));
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `
    SELECT COUNT(*) AS total
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `
    SELECT COUNT(*) AS total
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

async function foreignKeyExists(connection, tableName, constraintName) {
  const [rows] = await connection.query(
    `
    SELECT COUNT(*) AS total
    FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME = ?
    `,
    [tableName, constraintName]
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
  if (await columnExists(connection, tableName, columnName)) {
    return;
  }

  await connection.query(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${definition}`);
  console.log(`[startup] Added column ${tableName}.${columnName}.`);
}

async function dropForeignKeyIfExists(connection, tableName, constraintName) {
  if (!(await foreignKeyExists(connection, tableName, constraintName))) {
    return;
  }

  await connection.query(`ALTER TABLE ${quoteIdentifier(tableName)} DROP FOREIGN KEY ${quoteIdentifier(constraintName)}`);
  console.log(`[startup] Dropped foreign key ${tableName}.${constraintName}.`);
}

async function ensureNotificationReadsTable(connection) {
  if (await tableExists(connection, "notification_reads")) {
    return;
  }

  await connection.query(`
    CREATE TABLE notification_reads (
      notification_id BIGINT UNSIGNED NOT NULL,
      employee_id BIGINT UNSIGNED NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 1,
      read_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (notification_id, employee_id),
      KEY idx_notification_reads_employee (employee_id, is_read),
      CONSTRAINT fk_notification_reads_notification
        FOREIGN KEY (notification_id) REFERENCES notifications(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_notification_reads_employee
        FOREIGN KEY (employee_id) REFERENCES employees(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  console.log("[startup] Created table notification_reads.");
}

async function ensureAttemptQuestionOptionsTable(connection) {
  if (await tableExists(connection, "attempt_question_options")) {
    return;
  }

  await connection.query(`
    CREATE TABLE attempt_question_options (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      attempt_id BIGINT UNSIGNED NOT NULL,
      question_id BIGINT UNSIGNED NOT NULL,
      option_id BIGINT UNSIGNED NOT NULL,
      option_order INT NOT NULL,
      option_label_snapshot CHAR(1) NULL,
      option_text_snapshot TEXT NULL,
      option_image_url_snapshot VARCHAR(500) NULL,
      is_correct_snapshot TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_attempt_question_options_order (attempt_id, question_id, option_order),
      UNIQUE KEY uq_attempt_question_options_option (attempt_id, question_id, option_id),
      CONSTRAINT fk_attempt_question_options_attempt
        FOREIGN KEY (attempt_id) REFERENCES test_attempts(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  console.log("[startup] Created table attempt_question_options.");
}

async function ensureBaselineRoles(connection) {
  await connection.query(`
    INSERT INTO roles (id, code, name, description) VALUES
      (1, 'employee', 'Nhân sự', 'Xem tài liệu, làm thử, làm chính thức, xem kết quả cá nhân'),
      (2, 'department_manager', 'Trưởng phòng', 'Xem kết quả nhân sự thuộc phòng mình'),
      (6, 'admin', 'Admin', 'Toàn quyền')
    ON DUPLICATE KEY UPDATE
      code = VALUES(code),
      name = VALUES(name),
      description = VALUES(description)
  `);

  await connection.query(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES
      (1,1),(1,2),(1,3),(1,4),
      (2,1),(2,2),(2,3),(2,4),(2,5),
      (6,1),(6,2),(6,3),(6,4),(6,5),(6,6),(6,7),(6,8),(6,9),(6,10)
  `);

  await connection.query(`
    INSERT IGNORE INTO employee_roles (employee_id, role_id)
    SELECT e.id, employee_role.id
    FROM employees e
    JOIN roles employee_role ON employee_role.code = 'employee'
    WHERE NOT EXISTS (
      SELECT 1
      FROM employee_roles existing_role
      WHERE existing_role.employee_id = e.id
    )
  `);

  console.log("[startup] Baseline roles and permissions are present; existing custom roles are preserved.");
}

async function backfillAttemptSnapshots(connection) {
  await connection.query(`
    UPDATE test_attempts attempt
    JOIN tests t ON t.id = attempt.test_id
    SET attempt.pass_score_snapshot = t.pass_score
    WHERE attempt.submitted_at IS NOT NULL
      AND attempt.pass_score_snapshot IS NULL
  `);

  await connection.query(`
    UPDATE attempt_questions aq
    LEFT JOIN questions q ON q.id = aq.question_id
    LEFT JOIN question_groups qg ON qg.id = q.group_id
    SET
      aq.question_text_snapshot = COALESCE(aq.question_text_snapshot, q.question_text),
      aq.image_url_snapshot = COALESCE(aq.image_url_snapshot, q.image_url),
      aq.explanation_snapshot = COALESCE(aq.explanation_snapshot, q.explanation),
      aq.difficulty_snapshot = COALESCE(aq.difficulty_snapshot, q.difficulty),
      aq.group_name_snapshot = COALESCE(aq.group_name_snapshot, qg.name)
    WHERE q.id IS NOT NULL
      AND (
        aq.question_text_snapshot IS NULL
        OR (q.image_url IS NOT NULL AND aq.image_url_snapshot IS NULL)
        OR aq.difficulty_snapshot IS NULL
      )
  `);

  await connection.query(`
    UPDATE attempt_question_options aqo
    LEFT JOIN answer_options ao ON ao.id = aqo.option_id
    SET
      aqo.option_label_snapshot = COALESCE(aqo.option_label_snapshot, ao.option_label),
      aqo.option_text_snapshot = COALESCE(aqo.option_text_snapshot, ao.option_text),
      aqo.option_image_url_snapshot = COALESCE(aqo.option_image_url_snapshot, ao.image_url),
      aqo.is_correct_snapshot = ao.is_correct
    WHERE ao.id IS NOT NULL
      AND (
        aqo.option_label_snapshot IS NULL
        OR aqo.option_text_snapshot IS NULL
        OR (ao.image_url IS NOT NULL AND aqo.option_image_url_snapshot IS NULL)
        OR aqo.is_correct_snapshot <> ao.is_correct
      )
  `);
}

async function runStartupMigrations(connection) {
  if (process.env.AUTO_DB_MIGRATE === "false") {
    console.log("[startup] AUTO_DB_MIGRATE=false, skipping database migrations.");
    return;
  }

  console.log("[startup] Applying database migrations...");
  await ensureNotificationReadsTable(connection);
  await addColumnIfMissing(connection, "questions", "image_url", "image_url VARCHAR(500) NULL AFTER question_text");
  await addColumnIfMissing(connection, "answer_options", "image_url", "image_url VARCHAR(500) NULL AFTER option_text");
  await addColumnIfMissing(connection, "test_attempts", "pass_score_snapshot", "pass_score_snapshot DECIMAL(5,2) NULL AFTER score");
  await ensureAttemptQuestionOptionsTable(connection);

  await dropForeignKeyIfExists(connection, "attempt_questions", "fk_attempt_questions_question");
  await dropForeignKeyIfExists(connection, "attempt_question_options", "fk_attempt_question_options_question");
  await dropForeignKeyIfExists(connection, "attempt_question_options", "fk_attempt_question_options_option");
  await dropForeignKeyIfExists(connection, "attempt_answers", "fk_attempt_answers_question");
  await dropForeignKeyIfExists(connection, "attempt_answers", "fk_attempt_answers_option");

  await addColumnIfMissing(connection, "attempt_questions", "question_text_snapshot", "question_text_snapshot TEXT NULL AFTER question_order");
  await addColumnIfMissing(connection, "attempt_questions", "image_url_snapshot", "image_url_snapshot VARCHAR(500) NULL AFTER question_text_snapshot");
  await addColumnIfMissing(connection, "attempt_questions", "explanation_snapshot", "explanation_snapshot TEXT NULL AFTER question_text_snapshot");
  await addColumnIfMissing(connection, "attempt_questions", "difficulty_snapshot", "difficulty_snapshot VARCHAR(20) NULL AFTER explanation_snapshot");
  await addColumnIfMissing(connection, "attempt_questions", "group_name_snapshot", "group_name_snapshot VARCHAR(180) NULL AFTER difficulty_snapshot");
  await addColumnIfMissing(connection, "attempt_question_options", "option_label_snapshot", "option_label_snapshot CHAR(1) NULL AFTER option_order");
  await addColumnIfMissing(connection, "attempt_question_options", "option_text_snapshot", "option_text_snapshot TEXT NULL AFTER option_label_snapshot");
  await addColumnIfMissing(
    connection,
    "attempt_question_options",
    "option_image_url_snapshot",
    "option_image_url_snapshot VARCHAR(500) NULL AFTER option_text_snapshot"
  );
  await addColumnIfMissing(
    connection,
    "attempt_question_options",
    "is_correct_snapshot",
    "is_correct_snapshot TINYINT(1) NOT NULL DEFAULT 0 AFTER option_image_url_snapshot"
  );

  await ensureBaselineRoles(connection);
  await backfillAttemptSnapshots(connection);
  console.log("[startup] Database migrations are up to date.");
}

async function ensureDatabase() {
  if (process.env.AUTO_DB_INIT === "false") {
    if (process.env.AUTO_DB_MIGRATE === "false") {
      console.log("[startup] AUTO_DB_INIT=false and AUTO_DB_MIGRATE=false, skipping database startup checks.");
      return;
    }

    const { connection: connectionConfig, databaseName } = getDatabaseConfig();
    let databaseConnection;
    try {
      databaseConnection = await mysql.createConnection({
        ...connectionConfig,
        database: databaseName
      });
    } catch (error) {
      throw formatDatabaseAccessError(error, databaseName);
    }

    try {
      await runStartupMigrations(databaseConnection);
      console.log(`[startup] Database "${databaseName}" migrations completed.`);
    } finally {
      await databaseConnection.end();
    }
    return;
  }

  const { connection: connectionConfig, databaseName } = getDatabaseConfig();
  const connection = await mysql.createConnection(connectionConfig);
  let createdDatabase = false;

  try {
    const exists = await databaseExists(connection, databaseName);
    if (!exists) {
      console.log(`[startup] Database "${databaseName}" is missing. Creating database...`);
      try {
        await createDatabase(connection, databaseName);
      } catch (error) {
        throw formatDatabaseAccessError(error, databaseName);
      }
      createdDatabase = true;
    }
  } finally {
    await connection.end();
  }

  let databaseConnection;
  try {
    databaseConnection = await mysql.createConnection({
      ...connectionConfig,
      database: databaseName
    });
  } catch (error) {
    throw formatDatabaseAccessError(error, databaseName);
  }

  try {
    const tableNames = await getTableNames(databaseConnection, databaseName);
    if (tableNames.size === 0) {
      if (!createdDatabase) {
        throw new Error(
          `Database "${databaseName}" exists but is empty. Automatic schema and seed initialization only runs when the database is missing. Run "npm run db:init" manually if this database should be initialized.`
        );
      }

      console.log(`[startup] Database "${databaseName}" is empty. Initializing schema and seed data...`);
      await runSqlFile(databaseConnection, "schema.sql", databaseName, true);
      await runSqlFile(databaseConnection, "seed.sql", databaseName, true);
      console.log(`[startup] Database "${databaseName}" initialized.`);
      return;
    }

    if (!hasRequiredTables(tableNames)) {
      throw new Error(
        `Database "${databaseName}" exists but is missing required tables. Run "npm run db:init" or apply a migration before starting the server.`
      );
    }

    await runStartupMigrations(databaseConnection);
    console.log(`[startup] Database "${databaseName}" is ready.`);
  } finally {
    await databaseConnection.end();
  }
}

async function startServer() {
  const dev = process.env.NODE_ENV !== "production";
  const hostname = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT || 6000);

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  createServer((request, response) => {
    handle(request, response);
  }).listen(port, hostname, () => {
    console.log(`[startup] Server ready on http://${hostname}:${port}`);
  });
}

async function main() {
  process.env.NODE_ENV = process.env.NODE_ENV || "production";

  await loadRuntimeModules();
  await loadEnvFile(".env");
  validateStartupEnv();
  await ensureDatabase();
  await loadNextModule();
  await startServer();
}

main().catch((error) => {
  console.error("[startup] Failed to start application:");
  console.error(error);
  process.exit(1);
});
