import express from "express";
import {
  getallwatchlater,
  handlewatchlater,
  removewatchlater,
  watchlaterStatus,
} from "../controllers/watchlater.js";
import auth from "../middleware/auth.js";

const routes = express.Router();
routes.get("/status/:videoId", auth, watchlaterStatus);
routes.get("/:userId", getallwatchlater);
routes.post("/:videoId", auth, handlewatchlater);
routes.delete("/:videoId", auth, removewatchlater);
export default routes;