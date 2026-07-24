import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

const root = process.cwd();

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

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
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
    console.log(`Column ${tableName}.${columnName} already exists.`);
    return;
  }

  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  console.log(`Added column ${tableName}.${columnName}.`);
}

async function dropForeignKeyIfExists(connection, tableName, constraintName) {
  if (!(await foreignKeyExists(connection, tableName, constraintName))) {
    console.log(`Foreign key ${tableName}.${constraintName} already absent.`);
    return;
  }

  await connection.query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``);
  console.log(`Dropped foreign key ${tableName}.${constraintName}.`);
}

async function ensureNotificationReadsTable(connection) {
  if (await tableExists(connection, "notification_reads")) {
    console.log("Table notification_reads already exists.");
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
  console.log("Created table notification_reads.");
}

async function ensureAttemptQuestionOptionsTable(connection) {
  if (await tableExists(connection, "attempt_question_options")) {
    console.log("Table attempt_question_options already exists.");
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
  console.log("Created table attempt_question_options.");
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

  console.log("Baseline roles and permissions are present; existing custom roles are preserved.");
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
  console.log("Backfilled attempt snapshots.");
}

async function backfillDefaultTestPassScores(connection) {
  await connection.query(`
    UPDATE tests
    SET pass_score = ROUND(
      (
        CASE
          WHEN question_count <= 1 THEN question_count
          ELSE question_count - 1
        END / question_count
      ) * 100,
      2
    )
    WHERE required_correct_answers IS NULL
      AND question_count > 0
      AND pass_score <> ROUND(
        (
          CASE
            WHEN question_count <= 1 THEN question_count
            ELSE question_count - 1
          END / question_count
        ) * 100,
        2
      )
  `);
  console.log("Aligned default test pass scores.");
}

async function snapshotOpenAttemptPassRules(connection) {
  await connection.query(`
    UPDATE test_attempts
    SET required_correct_answers_snapshot = CASE
          WHEN total_questions <= 1 THEN total_questions
          ELSE total_questions - 1
        END,
        pass_score_snapshot = COALESCE(
          pass_score_snapshot,
          ROUND(
            (
              CASE
                WHEN total_questions <= 1 THEN total_questions
                ELSE total_questions - 1
              END / total_questions
            ) * 100,
            2
          )
        )
    WHERE submitted_at IS NULL
      AND required_correct_answers_snapshot IS NULL
      AND total_questions > 0
  `);
  console.log("Snapshotted pass rules for open attempts.");
}

async function migrate() {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local");

  const connection = await mysql.createConnection(getDatabaseConfig());
  try {
    await ensureNotificationReadsTable(connection);
    await addColumnIfMissing(connection, "questions", "image_url", "image_url VARCHAR(500) NULL AFTER question_text");
    await addColumnIfMissing(connection, "answer_options", "image_url", "image_url VARCHAR(500) NULL AFTER option_text");
    await addColumnIfMissing(connection, "tests", "required_correct_answers", "required_correct_answers INT NULL AFTER pass_score");
    await addColumnIfMissing(connection, "test_attempts", "pass_score_snapshot", "pass_score_snapshot DECIMAL(5,2) NULL AFTER score");
    await addColumnIfMissing(
      connection,
      "test_attempts",
      "required_correct_answers_snapshot",
      "required_correct_answers_snapshot INT NULL AFTER score"
    );
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
    await backfillDefaultTestPassScores(connection);
    await snapshotOpenAttemptPassRules(connection);
    console.log("Database migrations completed.");
  } finally {
    await connection.end();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
