"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "@/app/context/UserContext";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import EmailComposerModal from "@/app/components/EmailComposerModal";
import Skeleton from "@/app/components/Skeleton";
import ScamNewsCarousel from "@/app/components/ScamNewsCarousel";
import ActivityTrend from "@/app/components/ActivityTrend";
import WardOverview from "@/app/components/WardOverview";
import ScamCategoryIcon, { categoryColor, displayCategoryName } from "@/app/components/ScamCategoryIcon";
import { normalizeScamType, SAFE_CATEGORY, formatTrend } from "@/lib/scam-categories";

interface CaseDoc {
  id: string;
  verdict: "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE";
  confidence: string;
  scamType: string;
  summary: string;
  originalMessage: string;
  manipulationTactics: string[];
  reportedToNSRC: boolean;
  createdAt: any;
  channel?: string;
}

function caseDate(c: CaseDoc): Date | null {
  const t = c.createdAt;
  if (!t) return null;
  const d = t.toDate ? t.toDate() : new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

const PARTNER_CTA_EMAIL = "guidrdeveloper@gmail.com";
const PARTNER_CTA_SUBJECT = "Guidr Partnership";
const PARTNER_CTA_BODY =
  `Hi Guidr team,\n\nI'd like to explore a partnership opportunity with Guidr.\n\n` +
  `A little about us:\n- Company:\n- Website:\n- What we'd like to discuss:\n\n` +
  `Looking forward to hearing back.\n\nThanks,`;

const RANGES = [
  { key: "Week", label: "This week", days: 7 },
  { key: "Month", label: "This month", days: 30 },
  { key: "Year", label: "This year", days: 365 },
] as const;

export default function AnalyticsPage() {
  const { user } = useUser();
  const [cases, setCases] = useState<CaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("Month");
  const [showPartnerPicker, setShowPartnerPicker] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "cases"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CaseDoc));
      setCases(data);
      setNow(Date.now());
      setLoading(false);
    }, (error) => {
      logger.error("Error fetching user cases:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const days = RANGES.find((r) => r.key === range)!.days;
  const rangeLabel = RANGES.find((r) => r.key === range)!.label;
  const periodMs = days * 86_400_000;

  const current = cases.filter((c) => {
    const d = caseDate(c);
    return d ? now - d.getTime() <= periodMs : false;
  });
  const previous = cases.filter((c) => {
    const d = caseDate(c);
    if (!d) return false;
    const age = now - d.getTime();
    return age > periodMs && age <= periodMs * 2;
  });

  const stats = {
    casesFiled: current.length,
    toNSRC: current.filter((c) => c.reportedToNSRC).length,
    scams: current.filter((c) => c.verdict === "SCAM").length,
  };

  const trendPct =
    previous.length === 0
      ? current.length > 0
        ? 100
        : 0
      : Math.round(((current.length - previous.length) / previous.length) * 100);
  const trendUp = current.length >= previous.length;

  const countByCategory = (list: CaseDoc[]) => {
    const map: Record<string, number> = {};
    list.forEach((c) => {
      const cat = normalizeScamType(c.scamType);
      if (cat === SAFE_CATEGORY) return;
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  };

  const currentByCat = countByCategory(current);
  const prevByCat = countByCategory(previous);

  const threatTotal =
    Object.values(currentByCat).reduce((a, b) => a + b, 0) || 1;

  const scamTypes = Object.entries(currentByCat)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([label, count]) => ({
      label,
      pct: Math.round((count / threatTotal) * 100),
    }));

  const emerging = Object.entries(currentByCat)
    .map(([label, count]) => {
      const prev = prevByCat[label] || 0;
      return { label, count, prev, trend: formatTrend(count, prev) };
    })
    .filter((e) => e.count > e.prev)
    .sort((a, b) => {
      const growth = (x: typeof a) => (x.prev === 0 ? Infinity : (x.count - x.prev) / x.prev);
      return growth(b) - growth(a);
    })
    .slice(0, 3);

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-5">

        <h1 className="text-2xl font-bold text-guidr-text guidr-animate-in guidr-stagger-1">
          Analytics
        </h1>

        <div className="flex gap-2 guidr-animate-in guidr-stagger-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
                range === r.key
                  ? "bg-guidr-primary text-white border-guidr-primary"
                  : "bg-white text-guidr-muted border-gray-200 hover:bg-gray-50"
              }`}
            >
              {r.key}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 guidr-animate-in guidr-stagger-2">
          <div className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <span className="text-2xl font-bold text-guidr-text leading-none">{stats.casesFiled}</span>
            )}
            <span className="text-xs text-guidr-muted mt-1.5">Cases filed</span>
          </div>
          <div className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <span className="text-2xl font-bold text-guidr-text leading-none">{stats.toNSRC}</span>
            )}
            <span className="text-xs text-guidr-muted mt-1.5">To NSRC</span>
          </div>
          <div className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <span className="text-2xl font-bold text-guidr-text leading-none">{stats.scams}</span>
            )}
            <span className="text-xs text-guidr-muted mt-1.5">Scams</span>
          </div>
          <div className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <span
                className={`text-2xl font-bold leading-none flex items-center gap-1 ${
                  trendUp ? "text-guidr-red" : "text-green-600"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {trendUp ? (
                    <>
                      <path d="M12 19V5" />
                      <path d="m5 12 7-7 7 7" />
                    </>
                  ) : (
                    <>
                      <path d="M12 5v14" />
                      <path d="m19 12-7 7-7-7" />
                    </>
                  )}
                </svg>
                {`${Math.abs(trendPct)}%`}
              </span>
            )}
            <span className="text-xs text-guidr-muted mt-1.5">{rangeLabel}</span>
          </div>
        </div>

        <div className="guidr-animate-in guidr-stagger-3">
          <WardOverview periodMs={periodMs} now={now} />
        </div>

        {!loading && (
          <div className="guidr-animate-in guidr-stagger-3">
            <ActivityTrend
              cases={cases.map((c) => ({ verdict: c.verdict, date: caseDate(c) }))}
              range={range}
              now={now}
            />
          </div>
        )}

        <div className="relative bg-guidr-blue-light/50 rounded-2xl p-4 border border-dashed border-guidr-blue/40 guidr-animate-in guidr-stagger-3">
          <div className="mb-3">
            <span className="text-[10px] font-bold tracking-widest text-guidr-muted uppercase bg-white/70 px-2 py-0.5 rounded">
              Advertisement
            </span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="shrink-0 w-11 h-11 rounded-xl bg-guidr-blue flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-guidr-text">This ad space is open</p>
              <p className="text-sm text-guidr-muted">Advertise with Guidr and reach Malaysians actively fighting scams.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPartnerPicker(true)}
            className="block w-full text-center bg-guidr-blue hover:bg-blue-600 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Inquire to advertise â†’
          </button>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 guidr-animate-in guidr-stagger-4">
          <h3 className="text-base font-bold text-guidr-text mb-4">Trending now</h3>
          {scamTypes.length === 0 ? (
            <p className="text-sm text-guidr-muted">No cases in this period yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {scamTypes.map((v) => {
                const color = categoryColor(v.label);
                return (
                  <div key={v.label}>
                    <div className="flex justify-between items-center text-sm mb-1.5">
                      <span className="flex items-center gap-2 font-medium text-guidr-text">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${color.bg}`}>
                          <ScamCategoryIcon scamType={v.label} size={14} className={color.text} />
                        </span>
                        {displayCategoryName(v.label)}
                      </span>
                      <span className="text-guidr-muted font-medium">{v.pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-guidr-bg rounded-full overflow-hidden">
                      <div
                        className="h-full bg-guidr-primary rounded-full transition-all duration-700"
                        style={{ width: `${v.pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {emerging.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-1.5 mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                </svg>
                <h4 className="text-xs font-bold tracking-widest text-guidr-muted uppercase">Emerging</h4>
              </div>
              <div className="flex flex-col gap-2.5">
                {emerging.map((e) => {
                  const color = categoryColor(e.label);
                  return (
                    <div key={e.label} className="flex items-center gap-2.5">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${color.bg}`}>
                        <ScamCategoryIcon scamType={e.label} size={15} className={color.text} />
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium text-guidr-text truncate">{displayCategoryName(e.label)}</span>
                      <span className="shrink-0 text-xs font-bold text-guidr-red">{e.trend}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="guidr-animate-in guidr-stagger-5">
          <ScamNewsCarousel />
        </div>

        <Link
          href="/cases"
          className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-guidr-primary/40 hover:shadow-md transition-all guidr-animate-in guidr-stagger-6"
        >
          <div className="shrink-0 w-11 h-11 rounded-xl bg-guidr-primary-light flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-guidr-text">My Cases</p>
            <p className="text-sm text-guidr-muted">
              {loading
                ? "View your full case history"
                : `View all ${cases.length} ${cases.length === 1 ? "case" : "cases"} you've filed`}
            </p>
          </div>
          <svg className="shrink-0 text-guidr-muted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>

      </main>
      <BottomNav />

      <EmailComposerModal
        isOpen={showPartnerPicker}
        onClose={() => setShowPartnerPicker(false)}
        to={PARTNER_CTA_EMAIL}
        subject={PARTNER_CTA_SUBJECT}
        body={PARTNER_CTA_BODY}
        title="Partner with Guidr"
        description="Pick your email provider. A draft is pre-filled to get you started."
      />
    </div>
  );
}
