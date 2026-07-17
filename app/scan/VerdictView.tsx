"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import { auth } from "@/lib/firebase";
import { incrementStat, getTrustedContacts, createAlert, subscribeEntitlements, TrustedContact } from "@/lib/firestore";
import { isPro, FREE_EVIDENCE_LIMIT } from "@/lib/plan";
import { displayCategoryName } from "@/app/components/ScamCategoryIcon";

interface EvidenceItem {
  finding: string;
  source: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}

interface Analysis {
  verdict: "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  scam_type: string;
  language_detected?: string;
  manipulation_tactics: string[];
  evidence_chain: EvidenceItem[];
  recommended_actions: string[];
  summary: string;
}

interface VerdictViewProps {
  analysis: Analysis;
  originalMessage: string;
  toolCalls: any[];
}

// ── Verdict theming ──
function getVerdictTheme(verdict: string) {
  switch (verdict) {
    case "SCAM":
      return {
        label: "LIKELY SCAM",
        heroBg: "bg-red-50",
        heroBorder: "border-red-200",
        topBorder: "border-t-red-500",
        iconBox: "bg-red-100",
        iconColor: "#dc2626",
        labelText: "text-red-800",
        confBg: "bg-red-600",
        gaugeText: "text-red-800",
        gaugeTrack: "bg-red-200",
        gaugeFrom: "#f87171",
        gaugeTo: "#dc2626",
        warnBg: "bg-red-500/10",
        warnText: "text-red-900",
        warnIcon: "#dc2626",
        tag: "bg-red-50 border-red-200 text-red-800",
        warning: "Do not reply, click links, or send money. Block the sender and report it.",
      };
    case "SUSPICIOUS":
      return {
        label: "SUSPICIOUS",
        heroBg: "bg-amber-50",
        heroBorder: "border-amber-200",
        topBorder: "border-t-amber-500",
        iconBox: "bg-amber-100",
        iconColor: "#d97706",
        labelText: "text-amber-800",
        confBg: "bg-amber-500",
        gaugeText: "text-amber-800",
        gaugeTrack: "bg-amber-200",
        gaugeFrom: "#fbbf24",
        gaugeTo: "#f59e0b",
        warnBg: "bg-amber-500/10",
        warnText: "text-amber-900",
        warnIcon: "#d97706",
        tag: "bg-amber-50 border-amber-200 text-amber-800",
        warning: "Do not click any links. Verify directly with the company using official contact details before taking any action.",
      };
    default: // LIKELY_SAFE
      return {
        label: "LIKELY SAFE",
        heroBg: "bg-green-50",
        heroBorder: "border-green-200",
        topBorder: "border-t-green-500",
        iconBox: "bg-green-100",
        iconColor: "#16a34a",
        labelText: "text-green-800",
        confBg: "bg-green-600",
        gaugeText: "text-green-800",
        gaugeTrack: "bg-green-200",
        gaugeFrom: "#4ade80",
        gaugeTo: "#16a34a",
        warnBg: "bg-green-500/10",
        warnText: "text-green-900",
        warnIcon: "#16a34a",
        tag: "bg-slate-50 border-slate-200 text-slate-700",
        warning: "No major red flags found, but stay cautious and verify any unexpected requests independently.",
      };
  }
}

// ── Risk score (0–100) derived from verdict + confidence ──
function getRiskScore(verdict: string, confidence: string): number {
  if (verdict === "LIKELY_SAFE") {
    const adj = confidence === "HIGH" ? -8 : confidence === "LOW" ? 10 : 0;
    return Math.max(5, 18 + adj);
  }
  const base = verdict === "SCAM" ? 85 : 65;
  const adj = confidence === "HIGH" ? 10 : confidence === "LOW" ? -12 : 0;
  return Math.min(98, Math.max(20, base + adj));
}

// ── Evidence severity → card theme + pill label ──
function getEvidenceTheme(severity: string) {
  switch (severity) {
    case "HIGH":
      return {
        pill: "HIGH RISK",
        card: "bg-red-50 border-red-200 border-l-red-500",
        iconBox: "bg-red-100 text-red-500",
        title: "text-red-900",
        pillClass: "text-red-600 bg-red-100",
        sourceColor: "text-red-500",
      };
    case "MEDIUM":
      return {
        pill: "WARNING",
        card: "bg-amber-50 border-amber-200 border-l-amber-500",
        iconBox: "bg-amber-100 text-amber-600",
        title: "text-amber-900",
        pillClass: "text-amber-700 bg-amber-100",
        sourceColor: "text-amber-600",
      };
    default:
      return {
        pill: "NEUTRAL",
        card: "bg-white border-gray-200 border-l-slate-400",
        iconBox: "bg-slate-100 text-slate-500",
        title: "text-guidr-text",
        pillClass: "text-slate-500 bg-slate-100",
        sourceColor: "text-slate-400",
      };
  }
}

// ── Map source names to SVG icons ──
function getSourceIcon(source: string) {
  const lower = source.toLowerCase();
  if (lower.includes("ssm") || lower.includes("company") || lower.includes("business")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    );
  }
  if (lower.includes("url") || lower.includes("whois") || lower.includes("domain") || lower.includes("phish")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }
  if (lower.includes("recruiter") || lower.includes("contact") || lower.includes("pattern")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (lower.includes("report") || lower.includes("reddit") || lower.includes("lowyat") || lower.includes("forum")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  }
  // Default database icon
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

// ── Map tactic names to icons ──
function getTacticIcon(tactic: string) {
  const lower = tactic.toLowerCase();
  if (lower.includes("urgency") || lower.includes("pressure") || lower.includes("time")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  if (lower.includes("identity") || lower.includes("personal") || lower.includes("data")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    );
  }
  if (lower.includes("fee") || lower.includes("payment") || lower.includes("money") || lower.includes("advance")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (lower.includes("impersonat") || lower.includes("brand") || lower.includes("fake")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  // Default tag icon
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

export default function VerdictView({ analysis, originalMessage, toolCalls }: VerdictViewProps) {
  const router = useRouter();
  const { user } = useUser();
  const theme = getVerdictTheme(analysis.verdict);
  const riskScore = getRiskScore(analysis.verdict, analysis.confidence);

  // Typologies to display. Normally the model's manipulation_tactics, but it
  // occasionally returns an empty list even for a confirmed scam — which makes
  // the verdict look incomplete. For any non-safe verdict, fall back to the
  // scam category so this section always conveys something meaningful.
  const tactics: string[] = (() => {
    const fromModel = (analysis.manipulation_tactics || []).filter(Boolean);
    if (fromModel.length > 0) return fromModel;
    if (analysis.verdict === "LIKELY_SAFE") return [];
    const label = displayCategoryName(analysis.scam_type, analysis.verdict);
    return label && label !== "No threat detected" ? [label] : [];
  })();
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  // Plan gating: free accounts see a preview of the evidence chain; the full
  // breakdown is unlocked with Guidr Pro.
  const [pro, setPro] = useState(false);
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeEntitlements(user.uid, (e) => setPro(isPro(e)));
  }, [user?.uid]);
  // Warn-contacts modal state
  const [showWarnModal, setShowWarnModal] = useState(false);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contactsLoading, setContactsLoading] = useState(false);
  const [alertUrl, setAlertUrl] = useState<string | null>(null);
  const [creatingAlert, setCreatingAlert] = useState(false);
  const [copied, setCopied] = useState(false);

  // Open the modal and load the user's trusted contacts.
  async function openWarnModal() {
    if (!user) return;
    setShowWarnModal(true);
    setContactsLoading(true);
    try {
      const c = await getTrustedContacts(user.uid);
      setContacts(c);
      setSelectedIds(new Set(c.map((x) => x.id!).filter(Boolean)));
    } catch (err) {
      logger.error("Load contacts error:", err);
    } finally {
      setContactsLoading(false);
    }
  }

  function toggleContact(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Create the public alert (once) and return its shareable URL.
  async function ensureAlertUrl(): Promise<string | null> {
    if (alertUrl) return alertUrl;
    if (!user) return null;
    setCreatingAlert(true);
    try {
      const id = await createAlert({
        ownerUid: user.uid,
        warnedByName: user.fullName || user.username || "A Guidr user",
        verdict: analysis.verdict,
        confidence: analysis.confidence,
        scamType: analysis.scam_type || "unknown",
        summary: analysis.summary || "",
        manipulationTactics: analysis.manipulation_tactics || [],
        evidenceChain: analysis.evidence_chain || [],
        recommendedActions: analysis.recommended_actions || [],
        warnedContactCount: selectedIds.size,
      });
      const url = `${window.location.origin}/alert/${id}`;
      setAlertUrl(url);
      return url;
    } catch (err) {
      logger.error("Create alert error:", err);
      return null;
    } finally {
      setCreatingAlert(false);
    }
  }

  function buildMessage(url: string): string {
    const label = analysis.verdict === "SCAM" ? "a likely SCAM" : analysis.verdict === "SUSPICIOUS" ? "a SUSPICIOUS message" : "a message";
    return `⚠️ Guidr scam alert: I flagged ${label}${analysis.scam_type && analysis.scam_type !== "none" ? ` (${analysis.scam_type})` : ""}. Stay safe. See the details here: ${url}`;
  }

  // Open WhatsApp for a specific contact, prefilled with the alert link.
  async function warnViaWhatsApp(contact: TrustedContact) {
    const url = await ensureAlertUrl();
    if (!url) return;
    const phone = contact.phone.replace(/[^\d]/g, "");
    const text = encodeURIComponent(buildMessage(url));
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener");
  }

  // Open the device SMS app addressed to all selected contacts.
  async function warnViaSMS() {
    const url = await ensureAlertUrl();
    if (!url) return;
    const selected = contacts.filter((c) => c.id && selectedIds.has(c.id));
    const numbers = selected.map((c) => c.phone.replace(/[^\d+]/g, "")).join(",");
    const body = encodeURIComponent(buildMessage(url));
    window.location.href = `sms:${numbers}?&body=${body}`;
  }

  async function copyAlertLink() {
    const url = await ensureAlertUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(buildMessage(url));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard denied — link is still shown in the modal */
    }
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    try {
      // The report endpoint now requires the caller's Firebase ID token
      // (same as the scan routes) — see /api/generate-report.
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          originalMessage,
          analysis,
          tool_calls: toolCalls,
        }),
      });

      if (!res.ok) throw new Error("Report generation failed");
      const data = await res.json();

      // Increment "Reported to NSRC" only when user generates a report
      if (user) {
        await incrementStat(user.uid, "scamsReported");
      }

      sessionStorage.setItem("guidr_report", JSON.stringify(data));

      // The report page builds the MCMC email body + runs bank detection from
      // this structured payload. Without it, the email falls back to "Unknown"
      // / "Not specified" placeholders. Carry the channel forward from the
      // scan input so the email's "Channel:" line is meaningful.
      let channel: string | undefined;
      try {
        const inputRaw = sessionStorage.getItem("guidr_scan_input");
        if (inputRaw) channel = JSON.parse(inputRaw).sourceChannel;
      } catch { /* non-fatal */ }
      sessionStorage.setItem(
        "guidr_analysis",
        JSON.stringify({ ...analysis, originalMessage, channel })
      );

      router.push("/scan/report");
    } catch (err) {
      logger.error("Report generation error:", err);
    } finally {
      setIsGeneratingReport(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* ── Verdict Hero ── */}
      <section className={`${theme.heroBg} ${theme.heroBorder} ${theme.topBorder} border border-t-[3px] rounded-2xl p-4 guidr-animate-in guidr-stagger-1`}>
        {/* Verdict row */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 ${theme.iconBox} rounded-xl flex items-center justify-center shrink-0`}>
            {analysis.verdict === "LIKELY_SAFE" ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={theme.iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={theme.iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
          </div>
          <div>
            <p className={`text-2xl font-bold ${theme.labelText} tracking-wide leading-none`}>{theme.label}</p>
            <span className={`inline-flex items-center gap-1 ${theme.confBg} text-white rounded-full px-2.5 py-1 mt-1.5`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2 4 5v6c0 5 3.4 7.8 8 10 4.6-2.2 8-5 8-10V5l-8-3zm0 2.2 6 2.25V11c0 3.9-2.5 6.2-6 7.9z" />
              </svg>
              <span className="text-[9px] font-bold tracking-wider">{analysis.confidence} CONFIDENCE</span>
            </span>
          </div>
        </div>

        {/* Risk gauge */}
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className={`text-[9px] font-bold uppercase tracking-wider ${theme.gaugeText}`}>Risk score</span>
            <span className={`text-xs font-bold ${theme.gaugeText}`}>{riskScore} / 100</span>
          </div>
          <div className={`${theme.gaugeTrack} rounded-full h-2 overflow-hidden`}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${riskScore}%`, background: `linear-gradient(to right, ${theme.gaugeFrom}, ${theme.gaugeTo})` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className={`text-[8px] ${theme.gaugeText} opacity-70`}>Low</span>
            <span className={`text-[8px] ${theme.gaugeText} opacity-70`}>High</span>
          </div>
        </div>

        {/* Plain-language warning */}
        <div className={`${theme.warnBg} rounded-lg px-3 py-2.5 flex items-start gap-2`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.warnIcon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p className={`text-[11px] ${theme.warnText} leading-relaxed`}>{theme.warning}</p>
        </div>
      </section>

      {/* ── Analysis Summary ── */}
      <section className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm guidr-animate-in guidr-stagger-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-guidr-primary text-white text-[9px] font-bold px-2 py-0.5 rounded">Summary</span>
          <h2 className="text-sm font-bold text-guidr-text">Analysis Summary</h2>
        </div>
        <p className="text-xs text-guidr-muted leading-relaxed">{analysis.summary}</p>
      </section>

      {/* ── Evidence Chain ── */}
      {(analysis.evidence_chain || []).length > 0 && (
        <section className="guidr-animate-in guidr-stagger-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-slate-600 text-white text-[9px] font-bold px-2 py-0.5 rounded">Evidence</span>
            <h2 className="text-sm font-bold text-guidr-text">What we found</h2>
          </div>
          <div className="flex flex-col gap-2">
            {(pro
              ? analysis.evidence_chain || []
              : (analysis.evidence_chain || []).slice(0, FREE_EVIDENCE_LIMIT)
            ).map((item, i) => {
              const ev = getEvidenceTheme(item.severity);
              return (
                <div key={i} className={`${ev.card} border border-l-[3px] rounded-xl p-2.5 flex gap-2.5`}>
                  <div className={`w-8 h-8 ${ev.iconBox} rounded-lg flex items-center justify-center shrink-0`}>
                    {getSourceIcon(item.source)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className={`text-[11px] font-semibold ${ev.title} leading-snug`}>{item.finding}</p>
                      <span className={`text-[8px] font-bold ${ev.pillClass} px-1.5 py-0.5 rounded shrink-0`}>{ev.pill}</span>
                    </div>
                    <div className={`flex items-center gap-1 ${ev.sourceColor}`}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <span className="text-[9px]">{item.source} · GUIDR report</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Locked-evidence upsell (free tier, when more findings exist) */}
            {!pro && (analysis.evidence_chain || []).length > FREE_EVIDENCE_LIMIT && (
              <button
                type="button"
                onClick={() => router.push("/settings?upgrade=1")}
                className="relative overflow-hidden rounded-xl border border-dashed border-guidr-primary/40 bg-guidr-primary-light/30 p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-guidr-primary/15 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-guidr-text leading-snug">
                    +{(analysis.evidence_chain || []).length - FREE_EVIDENCE_LIMIT} more finding{(analysis.evidence_chain || []).length - FREE_EVIDENCE_LIMIT === 1 ? "" : "s"} hidden
                  </p>
                  <p className="text-[10px] text-guidr-muted leading-snug">
                    Unlock the full evidence chain with Guidr Pro
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Detected Typologies / Manipulation Tactics ── */}
      {tactics.length > 0 && (
        <section className="guidr-animate-in guidr-stagger-4">
          <p className="text-[11px] font-bold text-guidr-text mb-2">Detected typologies</p>
          <div className="flex flex-wrap gap-1.5">
            {tactics.map((tactic, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 ${theme.tag} border rounded-full px-2.5 py-1 text-[10px] font-semibold`}
              >
                {getTacticIcon(tactic)}
                {tactic}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Action Buttons ── */}
      <section className="flex flex-col gap-2 mt-1 guidr-animate-in guidr-stagger-5">
        {/* Generate NSRC Report — primary CTA */}
        {(analysis.verdict === "SCAM" || analysis.verdict === "SUSPICIOUS") && (
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
            className="
              w-full flex items-center justify-center gap-2.5
              py-3.5 px-6 rounded-xl
              bg-guidr-primary text-white font-semibold text-sm
              shadow-md
              hover:bg-guidr-primary-dark active:scale-[0.98]
              transition-all duration-200
              disabled:opacity-60 disabled:cursor-not-allowed
            "
          >
            {isGeneratingReport ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating report...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Generate NSRC Report
              </>
            )}
          </button>
        )}

        {/* Secondary actions row */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-50 border border-green-300 text-green-700 text-[11px] font-semibold">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            Auto-saved
          </div>
          <button
            type="button"
            onClick={openWarnModal}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-gray-200 text-slate-600 text-[11px] font-semibold hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            Warn contacts
          </button>
        </div>

        {/* Scan another */}
        <button
          type="button"
          onClick={() => router.push("/scan")}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-guidr-primary text-[11px] font-medium hover:text-guidr-primary-dark transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
          Scan another message
        </button>
      </section>

      {/* ── Warn Contacts Modal ── */}
      {showWarnModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowWarnModal(false)} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-xl guidr-animate-in max-h-[85dvh] overflow-y-auto no-scrollbar">
            {/* Header */}
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-lg font-bold text-guidr-text">Warn your contacts</h3>
                <p className="text-xs text-guidr-muted mt-0.5">Share this scam alert so they stay safe.</p>
              </div>
              <button onClick={() => setShowWarnModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-guidr-muted text-lg">✕</button>
            </div>

            {contactsLoading ? (
              <div className="py-10 flex justify-center">
                <div className="w-6 h-6 border-2 border-guidr-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center gap-3">
                <p className="text-sm text-guidr-muted">You haven&apos;t added any trusted contacts yet.</p>
                <button
                  onClick={() => router.push("/settings")}
                  className="px-5 py-2.5 bg-guidr-primary text-white rounded-xl font-semibold text-sm hover:bg-guidr-primary-dark transition-colors"
                >
                  Add contacts in Settings
                </button>
                <p className="text-[11px] text-guidr-muted">Free plan includes up to 5 contacts.</p>
              </div>
            ) : (
              <>
                {/* Contact list with WhatsApp per-contact */}
                <div className="flex flex-col gap-2 my-3">
                  {contacts.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/60">
                      <button
                        onClick={() => c.id && toggleContact(c.id)}
                        className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${c.id && selectedIds.has(c.id) ? "bg-guidr-primary border-guidr-primary" : "border-gray-300 bg-white"}`}
                        aria-label="Select contact"
                      >
                        {c.id && selectedIds.has(c.id) && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-guidr-text truncate">{c.name}</p>
                        <p className="text-xs text-guidr-muted truncate">{c.phone}</p>
                      </div>
                      <button
                        onClick={() => warnViaWhatsApp(c)}
                        disabled={creatingAlert}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600 active:scale-95 transition-all disabled:opacity-60"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.8.9.9-2.7-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3a3 3 0 0 0-.9 2.2c0 1.3 1 2.6 1.1 2.8.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1z" /></svg>
                        WhatsApp
                      </button>
                    </div>
                  ))}
                </div>

                {/* Bulk SMS + copy link */}
                <div className="flex flex-col gap-2 mt-2">
                  <button
                    onClick={warnViaSMS}
                    disabled={creatingAlert || selectedIds.size === 0}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {creatingAlert ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        Send SMS to {selectedIds.size} selected
                      </>
                    )}
                  </button>
                  <button
                    onClick={copyAlertLink}
                    disabled={creatingAlert}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-gray-200 text-guidr-text font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
                  >
                    {copied ? (
                      <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Copied!</>
                    ) : (
                      <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> Copy alert message</>
                    )}
                  </button>
                </div>

                {alertUrl && (
                  <p className="text-[11px] text-guidr-muted text-center mt-3 break-all">
                    Shareable link: {alertUrl}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
