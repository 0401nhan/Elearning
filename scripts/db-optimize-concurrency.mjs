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

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `
    SELECT COUNT(*) AS total
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    `,
    [tableName, indexName]
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

async function ensurePassScoreSnapshotColumn(connection) {
  if (await columnExists(connection, "test_attempts", "pass_score_snapshot")) {
    console.log("Column test_attempts.pass_score_snapshot already exists.");
    return;
  }

  await connection.query(`
    ALTER TABLE test_attempts
      ADD COLUMN pass_score_snapshot DECIMAL(5,2) NULL AFTER score
  `);
  await connection.query(`
    UPDATE test_attempts attempt
    JOIN tests t ON t.id = attempt.test_id
    SET attempt.pass_score_snapshot = t.pass_score
    WHERE attempt.submitted_at IS NOT NULL
      AND attempt.pass_score_snapshot IS NULL
  `);
  console.log("Added column test_attempts.pass_score_snapshot.");
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

async function ensureIndex(connection, tableName, indexName, definition) {
  if (await indexExists(connection, tableName, indexName)) {
    console.log(`Index ${tableName}.${indexName} already exists.`);
    return;
  }

  await connection.query(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  console.log(`Added index ${tableName}.${indexName}.`);
}

async function main() {
  await loadEnvFile(".env");

  const connection = await mysql.createConnection(getDatabaseConfig());

  try {
    await ensurePassScoreSnapshotColumn(connection);
    await ensureAttemptQuestionOptionsTable(connection);
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
    await ensureIndex(
      connection,
      "retake_requests",
      "idx_retake_status_assignment",
      "KEY idx_retake_status_assignment (status, assignment_id)"
    );
    console.log("Database concurrency optimizations are ready.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Failed to optimize database for concurrent attempts:");
  console.error(error);
  process.exit(1);
});
