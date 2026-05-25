type OfficialResultInput = {
  status?: string | null;
  officialScore?: number | null;
  passScore?: number | null;
  attempts?: number | null;
  allowUnlimitedPractice?: boolean | null;
  officialAttemptsUsed?: number | null;
  maxOfficialAttempts?: number | null;
  official_attempts_used?: number | null;
  max_official_attempts?: number | null;
};

function getAttemptNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function hasOfficialResult(test: OfficialResultInput) {
  return (
    test.officialScore !== null &&
    test.officialScore !== undefined
  ) || test.status === "ĐÃ ĐẠT" || test.status === "CHƯA ĐẠT" || test.status === "passed" || test.status === "failed";
}

export function isOfficialPassed(test: OfficialResultInput) {
  if (test.status === "ĐÃ ĐẠT" || test.status === "passed") {
    return true;
  }

  if (test.status === "CHƯA ĐẠT" || test.status === "failed") {
    return false;
  }

  if (test.officialScore !== null && test.officialScore !== undefined && test.passScore !== null && test.passScore !== undefined) {
    return test.officialScore >= test.passScore;
  }

  return false;
}

export function canStartOfficialAttempt(test: OfficialResultInput) {
  if (isOfficialPassed(test)) {
    return false;
  }

  const used = getAttemptNumber(test.officialAttemptsUsed ?? test.official_attempts_used);
  const limit = getAttemptNumber(test.maxOfficialAttempts ?? test.max_official_attempts);

  if (used !== null && limit !== null) {
    return used < limit;
  }

  return !hasOfficialResult(test);
}

export function canStartPracticeAttempt(test: OfficialResultInput) {
  const attempts = getAttemptNumber(test.attempts);
  return test.allowUnlimitedPractice !== false || attempts === null || attempts === 0;
}

export function isOfficialLocked(test: OfficialResultInput) {
  return hasOfficialResult(test) && !canStartOfficialAttempt(test);
}

export function officialResultTone(test: OfficialResultInput) {
  if (!hasOfficialResult(test)) {
    return "neutral";
  }

  return isOfficialPassed(test) ? "passed" : "failed";
}

export function officialResultLabel(test: OfficialResultInput) {
  if (!hasOfficialResult(test)) {
    return "Làm chính thức";
  }

  return isOfficialPassed(test) ? "Đã đạt" : "Chưa đạt";
}
