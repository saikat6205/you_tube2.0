"use client";

import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (value: Theme) => Promise<void>;
  toggleTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "yourtube.theme";

const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark";

/**
 * Only used to avoid a flash of the wrong theme before hydration and before the
 * logged-in user is known. The authoritative value is the one stored on the
 * account, which the server derives from the IST login time.
 */
export const resolveIstTheme = (): Theme => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hourCycle: "h23",
      hour: "2-digit",
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
    return hour >= 10 && hour < 12 ? "light" : "dark";
  } catch {
    return "dark";
  }
};

export const readStoredTheme = (): Theme | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
};

const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUser();
  const [theme, setThemeState] = useState<Theme>("dark");

  // Server value wins for a signed-in user; localStorage then keeps the same
  // choice on the next load without waiting for the network.
  useEffect(() => {
    if (!user) {
      const guestTheme = readStoredTheme() ?? resolveIstTheme();
      setThemeState(guestTheme);
      applyTheme(guestTheme);
      return;
    }
    const saved = (user as { theme?: string }).theme;
    const next: Theme = isTheme(saved) ? saved : resolveIstTheme();
    setThemeState(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable - the theme still applies for this page view
    }
  }, [user]);

  const setTheme = useCallback(
    async (value: Theme) => {
      // Optimistic: switch immediately, revert only if the server refuses.
      const previous = theme;
      setThemeState(value);
      applyTheme(value);
      try {
        window.localStorage.setItem(STORAGE_KEY, value);
      } catch {
        // ignore storage failures
      }

      if (!user) return;

      try {
        await axiosInstance.patch("/user/theme", { theme: value });
      } catch (error) {
        console.error("Failed to save theme:", error);
        setThemeState(previous);
        applyTheme(previous);
        try {
          window.localStorage.setItem(STORAGE_KEY, previous);
        } catch {
          // ignore storage failures
        }
      }
    },
    [theme, user]
  );

  const toggleTheme = useCallback(async () => {
    await setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};