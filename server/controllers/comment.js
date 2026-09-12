import comment from "../Modals/comment.js";
import mongoose from "mongoose";

export const postcomment = async (req, res) => {
  const commentdata = { ...req.body };
  if (req.userId) {
    commentdata.userid = req.userId;
  }
  const postcomment = new comment(commentdata);
  try {
    await postcomment.save();
    return res.status(200).json({ comment: true, result: postcomment });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const getallcomment = async (req, res) => {
  const { videoid } = req.params;
  try {
    const commentvideo = await comment.find({ videoid: videoid });
    return res.status(200).json(commentvideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const deletecomment = async (req, res) => {
  const { id: _id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("comment unavailable");
  }
  try {
    const existing = await comment.findById(_id);
    if (!existing) {
      return res.status(404).json({ message: "Comment not found" });
    }
    if (req.userId && existing.userid?.toString() !== req.userId) {
      return res.status(403).json({ message: "You can only delete your own comments" });
    }
    await comment.findByIdAndDelete(_id);
    return res.status(200).json({ comment: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const editcomment = async (req, res) => {
  const { id: _id } = req.params;
  const { commentbody } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("comment unavailable");
  }
  try {
    const existing = await comment.findById(_id);
    if (!existing) {
      return res.status(404).json({ message: "Comment not found" });
    }
    if (req.userId && existing.userid?.toString() !== req.userId) {
      return res.status(403).json({ message: "You can only edit your own comments" });
    }
    const updatecomment = await comment.findByIdAndUpdate(
      _id,
      {
        $set: { commentbody: commentbody },
      },
      { new: true }
    );
    res.status(200).json(updatecomment);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};