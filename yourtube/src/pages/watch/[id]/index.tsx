import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videopplayer from "@/components/Videopplayer";
import axiosInstance from "@/lib/axiosinstance";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";

const index = () => {
  const router = useRouter();
  const { id } = router.query;
  const [video, setVideo] = useState<any>(null);
  const [allVideos, setAllVideos] = useState<any[]>([]);
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

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Videopplayer video={video} />
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