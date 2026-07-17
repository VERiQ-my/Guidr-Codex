"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onForegroundMessage } from "@/lib/messaging";

/**
 * Shows web pushes that arrive while the app tab is focused.
 *
 * FCM only hands foreground messages to the page (onMessage) — the service
 * worker's onBackgroundMessage never fires for a focused tab, and our pushes
 * are data-only (no auto-display), so without this subscriber a broadcast or
 * Guardian Alert received mid-session was silently dropped.
 *
 * Renders its own severity-styled cards instead of the shared toast: a
 * Guardian Alert mid-session is the loudest moment in the product and must
 * not look like "settings saved". Styling mirrors the service worker's
 * per-type presets (firebase-messaging-sw.js) so a push feels the same
 * whether it lands in the OS shade or in the app.
 */

interface PushCard {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string;
}

type IconName = "alert" | "search" | "shield" | "megaphone" | "info";

interface CardStyle {
  accent: string; // left border colour
  iconBg: string;
  stroke: string;
  icon: IconName;
  cta: string;
  /** Sticky cards stay until dismissed (mirrors requireInteraction in the SW). */
  sticky?: boolean;
}

const CARD_STYLES: Record<string, CardStyle> = {
  "guardian-alert": {
    accent: "border-guidr-red",
    iconBg: "bg-guidr-red-light",
    stroke: "#e05252",
    icon: "alert",
    cta: "See what happened",
    sticky: true,
  },
  "guardian-notice": {
    accent: "border-amber-500",
    iconBg: "bg-amber-100",
    stroke: "#d97706",
    icon: "search",
    cta: "Take a look",
  },
  "guardian-digest": {
    accent: "border-guidr-primary",
    iconBg: "bg-guidr-primary-light",
    stroke: "#0d7377",
    icon: "shield",
    cta: "See the week",
  },
  "guardian-linked": {
    accent: "border-green-500",
    iconBg: "bg-green-100",
    stroke: "#15803d",
    icon: "shield",
    cta: "See your guardians",
  },
  broadcast: {
    accent: "border-purple-500",
    iconBg: "bg-purple-100",
    stroke: "#7c3aed",
    icon: "megaphone",
    cta: "Read more",
  },
  daily: {
    accent: "border-guidr-primary",
    iconBg: "bg-guidr-primary-light",
    stroke: "#0d7377",
    icon: "shield",
    cta: "Take a look",
  },
  default: {
    accent: "border-guidr-primary",
    iconBg: "bg-guidr-primary-light",
    stroke: "#0d7377",
    icon: "info",
    cta: "Open",
  },
};

const CARD_TTL_MS = 8000;

function CardIcon({ name, stroke }: { name: IconName; stroke: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "alert":
      return (
        <svg {...common}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
      );
    case "megaphone":
      return (
        <svg {...common}>
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
}

export default function ForegroundPush() {
  const router = useRouter();
  const [cards, setCards] = useState<PushCard[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    onForegroundMessage((payload) => {
      const data = payload.data || {};
      const title = payload.notification?.title || data.title || "";
      const body = payload.notification?.body || data.body || "";
      if (!title && !body) return;

      const type = data.type && CARD_STYLES[data.type] ? data.type : "default";
      const id = nextId.current++;
      setCards((prev) => [...prev, { id, type, title, body, url: data.url || "/" }]);

      const style = CARD_STYLES[type];
      if (style.sticky) {
        // Same urgency cue the OS notification gets from its vibrate preset.
        navigator.vibrate?.([200, 100, 200]);
      } else {
        timers.current.set(
          id,
          setTimeout(() => remove(id), CARD_TTL_MS)
        );
      }
    }).then((u) => {
      if (cancelled) u();
      else unsub = u;
    });

    const pending = timers.current;
    return () => {
      cancelled = true;
      unsub?.();
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, [remove]);

  if (cards.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[210] flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ paddingTop: "calc(5rem + env(safe-area-inset-top, 0px))" }}
    >
      {cards.map((card) => {
        const style = CARD_STYLES[card.type];
        const urgent = !!style.sticky;
        return (
          <div
            key={card.id}
            role={urgent ? "alert" : "status"}
            aria-live={urgent ? "assertive" : "polite"}
            className={`pointer-events-auto w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 border-l-4 ${style.accent} overflow-hidden guidr-animate-in`}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${style.iconBg}`}>
                <CardIcon name={style.icon} stroke={style.stroke} />
              </div>
              <div className="flex-1 min-w-0">
                {card.title && <p className="text-sm font-bold text-guidr-text">{card.title}</p>}
                {card.body && <p className="text-xs text-guidr-muted leading-relaxed mt-0.5">{card.body}</p>}
                <button
                  onClick={() => {
                    remove(card.id);
                    router.push(card.url);
                  }}
                  className="mt-2 text-xs font-semibold text-guidr-primary hover:underline"
                >
                  {style.cta}
                </button>
              </div>
              <button
                onClick={() => remove(card.id)}
                aria-label="Dismiss notification"
                className="shrink-0 -mr-1 -mt-1 w-7 h-7 flex items-center justify-center rounded-full text-guidr-muted hover:bg-gray-100 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
