import video from "../Modals/video.js";
import download from "../Modals/download.js";
import users from "../Modals/Auth.js";
import fs from "fs";
import path from "path";
import { PLANS } from "../config/plans.js";

const startOfDay = () => new Date(new Date().setHours(0, 0, 0, 0));

export const downloadvideo = async (req, res) => {
  const userId = req.userId;
  const { videoId } = req.params;
  try {
    const file = await video.findById(videoId);
    if (!file) {
      return res.status(404).json({ message: "Video not found" });
    }
    const user = await users.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const plan = user.plan || "free";
    const limit = PLANS[plan] ?? PLANS.free;
    const usedToday = await download.countDocuments({
      userid: userId,
      downloadedon: { $gte: startOfDay() },
    });
    if (usedToday >= limit) {
      return res.status(429).json({
        message: `Daily download limit reached (${usedToday}/${limit} for ${plan} plan). Try again tomorrow.`,
      });
    }
    if (!fs.existsSync(file.filepath)) {
      return res.status(500).json({ message: "Video file not found on server" });
    }
    await download.create({ userid: userId, videoid: videoId, plan: plan });
    await video.findByIdAndUpdate(videoId, { $inc: { downloads: 1 } });
    const filename = file.filename || `${file._id}.mp4`;
    res.download(path.resolve(file.filepath), filename, (err) => {
      if (err && !res.headersSent) {
        console.error("Download stream error:", err);
      }
    });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getdownloads = async (req, res) => {
  const { userId } = req.params;
  try {
    const downloads = await download
      .find({ userid: userId })
      .sort({ downloadedon: -1 })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .exec();
    return res.status(200).json(downloads);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getlimits = async (req, res) => {
  const userId = req.userId;
  try {
    const user = await users.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const plan = user.plan || "free";
    const limit = PLANS[plan] ?? PLANS.free;
    const usedToday = await download.countDocuments({
      userid: userId,
      downloadedon: { $gte: startOfDay() },
    });
    const remaining = limit === Infinity ? Infinity : Math.max(0, limit - usedToday);
    return res
      .status(200)
      .json({ plan, limit, usedToday, remaining });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};