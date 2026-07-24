function getQuestionCount(value: unknown) {
  const questionCount = Math.floor(Number(value));
  return Number.isFinite(questionCount) ? Math.max(1, questionCount) : 1;
}

export function getDefaultRequiredCorrectAnswers(questionCount: unknown) {
  const totalQuestions = getQuestionCount(questionCount);
  return totalQuestions <= 1 ? totalQuestions : totalQuestions - 1;
}

export function getConfiguredRequiredCorrectAnswers(value: unknown) {
  const requiredCorrectAnswers = Number(value);
  return Number.isInteger(requiredCorrectAnswers) && requiredCorrectAnswers > 0 ? requiredCorrectAnswers : null;
}

export function getCustomRequiredCorrectAnswers(value: unknown, questionCount: unknown) {
  const configuredRequiredCorrectAnswers = getConfiguredRequiredCorrectAnswers(value);
  if (configuredRequiredCorrectAnswers === null) {
    return null;
  }

  return Math.min(configuredRequiredCorrectAnswers, getQuestionCount(questionCount));
}

export function getRequiredCorrectAnswers(questionCount: unknown, configuredRequiredCorrectAnswers?: unknown) {
  const totalQuestions = getQuestionCount(questionCount);
  const configured = getConfiguredRequiredCorrectAnswers(configuredRequiredCorrectAnswers);
  return configured === null ? getDefaultRequiredCorrectAnswers(totalQuestions) : Math.min(configured, totalQuestions);
}

export function getPassScoreForRequiredCorrectAnswers(questionCount: unknown, configuredRequiredCorrectAnswers?: unknown) {
  const totalQuestions = getQuestionCount(questionCount);
  const requiredCorrectAnswers = getRequiredCorrectAnswers(totalQuestions, configuredRequiredCorrectAnswers);
  return Number(((requiredCorrectAnswers / totalQuestions) * 100).toFixed(2));
}
