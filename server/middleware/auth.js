import jwt from "jsonwebtoken";
import { isAdminEmail } from "../utils/admin.js";

const readToken = (req) => {
  const header = req.headers.authorization;
  const queryToken = req.query && (req.query.token || req.query.access_token);

  if (header && header.startsWith("Bearer ")) return header.slice(7);
  if (queryToken) return String(queryToken);
  return null;
};

const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "yourtube_secret_key");
    return decoded;
  } catch (error) {
    return null;
  }
};

const auth = (req, res, next) => {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  req.userId = decoded.id;
  req.userEmail = decoded.email;
  return next();
};

/**
 * Attaches the viewer when a valid token is present but never rejects the
 * request. Public reads (like comment lists) use this to include per-viewer
 * reaction/report state.
 */
export const optionalAuth = (req, res, next) => {
  const token = readToken(req);
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.userId = decoded.id;
      req.userEmail = decoded.email;
    }
  }
  next();
};

export const requireAdmin = (req, res, next) => {
  if (!req.userId || !isAdminEmail(req.userEmail)) {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
};

export default auth;
