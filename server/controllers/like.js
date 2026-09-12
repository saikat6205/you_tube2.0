import video from "../Modals/video.js";
import like from "../Modals/like.js";
import dislike from "../Modals/dislike.js";

export const handlelike = async (req, res) => {
  const userId = req.userId || req.body.userId;
  const { videoId } = req.params;
  try {
    const exisitinglike = await like.findOne({
      viewer: userId,
      videoid: videoId,
    });
    if (exisitinglike) {
      await like.findByIdAndDelete(exisitinglike._id);
      await video.findByIdAndUpdate(videoId, { $inc: { Like: -1 } });
      return res.status(200).json({ liked: false });
    } else {
      await like.create({ viewer: userId, videoid: videoId });
      await video.findByIdAndUpdate(videoId, { $inc: { Like: 1 } });
      const removed = await dislike.findOneAndDelete({
        viewer: userId,
        videoid: videoId,
      });
      if (removed) {
        await video.findByIdAndUpdate(videoId, { $inc: { Dislike: -1 } });
      }
      return res.status(200).json({ liked: true });
    }
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const removelike = async (req, res) => {
  const userId = req.userId || req.body.userId;
  const { videoId } = req.params;
  try {
    const removed = await like.findOneAndDelete({
      viewer: userId,
      videoid: videoId,
    });
    if (removed) {
      await video.findByIdAndUpdate(videoId, { $inc: { Like: -1 } });
    }
    return res.status(200).json({ liked: false });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const likedStatus = async (req, res) => {
  const userId = req.userId || req.body.userId;
  const { videoId } = req.params;
  try {
    const existing = await like.findOne({ viewer: userId, videoid: videoId });
    return res.status(200).json({ liked: !!existing });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getallLikedVideo = async (req, res) => {
  const { userId } = req.params;
  try {
    const likevideo = await like
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .exec();
    return res.status(200).json(likevideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};