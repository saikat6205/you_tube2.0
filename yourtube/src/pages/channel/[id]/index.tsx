import ChannelHeader from "@/components/ChannelHeader";
import Channeltabs from "@/components/Channeltabs";
import ChannelVideos from "@/components/ChannelVideos";
import VideoUploader from "@/components/VideoUploader";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

const index = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useUser();
  const [channel, setChannel] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [channelRes, videosRes] = await Promise.all([
          axiosInstance.get(`/user/${id}`),
          axiosInstance.get(`/video/channel/${id}`),
        ]);
        setChannel(channelRes.data);
        setVideos(videosRes.data);
      } catch (error) {
        console.error("Error fetching channel data:", error);
        setChannel(null);
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 min-h-screen bg-white p-8 text-center">
        Loading channel...
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex-1 min-h-screen bg-white p-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Channel not found</h2>
        <p className="text-gray-600">This channel may not exist.</p>
      </div>
    );
  }

  const isOwner = user?._id === id;

  return (
    <div className="flex-1 min-h-screen bg-white">
      <div className="max-w-full mx-auto">
        <ChannelHeader channel={channel} user={user} />
        <Channeltabs />
        {isOwner && (
          <div className="px-4 pb-8">
            <VideoUploader
              channelId={channel._id}
              channelName={channel?.channelname}
            />
          </div>
        )}
        <div className="px-4 pb-8">
          <ChannelVideos videos={videos} />
        </div>
      </div>
    </div>
  );
};

export default index;