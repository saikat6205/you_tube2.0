import express from "express";
import {
  getallvideo,
  uploadvideo,
  getvideo,
  searchvideo,
  getchannelvideos,
} from "../controllers/video.js";
import upload from "../filehelper/filehelper.js";
import auth from "../middleware/auth.js";

const routes = express.Router();

routes.post("/upload", auth, upload.single("file"), uploadvideo);
routes.get("/search", searchvideo);
routes.get("/channel/:uploader", getchannelvideos);
routes.get("/getall", getallvideo);
routes.get("/:videoId", getvideo);
export default routes;