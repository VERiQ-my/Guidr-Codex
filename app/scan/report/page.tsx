"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import SubmitConsentModal from "../SubmitConsentModal";
import EmailComposerModal from "@/app/components/EmailComposerModal";
import { detectBanks, type Bank } from "@/lib/malaysian-banks";
import { useUser } from "@/app/context/UserContext";
import { saveCase, awardXP, incrementStat, subscribeEntitlements } from "@/lib/firestore";
import { isPro, FREE_REPORT_SECTIONS, FREE_EVIDENCE_LIMIT } from "@/lib/plan";
import ScamCategoryIcon, { categoryColor, displayCategoryName } from "@/app/components/ScamCategoryIcon";

/* ── Free-tier limiter: keep only the un-gated report sections, replacing the
   detailed forensic ones with a Pro upsell note. Used for the PDF export and
   clipboard copy so they mirror exactly what a free user sees on screen. ── */
function limitReportMarkdown(md: string): string {
  const parts = md.split(/\n## /);
  const head = parts[0].trimEnd();
  const kept: string[] = [];
  let droppedAny = false;
  for (const sec of parts.slice(1)) {
    const title = sec.split("\n")[0].replace(/^\d+\.\s*/, "").trim().toUpperCase();
    if (FREE_REPORT_SECTIONS.has(title)) kept.push("## " + sec.trimEnd());
    else droppedAny = true;
  }
  const upsell = droppedAny
    ? "\n## FULL FORENSIC DETAIL — GUIDR PRO\n\n" +
      "The complete evidence chain, suspicious-party breakdown, verbatim message, " +
      "and recommended actions for authorities are available on Guidr Pro. " +
      "Upgrade in the Guidr app to export the full forensic report.\n"
    : "";
  return [head, ...kept].join("\n\n") + (upsell ? "\n" + upsell : "");
}

/* ── Verdict → badge + tile styling (mirrors VerdictView's palette).
   Returns Tailwind class names (not hex values) so dark-mode CSS overrides
   in globals.css can adapt the colors. Previously these were inline styles
   which always beat CSS classes and broke dark mode. */
function verdictStyle(verdict: string) {
  switch (verdict) {
    case "SCAM":
      return {
        label: "SCAM",
        badge: "bg-red-500",
        tileBg: "bg-red-50",
        tileBorder: "border-red-200",
        tileText: "text-red-800",
        tileSub: "text-red-600",
      };
    case "LIKELY_SAFE":
      return {
        label: "LIKELY SAFE",
        badge: "bg-green-500",
        tileBg: "bg-green-50",
        tileBorder: "border-green-200",
        tileText: "text-green-800",
        tileSub: "text-green-600",
      };
    default: // SUSPICIOUS
      return {
        label: "SUSPICIOUS",
        badge: "bg-amber-500",
        tileBg: "bg-amber-50",
        tileBorder: "border-amber-200",
        tileText: "text-amber-800",
        tileSub: "text-amber-600",
      };
  }
}

/* ── Two-letter initials from a full name (for the reporter avatar) ── */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ReportData {
  report_id: string;
  generated_at: string;
  format: string;
  content: string;
}

/* ── Parse markdown report into structured sections ── */
function parseReport(md: string) {
  const sections: Record<string, string> = {};
  let currentKey = "";
  const lines = md.split("\n");

  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentKey = line.replace(/^##\s*\d*\.?\s*/, "").trim().toUpperCase();
    } else if (currentKey) {
      sections[currentKey] = (sections[currentKey] || "") + line + "\n";
    }
  }
  return sections;
}

/* ── Extract table rows from markdown table ── */
function parseTable(text: string): [string, string][] {
  const rows: [string, string][] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("|") && !line.includes("---")) {
      const cells = line.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.length >= 2 && cells[0] !== "Field") {
        rows.push([cells[0], cells[1].replace(/\*\*/g, "")]);
      }
    }
  }
  return rows;
}

/* ── Extract list items ── */
function parseList(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => /^\d+\.\s|^-\s/.test(l.trim()))
    .map((l) => l.replace(/^\d+\.\s*|^-\s*\[.\]\s*|^-\s*/, "").replace(/\*\*/g, "").trim());
}

/* ── Extract code block content ── */
function parseCodeBlock(text: string): string {
  const match = text.match(/```[\s\S]*?\n([\s\S]*?)```/);
  return match ? match[1].trim() : "";
}

/* ── Section icon component ── */
function SectionIcon({ name, className = "text-guidr-muted" }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    person: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    gavel: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    warning: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>,
    phone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    globe: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    checklist: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    message: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  };
  return <span className={className}>{icons[name] || icons.shield}</span>;
}

/* ── Card section header: teal icon + dark title, optional right-side note ── */
function SectionHead({ icon, title, right }: { icon: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-guidr-text">
        <SectionIcon name={icon} className="text-guidr-primary" /> {title}
      </h3>
      {right}
    </div>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const { user } = useUser();
  const [report, setReport] = useState<ReportData | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, any> | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [submittedAgencies, setSubmittedAgencies] = useState<string[] | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  // Tracks which bank's contact modal is open (null when closed). Separate
  // from showEmailPicker so opening a bank modal doesn't close the MCMC one.
  const [activeBankModal, setActiveBankModal] = useState<Bank | null>(null);
  // Plan gating: free accounts get a limited report; Pro sees the full
  // forensic detail (and exports it).
  const [pro, setPro] = useState(false);
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeEntitlements(user.uid, (e) => setPro(isPro(e)));
  }, [user?.uid]);

  useEffect(() => {
    const raw = sessionStorage.getItem("guidr_report");
    if (!raw) { router.replace("/scan"); return; }
    setReport(JSON.parse(raw));

    // Verdict + structured fields live in a separate sessionStorage entry
    // written by the scan flow. Used to build the email body and detect
    // bank mentions — missing it is non-fatal (we still show the PDF dump).
    const analysisRaw = sessionStorage.getItem("guidr_analysis");
    if (analysisRaw) {
      try { setAnalysis(JSON.parse(analysisRaw)); } catch { /* ignore */ }
    }
  }, [router]);

  // Run bank detection across the user's message text + AI summary. Pure
  // client-side substring match — see lib/malaysian-banks.ts.
  const detectedBanks = useMemo(() => {
    if (!analysis) return [];
    const text = [
      analysis.originalMessage,
      analysis.summary,
      analysis.scam_type,
      ...(analysis.evidence_chain || []).map((e: any) => e.finding),
    ].filter(Boolean).join(" ");
    return detectBanks(text);
  }, [analysis]);

  const parsed = useMemo(() => report ? parseReport(report.content) : null, [report]);

  function handleCopyReport() {
    if (report) {
      // Free accounts copy the same limited report they see on screen.
      navigator.clipboard.writeText(pro ? report.content : limitReportMarkdown(report.content));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }

  async function handleDownloadPDF() {
    if (!report) return;
    // jsPDF is ~450 KB — load it on demand so it never enters the initial
    // bundle. The button handler is async; users only pay the cost on click.
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // Helper: add text with word-wrapping
    function addWrappedText(text: string, x: number, startY: number, fontSize: number, fontStyle: string = "normal", maxWidth: number = contentWidth): number {
      pdf.setFontSize(fontSize);
      pdf.setFont("helvetica", fontStyle);
      const lines = pdf.splitTextToSize(text, maxWidth);
      for (const line of lines) {
        if (startY > 275) { pdf.addPage(); startY = margin; }
        pdf.text(line, x, startY);
        startY += fontSize * 0.45;
      }
      return startY;
    }

    // Header bar
    pdf.setFillColor(13, 115, 119); // guidr-primary
    pdf.rect(0, 0, pageWidth, 18, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("GUIDR — FORENSIC SCAM REPORT", pageWidth / 2, 11, { align: "center" });
    y = 25;

    // Case ID & Date
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Case ID: ${report.report_id}`, margin, y);
    pdf.text(`Generated: ${report.generated_at}`, pageWidth - margin, y, { align: "right" });
    y += 4;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Parse the markdown content into sections. Free accounts export the same
    // limited report shown on screen; Pro exports the full forensic detail.
    const exportContent = pro ? report.content : limitReportMarkdown(report.content);
    const sections = exportContent.split(/\n## /);
    pdf.setTextColor(30, 30, 30);

    for (const section of sections) {
      if (!section.trim()) continue;
      const lines = section.split("\n");
      const title = lines[0].replace(/^\d+\.\s*/, "").trim();
      const body = lines.slice(1).join("\n").trim();

      if (y > 265) { pdf.addPage(); y = margin; }

      // Section title
      pdf.setFillColor(240, 245, 245);
      pdf.rect(margin, y - 4, contentWidth, 8, "F");
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(13, 115, 119);
      pdf.text(title.toUpperCase(), margin + 2, y + 1);
      y += 8;

      // Section body
      pdf.setTextColor(50, 50, 50);
      const bodyLines = body.split("\n");
      for (const bLine of bodyLines) {
        const cleaned = bLine.replace(/\*\*/g, "").replace(/^-\s*/, "• ").replace(/^\|.*\|$/, "").trim();
        if (!cleaned || cleaned.startsWith("---")) continue;

        // Table row
        if (bLine.trim().startsWith("|") && !bLine.includes("---")) {
          const cells = bLine.split("|").filter(Boolean).map(c => c.replace(/\*\*/g, "").trim());
          if (cells.length >= 2 && cells[0] !== "Field") {
            pdf.setFont("helvetica", "bold");
            y = addWrappedText(`${cells[0]}:`, margin + 2, y, 9, "bold", 50);
            y -= 9 * 0.45;
            pdf.setFont("helvetica", "normal");
            y = addWrappedText(cells[1], margin + 55, y, 9, "normal", contentWidth - 55);
            y += 1;
            continue;
          }
        }

        if (cleaned.startsWith("### ")) {
          y += 2;
          y = addWrappedText(cleaned.replace("### ", ""), margin + 2, y, 10, "bold");
          y += 1;
        } else if (cleaned.startsWith("```")) {
          continue;
        } else {
          y = addWrappedText(cleaned, margin + 2, y, 9, "normal");
          y += 0.5;
        }
      }
      y += 4;
    }

    // Footer
    if (y > 265) { pdf.addPage(); y = margin; }
    y += 4;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 6;
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "italic");
    pdf.setTextColor(150, 150, 150);
    pdf.text("This report was generated by Guidr, an AI-powered scam investigation platform.", pageWidth / 2, y, { align: "center" });
    y += 4;
    pdf.text("Report contents are AI-generated and should be verified before official use.", pageWidth / 2, y, { align: "center" });

    pdf.save(`Guidr_Report_${report.report_id}.pdf`);
  }

  // Build a clean structured plain-text email body from the verdict data.
  // We deliberately do NOT dump the markdown report — it renders as raw `#`
  // and `**` noise in Gmail/Outlook web compose. The full forensic report
  // goes in the PDF attachment (which the user attaches manually since web
  // compose can't accept attachment URL params).
  const mcmcEmail = useMemo(() => {
    if (!report) return null;

    const verdict = analysis?.verdict || "SCAM";
    const confidence = analysis?.confidence || "HIGH";
    const scamType = analysis?.scam_type || "Unknown";
    const channel = analysis?.channel || analysis?.message_channel || "Not specified";
    const summary = analysis?.summary || "(no AI summary available)";
    const evidence: { finding: string; severity?: string }[] = analysis?.evidence_chain || [];

    const evidenceBlock = evidence.length
      ? evidence
          .slice(0, pro ? 5 : FREE_EVIDENCE_LIMIT)
          .map((e, i) => `${i + 1}. ${e.finding}${e.severity ? ` (${e.severity})` : ""}`)
          .join("\n") +
        (!pro && evidence.length > FREE_EVIDENCE_LIMIT
          ? "\n(Upgrade to Guidr Pro to include the full evidence chain.)"
          : "")
      : "(See attached PDF for full evidence chain.)";

    const banksBlock = detectedBanks.length
      ? `\nBANKS INVOLVED\n--------------\n` +
        detectedBanks.map((b) => `- ${b.name}\n  (See attached PDF for account/transaction detail)`).join("\n") +
        `\n`
      : "";

    const pdfName = `Guidr_Report_${report.report_id}.pdf`;

    const body =
      `Dear MCMC,\n\n` +
      `I am submitting a scam report I encountered, investigated by\n` +
      `the Guidr AI scam-investigation platform.\n\n` +
      `OVERVIEW\n--------\n` +
      `Case ID:    ${report.report_id}\n` +
      `Reported:   ${report.generated_at}\n` +
      `Verdict:    ${verdict} (${confidence} confidence)\n` +
      `Scam Type:  ${scamType}\n` +
      `Channel:    ${channel}\n\n` +
      `SUMMARY\n-------\n${summary}\n\n` +
      `KEY EVIDENCE\n------------\n${evidenceBlock}\n` +
      banksBlock +
      `\nATTACHMENT\n----------\n` +
      `The full investigation report has been saved to your\n` +
      `Downloads folder as ${pdfName}.\n` +
      `Please attach it to this email before sending.\n\n` +
      `Thank you,\n[Your name]\n\n` +
      `---\nThis case was analyzed by Guidr - guidr.veriq.my`;

    return {
      to: "aduan@mcmc.gov.my",
      subject: `Scam Report ${report.report_id} (Guidr Submission)`,
      body,
    };
  }, [report, analysis, detectedBanks, pro]);

  function handleEmailMCMC() {
    if (!mcmcEmail) return;
    // Auto-trigger the PDF download so it's already in the Downloads folder
    // when the email composer opens. The body text instructs the user to
    // attach it manually (web compose URLs can't pre-attach files).
    handleDownloadPDF();
    setShowEmailPicker(true);
  }

  function handleCallNSRC() {
    window.location.href = "tel:997";
  }

  async function handleConfirmSubmit(agencies: string[]) {
    setSubmittedAgencies(agencies);
    setShowConsentModal(false);

    // Save report to Firestore
    if (user && report) {
      try {
        const analysisRaw = sessionStorage.getItem("guidr_analysis");
        const analysis = analysisRaw ? JSON.parse(analysisRaw) : {};

        await saveCase({
          userId: user.uid,
          verdict: analysis.verdict || "SCAM",
          confidence: analysis.confidence || "HIGH",
          scamType: analysis.scam_type || "Unknown",
          summary: analysis.summary || "",
          originalMessage: analysis.originalMessage || "",
          manipulationTactics: analysis.manipulation_tactics || [],
          evidenceChain: analysis.evidence_chain || [],
          recommendedActions: analysis.recommended_actions || [],
          reportMarkdown: report.content,
          reportId: report.report_id,
          reportedToNSRC: agencies.includes("nsrc"),
          reportedToPDRM: agencies.includes("pdrm"),
          reportedToMCMC: agencies.includes("mcmc"),
        });

        await awardXP(user.uid, 25);
        await incrementStat(user.uid, "scamsReported");
      } catch (err) {
        logger.error("Error saving report to Firestore:", err);
      }
    }

    // Trigger real actions based on selected agencies
    if (agencies.includes("mcmc")) {
      handleEmailMCMC();
    }
    if (agencies.includes("nsrc")) {
      // Small delay so mailto opens first
      setTimeout(() => handleCallNSRC(), 1500);
    }
  }

  if (!report || !parsed) {
    return (
      <div className="guidr-container">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-guidr-primary border-t-transparent rounded-full animate-spin" />
        </main>
        <BottomNav />
      </div>
    );
  }

  const classificationRows = parseTable(parsed["INCIDENT CLASSIFICATION"] || "");
  const incidentSummary = (parsed["INCIDENT SUMMARY"] || "").trim();
  const suspiciousPartiesRaw = parsed["SUSPICIOUS PARTIES"] || "";
  const originalMessage = parseCodeBlock(parsed["ORIGINAL MESSAGE (VERBATIM)"] || "");
  const recommendedActions = parseList(parsed["RECOMMENDED ACTIONS FOR AUTHORITIES"] || "");
  const generatedDate = report.generated_at.split(" at")[0] || report.generated_at;

  // ── Header / classification values: prefer structured analysis data,
  // fall back to whatever the markdown table parsed. Keeps the redesigned
  // tiles populated even on older reports that only have markdown. ──
  const verdict = (analysis?.verdict as string) || "SUSPICIOUS";
  const vs = verdictStyle(verdict);
  const confidence = (analysis?.confidence as string) || "MEDIUM";
  const scamType = analysis?.scam_type || "";
  const threatLabel = scamType
    ? displayCategoryName(scamType, verdict)
    : (classificationRows.find(([l]) => /threat|type|category/i.test(l))?.[1] || "Unknown");
  const threatColor = categoryColor(scamType);
  const channel = analysis?.channel || analysis?.message_channel
    || classificationRows.find(([l]) => /channel/i.test(l))?.[1] || "Not specified";
  const language = analysis?.language_detected
    || classificationRows.find(([l]) => /language/i.test(l))?.[1] || "—";
  const reporterName = user?.fullName || "Guidr user";

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe">
        {/* ── Page Header ── */}
        <div className="flex flex-col gap-2 mb-5 guidr-animate-in guidr-stagger-1">
          <h2 className="text-2xl font-bold text-guidr-text leading-tight">
            Your scam report is ready to file
          </h2>
          <p className="text-sm text-guidr-muted">
            Review the compiled forensic data below before submitting to NSRC.
          </p>
        </div>

        {/* ── Submitted Status ── */}
        {submittedAgencies && (
          <div className="bg-green-50 border border-green-200/50 rounded-xl p-4 mb-4 flex items-start gap-3 guidr-animate-in">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-guidr-text">Report submitted successfully</p>
              <p className="text-xs text-guidr-muted mt-0.5">
                Sent to {submittedAgencies.map((id) => id === "nsrc" ? "NSRC (997)" : id === "pdrm" ? "PDRM" : "MCMC").join(", ")}
              </p>
            </div>
          </div>
        )}

        {/* ── Official Forensic Report Document ── */}
        <div className="flex flex-col gap-2.5 guidr-animate-in guidr-stagger-2">

          {/* Document header (official, dark) */}
          <div className="bg-[#1a2535] rounded-2xl p-4">
            {/* Guidr branding + live verdict badge */}
            <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-white/[0.08]">
              <div className="w-7 h-7 rounded-lg bg-guidr-primary flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200 m-0 leading-tight">Guidr Forensic Report</p>
                <p className="text-[10px] text-slate-400 m-0 leading-tight">Ready to submit to NSRC Malaysia</p>
              </div>
              <span className={`ml-auto rounded-md px-2 py-1 text-[10px] font-bold text-white shrink-0 ${vs.badge}`}>{vs.label}</span>
            </div>
            {/* Case ID + generated date */}
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Case ID</p>
                <p className="text-lg font-semibold text-[#5eead4] font-mono tracking-wide m-0">{report.report_id}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Generated</p>
                <p className="text-xs text-slate-300 m-0">{generatedDate}</p>
              </div>
            </div>
          </div>

          {/* Reporter Details */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200/60">
            <SectionHead icon="person" title="Reporter Details" />
            <div className="flex items-center gap-2.5 bg-guidr-primary-light border border-guidr-primary/30 rounded-lg p-2.5">
              <div className="w-8 h-8 rounded-full bg-guidr-primary flex items-center justify-center shrink-0 text-white text-[11px] font-semibold">
                {initialsOf(reporterName)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-guidr-text m-0 truncate">{reporterName}</p>
                <p className="text-[10px] text-guidr-text/70 m-0">Verified via Guidr profile</p>
              </div>
            </div>
          </div>

          {/* Incident Classification */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200/60">
            <SectionHead icon="gavel" title="Incident Classification" />
            <div className="grid grid-cols-2 gap-2">
              {/* Threat type */}
              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-200/60">
                <p className="text-[9px] uppercase tracking-wide text-guidr-muted mb-1">Threat type</p>
                <div className="flex items-center gap-1.5">
                  <ScamCategoryIcon scamType={scamType} size={14} className={`${threatColor.text} shrink-0`} />
                  <p className="text-xs font-semibold text-guidr-text m-0 truncate">{threatLabel}</p>
                </div>
              </div>
              {/* Verdict (color-coded) */}
              <div className={`rounded-xl p-2.5 border ${vs.tileBg} ${vs.tileBorder}`}>
                <p className="text-[9px] uppercase tracking-wide text-guidr-muted mb-1">Verdict</p>
                <p className={`text-xs font-semibold m-0 ${vs.tileText}`}>{vs.label}</p>
                <p className={`text-[9px] m-0 ${vs.tileSub}`}>
                  {confidence.charAt(0) + confidence.slice(1).toLowerCase()} confidence
                </p>
              </div>
              {/* Language */}
              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-200/60">
                <p className="text-[9px] uppercase tracking-wide text-guidr-muted mb-1">Language</p>
                <div className="flex items-center gap-1.5">
                  <SectionIcon name="globe" className="text-guidr-muted shrink-0" />
                  <p className="text-xs font-semibold text-guidr-text m-0 truncate">{language}</p>
                </div>
              </div>
              {/* Channel */}
              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-200/60">
                <p className="text-[9px] uppercase tracking-wide text-guidr-muted mb-1">Channel</p>
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-guidr-muted shrink-0">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
                  </svg>
                  <p className="text-xs font-semibold text-guidr-text m-0 truncate">{channel}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Incident Summary */}
          {incidentSummary && (
            <div className="bg-white rounded-2xl p-4 border border-gray-200/60">
              <SectionHead icon="shield" title="Incident Summary" />
              <p className="text-sm text-guidr-muted leading-relaxed m-0">{incidentSummary}</p>
            </div>
          )}

          {/* Pro upsell — replaces the gated forensic sections for free users */}
          {!pro && (
            <button
              type="button"
              onClick={() => router.push("/settings?upgrade=1")}
              className="bg-white rounded-2xl p-4 border border-dashed border-guidr-primary/40 flex items-center gap-3 text-left active:scale-[0.99] transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-guidr-primary/15 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-guidr-text leading-snug">Full forensic report with Guidr Pro</p>
                <p className="text-xs text-guidr-muted leading-snug mt-0.5">
                  Unlock the evidence chain, suspicious parties, verbatim message &amp; recommended actions, included in the PDF export too.
                </p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {/* Suspicious Parties — keep per-entity FLAGGED cards (Pro only) */}
          {pro && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200/60">
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-guidr-text mb-2.5">
              <SectionIcon name="warning" className="text-amber-500" /> Suspicious Parties
            </h3>
            {suspiciousPartiesRaw.includes("###") ? (
              <div className="flex flex-col gap-1.5">
                {/* Splitting on "###" leaves a fragment for whatever came
                    BEFORE the first heading — usually just "\n" or whitespace,
                    which passes filter(Boolean). Parse blocks first, then
                    discard any with no title and no detail lines so we don't
                    render an empty card with just a stranded "FLAGGED" badge. */}
                {suspiciousPartiesRaw
                  .split("###")
                  .map((block) => {
                    const lines = block.trim().split("\n");
                    const title = lines[0]?.trim() || "";
                    const details = lines
                      .slice(1)
                      .filter((l) => l.trim().startsWith("-"))
                      .map((l) => l.replace(/^-\s*/, "").replace(/\*\*/g, "").trim());
                    return { title, details };
                  })
                  .filter(({ title, details }) => title || details.length > 0)
                  .map(({ title, details }, i) => (
                    <div key={i} className="bg-amber-50/60 border border-amber-200/70 rounded-xl p-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-guidr-text">{title}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200/50 shrink-0">FLAGGED</span>
                      </div>
                      {details.map((d, j) => (
                        <p key={j} className="text-xs text-guidr-muted m-0">{d}</p>
                      ))}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200/70 rounded-lg p-2.5 flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-xs text-amber-900 m-0 leading-relaxed">See evidence chain for full entity details.</p>
              </div>
            )}
          </div>
          )}

          {/* Original Message (verbatim) — Pro only */}
          {pro && originalMessage && (
            <div className="bg-white rounded-2xl p-4 border border-gray-200/60">
              <SectionHead icon="message" title="Original Message" />
              <div className="bg-[#1a2535] rounded-lg p-3 text-xs text-[#5eead4] font-mono whitespace-pre-wrap leading-relaxed">
                {originalMessage}
              </div>
            </div>
          )}

          {/* Recommended Actions — numbered for NSRC review (Pro only) */}
          {pro && recommendedActions.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-gray-200/60">
              <SectionHead
                icon="checklist"
                title="Recommended Actions"
                right={<span className="text-[9px] text-guidr-muted">For NSRC review</span>}
              />
              <div className="flex flex-col gap-1.5">
                {recommendedActions.map((action, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-2.5 border border-gray-200/60 flex items-start gap-2">
                    <div className="w-[22px] h-[22px] rounded-md bg-guidr-primary flex items-center justify-center shrink-0 text-white text-[10px] font-semibold">
                      {i + 1}
                    </div>
                    <p className="text-xs text-guidr-text m-0 mt-0.5">{action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* End-of-report divider */}
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-1.5 text-guidr-muted">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
              </svg>
              <span className="text-[9px] uppercase tracking-wider">End of Forensic Report</span>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        </div>

        {/* ── Action Bar ── */}
        <div className="flex flex-col gap-3 mt-5 guidr-animate-in guidr-stagger-3">
          {/* Copy to clipboard */}
          <button
            onClick={handleCopyReport}
            className="w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-xl bg-guidr-primary text-white font-semibold text-base shadow-md hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {copySuccess ? "Copied!" : "Copy to clipboard"}
          </button>

          {/* Secondary row */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDownloadPDF}
              className="flex flex-col items-center justify-center gap-1 py-3 px-4 rounded-xl bg-white border border-gray-300 text-guidr-muted text-xs font-bold shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              Download PDF
            </button>
            <button
              onClick={handleEmailMCMC}
              className="flex flex-col items-center justify-center gap-1 py-3 px-4 rounded-xl bg-white border border-gray-300 text-guidr-muted text-xs font-bold shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
              </svg>
              Email MCMC
            </button>
          </div>

          {/* ── Banks involved (only if any detected in the message) ── */}
          {detectedBanks.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-900">Bank mentioned in this scam</p>
                  <p className="text-xs text-amber-800/80 leading-relaxed mt-0.5">
                    If money was transferred or is being requested, contact the bank&apos;s fraud line <strong>immediately</strong>. They can sometimes freeze a transaction before it completes.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {detectedBanks.map((bank) => (
                  <div key={bank.name} className="rounded-lg bg-white border border-amber-200 p-3 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-guidr-text">{bank.name}</p>
                      <p className="text-xs text-guidr-muted truncate">
                        Hotline: <span className="font-mono">{bank.hotline}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`tel:${bank.hotline.replace(/[^\d+]/g, "")}`}
                        className="px-2.5 py-1.5 rounded-md bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
                      >
                        Call
                      </a>
                      <button
                        type="button"
                        onClick={() => setActiveBankModal(bank)}
                        className="px-2.5 py-1.5 rounded-md bg-guidr-primary text-white text-xs font-bold hover:bg-guidr-primary-dark transition-colors"
                      >
                        Email
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-amber-800/70 leading-relaxed">
                ⚠ Always verify the latest hotline at the bank&apos;s official website before calling. Scammers also impersonate banks.
              </p>
            </div>
          )}

          {/* Call NSRC 997 — emergency block (opens consent + submit flow) */}
          {!submittedAgencies && (
            <div className="mt-1 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-guidr-muted text-center mb-2">
                Need immediate assistance?
              </p>
              <button
                onClick={() => setShowConsentModal(true)}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl bg-red-500 text-white font-semibold text-base shadow-md hover:bg-red-600 active:scale-[0.98] transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                Call NSRC 997
              </button>
            </div>
          )}

          {/* Standalone Call NSRC after submission */}
          {submittedAgencies && (
            <button
              onClick={handleCallNSRC}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl bg-white border-2 border-guidr-primary text-guidr-primary font-semibold text-base hover:bg-guidr-primary-light/20 active:scale-[0.98] transition-all mt-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Call NSRC 997
            </button>
          )}
        </div>
      </main>
      <BottomNav />

      <SubmitConsentModal
        isOpen={showConsentModal}
        onClose={() => setShowConsentModal(false)}
        onConfirm={handleConfirmSubmit}
        reportId={report.report_id}
      />

      {mcmcEmail && (
        <EmailComposerModal
          isOpen={showEmailPicker}
          onClose={() => setShowEmailPicker(false)}
          to={mcmcEmail.to}
          subject={mcmcEmail.subject}
          body={mcmcEmail.body}
          title="Send report to MCMC"
          description={`We've started downloading ${`Guidr_Report_${report.report_id}.pdf`} to your Downloads folder. Pick your email provider and remember to attach the PDF before sending.`}
        />
      )}

      {activeBankModal && report && (
        <EmailComposerModal
          isOpen={!!activeBankModal}
          onClose={() => setActiveBankModal(null)}
          // Most banks publish a contact form rather than a fraud-specific
          // inbox. We use the verifyAt URL as a fallback "To" so users can
          // also paste this into the bank's own form if the email bounces.
          to={activeBankModal.email || activeBankModal.verifyAt}
          subject={`Urgent: Potential scam involving ${activeBankModal.name} (Case ${report.report_id})`}
          body={
            `Dear ${activeBankModal.name} Fraud Team,\n\n` +
            `I'm reporting a scam that mentioned ${activeBankModal.name}. ` +
            `A scam investigation was performed by the Guidr platform, ` +
            `case ID ${report.report_id}, dated ${report.generated_at}.\n\n` +
            (analysis?.summary ? `SUMMARY\n-------\n${analysis.summary}\n\n` : "") +
            `If a transaction has already been initiated, please advise ` +
            `whether it can still be stopped or reversed. The full ` +
            `forensic report (Guidr_Report_${report.report_id}.pdf) is ` +
            `attached for your reference.\n\n` +
            `Verify the latest fraud contact at: ${activeBankModal.verifyAt}\n\n` +
            `Thank you,\n[Your name]\n[Your contact number]\n\n` +
            `---\nReport prepared by Guidr - guidr.veriq.my`
          }
          title={`Contact ${activeBankModal.name}`}
          description={`Hotline: ${activeBankModal.hotline}. If money was transferred, calling is usually faster, since emails may take days to triage.`}
        />
      )}
    </div>
  );
}
