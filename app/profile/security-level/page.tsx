"use client";

import { useState, useEffect, useMemo } from "react";
import BottomNav from "@/app/components/BottomNav";
import { useUser } from "@/app/context/UserContext";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { deriveCaseStatus } from "@/lib/firestore";
import { SECURITY_RANKS, getSecurityLevel } from "@/lib/security-level";

/* ── Inline icons (codebase convention — no icon font) ── */
function Icon({ type, size = 20, className }: { type: string; size?: number; className?: string }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (type) {
    case "back": return <svg {...p}><path d="M15 6l-6 6 6 6" /></svg>;
    case "check": return <svg {...p}><polyline points="20 6 9 17 4 12" /></svg>;
    case "lock": return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

/** Firestore Timestamp | ISO string | Date → Date | null. */
function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

/** "2 hours ago" / "Yesterday" / "3 days ago" / "12 Jun". */
function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type Tone = "teal" | "green" | "amber";
interface ActivityItem {
  key: string;
  label: string;
  date: Date;
  xp: number;
  tone: Tone;
}

const TONE: Record<Tone, { text: string; bg: string }> = {
  teal: { text: "text-guidr-primary", bg: "bg-guidr-primary-light/40" },
  green: { text: "text-green-700", bg: "bg-green-100" },
  amber: { text: "text-amber-700", bg: "bg-amber-100" },
};

export default function SecurityLevelPage() {
  const { user } = useUser();
  const router = useRouter();

  const [profile, setProfile] = useState({
    xp: 0,
    casesScanned: 0,
    scamsReported: 0,
    quizzesPassed: 0,
    isIdentityVerified: false,
    verifiedAt: null as string | null,
  });
  const [cases, setCases] = useState<
    { id: string; channel?: string; reported: boolean; createdAt: Date | null }[]
  >([]);
  const [showAllActivity, setShowAllActivity] = useState(false);

  // Animated hero values (count-up XP + progress bar fill on mount).
  const [animXp, setAnimXp] = useState(0);
  const [barFilled, setBarFilled] = useState(false);
  // Captured once so relative-time / "this week" math stays pure across renders.
  const [now] = useState(() => Date.now());

  // Live profile doc.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setProfile({
        xp: d.xp || 0,
        casesScanned: d.casesScanned || 0,
        scamsReported: d.scamsReported || 0,
        quizzesPassed: d.quizzesPassed || 0,
        isIdentityVerified: d.isIdentityVerified || false,
        verifiedAt: d.verifiedAt || null,
      });
    });
    return () => unsub();
  }, [user]);

  // Live cases — powers the "scanned this week" delta and the activity feed.
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "cases"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setCases(
        snap.docs.map((doc) => {
          const c = doc.data();
          return {
            id: doc.id,
            channel: c.channel,
            reported: deriveCaseStatus(c as Parameters<typeof deriveCaseStatus>[0]) === "reported",
            createdAt: toDate(c.createdAt),
          };
        })
      );
    });
    return () => unsub();
  }, [user]);

  const level = getSecurityLevel(profile.xp);

  // Count-up XP + fill the bar once we know the real total. State is only ever
  // set from async callbacks (timeout / interval), never synchronously here.
  useEffect(() => {
    const barT = setTimeout(() => setBarFilled(true), 250);
    const target = profile.xp;
    if (target <= 0) return () => clearTimeout(barT);
    const step = Math.max(target / 50, 1);
    let current = 0;
    const iv = setInterval(() => {
      current = Math.min(current + step, target);
      setAnimXp(Math.floor(current));
      if (current >= target) clearInterval(iv);
    }, 16);
    return () => {
      clearInterval(iv);
      clearTimeout(barT);
    };
  }, [profile.xp]);

  const scannedThisWeek = useMemo(() => {
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    return cases.filter((c) => c.createdAt && c.createdAt.getTime() >= weekAgo).length;
  }, [cases, now]);

  // Activity feed derived from real signals (no separate event log exists yet):
  // every scan, every report, and the identity verification.
  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const c of cases) {
      if (!c.createdAt) continue;
      const channel = c.channel ? c.channel.charAt(0).toUpperCase() + c.channel.slice(1) : "Message";
      items.push({ key: `scan-${c.id}`, label: `${channel} scanned`, date: c.createdAt, xp: 10, tone: "teal" });
      if (c.reported) {
        items.push({ key: `report-${c.id}`, label: "Scam reported to NSRC 997", date: c.createdAt, xp: 25, tone: "green" });
      }
    }
    const verified = toDate(profile.verifiedAt);
    if (profile.isIdentityVerified && verified) {
      items.push({ key: "verified", label: "Identity verified", date: verified, xp: 50, tone: "amber" });
    }
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [cases, profile.isIdentityVerified, profile.verifiedAt]);

  const visibleActivity = showAllActivity ? activity : activity.slice(0, 3);

  // Real XP economy (see awardXP / incrementStat call sites in the app).
  const earnXp = [
    { action: "Complete a scan", note: null, xp: "+10 XP", tone: "teal" as Tone },
    { action: "Report to NSRC 997", note: "Highest impact action", xp: "+25 XP", tone: "green" as Tone },
    { action: "Read a learn article", note: null, xp: "+50 XP", tone: "teal" as Tone },
    ...(profile.isIdentityVerified
      ? []
      : [{ action: "Verify your identity", note: null, xp: "+50 XP", tone: "teal" as Tone }]),
    { action: "Daily challenge", note: "New challenge every day", xp: "+100 XP", tone: "amber" as Tone },
  ];

  const statTiles = [
    {
      value: profile.casesScanned,
      label: "Scanned",
      sub: scannedThisWeek > 0 ? `↑ ${scannedThisWeek} this week` : "All time",
      subClass: "text-green-600",
      highlight: false,
    },
    {
      value: profile.scamsReported,
      label: "Reported",
      sub: "+25 XP each",
      subClass: "text-green-700",
      highlight: true,
    },
    {
      value: profile.quizzesPassed,
      label: "Quizzes",
      sub: "Stay sharp",
      subClass: "text-blue-600",
      highlight: false,
    },
  ];

  return (
    <div className="guidr-container">
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-5">
        <div className="flex flex-col gap-5 w-full lg:max-w-2xl lg:mx-auto">

          {/* ── Header with back button ── */}
          <div className="flex items-center gap-3 guidr-animate-in guidr-stagger-1">
            <button
              onClick={() => router.back()}
              aria-label="Back to profile"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all shrink-0 text-guidr-primary"
            >
              <Icon type="back" size={18} />
            </button>
            <h2 className="text-2xl font-bold text-guidr-text">Security Level</h2>
          </div>

          {/* ── HERO: current rank + XP progress ── */}
          <section className="guidr-animate-in guidr-stagger-2">
            <div
              className="relative overflow-hidden rounded-[20px] px-5 pt-6 pb-[22px] text-white"
              style={{ background: "linear-gradient(135deg,#14b8a6 0%,#0d7377 100%)" }}
            >
              <div className="absolute -right-11 -top-11 w-[180px] h-[180px] rounded-full bg-white/[0.07] pointer-events-none" />
              <div className="absolute -left-[30px] -bottom-[50px] w-40 h-40 rounded-full bg-white/[0.04] pointer-events-none" />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/65 mb-[5px]">
                      Level {level.levelNum}
                    </p>
                    <p className="text-[22px] font-bold leading-tight">{level.title}</p>
                  </div>
                  <span className="text-[32px] leading-none" aria-hidden="true">{level.icon}</span>
                </div>

                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-[13px] font-semibold text-white/90">{animXp} XP</span>
                  {level.nextLevel ? (
                    <span className="text-[11px] text-white/65">
                      {level.xpToNext} XP to {level.nextLevel.title}
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/65">Maximum rank 🏆</span>
                  )}
                </div>
                <div
                  className="h-2 bg-white/20 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.round(level.pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="XP progress to next rank"
                >
                  <div
                    className="h-full bg-white/90 rounded-full transition-[width] duration-1000 ease-out"
                    style={{ width: barFilled ? `${level.pct}%` : "0%" }}
                  />
                </div>
                <div className="flex justify-between mt-[5px]">
                  <span className="text-[10px] text-white/50">{level.title} · {level.minXp} XP</span>
                  {level.nextLevel && (
                    <span className="text-[10px] text-white/50">
                      {level.nextLevel.title} · {level.nextLevel.minXp} XP
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── STAT TILES ── */}
          <section className="guidr-animate-in guidr-stagger-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm grid grid-cols-3 divide-x divide-gray-100 overflow-hidden">
              {statTiles.map((t) => (
                <div key={t.label} className={`px-2 py-3.5 text-center ${t.highlight ? "bg-green-50/60" : ""}`}>
                  <p className={`text-2xl font-bold mb-0.5 ${t.highlight ? "text-green-700" : "text-guidr-text"}`}>{t.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-guidr-muted mb-1">{t.label}</p>
                  <span className={`text-[10px] font-semibold ${t.subClass}`}>{t.sub}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── RANK JOURNEY ── */}
          <section className="guidr-animate-in guidr-stagger-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">All ranks</p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-[18px]">
              <div className="relative pl-6">
                <div className="absolute left-[7px] top-[18px] bottom-[18px] w-0.5 bg-slate-100" aria-hidden="true" />
                {SECURITY_RANKS.map((r, i) => {
                  const done = r.level < level.levelNum;
                  const current = r.level === level.levelNum;
                  const away = Math.max(r.minXp - profile.xp, 0);
                  return (
                    <div key={r.title} className={`flex items-center gap-3 ${i < SECURITY_RANKS.length - 1 ? "mb-[18px]" : ""}`}>
                      {/* Timeline dot */}
                      {current ? (
                        <div
                          className="w-5 h-5 -ml-0.5 rounded-full relative z-[1] shrink-0 flex items-center justify-center"
                          style={{ background: r.solid, boxShadow: `0 0 0 4px ${r.solid}26` }}
                        >
                          <span
                            className="absolute inset-0 rounded-full opacity-40 animate-ping"
                            style={{ background: r.solid }}
                          />
                        </div>
                      ) : done ? (
                        <div
                          className="w-4 h-4 rounded-full relative z-[1] shrink-0 flex items-center justify-center text-white"
                          style={{ background: r.solid }}
                        >
                          <Icon type="check" size={10} />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-white border-2 border-slate-200 relative z-[1] shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <span
                              className="text-[13px] font-semibold"
                              style={{ color: current ? r.solid : done ? r.solid : "#9ca3af" }}
                            >
                              {r.icon} {r.title}
                            </span>
                            <p className="text-[11px] text-guidr-muted mt-px">
                              Level {r.level} · {r.minXp} XP
                              {!done && !current && away > 0 ? ` · ${away} away` : ""}
                            </p>
                          </div>
                          {current ? (
                            <span
                              className="text-[9px] font-bold uppercase tracking-wide text-white px-2 py-0.5 rounded"
                              style={{ background: r.solid }}
                            >
                              You
                            </span>
                          ) : done ? (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              Done
                            </span>
                          ) : (
                            <Icon type="lock" size={14} className="text-slate-300" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── HOW TO EARN XP ── */}
          <section className="guidr-animate-in guidr-stagger-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">How to earn XP</p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {earnXp.map((item, i) => (
                <div
                  key={item.action}
                  className={`flex items-center justify-between px-4 py-3 ${i < earnXp.length - 1 ? "border-b border-gray-100" : ""} ${item.tone === "green" ? "bg-green-50/60" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] text-guidr-text">{item.action}</p>
                    {item.note && <p className="text-[11px] text-guidr-muted mt-0.5">{item.note}</p>}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ml-3 ${TONE[item.tone].text} ${TONE[item.tone].bg}`}>
                    {item.xp}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ── RECENT ACTIVITY ── */}
          <section className="guidr-animate-in guidr-stagger-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">Recent activity</p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {activity.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[13px] text-guidr-text font-medium">No activity yet</p>
                  <p className="text-[11px] text-guidr-muted mt-1">Run your first scan to start earning XP.</p>
                </div>
              ) : (
                <>
                  {visibleActivity.map((a, i) => (
                    <div
                      key={a.key}
                      className={`flex items-center justify-between px-4 py-3 ${i < visibleActivity.length - 1 ? "border-b border-gray-100" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-guidr-text truncate">{a.label}</p>
                        <p className="text-[11px] text-guidr-muted mt-0.5">{relativeTime(a.date)}</p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ml-3 ${TONE[a.tone].text} ${TONE[a.tone].bg}`}>
                        +{a.xp}
                      </span>
                    </div>
                  ))}
                  {activity.length > 3 && (
                    <button
                      onClick={() => setShowAllActivity((s) => !s)}
                      className="w-full px-4 py-3 text-xs font-bold text-guidr-primary border-t border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      {showAllActivity ? "Show less" : "Show all activity"}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

        </div>
      </main>
      <BottomNav />
    </div>
  );
}
