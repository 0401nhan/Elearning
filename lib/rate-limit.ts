type RateLimitEntry = {
  failedAttempts: number;
  firstFailedAt: number;
  blockedUntil: number;
};

type GlobalWithRateLimits = typeof globalThis & {
  ebLearningRateLimits?: Map<string, RateLimitEntry>;
};

const globalForRateLimits = globalThis as GlobalWithRateLimits;
const rateLimits = globalForRateLimits.ebLearningRateLimits ?? new Map<string, RateLimitEntry>();

if (process.env.NODE_ENV !== "production") {
  globalForRateLimits.ebLearningRateLimits = rateLimits;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;

function pruneExpiredEntries(now: number) {
  if (rateLimits.size < 500) {
    return;
  }

  for (const [key, entry] of rateLimits.entries()) {
    const windowExpired = now - entry.firstFailedAt > LOGIN_WINDOW_MS;
    const blockExpired = entry.blockedUntil <= now;

    if (windowExpired && blockExpired) {
      rateLimits.delete(key);
    }
  }
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "unknown";
}

export function getLoginRateLimitKey(request: Request, username: string) {
  return `login:${getClientIp(request)}:${username || "unknown"}`;
}

export function getLoginRateLimitStatus(key: string) {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || entry.blockedUntil <= now) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000))
  };
}

export function recordFailedLogin(key: string) {
  const now = Date.now();
  pruneExpiredEntries(now);

  const current = rateLimits.get(key);
  const isWithinWindow = current && now - current.firstFailedAt <= LOGIN_WINDOW_MS;
  const entry: RateLimitEntry = isWithinWindow
    ? current
    : {
        failedAttempts: 0,
        firstFailedAt: now,
        blockedUntil: 0
      };

  entry.failedAttempts += 1;

  if (entry.failedAttempts >= MAX_FAILED_LOGINS) {
    entry.blockedUntil = now + LOGIN_BLOCK_MS;
  }

  rateLimits.set(key, entry);
}

export function clearLoginRateLimit(key: string) {
  rateLimits.delete(key);
}
