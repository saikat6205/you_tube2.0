"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "yourtube.devGeoIp";
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Developer-only helper for testing "new city / new state" OTP on localhost.
 * Renders only when NEXT_PUBLIC_DEV_GEO=true, so it never appears in production.
 * The backend still only honours the header when the request comes from loopback.
 */
export default function DevGeoSwitcher() {
  const enabled =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_GEO === "true";
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    setCurrent(window.localStorage.getItem(STORAGE_KEY) || "");
  }, [enabled]);

  if (!enabled) return null;

  const apply = () => {
    const trimmed = value.trim();
    if (trimmed && !IPV4.test(trimmed)) {
      setError("Enter a valid IPv4 such as 8.8.8.8");
      return;
    }
    setError("");
    if (trimmed) {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setCurrent(trimmed);
  };

  return (
    <div className="fixed bottom-4 left-4 z-[90] text-xs">
      {open ? (
        <div className="w-64 rounded-lg border bg-background p-3 shadow-lg">
          <p className="mb-2 flex items-center gap-1 font-semibold">
            <MapPin className="h-3.5 w-3.5 text-red-600" />
            Dev location (login only)
          </p>
          <p className="mb-2 text-muted-foreground">
            Current: {current || "real (Local on localhost)"}
          </p>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 8.8.8.8"
            className="mb-2 h-8"
          />
          {error && <p className="mb-2 text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={apply} className="h-7">
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                setValue("");
                window.localStorage.removeItem(STORAGE_KEY);
                setCurrent("");
                setError("");
              }}
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <MapPin className="mr-1 h-3.5 w-3.5" />
          Dev geo
        </Button>
      )}
    </div>
  );
}
