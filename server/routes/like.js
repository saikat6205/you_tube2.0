import express from "express";
import {
  handlelike,
  getallLikedVideo,
  removelike,
  likedStatus,
} from "../controllers/like.js";
import auth from "../middleware/auth.js";

const routes = express.Router();
routes.get("/status/:videoId", auth, likedStatus);
routes.get("/:userId", getallLikedVideo);
routes.post("/:videoId", auth, handlelike);
routes.delete("/:videoId", auth, removelike);
export default routes;