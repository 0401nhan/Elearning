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
  officialCooldownSeconds?: number | null;
  official_cooldown_seconds?: number | null;
  nextOfficialAvailableAt?: string | null;
  next_official_available_at?: string | null;
};

export const OFFICIAL_RETAKE_COOLDOWN_MESSAGE = "Làm lại bài kiểm tra vào tuần sau";

export function hasOfficialResult(test: OfficialResultInput) {
  return (
    test.officialScore !== null &&
    test.officialScore !== undefined
  ) || test.status === "ĐÃ ĐẠT" || test.status === "CHƯA ĐẠT" || test.status === "passed" || test.status === "failed";
}

export function getOfficialCooldownSeconds(test: OfficialResultInput) {
  const value = Number(test.officialCooldownSeconds ?? test.official_cooldown_seconds ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : 0;
}

export function hasOfficialCooldown(test: OfficialResultInput) {
  return getOfficialCooldownSeconds(test) > 0;
}

export function getNextOfficialAvailableAt(test: OfficialResultInput) {
  return test.nextOfficialAvailableAt ?? test.next_official_available_at ?? null;
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

  if (hasOfficialCooldown(test)) {
    return false;
  }

  return true;
}

export function canStartPracticeAttempt(_test?: OfficialResultInput) {
  void _test;
  return true;
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
