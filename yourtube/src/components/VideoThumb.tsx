import { Lock } from "lucide-react";

export default function VideoThumb({
  video,
  className,
}: {
  video: {
    _id: string;
    filepath?: string;
    videotitle?: string;
    ispremium?: boolean;
  };
  className?: string;
}) {
  if (video?.ispremium) {
    return (
      <div
        className={`relative bg-gradient-to-br from-gray-800 to-gray-900 flex flex-col items-center justify-center text-white ${className}`}
      >
        <div className="flex items-center gap-1.5 bg-amber-500 text-black px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase">
          <Lock className="w-3 h-3" />
          Premium
        </div>
        <p className="text-xs text-gray-400 mt-1 px-3 text-center line-clamp-1">
          {video?.videotitle}
        </p>
      </div>
    );
  }
  return (
    <video
      src={`${process.env.BACKEND_URL}/${video?.filepath}`}
      className={`object-cover ${className}`}
    />
  );
}