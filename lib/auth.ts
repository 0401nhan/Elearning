import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import type { RowDataPacket } from "mysql2";
import { queryRows } from "@/lib/db";
import { canViewPeopleResultsUser, isAdminUser, isDepartmentManagerUser } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";

export const SESSION_COOKIE_NAME = "eb_session";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const MIN_PRODUCTION_SESSION_SECRET_LENGTH = 32;
const INSECURE_SESSION_SECRETS = new Set([
  "development-session-secret-change-me",
  "replace_with_a_long_random_secret",
  "change-me",
  "changeme",
  "password",
  "secret"
]);

type SessionPayload = {
  employeeId: number;
  exp: number;
};

type AuthUserRow = RowDataPacket & {
  id: number;
  employee_code: string;
  username: string;
  full_name: string;
  phone: string;
  email: string | null;
  password_hash: string;
  department_id: number;
  department_name: string;
  position_title: string | null;
  avatar_initial: string | null;
  roles: string | null;
};

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    if (process.env.NODE_ENV === "production") {
      const normalizedSecret = secret.trim().toLowerCase();
      if (secret.length < MIN_PRODUCTION_SESSION_SECRET_LENGTH || INSECURE_SESSION_SECRETS.has(normalizedSecret)) {
        throw new Error(
          `SESSION_SECRET must be a private random string with at least ${MIN_PRODUCTION_SESSION_SECRET_LENGTH} characters in production.`
        );
      }
    }

    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing required environment variable: SESSION_SECRET");
  }

  return "development-session-secret-change-me";
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password: string, salt = randomBytes(16).toString("base64url")) {
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString(
    "base64url"
  );

  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationValue, salt, expectedHash] = storedHash.split("$");
  const iterations = Number(iterationValue);

  if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !expectedHash) {
    return false;
  }

  const actualHash = pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString(
    "base64url"
  );

  return safeEqual(actualHash, expectedHash);
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [key, ...valueParts] = cookie.trim().split("=");
    if (key === name) {
      const value = valueParts.join("=");
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return null;
}

function mapUser(row: AuthUserRow): SessionUser {
  return {
    id: row.id,
    code: row.employee_code,
    username: row.username,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    departmentId: row.department_id,
    department: row.department_name,
    position: row.position_title,
    avatarInitial: row.avatar_initial,
    roles: row.roles ? row.roles.split(",") : []
  };
}

export function createSessionToken(employeeId: number) {
  const payload: SessionPayload = {
    employeeId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | null) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !safeEqual(signPayload(encodedPayload), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.employeeId || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  };
}

export function getExpiredSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  };
}

export async function getUserByCredentials(username: string, password: string) {
  const rows = await queryRows<AuthUserRow[]>(
    `
    SELECT
      e.id,
      e.employee_code,
      e.username,
      e.full_name,
      e.phone,
      e.email,
      e.password_hash,
      e.department_id,
      d.name AS department_name,
      e.position_title,
      e.avatar_initial,
      GROUP_CONCAT(r.code ORDER BY r.code) AS roles
    FROM employees e
    JOIN departments d ON d.id = e.department_id
    LEFT JOIN employee_roles er ON er.employee_id = e.id
    LEFT JOIN roles r ON r.id = er.role_id
    WHERE e.username = ? AND e.is_active = 1
    GROUP BY e.id
    LIMIT 1
    `,
    [username]
  );

  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) {
    return null;
  }

  return mapUser(row);
}

export async function getUserById(employeeId: number) {
  const rows = await queryRows<AuthUserRow[]>(
    `
    SELECT
      e.id,
      e.employee_code,
      e.username,
      e.full_name,
      e.phone,
      e.email,
      e.password_hash,
      e.department_id,
      d.name AS department_name,
      e.position_title,
      e.avatar_initial,
      GROUP_CONCAT(r.code ORDER BY r.code) AS roles
    FROM employees e
    JOIN departments d ON d.id = e.department_id
    LEFT JOIN employee_roles er ON er.employee_id = e.id
    LEFT JOIN roles r ON r.id = er.role_id
    WHERE e.id = ? AND e.is_active = 1
    GROUP BY e.id
    LIMIT 1
    `,
    [employeeId]
  );

  return rows[0] ? mapUser(rows[0]) : null;
}

export async function getCurrentUser(request: Request) {
  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  const payload = verifySessionToken(token);

  return payload ? getUserById(payload.employeeId) : null;
}

export function isAdmin(user: SessionUser) {
  return isAdminUser(user);
}

export function isDepartmentManager(user: SessionUser) {
  return isDepartmentManagerUser(user);
}

export function canViewPeopleResults(user: SessionUser) {
  return canViewPeopleResultsUser(user);
}
