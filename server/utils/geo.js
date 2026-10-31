const UNKNOWN = "Unknown";
const LOCAL = "Local";

const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60;
const FAILURE_TTL_MS = 1000 * 60;
const LOOKUP_TIMEOUT_MS = 4000;
const LOCAL_LOCATION = { city: LOCAL, state: LOCAL, country: LOCAL, resolved: false };

// Tried in order. Multiple providers keep new-city detection working when one
// of them is rate limited or down.
const providers = [
  {
    name: "ipwho.is",
    url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}`,
    parse: (data) =>
      data && data.success !== false
        ? { city: data.city, state: data.region, country: data.country }
        : null,
  },
  {
    name: "ip-api.com",
    url: (ip) =>
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`,
    parse: (data) =>
      data && data.status === "success"
        ? { city: data.city, state: data.regionName, country: data.country }
        : null,
  },
  {
    name: "ipapi.co",
    url: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    parse: (data) =>
      data && !data.error
        ? { city: data.city, state: data.region, country: data.country_name }
        : null,
  },
];


/**
 * Loopback / private / link-local addresses are not geolocatable and must never
 * trigger a paid or public lookup.
 */
export const isPrivateIp = (ip) => {
  const value = String(ip || "").trim().toLowerCase();
  if (!value) return true;
  if (value === "::1" || value === "::ffff:127.0.0.1") return true;
  if (value.startsWith("127.")) return true;
  if (value.startsWith("10.")) return true;
  if (value.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return true;
  if (value.startsWith("169.254.")) return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true;
  if (value.startsWith("fe80:")) return true;
  return false;
};

export const getClientIp = (req) => {
  const direct = req.socket?.remoteAddress || "";
  const forwarded = req.headers["x-forwarded-for"];

  // Only honour X-Forwarded-For when the request actually arrived through a
  // local/proxy hop (private or loopback address), or when the operator opts in
  // with TRUST_PROXY=true. A direct public connection can therefore not spoof its
  // own location by setting the header.
  const trustForwarded =
    isPrivateIp(direct) || String(process.env.TRUST_PROXY).toLowerCase() === "true";

  if (trustForwarded && typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || direct || "";
};

/**
 * Approximate city/state/country from the request IP.
 *
 * No browser geolocation permission is requested and no GPS coordinates are read
 * or stored - only the coarse admin areas needed to spot a new city/state login.
 */
export const lookupLocation = async (ip) => {
  if (isPrivateIp(ip)) {
    return LOCAL_LOCATION;
  }

  const cached = cache.get(ip);
  if (cached && Date.now() - cached.at < cached.ttl) {
    return cached.value;
  }

  for (const provider of providers) {
    let timer;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      const response = await fetch(provider.url(ip), { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const parsed = provider.parse(data);
      if (!parsed || !parsed.city) {
        throw new Error("response did not include a city");
      }

      const value = {
        city: parsed.city || UNKNOWN,
        state: parsed.state || UNKNOWN,
        country: parsed.country || UNKNOWN,
        resolved: true,
      };
      cache.set(ip, { at: Date.now(), ttl: CACHE_TTL_MS, value });
      return value;
    } catch (error) {
      console.warn(`IP geolocation via ${provider.name} failed: ${error.message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const value = { city: UNKNOWN, state: UNKNOWN, country: UNKNOWN, resolved: false };
  // Short-lived negative cache so a burst of logins does not hammer providers.
  cache.set(ip, { at: Date.now(), ttl: FAILURE_TTL_MS, value });
  return value;
};

const normalize = (value) => String(value || "").trim().toLowerCase();

/** City/state equality, tolerant of casing and stray whitespace. */
export const isSameRegion = (a, b) =>
  normalize(a?.city) === normalize(b?.city) &&
  normalize(a?.state) === normalize(b?.state);