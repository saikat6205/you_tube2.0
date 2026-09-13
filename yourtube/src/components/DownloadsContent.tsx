"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Crown, Download, FolderDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import VideoThumb from "@/components/VideoThumb";
import { toast } from "sonner";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

export default function DownloadsContent() {
  const [downloads, setDownloads] = useState<any[]>([]);
  const [limits, setLimits] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    if (user) {
      loadDownloads();
      loadLimits();
    }
  }, [user]);

  const loadDownloads = async () => {
    if (!user) return;
    try {
      const res = await axiosInstance.get(`/download/list/${user?._id}`);
      setDownloads(res.data);
    } catch (error) {
      console.error("Error loading downloads:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLimits = async () => {
    if (!user) return;
    try {
      const res = await axiosInstance.get(`/download/limits`);
      setLimits(res.data);
    } catch (error) {
      console.error("Error loading download limits:", error);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <Download className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Manage your downloads</h2>
        <p className="text-gray-600">Sign in to view and manage downloads.</p>
      </div>
    );
  }

  if (loading) {
    return <div>Loading downloads...</div>;
  }

  const limitLabel =
    limits?.downloadsPerDay === Infinity
      ? "Unlimited"
      : `${limits?.downloadsPerDay ?? 0} downloads/day`;
  const remainingLabel =
    limits?.remaining === Infinity
      ? "Unlimited"
      : `${limits?.remaining ?? 0} remaining today`;

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 rounded-lg p-4 border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FolderDown className="w-6 h-6 text-gray-500" />
          <div>
            <p className="font-medium capitalize">
              {limits?.planName || limits?.plan || "free"} plan
            </p>
            <p className="text-sm text-gray-600">
              {limitLabel} • {limits?.usedToday ?? 0} used today • {remainingLabel}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {limits?.adFree ? "Ad-free viewing" : "Free plan shows ads"}{" "}
              •{" "}
              {limits?.watchMinutesPerDay === Infinity
                ? "Unlimited watch time"
                : `${limits?.watchMinutesPerDay ?? 60} min watch time per day`}
            </p>
          </div>
        </div>
        <Link href="/upgrade">
          <Button className="bg-red-600 hover:bg-red-700 text-white">
            <Crown className="w-4 h-4 mr-2" />
            Upgrade plan
          </Button>
        </Link>
      </div>

      {downloads.length === 0 ? (
        <div className="text-center py-12">
          <Download className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No downloads yet</h2>
          <p className="text-gray-600">
            Videos you download will appear here. Free users get 1 download per
            day.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {downloads.length} total{" "}
            {downloads.length === 1 ? "download" : "downloads"}
          </p>
          {downloads.map((item) => (
            <div key={item._id} className="flex gap-4 group">
              <Link href={`/watch/${item.videoid._id}`} className="flex-shrink-0">
                <div className="relative w-40 aspect-video bg-gray-100 rounded overflow-hidden">
                  <VideoThumb
                    video={item.videoid}
                    className="group-hover:scale-105 transition-transform duration-200 w-full h-full"
                  />
                </div>
              </Link>

              <div className="flex-1 min-w-0">
                <Link href={`/watch/${item.videoid._id}`}>
                  <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600 mb-1">
                    {item.videoid.videotitle}
                  </h3>
                </Link>
                <p className="text-sm text-gray-600">{item.videoid.videochanel}</p>
                <p className="text-sm text-gray-600">
                  {(item.videoid.views || 0).toLocaleString()} views •{" "}
                  {formatDistanceToNow(new Date(item.videoid.createdAt))} ago
                </p>
                <p className="text-xs text-gray-500 mt-1 capitalize">
                  Downloaded {formatDistanceToNow(new Date(item.downloadedon))}{" "}
                  ago
                  {item.plan && ` • ${item.plan} plan`}
                </p>
              </div>

              <Button variant="ghost" size="sm" className="self-center" asChild>
                <Link href={`/watch/${item.videoid._id}`}>Watch again</Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}