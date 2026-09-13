import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
  const header = req.headers.authorization;
  const queryToken =
    req.query && (req.query.token || req.query.access_token);
  if ((!header || !header.startsWith("Bearer ")) && !queryToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = queryToken || header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "yourtube_secret_key");
    req.userId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default auth;