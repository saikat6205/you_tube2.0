import express from "express";
import { toggledislike, dislikedStatus } from "../controllers/dislike.js";
import auth from "../middleware/auth.js";

const routes = express.Router();
routes.get("/status/:videoId", auth, dislikedStatus);
routes.post("/:videoId", auth, toggledislike);
export default routes;