const DEVICE_ID_KEY = "yourtube.deviceId";
const DEVICE_ID_COOKIE = "yourtube_device";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const randomUuid = () => {
  const webCrypto = typeof window !== "undefined" ? window.crypto : undefined;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  if (webCrypto?.getRandomValues) {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16
    )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "";
};

const readCookie = (name: string) => {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : "";
};

const writeCookie = (name: string, value: string) => {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
};

/**
 * Stable, random identifier for this browser. Generated locally and never derived
 * from personal data or the User-Agent, so it carries no fingerprinting meaning
 * on its own. Mirrored to a cookie so clearing one store does not silently look
 * like a brand new device and trigger another OTP.
 */
export const getDeviceId = (): string => {
  if (typeof window === "undefined") return "";

  try {
    const fromStorage = window.localStorage.getItem(DEVICE_ID_KEY);
    if (fromStorage && UUID_PATTERN.test(fromStorage)) return fromStorage;

    const existing = randomUuid();
    if (existing) {
      try {
        window.localStorage.setItem(DEVICE_ID_KEY, existing);
      } catch {
        // Private browsing can block localStorage; the cookie still works.
      }
      writeCookie(DEVICE_ID_COOKIE, existing);
      return existing;
    }
  } catch {
    // localStorage unavailable (Safari private mode, blocked storage)
  }

  const fromCookie = readCookie(DEVICE_ID_COOKIE);
  return UUID_PATTERN.test(fromCookie) ? fromCookie : "";
};