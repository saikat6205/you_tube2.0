import crypto from "node:crypto";

const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_DEVICE_ID_LENGTH = 64;

/**
 * The browser generates the device id (random UUID v4) and stores it locally.
 * We only accept a well formed UUID, which keeps the value opaque and prevents
 * a caller from smuggling arbitrary strings into trustedDevices.
 * Returns "" when absent/invalid, which the caller must treat as "new device".
 */
export const normalizeDeviceId = (value) => {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_DEVICE_ID_LENGTH) return "";
  return DEVICE_ID_PATTERN.test(raw) ? raw.toLowerCase() : "";
};

/**
 * SHA-256 of the User-Agent, truncated. Stored instead of the raw UA so the
 * database never holds a fingerprint string, while still letting us detect a
 * different browser reusing the same stored device id.
 */
export const hashUserAgent = (userAgent = "") =>
  crypto
    .createHash("sha256")
    .update(String(userAgent))
    .digest("hex")
    .slice(0, 32);