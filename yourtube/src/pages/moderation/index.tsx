import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import { Check, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

interface Viewer {
  _id?: string;
  isAdmin?: boolean;
}

interface ReportEntry {
  reason: string;
  createdAt?: string;
}

interface ReportedComment {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  commentedon?: string;
  reportCount: number;
  status: "visible" | "flagged" | "removed";
  reports?: ReportEntry[];
  reviewedAt?: string | null;
}

const reasonLabel = (reason: string) => {
  const labels: Record<string, string> = {
    abuse: "Abuse",
    spam: "Spam",
    harassment: "Harassment",
    other: "Other",
  };
  return labels[reason] || "Other";
};

const relativeTime = (value?: string) => {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return formatDistanceToNow(date, { addSuffix: true });
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }
  return fallback;
};

const ModerationPage = () => {
  const { user } = useUser() as { user: Viewer | null };
  const [items, setItems] = useState<ReportedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      const res = await axiosInstance.get("/comment/reported/list");
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not load the moderation queue."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadQueue();
  }, [user?.isAdmin, loadQueue]);

  const review = async (id: string, action: "approve" | "remove") => {
    setBusyId(id);
    try {
      await axiosInstance.patch(`/comment/review/${id}`, { action });
      toast.success(action === "approve" ? "Comment approved." : "Comment removed.");
      await loadQueue();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not review this comment."));
    } finally {
      setBusyId(null);
    }
  };

  if (!user) {
    return (
      <main className="flex-1 p-6">
        <div className="max-w-3xl space-y-2">
          <h1 className="text-2xl font-bold">Comment moderation</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with an admin account to review flagged comments.
          </p>
        </div>
      </main>
    );
  }

  if (!user.isAdmin) {
    return (
      <main className="flex-1 p-6">
        <div className="max-w-3xl space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldAlert className="h-6 w-6" />
            Comment moderation
          </h1>
          <p className="text-sm text-muted-foreground">
            You do not have access to the moderation queue.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6">
      <div className="max-w-4xl space-y-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldAlert className="h-6 w-6" />
            Comment moderation
          </h1>
          <p className="text-sm text-muted-foreground">
            Comments flagged by reports. Approving clears the reports; removing
            hides the comment from the video. Nothing is deleted automatically.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading review queue...
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No flagged comments right now.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <article key={item._id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.usercommented}</p>
                    <p className="text-xs text-muted-foreground">
                      {relativeTime(item.commentedon)} · {item.reportCount} report
                      {item.reportCount === 1 ? "" : "s"}
                      {item.reviewedAt ? ` · reviewed ${relativeTime(item.reviewedAt)}` : ""}
                    </p>
                  </div>
                  <span
                    className={
                      item.status === "removed"
                        ? "rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-400"
                        : "rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
                    }
                  >
                    {item.status === "removed" ? "Removed" : "Flagged"}
                  </span>
                </div>

                <p className="whitespace-pre-wrap break-words text-sm">
                  {item.commentbody}
                </p>

                <div className="flex flex-wrap gap-1">
                  {(item.reports || []).map((report, index) => (
                    <span
                      key={`${report.reason}-${index}`}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {reasonLabel(report.reason)}
                    </span>
                  ))}
                </div>

                {item.status !== "removed" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => review(item._id, "approve")}
                      disabled={busyId === item._id}
                    >
                      {busyId === item._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => review(item._id, "remove")}
                      disabled={busyId === item._id}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Removed from public comments.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default ModerationPage;
