import express from "express";
import { login, updateprofile, getuser } from "../controllers/auth.js";
import auth from "../middleware/auth.js";
const routes = express.Router();

routes.post("/login", login);
routes.get("/:id", getuser);
routes.patch("/update/:id", auth, updateprofile);
export default routes;