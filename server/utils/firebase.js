import jwt from "jsonwebtoken";

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const CERT_TTL_MS = 55 * 60 * 1000;

let cache = { at: 0, certs: null };

const fetchCerts = async (force = false) => {
  const now = Date.now();
  if (!force && cache.certs && now - cache.at < CERT_TTL_MS) {
    return cache.certs;
  }
  const response = await fetch(CERT_URL);
  if (!response.ok) {
    throw new Error(`Could not load Firebase signing keys (${response.status})`);
  }
  const certs = await response.json();
  cache = { at: now, certs };
  return certs;
};

/**
 * Verifies a Firebase ID token produced by the browser SDK.
 *
 * This is what makes the backend truly authenticate the user: the email is taken
 * from the signed token, never from the request body. Signature, audience,
 * issuer and expiry are all checked against Google's published certificates.
 */
export const verifyFirebaseIdToken = async (idToken) => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    const error = new Error("FIREBASE_PROJECT_ID is not configured");
    error.code = "AUTH_CONFIG";
    throw error;
  }
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Missing idToken");
  }

  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid) {
    throw new Error("Malformed ID token");
  }

  let certs = await fetchCerts();
  let cert = certs[kid];
  if (!cert) {
    // Signing keys rotate; refresh once before giving up.
    certs = await fetchCerts(true);
    cert = certs[kid];
  }
  if (!cert) {
    throw new Error("Unknown ID token signing key");
  }

  const payload = jwt.verify(idToken, cert, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
    clockTolerance: 30,
  });

  if (!payload.sub) {
    throw new Error("ID token has no subject");
  }
  if (!payload.email) {
    throw new Error("ID token has no email");
  }
  if (payload.email_verified === false) {
    throw new Error("Email is not verified");
  }

  return payload;
};
