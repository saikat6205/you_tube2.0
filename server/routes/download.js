import express from "express";
import { downloadvideo, getdownloads, getlimits } from "../controllers/download.js";
import auth from "../middleware/auth.js";

const routes = express.Router();
routes.get("/limits", auth, getlimits);
routes.get("/list/:userId", getdownloads);
routes.get("/:videoId", auth, downloadvideo);
export default routes;