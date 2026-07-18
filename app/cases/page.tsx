"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import { useUser } from "@/app/context/UserContext";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { displayScamCategory } from "@/lib/scam-categories";

interface CaseDoc {
  id: string;
  verdict: "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE";
  confidence?: number;
  scamType?: string;
  summary?: string;
  manipulationTactics?: string[];
  reportedToNSRC?: boolean;
  createdAt?: { toDate?: () => Date } | Date | number | string | null;
}

function caseDate(value: CaseDoc["createdAt"]): Date | null {
  if (!value) return null;
  if (typeof value === "object" && !(value instanceof Date) && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  if (!(typeof value === "number" || typeof value === "string" || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function presentation(verdict: CaseDoc["verdict"]) {
  if (verdict === "SCAM") return { label: "Scam", className: "bg-red-100 text-red-700" };
  if (verdict === "SUSPICIOUS") return { label: "Suspicious", className: "bg-amber-100 text-amber-800" };
  return { label: "Likely safe", className: "bg-emerald-100 text-emerald-700" };
}

export default function CasesPage() {
  const { user } = useUser();
  const [cases, setCases] = useState<CaseDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const casesQuery = query(collection(db, "cases"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    return onSnapshot(casesQuery, (snapshot) => {
      setCases(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as CaseDoc));
      setLoading(false);
    }, (error) => {
      logger.error("Error fetching saved cases:", error);
      setLoading(false);
    });
  }, [user]);

  return <div className="guidr-container">
    <Header />
    <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 pb-safe no-scrollbar">
      <div><h1 className="text-2xl font-bold text-guidr-text">My Cases</h1><p className="mt-1 text-sm text-guidr-muted">Your saved message checks and safety advice.</p></div>

      {loading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-guidr-primary border-t-transparent" /></div> : cases.length === 0 ? <section className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-5 py-12 text-center shadow-sm"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-guidr-primary-light text-guidr-primary"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg></div><h2 className="mt-4 text-lg font-bold text-guidr-text">No saved cases yet</h2><p className="mt-2 max-w-sm text-sm leading-5 text-guidr-muted">Finish a message check and it will appear here automatically.</p><Link href="/scan" className="mt-5 rounded-xl bg-guidr-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-guidr-primary-dark">Check a message</Link></section> : <div className="flex flex-col gap-3">{cases.map((item) => {
        const status = presentation(item.verdict);
        const date = caseDate(item.createdAt);
        return <article key={item.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-guidr-muted">{date ? date.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "Saved check"}</p><h2 className="mt-1 text-base font-bold text-guidr-text">{displayScamCategory(item.scamType || "Other")}</h2></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}>{status.label}</span></div><p className="mt-3 text-sm leading-5 text-guidr-muted">{item.summary || "Your safety assessment was saved."}</p><div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-guidr-bg px-2.5 py-1 font-semibold text-guidr-text">{Math.round(item.confidence || 0)}% confidence</span>{item.reportedToNSRC && <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">Reported to NSRC</span>}{item.manipulationTactics?.slice(0, 2).map((tactic) => <span key={tactic} className="rounded-full bg-guidr-primary-light px-2.5 py-1 text-guidr-primary">{tactic}</span>)}</div></article>;
      })}</div>}
    </main>
    <BottomNav />
  </div>;
}
