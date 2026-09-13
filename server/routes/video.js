import express from "express";
import {
  getallvideo,
  uploadvideo,
  getvideo,
  searchvideo,
  getchannelvideos,
  getstream,
  getwatchstatus,
  addwatchtime,
} from "../controllers/video.js";
import upload from "../filehelper/filehelper.js";
import auth from "../middleware/auth.js";

const routes = express.Router();

routes.get("/getall", getallvideo);
routes.get("/search", searchvideo);
routes.get("/channel/:uploader", getchannelvideos);
routes.get("/stream/:videoId", auth, getstream);
routes.get("/watchstatus", auth, getwatchstatus);
routes.post("/watchtime", auth, addwatchtime);
routes.post("/upload", auth, upload.single("file"), uploadvideo);
routes.get("/:videoId", getvideo);
export default routes;