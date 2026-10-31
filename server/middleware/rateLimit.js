/**
 * Small fixed-window, in-memory rate limiter.
 *
 * The app runs as a single Node process, so a Map is enough to slow down
 * credential stuffing and OTP brute force. Each limiter gets its own Map so
 * login, verification and resend traffic never share a counter.
 */
export const createRateLimit = ({ windowMs, max, message }) => {
  const hits = new Map();
  const MAX_TRACKED_KEYS = 10000;

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const entry = hits.get(key);

    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });

      // Opportunistic cleanup so a long-running process does not grow forever.
      if (hits.size > MAX_TRACKED_KEYS) {
        for (const [trackedKey, value] of hits) {
          if (now - value.start >= windowMs) hits.delete(trackedKey);
        }
      }
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - entry.start)) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message,
        retryAfterSeconds,
      });
    }

    return next();
  };
};
