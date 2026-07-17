"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
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
  const [totalCasesFiled, setTotalCasesFiled] = useState<number>(0);
  const [reportedToNSRC, setReportedToNSRC] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState<number>(0);

  useEffect(() => {
    const scamsQuery = query(collection(db, "scams"), orderBy("cases", "desc"), limit(3));
    const unsubscribeScams = onSnapshot(scamsQuery, (snapshot) => {
      const scamsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name || "Unknown Scam",
        cases: doc.data().cases || 0,
      }));
      setTrendingScams(scamsData);
    }, (error) => logger.error("Error fetching scams:", error));

    const unsubscribeStats = subscribeGlobalStats((stats) => {
      setTotalCasesFiled(stats.totalCases);
      setReportedToNSRC(stats.reportedNSRC);
      setTotalUsers(stats.totalUsers);
      setLoading(false);
    });

    return () => {
      unsubscribeScams();
      unsubscribeStats();
    };
  }, []);

  return (
    <section className="px-5 py-4 lg:px-0 lg:py-6">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">

      <div className="order-2 lg:order-1 lg:col-span-1">
      <div className="guidr-animate-in guidr-stagger-3 bg-white rounded-2xl border-l-4 border-l-guidr-red shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
          <div className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-guidr-red-light">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e05252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold text-guidr-text leading-tight">Top Trending Scams</p>
            <p className="text-xs text-guidr-muted">Across all Guidr users</p>
          </div>
        </div>

        <div className="px-4 pb-4 pt-1 flex flex-col gap-2">
          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/40">
                  <Skeleton className="w-7 h-7 rounded-full" />
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </>
          ) : trendingScams.length > 0 ? (
            (() => {
              const trendingTotal = trendingScams.reduce((sum, s) => sum + s.cases, 0);
              return trendingScams.map((scam, i) => {
                const share = trendingTotal > 0 ? Math.round((scam.cases / trendingTotal) * 100) : 0;
                return (
              <div
                key={scam.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${medalColors[i]?.border || "border-gray-200"} ${medalColors[i]?.bg || "bg-gray-50"}/40`}
              >
                <div className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full font-bold text-sm ${medalColors[i]?.bg || "bg-gray-100"} ${medalColors[i]?.text || "text-gray-500"} ring-1 ${medalColors[i]?.ring || "ring-gray-200"}`}>
                  {i + 1}
                </div>

                <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${categoryColor(scam.name).bg}`}>
                  <ScamCategoryIcon scamType={scam.name} size={16} className={categoryColor(scam.name).text} />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-guidr-text truncate">{displayCategoryName(scam.name)}</p>
                  <p className="text-xs text-guidr-muted">{scam.cases.toLocaleString()} cases</p>
                </div>

                <span className="shrink-0 text-xs font-semibold text-guidr-red flex items-center gap-0.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                  {share}%
                </span>
              </div>
                );
              });
            })()
          ) : (
            <p className="text-sm text-guidr-muted text-center py-2">No data yet.</p>
          )}
        </div>
      </div>
      </div>

      <div className="order-1 lg:order-2 lg:col-span-2 grid grid-cols-3 gap-3 lg:gap-4">

      <div className="guidr-animate-in guidr-stagger-4 flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-bold text-guidr-text leading-none">
            {totalCasesFiled.toLocaleString()}
          </p>
        )}
        <p className="text-xs text-guidr-muted mt-1.5">Cases filed</p>
      </div>

      <div className="guidr-animate-in guidr-stagger-5 flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-bold text-guidr-text leading-none">
            {reportedToNSRC.toLocaleString()}
          </p>
        )}
        <p className="text-xs text-guidr-muted mt-1.5">To NSRC</p>
      </div>

      <div className="guidr-animate-in guidr-stagger-6 flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-bold text-guidr-text leading-none">
            {totalUsers.toLocaleString()}
          </p>
        )}
        <p className="text-xs text-guidr-muted mt-1.5">Users</p>
      </div>

      </div>
      </div>
    </section>
  );
}
