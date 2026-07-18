"use client";

import { logger } from "@/lib/logger";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "@/app/context/UserContext";
import Skeleton from "@/app/components/Skeleton";
import ScamCategoryIcon, { categoryColor, displayCategoryName } from "@/app/components/ScamCategoryIcon";
import { normalizeScamType, SAFE_CATEGORY } from "@/lib/scam-categories";

const medalColors = [
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", ring: "ring-amber-200" },
  { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-300", ring: "ring-gray-200" },
  { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300", ring: "ring-orange-200" },
];

interface CaseDoc {
  id: string;
  verdict: "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE";
  scamType: string;
  reportedToNSRC: boolean;
  createdAt: unknown;
}

interface Scam {
  id: string;
  name: string;
  cases: number;
}

function caseDate(item: CaseDoc): Date | null {
  if (!item.createdAt) return null;
  const value = item.createdAt;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (!(typeof value === "number" || typeof value === "string" || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function StatsCards() {
  const { user } = useUser();
  const [cases, setCases] = useState<CaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user) return;

    const casesQuery = query(
      collection(db, "cases"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(
      casesQuery,
      (snapshot) => {
        setCases(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as CaseDoc));
        setNow(Date.now());
        setLoading(false);
      },
      (error) => {
        logger.error("Error fetching home case data:", error);
        setLoading(false);
      },
    );
  }, [user]);

  const currentCases = useMemo(() => {
    const cutoff = now - 30 * 86_400_000;
    return cases.filter((item) => {
      const date = caseDate(item);
      return date ? date.getTime() >= cutoff : false;
    });
  }, [cases, now]);

  const trendingScams = useMemo<Scam[]>(() => {
    const counts = new Map<string, number>();
    currentCases.forEach((item) => {
      const category = normalizeScamType(item.scamType);
      if (category === SAFE_CATEGORY) return;
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [...counts.entries()]
      .sort(([, left], [, right]) => right - left)
      .slice(0, 3)
      .map(([name, count]) => ({ id: name, name, cases: count }));
  }, [currentCases]);

  const casesFiled = currentCases.length;
  const reportedToNSRC = currentCases.filter((item) => item.reportedToNSRC).length;
  const scams = currentCases.filter((item) => item.verdict === "SCAM").length;

  return (
    <section className="px-5 py-4 lg:px-0 lg:py-6">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
        <div className="order-2 lg:order-1 lg:col-span-1">
          <div className="guidr-animate-in guidr-stagger-3 overflow-hidden rounded-2xl border-l-4 border-l-guidr-red bg-white shadow-sm">
            <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-guidr-red-light">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e05252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
              </div>
              <div><p className="text-base font-bold leading-tight text-guidr-text">Top scam patterns</p><p className="text-xs text-guidr-muted">From your activity this month</p></div>
            </div>

            <div className="flex flex-col gap-2 px-4 pb-4 pt-1">
              {loading ? [0, 1, 2].map((index) => <div key={index} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/40 px-3 py-2.5"><Skeleton className="h-7 w-7 rounded-full" /><div className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-20" /></div></div>) : trendingScams.length > 0 ? (() => {
                const total = trendingScams.reduce((sum, item) => sum + item.cases, 0);
                return trendingScams.map((scam, index) => {
                  const share = total ? Math.round((scam.cases / total) * 100) : 0;
                  const medal = medalColors[index] || medalColors[2];
                  const color = categoryColor(scam.name);
                  return <div key={scam.id} className={`flex items-center gap-3 rounded-xl border ${medal.border} ${medal.bg}/40 px-3 py-2.5`}><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${medal.bg} ${medal.text} ring-1 ${medal.ring}`}>{index + 1}</div><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color.bg}`}><ScamCategoryIcon scamType={scam.name} size={16} className={color.text} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-guidr-text">{displayCategoryName(scam.name)}</p><p className="text-xs text-guidr-muted">{scam.cases} {scam.cases === 1 ? "case" : "cases"}</p></div><span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-guidr-red">{share}%</span></div>;
                });
              })() : <p className="py-2 text-center text-sm text-guidr-muted">No risky cases this month.</p>}
            </div>
          </div>
        </div>

        <div className="order-1 grid grid-cols-3 gap-3 lg:order-2 lg:col-span-2 lg:gap-4">
          {[
            ["Cases filed", casesFiled],
            ["To NSRC", reportedToNSRC],
            ["Scams", scams],
          ].map(([label, value], index) => <div key={String(label)} className={`guidr-animate-in guidr-stagger-${index + 4} flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm`}>{loading ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-bold leading-none text-guidr-text">{Number(value).toLocaleString()}</p>}<p className="mt-1.5 text-xs text-guidr-muted">{label}</p></div>)}
        </div>
      </div>
    </section>
  );
}
