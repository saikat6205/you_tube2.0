"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Lock } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { Button } from "./ui/button";

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    filepath: string;
    ispremium?: boolean;
  };
  remainingSeconds?: number | null;
  adFree?: boolean;
}

const HEARTBEAT_INTERVAL = 30000;

export default function VideoPlayer({
  video,
  remainingSeconds,
  adFree,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(
    remainingSeconds ?? null
  );
  const lastReportedRef = useRef(0);

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    setLoggedIn(!!token);
    setLimitReached(false);
    setRemaining(remainingSeconds ?? null);
  }, [remainingSeconds, video?._id]);

  useEffect(() => {
    if (!video?._id) return;
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      setSrc(
        `${process.env.BACKEND_URL}/video/stream/${video._id}?token=${encodeURIComponent(
          token
        )}`
      );
    } else if (!video.ispremium) {
      setSrc(`${process.env.BACKEND_URL}/${video.filepath}`);
    } else {
      setSrc(null);
    }
  }, [video?._id, video?.filepath, video?.ispremium]);

  useEffect(() => {
    if (!loggedIn) return;
    const sendHeartbeat = async () => {
      const videoEl = videoRef.current;
      if (!videoEl || videoEl.paused || videoEl.currentTime <= 0) {
        if (videoEl) lastReportedRef.current = videoEl.currentTime;
        return;
      }
      const now = videoEl.currentTime;
      const elapsed = now - lastReportedRef.current;
      lastReportedRef.current = now;
      if (elapsed <= 0) return;
      try {
        const res = await axiosInstance.post("/video/watchtime", {
          seconds: Math.round(elapsed),
        });
        const rem = res.data.remainingSeconds;
        setRemaining(rem);
        if (rem !== Infinity && rem <= 0) {
          videoEl.pause();
          setLimitReached(true);
          lastReportedRef.current = 0;
        }
      } catch (error) {
        console.error(error);
      }
    };
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
  }, [loggedIn]);

  const handlePlay = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (remaining !== null && remaining !== Infinity && remaining <= 0) {
      videoEl.pause();
      setLimitReached(true);
      return;
    }
    lastReportedRef.current = videoEl.currentTime || 0;
  };

  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
      {src ? (
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          onPlay={handlePlay}
          onPause={() => {
            if (videoRef.current)
              lastReportedRef.current = videoRef.current.currentTime;
          }}
          poster={`/placeholder.svg?height=480&width=854`}
        >
          <source src={src} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-white gap-3 bg-gray-900">
          <div className="flex items-center gap-2 bg-amber-500 text-black px-3 py-1 rounded-full text-xs font-semibold uppercase">
            <Lock className="w-3.5 h-3.5" />
            Premium
          </div>
          <p className="text-lg font-medium">Premium video</p>
          <p className="text-sm text-gray-400">Sign in with a paid plan to watch</p>
          <Link href="/upgrade">
            <Button className="bg-red-600 hover:bg-red-700 text-white">
              <Crown className="w-4 h-4 mr-2" />
              Upgrade to watch
            </Button>
          </Link>
        </div>
      )}

      {limitReached && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white gap-3">
          <p className="text-lg font-medium">Daily watch limit reached</p>
          <p className="text-sm text-gray-400">
            You have used all your watch time for today.
          </p>
          <Link href="/upgrade">
            <Button className="bg-red-600 hover:bg-red-700 text-white">
              <Crown className="w-4 h-4 mr-2" />
              Upgrade for more watch time
            </Button>
          </Link>
          <p className="text-xs text-gray-500">
            Your watch time resets tomorrow.
          </p>
        </div>
      )}

      {loggedIn && adFree !== undefined && !adFree && (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-amber-500 text-black text-xs font-medium px-3 py-1 rounded-full z-10">
          <Lock className="w-3 h-3" />
          Free plan shows ads — upgrade for ad-free viewing
        </div>
      )}
    </div>
  );
}