/**
 * Task 5 self-test: exercises the pure theme, device, geo and OTP logic without
 * touching MongoDB, the network or real email. Run with:
 *   node scripts/task5-selftest.mjs
 *
 * Short OTP timings are set here only for this test process.
 */
process.env.OTP_TTL_SECONDS = "5";
process.env.OTP_MAX_ATTEMPTS = "3";
process.env.OTP_RESEND_COOLDOWN_SECONDS = "1";
process.env.OTP_MAX_SENDS_PER_HOUR = "50";

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { resolveThemeFromLoginTime, getIstTime } from "../utils/theme.js";
import { isPrivateIp, isSameRegion, getClientIp } from "../utils/geo.js";
import { normalizeDeviceId, hashUserAgent } from "../utils/device.js";
import {
  findTrustedDevice,
  mergeTrustedDevice,
  MAX_TRUSTED_DEVICES,
} from "../utils/trust.js";
import { verifyFirebaseIdToken } from "../utils/firebase.js";
import {
  issueChallenge,
  resendChallenge,
  verifyChallenge,
  __resetForTests,
} from "../utils/otp.js";

let passed = 0;
let failed = 0;

const check = (condition, label) => {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Build an instant whose Asia/Kolkata wall clock is exactly h:m.
const ist = (hour, minute = 0) => {
  const totalMinutes = hour * 60 + minute - 330; // IST is UTC+05:30
  return new Date(
    Date.UTC(2026, 0, 15, Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0)
  );
};

const wrongCode = (code) => String((Number(code) + 1) % 1000000).padStart(6, "0");

const device = (suffix) => ({
  userId: "000000000000000000000001",
  email: `${suffix}@example.com`,
  deviceId: `00000000-0000-4000-8000-0000000000${suffix}`,
  userAgentHash: "ua-hash",
  location: { city: "Local", state: "Local", country: "Local" },
});

console.log("Task 5 self-test\n");

console.log("Theme (Asia/Kolkata, light = [10:00, 12:00))");
check(getIstTime(ist(10, 30)).hour === 10 && getIstTime(ist(10, 30)).minute === 30, "getIstTime reads IST wall clock");
check(resolveThemeFromLoginTime(ist(9, 59)) === "dark", "09:59 -> dark");
check(resolveThemeFromLoginTime(ist(10, 0)) === "light", "10:00 -> light (inclusive)");
check(resolveThemeFromLoginTime(ist(10, 30)) === "light", "10:30 -> light");
check(resolveThemeFromLoginTime(ist(11, 59)) === "light", "11:59 -> light");
check(resolveThemeFromLoginTime(ist(12, 0)) === "dark", "12:00 -> dark (exclusive)");
check(resolveThemeFromLoginTime(ist(13, 0)) === "dark", "13:00 -> dark");

console.log("\nDevice + location helpers");
const uuid = "550e8400-e29b-41d4-a716-446655440000";
check(normalizeDeviceId(uuid.toUpperCase()) === uuid, "valid UUID normalised to lowercase");
check(normalizeDeviceId("not-a-uuid") === "", "invalid device id rejected");
check(normalizeDeviceId(undefined) === "", "missing device id rejected");
check(hashUserAgent("Mozilla/5.0").length === 32, "user-agent hash is 32 chars");
check(hashUserAgent("Mozilla/5.0") === hashUserAgent("Mozilla/5.0"), "user-agent hash is stable");
check(isPrivateIp("::1") && isPrivateIp("127.0.0.1") && isPrivateIp("192.168.1.5"), "private/loopback IPs detected");
check(isPrivateIp("172.20.0.1") && !isPrivateIp("172.32.0.1"), "172.16/12 boundary respected");
check(!isPrivateIp("8.8.8.8"), "public IP not treated as private");
check(
  isSameRegion({ city: "Kolkata", state: "West Bengal" }, { city: " kolkata ", state: "west bengal" }),
  "same region is case/space insensitive"
);
check(!isSameRegion({ city: "Kolkata", state: "West Bengal" }, { city: "Delhi", state: "Delhi" }), "different city is not same region");

const fakeReq = (direct, forwarded) => ({
  socket: { remoteAddress: direct },
  headers: forwarded ? { "x-forwarded-for": forwarded } : {},
  ip: direct,
});
check(
  getClientIp(fakeReq("8.8.8.8", "1.2.3.4")) === "8.8.8.8",
  "public direct connection cannot spoof X-Forwarded-For"
);
check(
  getClientIp(fakeReq("::1", "1.2.3.4")) === "1.2.3.4",
  "loopback proxy honours X-Forwarded-For"
);

console.log("\nTrusted device / location rules");
const kolkata = { city: "Kolkata", state: "West Bengal", country: "India" };
const delhi = { city: "Delhi", state: "Delhi", country: "India" };
const identity = { deviceId: uuid, userAgentHash: "ua-1", location: kolkata };
let trustedList = mergeTrustedDevice([], identity, new Date("2026-01-01T00:00:00Z"));
check(trustedList.length === 1, "first verified login adds one trusted device");
check(
  Boolean(findTrustedDevice({ trustedDevices: trustedList }, identity)),
  "matching device + browser + city/state is trusted"
);
check(
  !findTrustedDevice(
    { trustedDevices: trustedList },
    { ...identity, deviceId: "550e8400-e29b-41d4-a716-446655440001" }
  ),
  "different device is not trusted"
);
check(
  !findTrustedDevice(
    { trustedDevices: trustedList },
    { ...identity, userAgentHash: "ua-2" }
  ),
  "different browser fingerprint is not trusted"
);
check(
  !findTrustedDevice(
    { trustedDevices: trustedList },
    { ...identity, location: { ...kolkata, city: "Howrah" } }
  ),
  "different city is not trusted"
);
check(
  !findTrustedDevice(
    { trustedDevices: trustedList },
    { ...identity, location: { ...kolkata, state: "Odisha" } }
  ),
  "different state is not trusted"
);

trustedList = mergeTrustedDevice(
  trustedList,
  identity,
  new Date("2026-01-02T00:00:00Z")
);
check(
  trustedList.length === 1 &&
    new Date(trustedList[0].lastLoginAt).toISOString() === "2026-01-02T00:00:00.000Z",
  "same place updates instead of duplicating"
);

trustedList = mergeTrustedDevice(
  trustedList,
  { ...identity, location: delhi },
  new Date("2026-01-03T00:00:00Z")
);
check(trustedList.length === 2, "new city is added as a separate trusted place");
check(
  Boolean(findTrustedDevice({ trustedDevices: trustedList }, identity)),
  "returning to an old city stays trusted"
);
check(
  Boolean(
    findTrustedDevice(
      { trustedDevices: trustedList },
      { ...identity, location: delhi }
    )
  ),
  "new city is trusted after verification"
);

trustedList = mergeTrustedDevice(
  trustedList,
  { ...identity, userAgentHash: "ua-2" },
  new Date("2026-01-04T00:00:00Z")
);
check(trustedList.length === 3, "new browser fingerprint is added after verification");
check(
  Boolean(
    findTrustedDevice(
      { trustedDevices: trustedList },
      { ...identity, userAgentHash: "ua-2" }
    )
  ),
  "updated browser stays trusted"
);

let many = [];
for (let i = 0; i < MAX_TRUSTED_DEVICES + 5; i += 1) {
  many = mergeTrustedDevice(
    many,
    {
      deviceId: `550e8400-e29b-41d4-a716-4466${String(i).padStart(8, "0")}`,
      userAgentHash: "ua",
      location: { ...kolkata, city: `City${i}` },
    },
    new Date(2026, 0, 1, 0, i)
  );
}
check(many.length === MAX_TRUSTED_DEVICES, "trusted device list is capped");

console.log("\nOTP lifecycle");
__resetForTests();
const first = issueChallenge(device("a"));
check(Boolean(first.challengeId) && !first.error, "challenge issued");
check(/^\d{6}$/.test(first.code || ""), "code is exactly 6 digits");

const mismatch = verifyChallenge(first.challengeId, wrongCode(first.code));
check(!mismatch.ok && mismatch.reason === "mismatch", "incorrect code rejected");

const accepted = verifyChallenge(first.challengeId, first.code);
check(accepted.ok, "correct code accepted");

const reused = verifyChallenge(first.challengeId, first.code);
check(!reused.ok && reused.reason === "expired", "reused code rejected (single use)");

console.log("\nOTP resend cooldown");
__resetForTests();
const resendTarget = issueChallenge(device("b"));
const blocked = resendChallenge(resendTarget.challengeId);
check(blocked.error === "cooldown", "resend blocked during cooldown");
await sleep(1100);
const resent = resendChallenge(resendTarget.challengeId);
check(!resent.error && Boolean(resent.code), "resend allowed after cooldown");
check(resent.challengeId === resendTarget.challengeId, "resend keeps the same challenge id");
const oldCode = verifyChallenge(resendTarget.challengeId, resendTarget.code);
check(!oldCode.ok, "old code invalid after resend");
const newCode = verifyChallenge(resendTarget.challengeId, resent.code);
check(newCode.ok, "new code accepted after resend");

console.log("\nOTP attempt limit");
__resetForTests();
const attemptsTarget = issueChallenge(device("c"));
let lastAttempt;
for (let i = 0; i < 3; i += 1) {
  lastAttempt = verifyChallenge(attemptsTarget.challengeId, wrongCode(attemptsTarget.code));
}
check(!lastAttempt.ok && lastAttempt.reason === "mismatch", "three wrong attempts still allowed");
const locked = verifyChallenge(attemptsTarget.challengeId, attemptsTarget.code);
check(!locked.ok && locked.reason === "tooManyAttempts", "attempt limit blocks further verification");

console.log("\nOTP expiry");
process.env.OTP_TTL_SECONDS = "1";
__resetForTests();
const expiring = issueChallenge(device("d"));
await sleep(1100);
const expired = verifyChallenge(expiring.challengeId, expiring.code);
check(!expired.ok && expired.reason === "expired", "code past TTL rejected");

console.log("\nFirebase ID token verification");
process.env.FIREBASE_PROJECT_ID = "test-project";
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicPem = publicKey.export({ type: "spki", format: "pem" });
const realFetch = global.fetch;
global.fetch = async () => ({ ok: true, json: async () => ({ testkid: publicPem }) });

const signIdToken = (overrides = {}, options = {}) =>
  jwt.sign(
    {
      sub: "uid-123",
      email: "person@example.com",
      email_verified: true,
      aud: "test-project",
      iss: "https://securetoken.google.com/test-project",
      ...overrides,
    },
    privateKey,
    { algorithm: "RS256", keyid: "testkid", expiresIn: "1h", ...options }
  );

const expectReject = async (token, label) => {
  let rejected = false;
  try {
    await verifyFirebaseIdToken(token);
  } catch {
    rejected = true;
  }
  check(rejected, label);
};

const validClaims = await verifyFirebaseIdToken(signIdToken());
check(validClaims.email === "person@example.com", "valid signed token accepted");
check(validClaims.sub === "uid-123", "subject returned from verified token");
await expectReject(signIdToken({ aud: "someone-else" }), "wrong audience rejected");
await expectReject(
  signIdToken({ iss: "https://securetoken.google.com/other" }),
  "wrong issuer rejected"
);
await expectReject(signIdToken({}, { expiresIn: -120 }), "expired token rejected");
await expectReject(signIdToken({ email_verified: false }), "unverified email rejected");
await expectReject(
  jwt.sign(
    {
      sub: "uid-123",
      email: "person@example.com",
      aud: "test-project",
      iss: "https://securetoken.google.com/test-project",
    },
    crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey,
    { algorithm: "RS256", keyid: "testkid", expiresIn: "1h" }
  ),
  "token signed by the wrong key rejected"
);
await expectReject(
  jwt.sign(
    {
      sub: "uid-123",
      email: "person@example.com",
      aud: "test-project",
      iss: "https://securetoken.google.com/test-project",
    },
    privateKey,
    { algorithm: "RS256", keyid: "missing-kid", expiresIn: "1h" }
  ),
  "unknown signing key rejected"
);
global.fetch = realFetch;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
