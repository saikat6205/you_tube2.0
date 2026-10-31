import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import {
  Flag,
  Languages,
  Loader2,
  MapPin,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { cn } from "@/lib/utils";
import { LANGUAGES, languageLabel } from "@/lib/languages";

interface Viewer {
  _id?: string;
  name?: string;
  channelname?: string;
  image?: string;
  preferredLanguage?: string;
  showLocation?: boolean;
  isAdmin?: boolean;
}

type Reaction = "like" | "dislike" | null;

interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  commentedon?: string;
  editedAt?: string | null;
  detectedLanguage?: string;
  detectedLanguageLabel?: string;
  locationLabel?: string;
  likeCount: number;
  dislikeCount: number;
  myReaction: Reaction;
  reportCount: number;
  reportedByMe: boolean;
  status: "visible" | "flagged" | "removed";
  canEdit?: boolean;
  canDelete?: boolean;
}

interface TranslationState {
  text: string;
  target: string;
  sourceLanguage: string;
  detectedLanguage?: string;
  provider?: string;
  shown: boolean;
  loading: boolean;
}

const REPORT_REASONS = [
  { value: "abuse", label: "Abusive content" },
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "other", label: "Something else" },
];

const MAX_COMMENT_LENGTH = 1000;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }
  return fallback;
};

const formatCommentTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
};

const Comments = ({ videoId }: { videoId: string }) => {
  const { user, handlegooglesignin } = useUser() as {
    user: Viewer | null;
    handlegooglesignin: () => Promise<void>;
  };

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [showLocation, setShowLocation] = useState(false);
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});
  const [reactionPending, setReactionPending] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<Comment | null>(null);
  const [reportReason, setReportReason] = useState("abuse");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const viewerId = user?._id;

  const loadComments = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`/comment/${videoId}`);
      setComments(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not load comments."));
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    setLoading(true);
    loadComments();
  }, [loadComments, viewerId]);

  useEffect(() => {
    if (!user) return;
    setPreferredLanguage(user.preferredLanguage || "en");
    setShowLocation(Boolean(user.showLocation));
  }, [user]);

  const replaceComment = (updated: Comment) => {
    setComments((prev) =>
      prev.map((comment) => (comment._id === updated._id ? updated : comment))
    );
  };

  const handleLanguageChange = (value: string) => {
    setPreferredLanguage(value);
    setTranslations({});
    if (!user) return;
    axiosInstance
      .patch("/user/preferences", { preferredLanguage: value })
      .catch(() =>
        toast.error("Could not save your language preference. It still applies this session.")
      );
  };

  const handleShowLocationChange = async (checked: boolean) => {
    if (!user) return;
    const previous = showLocation;
    setShowLocation(checked);
    try {
      await axiosInstance.patch("/user/preferences", { showLocation: checked });
      toast.success(
        checked
          ? "New comments will show your state and country."
          : "Location removed from your comments."
      );
    } catch (error) {
      setShowLocation(previous);
      toast.error(getErrorMessage(error, "Could not update your location preference."));
    }
  };

  const handleSubmitComment = async () => {
    if (!user) return;
    const body = newComment.trim();
    if (!body) return;
    if (body.length > MAX_COMMENT_LENGTH) {
      toast.error("Comments must be 1,000 characters or fewer.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        commentbody: body,
      });
      if (res.data?.result) {
        setComments((prev) => [res.data.result, ...prev]);
      }
      setNewComment("");
      toast.success("Comment posted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not post your comment."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (comment: Comment) => {
    setEditingCommentId(comment._id);
    setEditText(comment.commentbody);
  };

  const handleUpdateComment = async () => {
    if (!editingCommentId) return;
    const body = editText.trim();
    if (!body) return;

    try {
      const res = await axiosInstance.post(`/comment/editcomment/${editingCommentId}`, {
        commentbody: body,
      });
      replaceComment(res.data);
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[editingCommentId];
        return next;
      });
      setEditingCommentId(null);
      setEditText("");
      toast.success("Comment updated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update the comment."));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;
    try {
      await axiosInstance.delete(`/comment/deletecomment/${id}`);
      setComments((prev) => prev.filter((comment) => comment._id !== id));
      toast.success("Comment deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete the comment."));
    }
  };

  const handleReaction = async (comment: Comment, kind: "like" | "dislike") => {
    if (!user) {
      toast.error("Sign in to like or dislike comments.");
      return;
    }
    if (reactionPending === comment._id) return;

    setReactionPending(comment._id);
    try {
      const res = await axiosInstance.post(`/comment/${comment._id}/${kind}`);
      replaceComment(res.data.result);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save your reaction."));
    } finally {
      setReactionPending(null);
    }
  };

  const handleTranslate = async (comment: Comment) => {
    const existing = translations[comment._id];
    if (existing && existing.target === preferredLanguage && existing.text) {
      setTranslations((prev) => ({
        ...prev,
        [comment._id]: { ...existing, shown: !existing.shown },
      }));
      return;
    }

    setTranslations((prev) => ({
      ...prev,
      [comment._id]: {
        text: "",
        target: preferredLanguage,
        sourceLanguage: comment.detectedLanguage || "und",
        detectedLanguage: comment.detectedLanguage,
        shown: false,
        loading: true,
      },
    }));

    try {
      const res = await axiosInstance.post("/comment/translate", {
        commentId: comment._id,
        target: preferredLanguage,
      });
      const data = res.data;

      if (String(data?.text || "").trim() === comment.commentbody.trim()) {
        toast.info(`This comment is already in ${languageLabel(preferredLanguage)}.`);
        setTranslations((prev) => {
          const next = { ...prev };
          delete next[comment._id];
          return next;
        });
        return;
      }

      setTranslations((prev) => ({
        ...prev,
        [comment._id]: {
          text: data.text,
          target: preferredLanguage,
          sourceLanguage: data.sourceLanguage || comment.detectedLanguage || "und",
          detectedLanguage: data.detectedLanguage || data.sourceLanguage,
          provider: data.provider,
          shown: true,
          loading: false,
        },
      }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Translation failed. Please try again."));
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[comment._id];
        return next;
      });
    }
  };

  const openReportDialog = (comment: Comment) => {
    if (!user) {
      toast.error("Sign in to report a comment.");
      return;
    }
    setReportReason("abuse");
    setReportTarget(comment);
  };

  const handleReport = async () => {
    if (!reportTarget) return;
    setReportSubmitting(true);
    try {
      const res = await axiosInstance.post(`/comment/${reportTarget._id}/report`, {
        reason: reportReason,
      });
      if (res.data?.result) replaceComment(res.data.result);
      setReportTarget(null);
      toast.success(
        res.data?.alreadyReported
          ? "You already reported this comment."
          : "Thanks. This comment was flagged for review."
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not report this comment."));
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading comments...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{comments.length} Comments</h2>
        <label className="flex items-center gap-2 text-sm">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Translate to</span>
          <select
            value={preferredLanguage}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              handleLanguageChange(event.target.value)
            }
            className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Preferred comment language"
          >
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {user ? (
        <div className="flex gap-4">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.image || ""} />
            <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNewComment(event.target.value)
              }
              maxLength={MAX_COMMENT_LENGTH}
              className="min-h-[80px] resize-none rounded-none border-0 border-b-2 focus-visible:ring-0"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showLocation}
                  onChange={(event) => handleShowLocationChange(event.target.checked)}
                  className="h-4 w-4 accent-red-600"
                />
                <MapPin className="h-3.5 w-3.5" />
                Attach my state and country to new comments
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setNewComment("")}
                  disabled={!newComment.trim() || isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Comment
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {newComment.length}/{MAX_COMMENT_LENGTH}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={handlegooglesignin}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </button>{" "}
          to join the conversation.
        </div>
      )}

      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          comments.map((comment) => {
            const isOwn = Boolean(viewerId) && viewerId === comment.userid;
            const translation = translations[comment._id];
            const time = formatCommentTime(comment.commentedon);
            const absoluteTime = comment.commentedon
              ? new Date(comment.commentedon).toLocaleString()
              : undefined;

            return (
              <div key={comment._id} className="flex gap-4">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {comment.usercommented?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{comment.usercommented}</span>
                    {time && (
                      <span className="text-xs text-muted-foreground" title={absoluteTime}>
                        {time}
                      </span>
                    )}
                    {comment.editedAt && (
                      <span className="text-xs text-muted-foreground">(edited)</span>
                    )}
                    {comment.detectedLanguage &&
                      !["en", "und"].includes(comment.detectedLanguage) && (
                        <span className="text-xs text-muted-foreground">
                          {comment.detectedLanguageLabel ||
                            languageLabel(comment.detectedLanguage)}
                        </span>
                      )}
                    {comment.status === "flagged" && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                        <ShieldAlert className="h-3 w-3" />
                        Flagged for review
                      </span>
                    )}
                  </div>

                  {comment.locationLabel && (
                    <span className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {comment.locationLabel}
                    </span>
                  )}

                  {editingCommentId === comment._id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        maxLength={MAX_COMMENT_LENGTH}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={handleUpdateComment}
                          disabled={!editText.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditText("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {comment.commentbody}
                      </p>

                      {translation?.shown && (
                        <div className="mt-2 rounded-md border border-dashed p-2">
                          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Languages className="h-3 w-3" />
                            Translated from{" "}
                            {languageLabel(
                              translation.detectedLanguage || translation.sourceLanguage
                            )}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {translation.text}
                          </p>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleReaction(comment, "like")}
                          disabled={reactionPending === comment._id}
                          aria-pressed={comment.myReaction === "like"}
                          aria-label="Like comment"
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent disabled:opacity-50",
                            comment.myReaction === "like" && "font-medium text-foreground"
                          )}
                        >
                          <ThumbsUp
                            className={cn(
                              "h-4 w-4",
                              comment.myReaction === "like" && "fill-current"
                            )}
                          />
                          {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReaction(comment, "dislike")}
                          disabled={reactionPending === comment._id}
                          aria-pressed={comment.myReaction === "dislike"}
                          aria-label="Dislike comment"
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent disabled:opacity-50",
                            comment.myReaction === "dislike" && "font-medium text-foreground"
                          )}
                        >
                          <ThumbsDown
                            className={cn(
                              "h-4 w-4",
                              comment.myReaction === "dislike" && "fill-current"
                            )}
                          />
                          {comment.dislikeCount > 0 && <span>{comment.dislikeCount}</span>}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTranslate(comment)}
                          disabled={translation?.loading}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent disabled:opacity-50"
                        >
                          {translation?.loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Languages className="h-4 w-4" />
                          )}
                          {translation?.shown ? "Show original" : "Translate"}
                        </button>

                        {user && !isOwn && (
                          <button
                            type="button"
                            onClick={() => openReportDialog(comment)}
                            disabled={comment.reportedByMe}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent disabled:opacity-50"
                          >
                            <Flag className="h-4 w-4" />
                            {comment.reportedByMe ? "Reported" : "Report"}
                          </button>
                        )}

                        {isOwn && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEdit(comment)}
                              className="rounded px-1.5 py-1 hover:bg-accent"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(comment._id)}
                              className="rounded px-1.5 py-1 hover:bg-accent"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog
        open={Boolean(reportTarget)}
        onOpenChange={(open) => {
          if (!open) setReportTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report comment</DialogTitle>
            <DialogDescription>
              Reports flag the comment for a human review. They never delete it
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {REPORT_REASONS.map((reason) => (
              <label
                key={reason.value}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={reason.value}
                  checked={reportReason === reason.value}
                  onChange={() => setReportReason(reason.value)}
                  className="h-4 w-4 accent-red-600"
                />
                {reason.label}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReport}
              disabled={reportSubmitting}
            >
              {reportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Comments;
