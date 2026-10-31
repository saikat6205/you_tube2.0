import express from "express";
import {
  deletecomment,
  dislikecomment,
  editcomment,
  getallcomment,
  getreported,
  likecomment,
  postcomment,
  reportcomment,
  reviewcomment,
  translatecomment,
} from "../controllers/comment.js";
import auth, { optionalAuth, requireAdmin } from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rateLimit.js";

const routes = express.Router();

const postLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "You are commenting too fast. Please slow down.",
});

const reactionLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many reactions. Please slow down.",
});

const reportLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many reports. Please try again later.",
});

const translateLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many translation requests. Please slow down.",
});

routes.post("/postcomment", auth, postLimiter, postcomment);
routes.post("/editcomment/:id", auth, postLimiter, editcomment);
routes.delete("/deletecomment/:id", auth, deletecomment);
routes.post("/translate", translateLimiter, translatecomment);
routes.get("/reported/list", auth, requireAdmin, getreported);
routes.patch("/review/:id", auth, requireAdmin, reviewcomment);
routes.post("/:id/like", auth, reactionLimiter, likecomment);
routes.post("/:id/dislike", auth, reactionLimiter, dislikecomment);
routes.post("/:id/report", auth, reportLimiter, reportcomment);
routes.get("/:videoid", optionalAuth, getallcomment);

export default routes;
