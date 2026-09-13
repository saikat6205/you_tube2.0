import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videopplayer from "@/components/Videopplayer";
import { Button } from "@/components/ui/button";
import { Crown, Lock } from "lucide-react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";

const index = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useUser();
  const [video, setVideo] = useState<any>(null);
  const [allVideos, setAllVideos] = useState<any[]>([]);
  const [watchStatus, setWatchStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchvideo = async () => {
      if (!id || typeof id !== "string") return;
      try {
        const [videoRes, allRes] = await Promise.all([
          axiosInstance.get(`/video/${id}`),
          axiosInstance.get("/video/getall"),
        ]);
        setVideo(videoRes.data);
        setAllVideos(allRes.data || []);
      } catch (error) {
        console.log(error);
        setVideo(null);
      } finally {
        setLoading(false);
      }
    };
    fetchvideo();
  }, [id]);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    const loadWatchStatus = async () => {
      try {
        const res = await axiosInstance.get("/video/watchstatus");
        setWatchStatus(res.data);
      } catch (error) {
        console.log("watchstatus not available:", error);
        setWatchStatus(null);
      }
    };
    if (user) {
      loadWatchStatus();
    } else {
      setWatchStatus(null);
    }
  }, [id, user]);

  const relatedVideos = useMemo(
    () => allVideos.filter((vid: any) => vid._id !== id),
    [allVideos, id]
  );

  if (loading) {
    return <div>Loading..</div>;
  }

  if (!video) {
    return <div>Video not found</div>;
  }

  const premiumAccess = watchStatus?.premiumAccess === true;
  const isPremiumVideo = video.ispremium === true;
  const blocked = isPremiumVideo && !premiumAccess;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {blocked ? (
              <div className="aspect-video bg-gray-900 rounded-lg flex flex-col items-center justify-center text-white gap-3">
                <div className="flex items-center gap-2 bg-amber-500 text-black px-3 py-1 rounded-full text-xs font-semibold uppercase">
                  <Lock className="w-3.5 h-3.5" />
                  Premium
                </div>
                <p className="text-lg font-medium">This is a premium video</p>
                <p className="text-sm text-gray-400">
                  Upgrade your plan to unlock premium content, more watch time
                  and downloads.
                </p>
                <Link href="/upgrade">
                  <Button className="bg-red-600 hover:bg-red-700 text-white">
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade now
                  </Button>
                </Link>
              </div>
            ) : (
              <Videopplayer
                video={video}
                remainingSeconds={watchStatus?.remainingSeconds}
                adFree={watchStatus?.adFree}
              />
            )}
            <VideoInfo video={video} />
            <Comments videoId={id} />
          </div>
          <div className="space-y-4">
            <RelatedVideos videos={relatedVideos} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default index;