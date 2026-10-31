const IST_TIMEZONE = "Asia/Kolkata";

// Task 5 rule: LIGHT for 10:00:00 IST inclusive -> 12:00:00 IST exclusive.
const LIGHT_FROM_HOUR = 10;
const LIGHT_UNTIL_HOUR = 12;

const istFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIMEZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Wall-clock hour/minute in Asia/Kolkata for the given instant.
 * Deliberately uses Intl with an explicit IANA zone so the result never depends
 * on the server's or the browser's local timezone.
 */
export const getIstTime = (date = new Date()) => {
  const parts = Object.fromEntries(
    istFormatter.formatToParts(date).map((p) => [p.type, p.value])
  );
  const rawHour = Number(parts.hour);
  return {
    // Defensive % 24: some ICU builds emit "24" for midnight under h23.
    hour: Number.isFinite(rawHour) ? rawHour % 24 : 0,
    minute: Number(parts.minute) || 0,
  };
};

/** "light" when IST hour is in [10, 12), otherwise "dark". */
export const resolveThemeFromLoginTime = (date = new Date()) => {
  const { hour } = getIstTime(date);
  return hour >= LIGHT_FROM_HOUR && hour < LIGHT_UNTIL_HOUR ? "light" : "dark";
};

/** Human readable IST timestamp, used in the OTP email and server logs. */
export const formatIstTime = (date = new Date()) => {
  const { hour, minute } = getIstTime(date);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const paddedMinute = String(minute).padStart(2, "0");
  return `${displayHour}:${paddedMinute} ${suffix} IST`;
};