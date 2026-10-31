import { isSameRegion } from "./geo.js";

// A user can accumulate one trusted entry per device + browser fingerprint +
// city/state. Keeping known locations separate means returning to a place the
// user already verified does not trigger OTP again, while a genuinely new place
// still does.
export const MAX_TRUSTED_DEVICES = 20;

const plain = (entry) =>
  typeof entry.toObject === "function" ? entry.toObject() : { ...entry };

export const findTrustedDevice = (
  user,
  { deviceId, userAgentHash, location }
) => {
  if (!deviceId) return null;
  return (
    (user.trustedDevices || []).find(
      (entry) =>
        entry.deviceId === deviceId &&
        entry.userAgentHash === userAgentHash &&
        isSameRegion(entry, location)
    ) || null
  );
};

/**
 * Returns a new trusted-devices array with this login recorded. The input is
 * never mutated. Oldest entries are dropped once the limit is reached.
 */
export const mergeTrustedDevice = (
  trustedDevices,
  { deviceId, userAgentHash, location },
  now = new Date()
) => {
  const devices = (trustedDevices || []).map(plain);
  const entry = devices.find(
    (item) =>
      item.deviceId === deviceId &&
      item.userAgentHash === userAgentHash &&
      isSameRegion(item, location)
  );

  if (entry) {
    entry.country = location.country;
    entry.lastLoginAt = now;
  } else {
    devices.push({
      deviceId,
      userAgentHash,
      city: location.city,
      state: location.state,
      country: location.country,
      trustedAt: now,
      lastLoginAt: now,
    });
  }

  return devices
    .sort((a, b) => new Date(a.lastLoginAt) - new Date(b.lastLoginAt))
    .slice(-MAX_TRUSTED_DEVICES);
};
