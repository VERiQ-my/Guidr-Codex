"use client";

import { logger } from "@/lib/logger";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "./UserContext";
import { t, type Locale } from "@/lib/i18n";

type ThemePref = "light" | "dark" | "system";

interface PrefsContextType {
  /** The user's stored theme preference (may be "system"). */
  theme: ThemePref;
  locale: Locale;
  /**
   * The user's preferred default scan channel, or null until prefs have
   * loaded. ScanForm uses this to pre-select a channel on first render.
   */
  defaultScanChannel: string | null;
  /** Translate a key using the current locale */
  tr: (key: string, params?: Record<string, string>) => string;
}

const PrefsContext = createContext<PrefsContextType>({
  theme: "light",
  locale: "en",
  defaultScanChannel: null,
  tr: (key) => key,
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [theme, setTheme] = useState<ThemePref>("light");
  const [locale, setLocale] = useState<Locale>("en");
  const [defaultScanChannel, setDefaultScanChannel] = useState<string | null>(null);

  // Listen to user preferences from Firestore
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.theme === "dark" || data.theme === "light" || data.theme === "system") {
            setTheme(data.theme);
          }
          if (data.language === "en" || data.language === "ms" || data.language === "zh") {
            setLocale(data.language as Locale);
          }
          // Fall back to WhatsApp (the scan form's historical default) when the
          // user hasn't set a preference, so ScanForm always gets a concrete value.
          setDefaultScanChannel(
            typeof data.defaultScanChannel === "string" ? data.defaultScanChannel : "WhatsApp"
          );
        }
      },
      // Sign-in races can produce a momentary permission-denied while the
      // auth token propagates to Firestore servers; the SDK auto-retries
      // and the next snapshot succeeds. Swallow that specific case so it
      // doesn't pollute the console, but surface anything else.
      (err) => {
        if (err.code !== "permission-denied") {
          logger.error("[Guidr Prefs] subscription error:", err);
        }
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Apply the `dark` class to <html> whenever the theme preference changes.
  // For "system", follow the OS setting live via prefers-color-scheme.
  useEffect(() => {
    const html = document.documentElement;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && !!mq?.matches);
      html.classList.toggle("dark", isDark);
    };
    apply();
    if (theme === "system" && mq) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  function tr(key: string, params?: Record<string, string>): string {
    return t(locale, key, params);
  }

  return (
    <PrefsContext.Provider value={{ theme, locale, defaultScanChannel, tr }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs() {
  return useContext(PrefsContext);
}
