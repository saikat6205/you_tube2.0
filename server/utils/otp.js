import crypto from "node:crypto";

// NOTE: `dotenv.config()` runs inside index.js *after* ES module imports are
// evaluated, so every secret/setting below is resolved lazily at call time.
// Reading process.env at module scope would capture `undefined`.

const challenges = new Map(); // challengeId -> challenge
const sendLog = new Map(); // email -> { count, windowStart, lastSentAt }

const num = (name, fallback) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const settings = () => ({
  // Task 5 requires codes to expire after 5 minutes.
  ttlMs: num("OTP_TTL_SECONDS", 300) * 1000,
  maxAttempts: num("OTP_MAX_ATTEMPTS", 5),
  resendCooldownMs: num("OTP_RESEND_COOLDOWN_SECONDS", 60) * 1000,
  maxSendsPerHour: num("OTP_MAX_SENDS_PER_HOUR", 5),
  maxChallenges: 5000,
});

/**
 * Server-side pepper. A bare SHA-256 of a 6 digit code is reversible offline in
 * milliseconds (only 1e6 candidates), so the code is keyed with HMAC instead -
 * a leaked database or memory dump then cannot be brute forced without this key.
 */
const otpSecret = () =>
  process.env.OTP_SECRET || process.env.JWT_SECRET || "yourtube_otp_dev_secret";

const generateCode = () =>
  String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const hashCode = (code) =>
  crypto.createHmac("sha256", otpSecret()).update(String(code)).digest("hex");

const safeEquals = (a, b) => {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const dropChallenge = (challengeId) => {
  const entry = challenges.get(challengeId);
  if (entry) {
    const key = challengeKey(entry.email, entry.deviceId);
    if (index.get(key) === challengeId) index.delete(key);
  }
  challenges.delete(challengeId);
};

const challengeKey = (email, deviceId) =>
  `${String(email).toLowerCase()}::${String(deviceId || "none")}`;

const index = new Map(); // email+deviceId -> challengeId

const sweep = (maxChallenges) => {
  const now = Date.now();
  for (const [id, entry] of challenges) {
    if (entry.expiresAt <= now) dropChallenge(id);
  }
  for (const [email, log] of sendLog) {
    if (now - log.windowStart >= 3600_000) sendLog.delete(email);
  }
  while (challenges.size > maxChallenges) {
    const oldest = challenges.keys().next().value;
    if (oldest === undefined) break;
    dropChallenge(oldest);
  }
};

/**
 * Create (or reuse) an OTP challenge for a login attempt.
 *
 * Returns the plaintext `code` so the caller can e-mail it - it is never stored,
 * never logged and never returned to the client. `reused: true` means an
 * unexpired challenge already existed and no new e-mail was sent.
 */
export const issueChallenge = ({ userId, email, deviceId, userAgentHash, location }) => {
  const cfg = settings();
  sweep(cfg.maxChallenges);

  const key = challengeKey(email, deviceId);
  const existingId = index.get(key);
  if (existingId && challenges.has(existingId)) {
    return {
      challengeId: existingId,
      code: challenges.get(existingId).code,
      reused: true,
    };
  }

  const now = Date.now();
  const log = sendLog.get(email) || { count: 0, windowStart: now, lastSentAt: 0 };
  if (now - log.lastSentAt < cfg.resendCooldownMs) {
    const waitMs = cfg.resendCooldownMs - (now - log.lastSentAt);
    return { error: "cooldown", retryAfterSeconds: Math.ceil(waitMs / 1000) };
  }
  if (log.count >= cfg.maxSendsPerHour) {
    return { error: "rateLimited", retryAfterSeconds: 3600 };
  }

  const code = generateCode();
  const challengeId = crypto.randomUUID();
  challenges.set(challengeId, {
    userId: userId.toString(),
    email,
    deviceId,
    userAgentHash,
    location,
    codeHash: hashCode(code),
    attempts: 0,
    createdAt: now,
    expiresAt: now + cfg.ttlMs,
  });
  index.set(key, challengeId);

  sendLog.set(email, {
    count: log.count + 1,
    windowStart: log.windowStart,
    lastSentAt: now,
  });

  return { challengeId, code, reused: false };
};

/** Explicit resend: honours cooldown + hourly cap, otherwise re-issues. */
export const resendChallenge = (challengeId) => {
  const cfg = settings();
  sweep(cfg.maxChallenges);
  const entry = challenges.get(challengeId);
  if (!entry) return { error: "expired" };

  const now = Date.now();
  const log = sendLog.get(entry.email) || { count: 0, windowStart: now, lastSentAt: 0 };
  if (now - log.lastSentAt < cfg.resendCooldownMs) {
    const waitMs = cfg.resendCooldownMs - (now - log.lastSentAt);
    return { error: "cooldown", retryAfterSeconds: Math.ceil(waitMs / 1000) };
  }
  if (log.count >= cfg.maxSendsPerHour) {
    return { error: "rateLimited", retryAfterSeconds: 3600 };
  }

  // Fresh code, same challenge id, expiry window restarted.
  const code = generateCode();
  entry.codeHash = hashCode(code);
  entry.attempts = 0;
  entry.expiresAt = now + cfg.ttlMs;
  sendLog.set(entry.email, {
    count: log.count + 1,
    windowStart: log.windowStart,
    lastSentAt: now,
  });

  return { challengeId, code, reused: false, email: entry.email, location: entry.location };
};

export const verifyChallenge = (challengeId, submittedCode) => {
  const cfg = settings();
  sweep(cfg.maxChallenges);

  const entry = challenges.get(challengeId);
  if (!entry) return { ok: false, reason: "expired" };
  if (entry.expiresAt <= Date.now()) {
    dropChallenge(challengeId);
    return { ok: false, reason: "expired" };
  }

  entry.attempts += 1;
  if (entry.attempts > cfg.maxAttempts) {
    dropChallenge(challengeId);
    return { ok: false, reason: "tooManyAttempts" };
  }

  if (!safeEquals(hashCode(submittedCode), entry.codeHash)) {
    return {
      ok: false,
      reason: "mismatch",
      attemptsLeft: cfg.maxAttempts - entry.attempts,
    };
  }

  dropChallenge(challengeId); // single use
  return { ok: true, entry };
};

/** Test helper: drop all in-memory challenges and send counters. */
export const __resetForTests = () => {
  challenges.clear();
  index.clear();
  sendLog.clear();
};

/**
 * Abandon a challenge whose email could not be delivered. Refunds the send
 * counter so a failed delivery does not leave the user stuck behind the resend
 * cooldown, and lets them retry immediately.
 */
export const cancelChallenge = (challengeId) => {
  const entry = challenges.get(challengeId);
  if (!entry) return;
  dropChallenge(challengeId);

  const log = sendLog.get(entry.email);
  if (log) {
    log.count = Math.max(0, log.count - 1);
    if (log.count === 0) {
      sendLog.delete(entry.email);
    } else {
      log.lastSentAt = 0;
    }
  }
};

export const maskEmail = (email = "") => {
  const [name, domain] = String(email).split("@");
  if (!domain) return String(email);
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - visible.length, 1))}@${domain}`;
};