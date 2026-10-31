import express from "express";
import {
  login,
  updateprofile,
  getuser,
  verifyotp,
  resendotp,
  settheme,
} from "../controllers/auth.js";
import auth from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rateLimit.js";
const routes = express.Router();

const loginLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many login attempts. Please try again later.",
});

const verifyLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many verification attempts. Please try again later.",
});

const resendLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many resend requests. Please try again later.",
});

routes.post("/login", loginLimiter, login);
routes.post("/verify-otp", verifyLimiter, verifyotp);
routes.post("/otp/resend", resendLimiter, resendotp);
routes.patch("/theme", auth, settheme);
routes.get("/:id", getuser);
routes.patch("/update/:id", auth, updateprofile);
export default routes;
