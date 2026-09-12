import express from "express";
import {
  getallhistoryVideo,
  handlehistory,
  handleview,
  deletehistory,
} from "../controllers/history.js";
import auth from "../middleware/auth.js";

const routes = express.Router();
routes.get("/:userId", getallhistoryVideo);
routes.post("/views/:videoId", handleview);
routes.post("/:videoId", auth, handlehistory);
routes.delete("/:historyId", auth, deletehistory);
export default routes;