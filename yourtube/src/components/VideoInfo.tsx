import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Clock,
  Download,
  MoreHorizontal,
  Share,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import Link from "next/link";

const VideoInfo = ({ video }: any) => {
  const [likes, setlikes] = useState(video.Like || 0);
  const [dislikes, setDislikes] = useState(video.Dislike || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [isWatchLater, setIsWatchLater] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { user } = useUser();

  useEffect(() => {
    setlikes(video.Like || 0);
    setDislikes(video.Dislike || 0);
  }, [video]);

  const refreshCounts = async () => {
    try {
      const res = await axiosInstance.get(`/video/${video._id}`);
      setlikes(res.data.Like || 0);
      setDislikes(res.data.Dislike || 0);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const handleviews = async () => {
      try {
        if (user) {
          await axiosInstance.post(`/history/${video._id}`, {
            userId: user?._id,
          });
        } else {
          await axiosInstance.post(`/history/views/${video._id}`);
        }
      } catch (error) {
        console.log(error);
      }
    };
    handleviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  useEffect(() => {
    if (!user) return;
    const loadStatus = async () => {
      try {
        const [likeRes, dislikeRes, watchLaterRes] = await Promise.all([
          axiosInstance.get(`/like/status/${video._id}`),
          axiosInstance.get(`/dislike/status/${video._id}`),
          axiosInstance.get(`/watch/status/${video._id}`),
        ]);
        setIsLiked(likeRes.data.liked);
        setIsDisliked(dislikeRes.data.disliked);
        setIsWatchLater(watchLaterRes.data.watchlater);
      } catch (error) {
        console.error(error);
      }
    };
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleLike = async () => {
    if (!user) return;
    try {
      const res = await axiosInstance.post(`/like/${video._id}`, {
        userId: user?._id,
      });
      if (res.data.liked) {
        setIsLiked(true);
        setIsDisliked(false);
      } else {
        setIsLiked(false);
      }
      await refreshCounts();
    } catch (error) {
      console.log(error);
    }
  };

  const handleDislike = async () => {
    if (!user) return;
    try {
      const res = await axiosInstance.post(`/dislike/${video._id}`, {
        userId: user?._id,
      });
      if (res.data.disliked) {
        setIsDisliked(true);
        setIsLiked(false);
      } else {
        setIsDisliked(false);
      }
      await refreshCounts();
    } catch (error) {
      console.log(error);
    }
  };

  const handleWatchLater = async () => {
    if (!user) return;
    try {
      const res = await axiosInstance.post(`/watch/${video._id}`, {
        userId: user?._id,
      });
      setIsWatchLater(res.data.watchlater);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{video.videotitle}</h1>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="w-10 h-10">
            <AvatarFallback>{video.videochanel?.[0]}</AvatarFallback>
          </Avatar>
          <div>
            <Link
              href={`/channel/${video.uploader}`}
              className="font-medium hover:text-blue-600"
            >
              {video.videochanel}
            </Link>
            <p className="text-sm text-gray-600">
              {(video.views || 0).toLocaleString()} views
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-full">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-l-full"
              onClick={handleLike}
            >
              <ThumbsUp
                className={`w-5 h-5 mr-2 ${
                  isLiked ? "fill-black text-black" : ""
                }`}
              />
              {(likes || 0).toLocaleString()}
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button
              variant="ghost"
              size="sm"
              className="rounded-r-full"
              onClick={handleDislike}
            >
              <ThumbsDown
                className={`w-5 h-5 mr-2 ${
                  isDisliked ? "fill-black text-black" : ""
                }`}
              />
              {(dislikes || 0).toLocaleString()}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`bg-gray-100 rounded-full ${
              isWatchLater ? "text-primary" : ""
            }`}
            onClick={handleWatchLater}
          >
            <Clock className="w-5 h-5 mr-2" />
            {isWatchLater ? "Saved" : "Watch Later"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="bg-gray-100 rounded-full"
          >
            <Share className="w-5 h-5 mr-2" />
            Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="bg-gray-100 rounded-full"
          >
            <Download className="w-5 h-5 mr-2" />
            Download
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="bg-gray-100 rounded-full"
          >
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>
      </div>
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="flex gap-4 text-sm font-medium mb-2">
          <span>{(video.views || 0).toLocaleString()} views</span>
          <span>{video.createdAt && formatDistanceToNow(new Date(video.createdAt))} ago</span>
        </div>
        <div className={`text-sm ${showFullDescription ? "" : "line-clamp-3"}`}>
          <p>{video.videotitle}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 p-0 h-auto font-medium"
          onClick={() => setShowFullDescription(!showFullDescription)}
        >
          {showFullDescription ? "Show less" : "Show more"}
        </Button>
      </div>
    </div>
  );
};

export default VideoInfo;