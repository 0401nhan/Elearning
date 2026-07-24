import { pbkdf2Sync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

const root = process.cwd();
const testCode = "DEEP_SMOKE_TEST";
const usernamePrefix = "deep_smoke_";
const password = "DeepSmoke#123456";
const questionCount = 12;
const customRequiredCorrectAnswers = 8;
const requestTimeoutMs = 30000;

let baseUrl;
let participantCount;

function hashPassword(value, salt) {
  const iterations = 120000;
  const hash = pbkdf2Sync(value, salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

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
    charset: "utf8mb4"
  };
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseCookieHeader(headers) {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) {
    return "";
  }

  return setCookie
    .split(/,(?=\s*[^;]+=)/)
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(pathname, options = {}) {
  const response = await fetchWithTimeout(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    response,
    body,
    cookie: parseCookieHeader(response.headers)
  };
}

async function cleanup(connection) {
  await connection.query("DELETE FROM tests WHERE code = ?", [testCode]);
  await connection.query("DELETE FROM employees WHERE username LIKE ?", [`${usernamePrefix}%`]);
}

async function seedEmployees(connection) {
  const [[department]] = await connection.query("SELECT id FROM departments ORDER BY id LIMIT 1");
  const [[role]] = await connection.query("SELECT id FROM roles WHERE code = 'employee' LIMIT 1");

  assertCondition(department?.id, "No department exists for smoke employees.");
  assertCondition(role?.id, "Role 'employee' does not exist.");

  const employeeRows = Array.from({ length: participantCount }, (_, index) => {
    const ordinal = index + 1;
    const username = `${usernamePrefix}${String(ordinal).padStart(2, "0")}`;
    const employeeCode = `DST${String(ordinal).padStart(4, "0")}`;

    return [
      employeeCode,
      username,
      `Deep Smoke User ${ordinal}`,
      `09988${String(ordinal).padStart(5, "0")}`,
      hashPassword(password, employeeCode),
      `${username}@example.invalid`,
      department.id,
      "E2E",
      "Smoke tester",
      "S"
    ];
  });

  await connection.query(
    `
    INSERT INTO employees
      (employee_code, username, full_name, phone, password_hash, email, department_id, work_area, position_title, avatar_initial)
    VALUES ?
    `,
    [employeeRows]
  );

  const [employees] = await connection.query(
    "SELECT id, username FROM employees WHERE username LIKE ? ORDER BY id",
    [`${usernamePrefix}%`]
  );

  await connection.query("INSERT INTO employee_roles (employee_id, role_id) VALUES ?", [
    employees.map((employee) => [employee.id, role.id])
  ]);

  return employees;
}

async function seedTest(connection, employees) {
  await connection.query(
    `
    INSERT INTO tests
      (code, title, description, question_count, duration_minutes, pass_score, required_correct_answers, max_official_attempts,
       allow_unlimited_practice, randomize_questions, randomize_answers, show_practice_answers, show_official_answers, status, created_by)
    VALUES (?, 'Deep smoke attempt flow', 'Temporary automated test for concurrent attempt flows.', ?, 10, ?, ?, 1, 1, 0, 0, 1, 0, 'active', NULL)
    `,
    [
      testCode,
      questionCount,
      Number(((customRequiredCorrectAnswers / questionCount) * 100).toFixed(2)),
      customRequiredCorrectAnswers
    ]
  );

  const [[test]] = await connection.query("SELECT id FROM tests WHERE code = ? LIMIT 1", [testCode]);
  await connection.query("INSERT INTO question_groups (test_id, name, suggested_question_count, sort_order) VALUES (?, ?, ?, 1)", [
    test.id,
    "Deep smoke questions",
    questionCount
  ]);
  const [[group]] = await connection.query("SELECT id FROM question_groups WHERE test_id = ? LIMIT 1", [test.id]);

  for (let index = 1; index <= questionCount; index += 1) {
    const [questionResult] = await connection.query(
      `
      INSERT INTO questions (test_id, group_id, question_text, explanation, difficulty, created_by)
      VALUES (?, ?, ?, ?, 'easy', NULL)
      `,
      [test.id, group.id, `Deep smoke question ${index}?`, `Deep smoke explanation ${index}.`]
    );

    await connection.query("INSERT INTO answer_options (question_id, option_label, option_text, is_correct, sort_order) VALUES ?", [
      [
        [questionResult.insertId, "A", "Correct answer", 1, 1],
        [questionResult.insertId, "B", "Wrong answer B", 0, 2],
        [questionResult.insertId, "C", "Wrong answer C", 0, 3],
        [questionResult.insertId, "D", "Wrong answer D", 0, 4]
      ]
    ]);
  }

  await connection.query("INSERT INTO test_assignments (employee_id, test_id, assigned_by, status) VALUES ?", [
    employees.map((employee) => [employee.id, test.id, null, "not_started"])
  ]);

  return test.id;
}

async function login(username) {
  const { response, body, cookie } = await requestJson("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  assertCondition(response.ok, `Login failed for ${username}: ${response.status} ${JSON.stringify(body)}`);
  assertCondition(cookie.includes("eb_session="), `Login did not return session cookie for ${username}.`);

  return cookie;
}

async function loadMe(cookie, username) {
  const { response, body } = await requestJson("/api/me", {
    headers: { Cookie: cookie }
  });

  assertCondition(response.ok, `/api/me failed for ${username}: ${response.status} ${JSON.stringify(body)}`);
  assertCondition(body?.employee?.username === username, `/api/me returned wrong user for ${username}.`);
  assertCondition(Array.isArray(body.assignments), `/api/me did not return assignments for ${username}.`);
}

async function startOfficial(cookie, username, testId) {
  const { response, body } = await requestJson("/api/attempts/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({ testId, mode: "official" })
  });

  assertCondition(response.ok, `Start official failed for ${username}: ${response.status} ${JSON.stringify(body)}`);
  assertCondition(body?.attempt?.id, `Start official did not return attempt id for ${username}.`);
  assertCondition(body.questions?.length === questionCount, `Start official returned wrong question count for ${username}.`);

  return body;
}

async function saveDrafts(cookie, username, attempt) {
  const draftQuestions = attempt.questions.slice(0, Math.min(4, attempt.questions.length));

  await Promise.all(
    draftQuestions.map(async (question) => {
      const { response, body } = await requestJson("/api/attempts/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          attemptId: attempt.attempt.id,
          questionId: question.id,
          selectedOptionId: question.answers[0].id
        })
      });

      assertCondition(response.ok, `Draft save failed for ${username}: ${response.status} ${JSON.stringify(body)}`);
    })
  );
}

async function submitOfficial(cookie, username, attempt, correctAnswerTarget = questionCount) {
  const answers = attempt.questions.map((question, index) => ({
    questionId: question.id,
    selectedOptionId: index < correctAnswerTarget ? question.answers[0].id : question.answers[1].id
  }));

  const { response, body } = await requestJson("/api/attempts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({
      attemptId: attempt.attempt.id,
      mode: "official",
      timeSpentSeconds: 45,
      answers
    })
  });

  assertCondition(response.ok, `Submit official failed for ${username}: ${response.status} ${JSON.stringify(body)}`);
  const expectedScore = Number(((correctAnswerTarget / questionCount) * 100).toFixed(2));
  assertCondition(body.score === expectedScore, `Expected score ${expectedScore} for ${username}, got ${body.score}.`);
  assertCondition(body.totalQuestions === questionCount, `Submit returned wrong question count for ${username}.`);
  assertCondition(
    body.resultStatus === "passed" || body.resultStatus === "excellent",
    `Expected a passing result for ${username}, got ${body.resultStatus}.`
  );

  return body;
}

async function assertCannotSubmitAgain(cookie, username, attempt) {
  const answers = attempt.questions.map((question) => ({
    questionId: question.id,
    selectedOptionId: question.answers[0].id
  }));

  const { response } = await requestJson("/api/attempts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({
      attemptId: attempt.attempt.id,
      mode: "official",
      timeSpentSeconds: 45,
      answers
    })
  });

  assertCondition(response.status === 409, `Duplicate submit should be blocked for ${username}, got ${response.status}.`);
}

async function assertCannotStartAgain(cookie, username, testId) {
  const { response } = await requestJson("/api/attempts/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({ testId, mode: "official" })
  });

  assertCondition(response.status === 409, `Second official start should be blocked for ${username}, got ${response.status}.`);
}

async function runParticipant(employee, testId, correctAnswerTarget) {
  const cookie = await login(employee.username);
  await loadMe(cookie, employee.username);
  const attempt = await startOfficial(cookie, employee.username, testId);
  await saveDrafts(cookie, employee.username, attempt);
  const result = await submitOfficial(cookie, employee.username, attempt, correctAnswerTarget);
  await assertCannotSubmitAgain(cookie, employee.username, attempt);
  await assertCannotStartAgain(cookie, employee.username, testId);

  return {
    username: employee.username,
    attemptId: attempt.attempt.id,
    score: result.score
  };
}

async function assertDatabaseState(connection, testId) {
  const [[assignmentCounts]] = await connection.query(
    `
    SELECT
      COUNT(*) AS total,
      SUM(status = 'passed') AS passed,
      SUM(official_attempts_used = 1) AS used_once
    FROM test_assignments
    WHERE test_id = ?
    `,
    [testId]
  );
  const [[attemptCounts]] = await connection.query(
    `
    SELECT
      COUNT(*) AS total,
      SUM(submitted_at IS NOT NULL) AS submitted,
      SUM(score = 100) AS perfect,
      SUM(correct_answers = ?) AS threshold_passed,
      SUM(required_correct_answers_snapshot = ?) AS configured_threshold,
      SUM(ROUND(pass_score_snapshot, 2) = ?) AS configured_pass_score
    FROM test_attempts
    WHERE test_id = ? AND mode = 'official'
    `,
    [
      customRequiredCorrectAnswers,
      customRequiredCorrectAnswers,
      Number(((customRequiredCorrectAnswers / questionCount) * 100).toFixed(2)),
      testId
    ]
  );
  const [[answerCounts]] = await connection.query(
    `
    SELECT COUNT(*) AS total
    FROM attempt_answers aa
    JOIN test_attempts attempt ON attempt.id = aa.attempt_id
    WHERE attempt.test_id = ?
    `,
    [testId]
  );

  assertCondition(Number(assignmentCounts.total) === participantCount, "DB assignment count mismatch.");
  assertCondition(Number(assignmentCounts.passed) === participantCount, "DB passed assignment count mismatch.");
  assertCondition(Number(assignmentCounts.used_once) === participantCount, "DB attempt usage count mismatch.");
  assertCondition(Number(attemptCounts.total) === participantCount, "DB official attempt count mismatch.");
  assertCondition(Number(attemptCounts.submitted) === participantCount, "DB submitted attempt count mismatch.");
  assertCondition(Number(attemptCounts.perfect) === participantCount - 1, "DB perfect score count mismatch.");
  assertCondition(
    Number(attemptCounts.threshold_passed) === 1,
    `Configured pass threshold was not applied: ${JSON.stringify(attemptCounts)}.`
  );
  assertCondition(Number(attemptCounts.configured_threshold) === participantCount, "Attempt threshold snapshot mismatch.");
  assertCondition(Number(attemptCounts.configured_pass_score) === participantCount, "Attempt pass score snapshot mismatch.");
  assertCondition(Number(answerCounts.total) === participantCount * questionCount, "DB answer count mismatch.");
}

async function main() {
  await loadEnvFile(".env");
  baseUrl = process.env.DEEP_SMOKE_BASE_URL ?? `http://127.0.0.1:${process.env.PORT || 6000}`;
  participantCount = Math.max(2, Math.min(50, Number(process.env.DEEP_SMOKE_USERS || 12)));

  const connection = await mysql.createConnection(getDatabaseConfig());
  let testId = null;

  try {
    await cleanup(connection);
    const employees = await seedEmployees(connection);
    testId = await seedTest(connection, employees);

    const health = await requestJson("/api/health/db");
    assertCondition(health.response.ok && health.body?.ok === true, `Health check failed: ${health.response.status}`);

    const results = await Promise.all(
      employees.map((employee, index) =>
        runParticipant(employee, testId, index === 0 ? customRequiredCorrectAnswers : questionCount)
      )
    );
    await assertDatabaseState(connection, testId);

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          participants: results.length,
          officialAttempts: results.length,
          questionsPerAttempt: questionCount,
          blockedDuplicateSubmit: true,
          blockedSecondOfficialStart: true
        },
        null,
        2
      )
    );
  } finally {
    await cleanup(connection);
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Deep smoke test failed:");
  console.error(error);
  process.exit(1);
});
