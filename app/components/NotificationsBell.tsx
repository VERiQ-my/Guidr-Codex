"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "@/app/context/UserContext";
import { subscribeEntitlements } from "@/lib/firestore";
import { isPro } from "@/lib/plan";

type Placement = "header" | "sidebar";

interface NotifItem {
  id: string;
  type: "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE" | "REPORTED" | "ANNOUNCEMENT";
  title: string;
  body: string;
  time: number; // epoch ms
  href: string;
}

/** Admin broadcast, written by the Guidr Admin dashboard to announcements/. */
interface Announcement {
  id: string;
  title: string;
  body: string;
  time: number; // epoch ms
  segment: "all" | "pro" | "free";
  active: boolean;
}

const SEEN_KEY = "guidr_notif_seen_at";

/* Relative time, e.g. "3h ago" */
function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

/* Per-verdict presentation */
function describe(verdict: string, scamType: string, reported: boolean) {
  if (reported) {
    return {
      type: "REPORTED" as const,
      title: "Report submitted to NSRC",
      body: `Your ${scamType || "scam"} case was filed with the authorities.`,
    };
  }
  switch (verdict) {
    case "SCAM":
      return { type: "SCAM" as const, title: "Scam detected", body: `We flagged a ${scamType || "scam"} in your message.` };
    case "SUSPICIOUS":
      return { type: "SUSPICIOUS" as const, title: "Suspicious message", body: `${scamType || "Potential threat"}. Review before you act.` };
    default:
      return { type: "LIKELY_SAFE" as const, title: "Message looks safe", body: "No strong scam signals found in your scan." };
  }
}

function TypeIcon({ type }: { type: NotifItem["type"] }) {
  const map = {
    SCAM: { bg: "bg-guidr-red-light", stroke: "#e05252" },
    SUSPICIOUS: { bg: "bg-amber-100", stroke: "#d97706" },
    LIKELY_SAFE: { bg: "bg-guidr-green-light", stroke: "#22c55e" },
    REPORTED: { bg: "bg-guidr-blue-light", stroke: "#3b82f6" },
    ANNOUNCEMENT: { bg: "bg-purple-100", stroke: "#7c3aed" },
  }[type];

  return (
    <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${map.bg}`}>
      {type === "ANNOUNCEMENT" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={map.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      ) : type === "REPORTED" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={map.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ) : type === "LIKELY_SAFE" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={map.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={map.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )}
    </div>
  );
}

export default function NotificationsBell({ placement }: { placement: Placement }) {
  const { user } = useUser();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pro, setPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* Restore last-seen marker */
  useEffect(() => {
    const stored = Number(localStorage.getItem(SEEN_KEY) || 0);
    setSeenAt(stored);
  }, []);

  /* Subscribe to the user's recent cases → notifications */
  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, "cases"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(15)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: NotifItem[] = snap.docs.map((d) => {
          const data = d.data();
          const ms = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
          const info = describe(data.verdict, data.scamType, data.reportedToNSRC === true);
          return { id: d.id, ...info, time: ms, href: "/cases" };
        });
        setItems(next);
        setLoading(false);
      },
      (err) => {
        logger.error("Error loading notifications:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  /* Pro flag — announcements can target the "pro" or "free" segment */
  useEffect(() => {
    if (!user?.uid) {
      setPro(false);
      return;
    }
    const unsub = subscribeEntitlements(user.uid, (ent) => setPro(isPro(ent)));
    return () => unsub();
  }, [user?.uid]);

  /* Subscribe to admin broadcasts (announcements collection).
     Ordered by createdAt only (ISO strings sort correctly); the `active`
     and segment filters happen client-side so no composite index is needed. */
  useEffect(() => {
    if (!user?.uid) {
      setAnnouncements([]);
      return;
    }
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(10));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Announcement[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: `ann-${d.id}`,
            title: data.title || "Guidr announcement",
            body: data.body || "",
            time: Date.parse(data.createdAt) || Date.now(),
            segment: data.segment === "pro" || data.segment === "free" ? data.segment : "all",
            active: data.active !== false,
          };
        });
        setAnnouncements(next);
      },
      (err) => {
        logger.error("Error loading announcements:", err);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  /* Close on outside click / Escape */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Merge case notifications with segment-matching announcements */
  const visible: NotifItem[] = [
    ...items,
    ...announcements
      .filter((a) => a.active && (a.segment === "all" || (a.segment === "pro") === pro))
      .map((a) => ({
        id: a.id,
        type: "ANNOUNCEMENT" as const,
        title: a.title,
        body: a.body,
        time: a.time,
        href: "/",
      })),
  ]
    .sort((a, b) => b.time - a.time)
    .slice(0, 15);

  const unread = visible.filter((n) => n.time > seenAt).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // Opening marks everything as read
      const now = Date.now();
      setSeenAt(now);
      localStorage.setItem(SEEN_KEY, String(now));
    }
  };

  const panelPos =
    placement === "header"
      ? "right-0 top-full mt-2"
      : "left-full bottom-0 ml-3";

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      {placement === "header" ? (
        <button
          onClick={toggle}
          aria-label="Notifications"
          className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-guidr-red rounded-full ring-2 ring-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      ) : (
        <button
          onClick={toggle}
          aria-label="Notifications"
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${open ? "bg-guidr-primary-light text-guidr-primary" : "text-guidr-muted hover:bg-gray-50 hover:text-guidr-text"
            }`}
        >
          <span className="relative">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-guidr-red ring-2 ring-white" />
            )}
          </span>
          Notifications
          {unread > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-guidr-red rounded-full">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className={`absolute ${panelPos} z-50 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden guidr-animate-in`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-guidr-text">Notifications</p>
            <span className="text-xs text-guidr-muted">{visible.length} recent</span>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto no-scrollbar">
            {loading ? (
              <div className="py-10 flex justify-center">
                <div className="w-6 h-6 border-2 border-guidr-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : visible.length === 0 ? (
              <div className="py-10 px-6 text-center">
                <p className="text-sm font-medium text-guidr-text">You're all caught up</p>
                <p className="text-xs text-guidr-muted mt-1">Scan a message and updates will show up here.</p>
              </div>
            ) : (
              visible.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                >
                  <TypeIcon type={n.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-guidr-text">{n.title}</p>
                    <p className="text-xs text-guidr-muted leading-relaxed line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-guidr-muted mt-1">{timeAgo(n.time)}</p>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Footer */}
          {visible.length > 0 && (
            <Link
              href="/cases"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-center text-sm font-semibold text-guidr-primary hover:bg-gray-50 border-t border-gray-100 transition-colors"
            >
              View all cases
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
