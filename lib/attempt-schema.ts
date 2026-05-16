import type { ResultSetHeader } from "mysql2";
import { executeQuery } from "@/lib/db";

let passScoreSnapshotEnsured = false;

function isDuplicateColumnError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_FIELDNAME";
}

export async function ensureAttemptPassScoreSnapshotColumn() {
  if (passScoreSnapshotEnsured) {
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
