import mongoose from "mongoose";

const reportSchema = mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    reason: {
      type: String,
      enum: ["abuse", "spam", "harassment", "other"],
      default: "other",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const commentschema = mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    commentbody: { type: String },
    // Snapshot of the author's display name at posting time.
    usercommented: { type: String },
    commentedon: { type: Date, default: Date.now },
    editedAt: { type: Date, default: null },
    detectedLanguage: { type: String, default: "und" },
    // Coarse location only (state, country). Empty unless the author opted in.
    locationLabel: { type: String, default: "" },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    reports: { type: [reportSchema], default: [] },
    reportCount: { type: Number, default: 0 },
    // visible -> flagged (report threshold met) -> removed (admin decision)
    status: {
      type: String,
      enum: ["visible", "flagged", "removed"],
      default: "visible",
    },
    flaggedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

commentschema.index({ videoid: 1, commentedon: -1 });
commentschema.index({ status: 1, flaggedAt: -1 });

export default mongoose.model("comment", commentschema);
