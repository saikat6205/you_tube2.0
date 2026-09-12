import video from "../Modals/video.js";
import like from "../Modals/like.js";
import dislike from "../Modals/dislike.js";

export const toggledislike = async (req, res) => {
  const userId = req.userId || req.body.userId;
  const { videoId } = req.params;
  try {
    const exisitingdislike = await dislike.findOne({
      viewer: userId,
      videoid: videoId,
    });
    if (exisitingdislike) {
      await dislike.findByIdAndDelete(exisitingdislike._id);
      await video.findByIdAndUpdate(videoId, { $inc: { Dislike: -1 } });
      return res.status(200).json({ disliked: false });
    } else {
      await dislike.create({ viewer: userId, videoid: videoId });
      await video.findByIdAndUpdate(videoId, { $inc: { Dislike: 1 } });
      const removed = await like.findOneAndDelete({
        viewer: userId,
        videoid: videoId,
      });
      if (removed) {
        await video.findByIdAndUpdate(videoId, { $inc: { Like: -1 } });
      }
      return res.status(200).json({ disliked: true });
    }
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const dislikedStatus = async (req, res) => {
  const userId = req.userId || req.body.userId;
  const { videoId } = req.params;
  try {
    const existing = await dislike.findOne({ viewer: userId, videoid: videoId });
    return res.status(200).json({ disliked: !!existing });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};