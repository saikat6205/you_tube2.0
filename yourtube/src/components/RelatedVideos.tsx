import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import VideoThumb from "./VideoThumb";

interface RelatedVideosProps {
  videos: Array<{
    _id: string;
    videotitle: string;
    videochanel: string;
    filepath: string;
    views: number;
    createdAt: string;
    ispremium?: boolean;
  }>;
}

export default function RelatedVideos({ videos }: RelatedVideosProps) {
  if (!videos?.length) {
    return (
      <div className="text-sm text-gray-500">No related videos found.</div>
    );
  }
  return (
    <div className="space-y-2">
      {videos.map((video) => (
        <Link
          key={video._id}
          href={`/watch/${video._id}`}
          className="flex gap-2 group"
        >
          <div className="relative w-40 aspect-video bg-gray-100 rounded overflow-hidden flex-shrink-0">
            <VideoThumb
              video={video}
              className="object-cover group-hover:scale-105 transition-transform duration-200 w-full h-full"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600">
              {video.videotitle}
            </h3>
            <p className="text-xs text-gray-600 mt-1">{video.videochanel}</p>
            <p className="text-xs text-gray-600">
              {(video.views || 0).toLocaleString()} views •{" "}
              {formatDistanceToNow(new Date(video.createdAt))} ago
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}