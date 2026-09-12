import express from "express";
import { deletecomment, getallcomment, postcomment, editcomment } from "../controllers/comment.js";
import auth from "../middleware/auth.js";


const routes = express.Router();
routes.get("/:videoid", getallcomment);
routes.post("/postcomment", auth, postcomment);
routes.delete("/deletecomment/:id", auth, deletecomment);
routes.post("/editcomment/:id", auth, editcomment);
export default routes;