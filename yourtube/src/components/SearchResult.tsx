import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import axiosInstance from "@/lib/axiosinstance";

const SearchResult = ({ query }: any) => {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        setVideos([]);
        return;
      }
      setLoading(true);
      try {
        const res = await axiosInstance.get(
          `/video/search?q=${encodeURIComponent(query.trim())}`
        );
        setVideos(res.data);
      } catch (error) {
        console.error("Error searching videos:", error);
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [query]);

  if (!query.trim()) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">
          Enter a search term to find videos and channels.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Searching...</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">No results found</h2>
        <p className="text-gray-600">
          Try different keywords or remove search filters
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {videos.map((video: any) => (
          <div key={video._id} className="flex gap-4 group">
            <Link href={`/watch/${video._id}`} className="flex-shrink-0">
              <div className="relative w-80 aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <video
                  src={`${process.env.BACKEND_URL}/${video?.filepath}`}
                  className="object-cover group-hover:scale-105 transition-transform duration-200"
                />
              </div>
            </Link>

            <div className="flex-1 min-w-0 py-1">
              <Link href={`/watch/${video._id}`}>
                <h3 className="font-medium text-lg line-clamp-2 group-hover:text-blue-600 mb-2">
                  {video.videotitle}
                </h3>
              </Link>

              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <span>{(video.views || 0).toLocaleString()} views</span>
                <span>•</span>
                <span>
                  {formatDistanceToNow(new Date(video.createdAt))} ago
                </span>
              </div>

              <Link
                href={`/channel/${video.uploader}`}
                className="flex items-center gap-2 mb-2 hover:text-blue-600"
              >
                <Avatar className="w-6 h-6">
                  <AvatarImage src="/placeholder.svg?height=24&width=24" />
                  <AvatarFallback className="text-xs">
                    {video.videochanel?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-gray-600">
                  {video.videochanel}
                </span>
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center py-8">
        <p className="text-gray-600">
          Showing {videos.length} results for "{query}"
        </p>
      </div>
    </div>
  );
};

export default SearchResult;