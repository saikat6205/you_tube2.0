import express from "express";
import mongoose from "mongoose";
import auth, { optionalAuth } from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import users from "../Modals/Auth.js";
import video from "../Modals/video.js";
import {
  createParty,
  getParty,
  normalizePartyCode,
  partySummary,
} from "../utils/partyStore.js";

const routes = express.Router();

const createPartyLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many watch parties created. Please wait a minute and try again.",
});

const displayName = (user) =>
  user.channelname || user.name || user.email?.split("@")[0] || "Viewer";

routes.post("/", auth, createPartyLimit, async (req, res) => {
  const videoId = String(req.body?.videoId || "").trim();
  if (!mongoose.isValidObjectId(videoId)) {
    return res.status(400).json({ message: "A valid videoId is required" });
  }

  try {
    const [videoDoc, user] = await Promise.all([
      video.findById(videoId).select("videotitle"),
      users
        .findById(req.userId)
        .select("name channelname image email"),
    ]);

    if (!videoDoc) {
      return res.status(404).json({ message: "Video not found" });
    }
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const name = displayName(user);
    const result = createParty({
      hostId: req.userId,
      hostName: name,
      hostImage: user.image || "",
      videoId,
      videoTitle: videoDoc.videotitle,
    });

    if (result.error === "limit") {
      return res
        .status(503)
        .json({ message: "Too many active watch parties. Please try again later." });
    }

    return res.status(201).json({
      ...partySummary(result.party),
      joinPath: `/party/${result.party.code}`,
    });
  } catch (error) {
    console.error(" create party error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

routes.get("/:code", optionalAuth, (req, res) => {
  const code = normalizePartyCode(req.params.code);
  const party = getParty(code);
  if (!party) {
    return res.status(404).json({ message: "Watch party not found" });
  }
  return res.status(200).json(partySummary(party));
});

export default routes;
