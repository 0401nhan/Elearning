import type { ResultSetHeader } from "mysql2";
import type { RowDataPacket } from "mysql2/promise";
import { executeQuery, queryRows } from "@/lib/db";

let passScoreSnapshotEnsured = false;
let passScoreSnapshotEnsurePromise: Promise<void> | null = null;
let attemptQuestionOptionsEnsured = false;
let attemptQuestionOptionsEnsurePromise: Promise<void> | null = null;

type ExistsRow = RowDataPacket & {
  total: number;
};

function isDuplicateColumnError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_FIELDNAME";
}

async function tableExists(tableName: string) {
  const rows = await queryRows<ExistsRow[]>(
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

async function columnExists(tableName: string, columnName: string) {
  const rows = await queryRows<ExistsRow[]>(
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

async function ensurePassScoreSnapshotColumnInternal() {
  if (await columnExists("test_attempts", "pass_score_snapshot")) {
    passScoreSnapshotEnsured = true;
    return;
  }

  try {
    await executeQuery<ResultSetHeader>(`
      ALTER TABLE test_attempts
        ADD COLUMN pass_score_snapshot DECIMAL(5,2) NULL AFTER score
    `);
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error;
    }
  }

  await executeQuery<ResultSetHeader>(`
    UPDATE test_attempts attempt
    JOIN tests t ON t.id = attempt.test_id
    SET attempt.pass_score_snapshot = t.pass_score
    WHERE attempt.submitted_at IS NOT NULL
      AND attempt.pass_score_snapshot IS NULL
  `);

  passScoreSnapshotEnsured = true;
}

async function ensureAttemptQuestionOptionsTableInternal() {
  if (await tableExists("attempt_question_options")) {
    attemptQuestionOptionsEnsured = true;
    return;
  }

  await executeQuery<ResultSetHeader>(`
    CREATE TABLE IF NOT EXISTS attempt_question_options (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      attempt_id BIGINT UNSIGNED NOT NULL,
      question_id BIGINT UNSIGNED NOT NULL,
      option_id BIGINT UNSIGNED NOT NULL,
      option_order INT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_attempt_question_options_order (attempt_id, question_id, option_order),
      UNIQUE KEY uq_attempt_question_options_option (attempt_id, question_id, option_id),
      CONSTRAINT fk_attempt_question_options_attempt
        FOREIGN KEY (attempt_id) REFERENCES test_attempts(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_attempt_question_options_question
        FOREIGN KEY (question_id) REFERENCES questions(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_attempt_question_options_option
        FOREIGN KEY (option_id) REFERENCES answer_options(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  attemptQuestionOptionsEnsured = true;
}

export async function ensureAttemptPassScoreSnapshotColumn() {
  if (passScoreSnapshotEnsured) {
    return;
  }

  passScoreSnapshotEnsurePromise ??= ensurePassScoreSnapshotColumnInternal().finally(() => {
    passScoreSnapshotEnsurePromise = null;
  });

  await passScoreSnapshotEnsurePromise;
}

export async function ensureAttemptQuestionOptionsTable() {
  if (attemptQuestionOptionsEnsured) {
    return;
  }

  attemptQuestionOptionsEnsurePromise ??= ensureAttemptQuestionOptionsTableInternal().finally(() => {
    attemptQuestionOptionsEnsurePromise = null;
  });

  await attemptQuestionOptionsEnsurePromise;
}
