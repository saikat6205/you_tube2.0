import video from "../Modals/video.js";

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