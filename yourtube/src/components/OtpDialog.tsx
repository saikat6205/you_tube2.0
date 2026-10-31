"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, ShieldCheck } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

const RESEND_COOLDOWN_SECONDS = 60;

type OtpDialogProps = {
  open: boolean;
  destination?: string;
  city?: string;
  state?: string;
  error?: string | null;
  notice?: string | null;
  submitting?: boolean;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onCancel: () => void;
};

export default function OtpDialog({
  open,
  destination,
  city,
  state,
  error,
  notice,
  submitting,
  onSubmit,
  onResend,
  onCancel,
}: OtpDialogProps) {
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      const timer = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open || cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [open, cooldown]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.replace(/\D/g, "");
    if (trimmed.length !== 6 || submitting) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-red-600" />
            Verify it&apos;s you
          </DialogTitle>
          <DialogDescription>
            We sent a 6-digit code to{" "}
            <span className="font-medium text-foreground">{destination}</span>.
            Enter it below to finish signing in.
          </DialogDescription>
        </DialogHeader>

        {(city || state) && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              New sign-in detected from{" "}
              <span className="font-medium text-foreground">
                {[city, state].filter(Boolean).join(", ")}
              </span>
              .
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            ref={inputRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-[0.5em]"
            aria-label="Verification code"
          />

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="text-sm text-muted-foreground">{notice}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={code.replace(/\D/g, "").length !== 6 || submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify
            </Button>
          </DialogFooter>
        </form>

        <div className="flex flex-col items-center gap-2">
          <p className="m-0 text-center text-xs text-muted-foreground">
            The code expires in 5 minutes and can be used once.
          </p>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={submitting || cooldown > 0}
            onClick={onResend}
            className="h-auto p-0 text-xs"
          >
            {cooldown > 0
              ? `Resend code in ${cooldown}s`
              : "Resend code"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}