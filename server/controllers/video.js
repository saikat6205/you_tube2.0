import video from "../Modals/video.js";
import users from "../Modals/Auth.js";
import fs from "fs";
import path from "path";
import { getPlan } from "../config/plans.js";

const todayKey = () => new Date().toISOString().slice(0, 10);

const ensureToday = async (user) => {
  if (user.watchDate !== todayKey()) {
    user.watchDate = todayKey();
    user.watchSecondsUsed = 0;
    await user.save();
  }
};

export const uploadvideo = async (req, res) => {
  if (req.file === undefined) {
    return res
      .status(404)
      .json({ message: "plz upload a mp4 video file only" });
  } else {
    try {
      const file = new video({
        videotitle: req.body.videotitle,
        filename: req.file.originalname,
        filepath: req.file.path,
        filetype: req.file.mimetype,
        filesize: req.file.size,
        videochanel: req.body.videochanel,
        uploader: req.body.uploader,
        ispremium: req.body.ispremium === "true",
      });
      await file.save();
      return res.status(201).json("file uploaded successfully");
    } catch (error) {
      console.error(" error:", error);
      return res.status(500).json({ message: "Something went wrong" });
    }
  }
};

export const getallvideo = async (req, res) => {
  try {
    const files = await video.find();
    return res.status(200).send(files);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getvideo = async (req, res) => {
  const { videoId } = req.params;
  try {
    const file = await video.findById(videoId);
    if (!file) {
      return res.status(404).json({ message: "Video not found" });
    }
    return res.status(200).json(file);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const searchvideo = async (req, res) => {
  const { q } = req.query;
  try {
    if (!q || !q.trim()) {
      const files = await video.find();
      return res.status(200).json(files);
    }
    const regex = new RegExp(q.trim(), "i");
    const files = await video.find({
      $or: [{ videotitle: regex }, { videochanel: regex }],
    });
    return res.status(200).json(files);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getchannelvideos = async (req, res) => {
  const { uploader } = req.params;
  try {
    const files = await video.find({ uploader });
    return res.status(200).json(files);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getstream = async (req, res) => {
  const { videoId } = req.params;
  const userId = req.userId;
  try {
    const file = await video.findById(videoId);
    if (!file) {
      return res.status(404).json({ message: "Video not found" });
    }
    const user = await users.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const planInfo = getPlan(user.plan || "free");
    if (file.ispremium && !planInfo.premiumAccess) {
      return res.status(403).json({
        message:
          "This is a premium video. Upgrade your plan to watch it.",
      });
    }
    if (!fs.existsSync(file.filepath)) {
      return res.status(500).json({ message: "File not found on server" });
    }
    const filepath = path.resolve(file.filepath);
    const stat = fs.statSync(filepath);
    const range = req.headers.range;
    const contentType = file.filetype || "video/mp4";
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
      });
      fs.createReadStream(filepath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filepath).pipe(res);
    }
  } catch (error) {
    console.error(" getstream error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getwatchstatus = async (req, res) => {
  try {
    const user = await users.findById(req.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    await ensureToday(user);
    const planInfo = getPlan(user.plan || "free");
    const limitSeconds =
      planInfo.watchMinutesPerDay === Infinity
        ? Infinity
        : planInfo.watchMinutesPerDay * 60;
    const usedSeconds = user.watchSecondsUsed || 0;
    const remainingSeconds =
      limitSeconds === Infinity
        ? Infinity
        : Math.max(0, limitSeconds - usedSeconds);
    return res.status(200).json({
      plan: user.plan,
      planName: planInfo.name,
      adFree: planInfo.adFree,
      premiumAccess: planInfo.premiumAccess,
      watchMinutesPerDay: planInfo.watchMinutesPerDay,
      usedSeconds,
      remainingSeconds,
      limitSeconds,
    });
  } catch (error) {
    console.error(" getwatchstatus error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const addwatchtime = async (req, res) => {
  const { seconds } = req.body;
  try {
    const user = await users.findById(req.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    await ensureToday(user);
    const planInfo = getPlan(user.plan || "free");
    const addSeconds = Math.min(Math.max(Number(seconds) || 0, 0), 60 * 5);
    user.watchSecondsUsed = (user.watchSecondsUsed || 0) + addSeconds;
    await user.save();
    const limitSeconds =
      planInfo.watchMinutesPerDay === Infinity
        ? Infinity
        : planInfo.watchMinutesPerDay * 60;
    const remainingSeconds =
      limitSeconds === Infinity
        ? Infinity
        : Math.max(0, limitSeconds - user.watchSecondsUsed);
    return res.status(200).json({
      remainingSeconds,
      limitSeconds,
      usedSeconds: user.watchSecondsUsed,
      adFree: planInfo.adFree,
    });
  } catch (error) {
    console.error(" addwatchtime error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};