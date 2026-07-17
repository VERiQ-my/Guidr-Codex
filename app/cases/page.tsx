"use client";

import { logger } from "@/lib/logger";
import { useEffect, useMemo, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "@/app/context/UserContext";
import {
  deriveCaseStatus,
  setCaseStatus,
  markCaseReported,
  subscribeEntitlements,
  type CaseStatus,
} from "@/lib/firestore";
import { isPro, FREE_EVIDENCE_LIMIT, FREE_ACTION_LIMIT } from "@/lib/plan";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import ScamCategoryIcon, { categoryColor, categoryName, displayCategoryName } from "@/app/components/ScamCategoryIcon";
import Link from "next/link";

/** Firestore Timestamp / date-ish value as this page receives them. */
type TimestampLike = { toDate?: () => Date } | string | number | Date | null | undefined;

interface CaseDoc {
  id: string;
  verdict: "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE";
  confidence: string;
  scamType: string;
  summary: string;
  originalMessage: string;
  manipulationTactics: string[];
  evidenceChain?: { finding: string; source: string; severity: string }[];
  recommendedActions?: string[];
  reportedToNSRC: boolean;
  reportedToPDRM: boolean;
  reportedToMCMC: boolean;
  status?: CaseStatus;
  createdAt: any;
  reportedAt?: TimestampLike;
  resolvedAt?: TimestampLike;
}

/** Official reporting channels, matching the scan-report consent flow. */
const AGENCY_CHANNELS: { agency: "NSRC" | "PDRM" | "MCMC"; label: string; open: () => void }[] = [
  { agency: "NSRC", label: "Call NSRC 997", open: () => { window.location.href = "tel:997"; } },
  { agency: "PDRM", label: "PDRM e-Reporting", open: () => { window.open("https://ereporting.rmp.gov.my", "_blank", "noopener"); } },
  { agency: "MCMC", label: "Email MCMC", open: () => { window.location.href = "mailto:aduan@mcmc.gov.my?subject=Scam%20report%20via%20Guidr"; } },
];

const PAGE_SIZE = 8;

const STATUS_TABS: { key: "all" | CaseStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "reported", label: "Reported" },
  { key: "resolved", label: "Resolved" },
];

/* ── Status badge (matches the lifecycle statuses) ── */
function StatusBadge({ status }: { status: CaseStatus }) {
  const styles: Record<CaseStatus, string> = {
    pending: "text-amber-600",
    reported: "text-green-600",
    resolved: "text-blue-600",
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`text-xs font-bold ${styles[status]}`}>{label}</span>;
}

/** Absolute short date for the case timeline ("8 Jul 2026"). */
function shortDate(timestamp: TimestampLike): string {
  if (!timestamp) return "";
  const date =
    typeof timestamp === "object" && "toDate" in timestamp && timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp as string | number | Date);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

/* ── Time ago / date helper ── */
function timeAgo(timestamp: any): string {
  if (!timestamp) return "Just now";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export default function CasesPage() {
  const { user } = useUser();
  const [cases, setCases] = useState<CaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | CaseStatus>("all");
  const [search, setSearch] = useState("");
  const [grouped, setGrouped] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [resolving, setResolving] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [pro, setPro] = useState(false);

  // Pro unlocks the full evidence chain / actions in the exported PDF,
  // mirroring the on-screen paywall in the scan report.
  useEffect(() => {
    if (!user) return;
    return subscribeEntitlements(user.uid, (ent) => setPro(isPro(ent)));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "cases"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CaseDoc));
      setCases(data);
      setLoading(false);
    }, (error) => {
      logger.error("Error fetching cases:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Stable CASE# per case: oldest filed is #001. Cases arrive newest-first, so
  // the number is total minus the descending index.
  const caseNumbers = useMemo(() => {
    const map: Record<string, string> = {};
    const total = cases.length;
    cases.forEach((c, i) => {
      map[c.id] = String(total - i).padStart(3, "0");
    });
    return map;
  }, [cases]);

  // Status counts drive the tab labels and "Showing X of Y".
  const statusOf = (c: CaseDoc) => deriveCaseStatus(c);

  const searched = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return cases;
    return cases.filter((c) => {
      const hay = `${displayCategoryName(c.scamType, c.verdict)} ${c.summary} ${c.originalMessage} #${caseNumbers[c.id]}`.toLowerCase();
      return hay.includes(term);
    });
  }, [cases, search, caseNumbers]);

  const filtered = useMemo(
    () => searched.filter((c) => statusFilter === "all" || statusOf(c) === statusFilter),
    [searched, statusFilter]
  );

  // Reset pagination whenever the active view changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [statusFilter, search, grouped]);

  const visible = grouped ? filtered : filtered.slice(0, visibleCount);
  const hasMore = !grouped && visibleCount < filtered.length;

  // Group the visible cases by canonical category for the grouped view.
  const groups = useMemo(() => {
    if (!grouped) return [];
    const map = new Map<string, CaseDoc[]>();
    for (const c of visible) {
      const key = c.verdict === "LIKELY_SAFE" ? "None" : categoryName(c.scamType);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [grouped, visible]);

  async function handleResolve(id: string) {
    setResolving(id);
    try {
      await setCaseStatus(id, "resolved");
    } catch (err) {
      logger.error("Failed to resolve case:", err);
    } finally {
      setResolving(null);
    }
  }

  // Open the agency's real channel AND record the report on the case, so the
  // lifecycle/timeline reflects it. Marking first keeps the write reliable
  // even when the channel navigates away (tel:/mailto:).
  async function handleReport(c: CaseDoc, channel: (typeof AGENCY_CHANNELS)[number]) {
    setReportingId(c.id);
    try {
      await markCaseReported(c.id, channel.agency);
      channel.open();
    } catch (err) {
      logger.error("Failed to mark case reported:", err);
    } finally {
      setReportingId(null);
    }
  }

  // Case-summary PDF, built from the case doc itself so every case (including
  // auto-saved ones without a stored report) can be exported. jsPDF stays
  // lazy-loaded, same as the scan report page. Free accounts export the same
  // limited evidence/actions the paywall shows on screen.
  async function handleExportPDF(c: CaseDoc) {
    setExportingId(c.id);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = 25;

      const wrap = (text: string, size: number, style = "normal") => {
        pdf.setFontSize(size);
        pdf.setFont("helvetica", style);
        for (const line of pdf.splitTextToSize(text, contentWidth)) {
          if (y > 275) { pdf.addPage(); y = margin; }
          pdf.text(line, margin, y);
          y += size * 0.45;
        }
      };
      const section = (title: string) => {
        y += 4;
        if (y > 265) { pdf.addPage(); y = margin; }
        pdf.setTextColor(13, 115, 119);
        wrap(title.toUpperCase(), 11, "bold");
        pdf.setTextColor(30, 30, 30);
        y += 1;
      };

      // Header bar (same look as the forensic report export)
      pdf.setFillColor(13, 115, 119);
      pdf.rect(0, 0, pageWidth, 18, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.text("GUIDR — CASE SUMMARY", pageWidth / 2, 11, { align: "center" });

      pdf.setTextColor(100, 100, 100);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Case #${caseNumbers[c.id]}`, margin, y);
      pdf.text(`Filed: ${shortDate(c.createdAt)}`, pageWidth - margin, y, { align: "right" });
      y += 4;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 8;
      pdf.setTextColor(30, 30, 30);

      section("Classification");
      wrap(`Category: ${displayCategoryName(c.scamType, c.verdict)}`, 10);
      wrap(`Verdict: ${c.verdict}   ·   Confidence: ${c.confidence}`, 10);
      const agencies = [c.reportedToNSRC && "NSRC", c.reportedToPDRM && "PDRM", c.reportedToMCMC && "MCMC"].filter(Boolean);
      wrap(`Status: ${statusOf(c).toUpperCase()}${agencies.length ? ` (reported to ${agencies.join(", ")})` : ""}`, 10);

      if (c.summary) { section("Summary"); wrap(c.summary, 10); }
      if (c.originalMessage) { section("Original message"); wrap(c.originalMessage, 9, "italic"); }
      if (c.manipulationTactics?.length) {
        section("Tactics detected");
        c.manipulationTactics.forEach((t) => wrap(`• ${t}`, 10));
      }
      if (c.evidenceChain?.length) {
        section("Evidence");
        const items = pro ? c.evidenceChain : c.evidenceChain.slice(0, FREE_EVIDENCE_LIMIT);
        items.forEach((e) => wrap(`• [${e.severity}] ${e.finding} (${e.source})`, 10));
        if (!pro && c.evidenceChain.length > items.length) {
          wrap(`+ ${c.evidenceChain.length - items.length} more with Guidr Pro`, 9, "italic");
        }
      }
      if (c.recommendedActions?.length) {
        section("Recommended actions");
        const items = pro ? c.recommendedActions : c.recommendedActions.slice(0, FREE_ACTION_LIMIT);
        items.forEach((a) => wrap(`• ${a}`, 10));
        if (!pro && c.recommendedActions.length > items.length) {
          wrap(`+ ${c.recommendedActions.length - items.length} more with Guidr Pro`, 9, "italic");
        }
      }

      pdf.save(`guidr-case-${caseNumbers[c.id]}.pdf`);
    } catch (err) {
      logger.error("Failed to export case PDF:", err);
    } finally {
      setExportingId(null);
    }
  }

  function renderCard(c: CaseDoc) {
    const isExpanded = expandedId === c.id;
    const status = statusOf(c);
    // Safe scans always read as "No threat detected" with the safe glyph,
    // regardless of whatever scam_type the model happened to emit.
    const iconType = c.verdict === "LIKELY_SAFE" ? "None" : c.scamType;
    const color = categoryColor(iconType);
    const agencies: string[] = [];
    if (c.reportedToNSRC) agencies.push("NSRC");
    if (c.reportedToPDRM) agencies.push("PDRM");
    if (c.reportedToMCMC) agencies.push("MCMC");

    return (
      <button
        key={c.id}
        onClick={() => setExpandedId(isExpanded ? null : c.id)}
        className={`w-full text-left bg-white rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.06)] border border-gray-100 transition-all duration-200 ${
          isExpanded ? "ring-2 ring-guidr-primary/20" : ""
        }`}
      >
        <div className="p-4">
          {/* Row: icon + title/meta + status */}
          <div className="flex items-center gap-3">
            <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${color.bg}`}>
              <ScamCategoryIcon scamType={iconType} className={color.text} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-guidr-text truncate">
                {displayCategoryName(c.scamType, c.verdict)}
              </h3>
              <p className="text-xs text-guidr-muted mt-0.5">
                CASE#{caseNumbers[c.id]} · {timeAgo(c.createdAt)}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <StatusBadge status={status} />
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7b8794" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-3">
              {c.summary && (
                <p className="text-sm text-guidr-muted leading-relaxed">{c.summary}</p>
              )}

              {agencies.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {agencies.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-guidr-text bg-guidr-bg px-2 py-1 rounded-full uppercase">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#22c55e" stroke="none">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                      </svg>
                      {a}
                    </span>
                  ))}
                </div>
              )}

              {c.originalMessage && (
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-guidr-muted uppercase mb-1">Original Message</p>
                  <div className="bg-gray-50 p-3 rounded-lg text-xs text-guidr-text leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {c.originalMessage}
                  </div>
                </div>
              )}

              {c.manipulationTactics && c.manipulationTactics.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-guidr-muted uppercase mb-1">Tactics Detected</p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.manipulationTactics.map((t, i) => (
                      <span key={i} className="text-[10px] font-bold bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Case timeline ── */}
              <div>
                <p className="text-[10px] font-bold tracking-widest text-guidr-muted uppercase mb-1.5">Timeline</p>
                <div className="flex flex-col gap-1">
                  {[
                    { label: "Filed", date: shortDate(c.createdAt), done: true },
                    {
                      label: agencies.length ? `Reported to ${agencies.join(", ")}` : "Reported",
                      date: shortDate(c.reportedAt),
                      done: status === "reported" || status === "resolved" || agencies.length > 0,
                    },
                    { label: "Resolved", date: shortDate(c.resolvedAt), done: status === "resolved" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${step.done ? "bg-guidr-primary" : "bg-gray-200"}`} />
                      <span className={`text-xs ${step.done ? "text-guidr-text font-medium" : "text-guidr-muted/70"}`}>
                        {step.label}
                      </span>
                      {step.done && step.date && (
                        <span className="text-[10px] text-guidr-muted ml-auto">{step.date}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Report to authorities (unreported scam/suspicious cases) ── */}
              {status === "pending" && c.verdict !== "LIKELY_SAFE" && (
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-guidr-muted uppercase mb-1.5">Report this case</p>
                  <div className="flex gap-2 flex-wrap">
                    {AGENCY_CHANNELS.map((ch) => (
                      <span
                        key={ch.agency}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); handleReport(c, ch); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleReport(c, ch); } }}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                          ch.agency === "NSRC"
                            ? "bg-guidr-red text-white border-guidr-red hover:opacity-90"
                            : "bg-white text-guidr-text border-gray-200 hover:bg-gray-50"
                        } ${reportingId === c.id ? "opacity-60 pointer-events-none" : ""}`}
                      >
                        {ch.label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-guidr-muted mt-1.5">
                    Opens the official channel and marks this case as reported.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-widest text-guidr-muted uppercase">Confidence:</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    c.confidence === "HIGH" ? "bg-red-100 text-red-700" :
                    c.confidence === "MEDIUM" ? "bg-amber-100 text-amber-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {c.confidence}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); handleExportPDF(c); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleExportPDF(c); } }}
                    className="text-xs font-semibold text-guidr-text hover:text-guidr-primary px-3 py-1.5 rounded-lg border border-gray-200 bg-white transition-colors"
                  >
                    {exportingId === c.id ? "Exporting…" : "Export PDF"}
                  </span>
                  {status !== "resolved" && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleResolve(c.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleResolve(c.id); } }}
                      className="text-xs font-semibold text-guidr-primary hover:text-guidr-primary-dark px-3 py-1.5 rounded-lg bg-guidr-primary-light/60 transition-colors"
                    >
                      {resolving === c.id ? "Resolving…" : "Mark as resolved"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-4">

        {/* ── Page Title ── */}
        <div className="guidr-animate-in guidr-stagger-1">
          <h2 className="text-2xl font-bold text-guidr-text">My Cases</h2>
          <p className="text-sm text-guidr-muted mt-1">
            {loading
              ? "Loading..."
              : `Showing ${visible.length} of ${cases.length} case${cases.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* ── Search ── */}
        <div className="relative guidr-animate-in guidr-stagger-2">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-guidr-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases, categories…"
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white rounded-xl border border-gray-200 focus:border-guidr-primary focus:ring-2 focus:ring-guidr-primary/15 outline-none"
          />
        </div>

        {/* ── Status tabs + group toggle ── */}
        <div className="flex items-center justify-between gap-2 guidr-animate-in guidr-stagger-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {STATUS_TABS.map((tab) => {
              const count = tab.key === "all"
                ? searched.length
                : searched.filter((c) => statusOf(c) === tab.key).length;
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`shrink-0 text-sm px-3.5 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "bg-guidr-primary text-white border-guidr-primary"
                      : "bg-white text-guidr-muted border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {tab.label}
                  <span className={active ? "text-white/80" : "text-guidr-muted/70"}> {count}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setGrouped((g) => !g)}
            title="Group by category"
            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full border transition-colors ${
              grouped ? "bg-guidr-primary text-white border-guidr-primary" : "bg-white text-guidr-muted border-gray-200 hover:bg-gray-50"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Loading state ── */}
        {loading && (
          <div className="py-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-guidr-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── Empty: no cases at all ── */}
        {!loading && cases.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center guidr-animate-in guidr-stagger-2">
            <div className="w-16 h-16 rounded-full bg-guidr-primary-light flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-guidr-text mb-2">No cases yet</h3>
            <p className="text-sm text-guidr-muted text-center max-w-xs mb-5">
              Scan a suspicious message to start building your case history.
            </p>
            <Link
              href="/scan"
              className="flex items-center gap-2 px-6 py-3 bg-guidr-primary text-white font-semibold rounded-xl hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Investigate a message
            </Link>
          </div>
        )}

        {/* ── Empty: filters/search return nothing ── */}
        {!loading && cases.length > 0 && filtered.length === 0 && (
          <div className="py-10 text-center guidr-animate-in">
            <p className="text-sm text-guidr-muted">No cases match this view.</p>
            <p className="text-xs text-guidr-muted mt-1">Try a different filter or search term.</p>
          </div>
        )}

        {/* ── Flat list ── */}
        {!loading && filtered.length > 0 && !grouped && (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start guidr-animate-in guidr-stagger-2">
            {visible.map(renderCard)}
          </div>
        )}

        {/* ── Grouped by category ── */}
        {!loading && filtered.length > 0 && grouped && (
          <div className="flex flex-col gap-5 guidr-animate-in guidr-stagger-2">
            {groups.map(([category, items]) => {
              const color = categoryColor(category);
              return (
                <div key={category} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${color.bg}`}>
                      <ScamCategoryIcon scamType={category} size={16} className={color.text} />
                    </span>
                    <h3 className="text-sm font-bold text-guidr-text">{displayCategoryName(category)}</h3>
                    <span className="text-xs text-guidr-muted">({items.length})</span>
                  </div>
                  <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
                    {items.map(renderCard)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Load more ── */}
        {hasMore && (
          <button
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="self-center mt-1 text-sm font-semibold text-guidr-primary hover:text-guidr-primary-dark px-4 py-2"
          >
            Load more cases ›
          </button>
        )}

      </main>
      <BottomNav />
    </div>
  );
}
