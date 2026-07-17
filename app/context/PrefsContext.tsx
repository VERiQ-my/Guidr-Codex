"use client";

import { logger } from "@/lib/logger";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "./UserContext";
import { t, type Locale } from "@/lib/i18n";

type ThemePref = "light" | "dark" | "system";

interface PrefsContextType {
  theme: ThemePref;
  locale: Locale;
  defaultScanChannel: string | null;
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
          setDefaultScanChannel(
            typeof data.defaultScanChannel === "string" ? data.defaultScanChannel : "WhatsApp"
          );
        }
      },
      (err) => {
        if (err.code !== "permission-denied") {
          logger.error("[Guidr Prefs] subscription error:", err);
        }
      }
    );
    return () => unsubscribe();
  }, [user]);

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
