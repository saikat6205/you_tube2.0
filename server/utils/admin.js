/**
 * Admin access is resolved from the ADMIN_EMAILS environment variable. Emails
 * are compared case-insensitively and read lazily so dotenv has already run.
 */
export const getAdminEmails = () =>
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const isAdminEmail = (email) => {
  const clean = String(email || "").trim().toLowerCase();
  return Boolean(clean) && getAdminEmails().includes(clean);
};
