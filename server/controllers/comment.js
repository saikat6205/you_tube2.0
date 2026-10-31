import mongoose from "mongoose";
import comment from "../Modals/comment.js";
import users from "../Modals/Auth.js";
import { validateComment } from "../utils/moderation.js";
import { detectLanguage, isSupportedLanguage, languageLabel } from "../utils/language.js";
import { translateText } from "../utils/translate.js";
import { getClientIp, lookupLocation } from "../utils/geo.js";

const MAX_COMMENTS_PER_VIDEO = 200;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const REPORT_REASONS = ["abuse", "spam", "harassment", "other"];

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

const reportFlagThreshold = () => {
  const configured = Number(process.env.COMMENT_REPORT_FLAG_THRESHOLD);
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
};

/**
 * Public shape of a comment. Raw like/dislike/report arrays are never exposed;
 * only aggregate counts and the current viewer's own state are returned.
 */
const serializeComment = (doc, viewerId) => {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const likes = (plain.likes || []).map((id) => String(id));
  const dislikes = (plain.dislikes || []).map((id) => String(id));
  const reports = plain.reports || [];
  const viewer = viewerId ? String(viewerId) : null;

  let myReaction = null;
  if (viewer) {
    if (likes.includes(viewer)) myReaction = "like";
    else if (dislikes.includes(viewer)) myReaction = "dislike";
  }

  return {
    _id: String(plain._id),
    videoid: String(plain.videoid),
    userid: String(plain.userid),
    commentbody: plain.commentbody || "",
    usercommented: plain.usercommented || "Anonymous",
    commentedon: plain.commentedon,
    editedAt: plain.editedAt || null,
    detectedLanguage: plain.detectedLanguage || "und",
    detectedLanguageLabel: languageLabel(plain.detectedLanguage || "und"),
    locationLabel: plain.locationLabel || "",
    likeCount: likes.length,
    dislikeCount: dislikes.length,
    myReaction,
    reportCount: plain.reportCount || reports.length,
    reportedByMe: viewer ? reports.some((report) => String(report.userid) === viewer) : false,
    status: plain.status || "visible",
    flaggedAt: plain.flaggedAt || null,
    canEdit: viewer ? String(plain.userid) === viewer : false,
    canDelete: viewer ? String(plain.userid) === viewer : false,
  };
};

const locationLabelFor = async (req) => {
  try {
    const location = await lookupLocation(getClientIp(req));
    const parts = [location.state, location.country].filter(
      (part) => part && !["Unknown", "Local"].includes(part)
    );
    return parts.join(", ");
  } catch (error) {
    console.warn("Comment location lookup failed:", error.message);
    return "";
  }
};

export const postcomment = async (req, res) => {
  const { videoid, commentbody } = req.body;

  if (!isObjectId(videoid)) {
    return res.status(400).json({ message: "A valid video id is required" });
  }

  const validation = validateComment(commentbody);
  if (!validation.ok) {
    return res.status(422).json({ message: validation.message, reason: validation.reason });
  }

  try {
    const user = await users.findById(req.userId);
    if (!user) {
      return res.status(401).json({ message: "Please sign in to comment" });
    }

    const duplicate = await comment.findOne({
      userid: user._id,
      videoid,
      commentbody: validation.text,
      commentedon: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    });
    if (duplicate) {
      return res.status(429).json({
        message: "You already posted this comment recently.",
        reason: "duplicate",
      });
    }

    const locationLabel = user.showLocation ? await locationLabelFor(req) : "";

    const created = await comment.create({
      userid: user._id,
      videoid,
      commentbody: validation.text,
      usercommented: user.channelname || user.name || "Anonymous",
      commentedon: new Date(),
      detectedLanguage: detectLanguage(validation.text),
      locationLabel,
    });

    return res.status(201).json({
      comment: true,
      result: serializeComment(created, req.userId),
    });
  } catch (error) {
    console.error("Post comment error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getallcomment = async (req, res) => {
  const { videoid } = req.params;

  if (!isObjectId(videoid)) {
    return res.status(400).json({ message: "A valid video id is required" });
  }

  try {
    const comments = await comment
      .find({ videoid, status: { $ne: "removed" } })
      .sort({ commentedon: -1 })
      .limit(MAX_COMMENTS_PER_VIDEO);

    return res.status(200).json(comments.map((item) => serializeComment(item, req.userId)));
  } catch (error) {
    console.error("Get comments error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const editcomment = async (req, res) => {
  const { id: _id } = req.params;
  const { commentbody } = req.body;

  if (!isObjectId(_id)) {
    return res.status(404).json({ message: "Comment unavailable" });
  }

  const validation = validateComment(commentbody);
  if (!validation.ok) {
    return res.status(422).json({ message: validation.message, reason: validation.reason });
  }

  try {
    const existing = await comment.findById(_id);
    if (!existing || existing.status === "removed") {
      return res.status(404).json({ message: "Comment not found" });
    }
    if (String(existing.userid) !== String(req.userId)) {
      return res.status(403).json({ message: "You can only edit your own comments" });
    }

    existing.commentbody = validation.text;
    existing.detectedLanguage = detectLanguage(validation.text);
    existing.editedAt = new Date();
    await existing.save();

    return res.status(200).json(serializeComment(existing, req.userId));
  } catch (error) {
    console.error("Edit comment error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const deletecomment = async (req, res) => {
  const { id: _id } = req.params;

  if (!isObjectId(_id)) {
    return res.status(404).json({ message: "Comment unavailable" });
  }

  try {
    const existing = await comment.findById(_id);
    if (!existing) {
      return res.status(404).json({ message: "Comment not found" });
    }
    if (String(existing.userid) !== String(req.userId)) {
      return res.status(403).json({ message: "You can only delete your own comments" });
    }

    await comment.findByIdAndDelete(_id);
    return res.status(200).json({ comment: true });
  } catch (error) {
    console.error("Delete comment error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

const toggleReaction = (kind) => async (req, res) => {
  const { id: _id } = req.params;

  if (!isObjectId(_id)) {
    return res.status(404).json({ message: "Comment not found" });
  }

  try {
    const doc = await comment.findById(_id);
    if (!doc || doc.status === "removed") {
      return res.status(404).json({ message: "Comment not found" });
    }

    const viewer = String(req.userId);
    const likes = (doc.likes || []).map((value) => String(value));
    const dislikes = (doc.dislikes || []).map((value) => String(value));

    if (kind === "like") {
      if (likes.includes(viewer)) {
        doc.likes = (doc.likes || []).filter((value) => String(value) !== viewer);
      } else {
        doc.likes = [...(doc.likes || []), req.userId];
        doc.dislikes = (doc.dislikes || []).filter((value) => String(value) !== viewer);
      }
    } else if (dislikes.includes(viewer)) {
      doc.dislikes = (doc.dislikes || []).filter((value) => String(value) !== viewer);
    } else {
      doc.dislikes = [...(doc.dislikes || []), req.userId];
      doc.likes = (doc.likes || []).filter((value) => String(value) !== viewer);
    }

    await doc.save();
    return res.status(200).json({ comment: true, result: serializeComment(doc, req.userId) });
  } catch (error) {
    console.error(`React (${kind}) error:`, error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const likecomment = toggleReaction("like");
export const dislikecomment = toggleReaction("dislike");

export const reportcomment = async (req, res) => {
  const { id: _id } = req.params;

  if (!isObjectId(_id)) {
    return res.status(404).json({ message: "Comment not found" });
  }

  try {
    const doc = await comment.findById(_id);
    if (!doc || doc.status === "removed") {
      return res.status(404).json({ message: "Comment not found" });
    }
    if (String(doc.userid) === String(req.userId)) {
      return res.status(400).json({ message: "You cannot report your own comment." });
    }

    const viewer = String(req.userId);
    const alreadyReported = (doc.reports || []).some(
      (report) => String(report.userid) === viewer
    );

    if (!alreadyReported) {
      const reason = REPORT_REASONS.includes(String(req.body?.reason))
        ? String(req.body.reason)
        : "other";

      doc.reports = [...(doc.reports || []), { userid: req.userId, reason, createdAt: new Date() }];
      doc.reportCount = (doc.reportCount || 0) + 1;

      // Reports only flag a comment for human review. Dislikes never remove or
      // hide a comment, and nothing is deleted automatically.
      if (
        doc.status !== "removed" &&
        doc.status !== "flagged" &&
        doc.reportCount >= reportFlagThreshold()
      ) {
        doc.status = "flagged";
        doc.flaggedAt = new Date();
      }

      await doc.save();
    }

    return res.status(200).json({
      comment: true,
      alreadyReported,
      result: serializeComment(doc, req.userId),
    });
  } catch (error) {
    console.error("Report comment error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const translatecomment = async (req, res) => {
  const { commentId, target } = req.body;
  const targetLanguage = String(target || "en").trim().toLowerCase();

  if (!isObjectId(commentId)) {
    return res.status(400).json({ message: "A valid comment id is required" });
  }
  if (!isSupportedLanguage(targetLanguage)) {
    return res.status(400).json({ message: "Unsupported target language" });
  }

  try {
    const doc = await comment
      .findById(commentId)
      .select("commentbody status detectedLanguage");
    if (!doc || doc.status === "removed") {
      return res.status(404).json({ message: "Comment not found" });
    }

    const result = await translateText(doc.commentbody, targetLanguage);
    return res.status(200).json({
      ...result,
      commentId: String(doc._id),
      detectedLanguage: doc.detectedLanguage || result.sourceLanguage,
    });
  } catch (error) {
    console.warn("Translate comment failed:", error.message);
    return res.status(502).json({
      message: "Translation is temporarily unavailable. Please try again shortly.",
    });
  }
};

export const getreported = async (req, res) => {
  try {
    const docs = await comment
      .find({ status: { $in: ["flagged", "removed"] } })
      .sort({ flaggedAt: -1, commentedon: -1 })
      .limit(100);

    return res.status(200).json(
      docs.map((doc) => {
        const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
        return {
          ...serializeComment(doc, req.userId),
          // Reporter identities stay private; only the reasons are shared.
          reports: (plain.reports || []).map((report) => ({
            reason: report.reason || "other",
            createdAt: report.createdAt,
          })),
          reviewedAt: plain.reviewedAt || null,
        };
      })
    );
  } catch (error) {
    console.error("Get reported comments error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const reviewcomment = async (req, res) => {
  const { id: _id } = req.params;
  const action = String(req.body?.action || "").toLowerCase();

  if (!["approve", "remove"].includes(action)) {
    return res.status(400).json({ message: "action must be approve or remove" });
  }
  if (!isObjectId(_id)) {
    return res.status(404).json({ message: "Comment not found" });
  }

  try {
    const doc = await comment.findById(_id);
    if (!doc) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (action === "approve") {
      doc.status = "visible";
      doc.flaggedAt = null;
      // A clean review resets the report tally so future abuse can flag again.
      doc.reports = [];
      doc.reportCount = 0;
    } else {
      doc.status = "removed";
    }

    doc.reviewedAt = new Date();
    doc.reviewedBy = req.userId;
    await doc.save();

    return res.status(200).json(serializeComment(doc, req.userId));
  } catch (error) {
    console.error("Review comment error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
