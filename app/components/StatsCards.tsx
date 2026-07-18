"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeGlobalStats } from "@/lib/firestore";
import Skeleton from "@/app/components/Skeleton";
import ScamCategoryIcon, { categoryColor, displayCategoryName } from "@/app/components/ScamCategoryIcon";

const medalColors = [
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", ring: "ring-amber-200" },
  { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-300", ring: "ring-gray-200" },
  { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300", ring: "ring-orange-200" },
];

interface Scam {
  id: string;
  name: string;
  cases: number;
}
export default function StatsCards() {
  const [trendingScams, setTrendingScams] = useState<Scam[]>([]);
  const [totalCasesFiled, setTotalCasesFiled] = useState(0);
  const [reportedToNSRC, setReportedToNSRC] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeScams = onSnapshot(
      query(collection(db, "scams"), orderBy("cases", "desc"), limit(3)),
      (snapshot) => {
        setTrendingScams(snapshot.docs.map((entry) => ({ id: entry.id, name: entry.data().name || "Other", cases: Number(entry.data().cases) || 0 })));
      },
      (error) => {
        logger.error("Error fetching global scam trends:", error);
        setLoading(false);
      },
    );

    const unsubscribeStats = subscribeGlobalStats((stats) => {
      setTotalCasesFiled(stats.totalCases);
      setReportedToNSRC(stats.reportedNSRC);
      setTotalUsers(stats.totalUsers);
      setLoading(false);
    }, () => setLoading(false));

    return () => { unsubscribeScams(); unsubscribeStats(); };
  }, []);
  return (
    <section className="px-5 py-4 lg:px-0 lg:py-6">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
        <div className="order-2 lg:order-1 lg:col-span-1">
          <div className="guidr-animate-in guidr-stagger-3 overflow-hidden rounded-2xl border-l-4 border-l-guidr-red bg-white shadow-sm">
            <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-guidr-red-light">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e05252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
              </div>
              <div><p className="text-base font-bold leading-tight text-guidr-text">Top scam patterns</p><p className="text-xs text-guidr-muted">Across all Guidr users</p></div>
            </div>

            <div className="flex flex-col gap-2 px-4 pb-4 pt-1">
              {loading ? [0, 1, 2].map((index) => <div key={index} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/40 px-3 py-2.5"><Skeleton className="h-7 w-7 rounded-full" /><div className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-20" /></div></div>) : trendingScams.length > 0 ? (() => {
                const total = trendingScams.reduce((sum, item) => sum + item.cases, 0);
                return trendingScams.map((scam, index) => {
                  const share = total ? Math.round((scam.cases / total) * 100) : 0;
                  const medal = medalColors[index] || medalColors[2];
                  const color = categoryColor(scam.name);
                  return <div key={scam.id} className={`flex items-center gap-3 rounded-xl border ${medal.border} ${medal.bg}/40 px-3 py-2.5`}><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${medal.bg} ${medal.text} ring-1 ${medal.ring}`}>{index + 1}</div><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color.bg}`}><ScamCategoryIcon scamType={scam.name} size={16} className={color.text} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-guidr-text">{displayCategoryName(scam.name)}</p><p className="text-xs text-guidr-muted">{scam.cases.toLocaleString()} {scam.cases === 1 ? "case" : "cases"}</p></div><span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-guidr-red">{share}%</span></div>;
                });
              })() : <p className="py-2 text-center text-sm text-guidr-muted">No global data yet.</p>}
            </div>
          </div>
        </div>

        <div className="order-1 grid grid-cols-3 gap-3 lg:order-2 lg:col-span-2 lg:gap-4">
          {[
            ["Cases filed", totalCasesFiled],
            ["To NSRC", reportedToNSRC],
            ["Users", totalUsers],
          ].map(([label, value], index) => <div key={String(label)} className={`guidr-animate-in guidr-stagger-${index + 4} flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm`}>{loading ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-bold leading-none text-guidr-text">{Number(value).toLocaleString()}</p>}<p className="mt-1.5 text-xs text-guidr-muted">{label}</p></div>)}
        </div>
      </div>
    </section>
  );
}
