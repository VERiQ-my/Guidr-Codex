"use client";

import { jsPDF } from "jspdf";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, CircleHelp, ClipboardList, Download, PhoneCall, RotateCcw, ShieldAlert } from "lucide-react";
import { displayScamCategory } from "@/lib/scam-categories";
import type { Analysis } from "@/lib/scan-types";

const details = {
  SCAM: { title: "This looks like a scam", tone: "bg-red-50 text-red-700", icon: ShieldAlert },
  SUSPICIOUS: { title: "This needs extra care", tone: "bg-amber-50 text-amber-800", icon: AlertTriangle },
  LIKELY_SAFE: { title: "No strong scam signals found", tone: "bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
};

type ReportCardProps = { title: string; body: string; action: string; icon: typeof PhoneCall; href?: string; urgent?: boolean; onClick?: () => void };
function ReportCard({ title, body, action, icon: Icon, href, urgent, onClick }: ReportCardProps) {
  const className = urgent
    ? "group relative block overflow-hidden rounded-2xl border border-red-700 bg-red-700 p-1 text-left text-white shadow-lg shadow-red-900/20 transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/30"
    : "rounded-xl border border-black/10 p-4 text-left transition hover:border-guidr-primary hover:bg-guidr-primary/[0.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-guidr-primary/15";
  const content = urgent ? <div className="p-4 sm:p-5"><div className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-red-700 shadow-sm"><Icon size={22} /></span><div><p className="text-[11px] font-bold tracking-[0.13em] text-red-100">URGENT FRAUD SUPPORT</p><strong className="mt-0.5 block text-xl leading-tight">{title}</strong></div></div><p className="mt-3 text-sm leading-5 text-red-50">{body}</p><span className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 font-bold text-red-700 shadow-sm transition group-hover:bg-red-50">{action}<PhoneCall size={18} /></span><p className="mt-2 text-center text-xs text-red-100">Opens your phone dialler</p></div> : <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-guidr-primary/10 text-guidr-primary"><Icon size={18} /></span><div><strong className="block">{title}</strong><p className="mt-1 text-sm leading-5 text-guidr-muted">{body}</p><span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-guidr-primary">{action}<ArrowUpRight size={15} /></span></div></div>;
  return href ? <a href={href} aria-label={urgent ? `${action}: ${title}` : title} className={className}>{content}</a> : <button type="button" onClick={onClick} className={className}>{content}</button>;
}
function downloadReport(analysis: Analysis) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210; const margin = 16; const contentWidth = pageWidth - margin * 2; let y = 0;
  const clean = (value: string) => value.replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/[^\x20-\x7E]/g, " ");
  const verdictLabel = analysis.verdict === "SCAM" ? "HIGH RISK" : analysis.verdict === "SUSPICIOUS" ? "VERIFY CAREFULLY" : "NO IMMEDIATE DANGER";
  const drawHeader = (firstPage = false) => {
    doc.setFillColor(8, 107, 93); doc.rect(0, 0, pageWidth, firstPage ? 52 : 21, "F"); doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(firstPage ? 10 : 9); doc.text("GUIDR", margin, firstPage ? 14 : 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(firstPage ? 18 : 10); doc.text(firstPage ? "Scan report" : "Guidr scan report", margin, firstPage ? 27 : 13);
    if (firstPage) { doc.setFontSize(9); doc.setTextColor(221, 242, 237); doc.text("Generated " + new Date().toLocaleString("en-MY"), margin, 39); }
    doc.setTextColor(21, 36, 35); y = firstPage ? 66 : 34;
  };
  const addFooter = (page: number, total: number) => {
    doc.setDrawColor(220, 229, 226); doc.line(margin, 282, pageWidth - margin, 282); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(93, 107, 105);
    doc.text("Guidr - a calm second opinion", margin, 288); doc.text("Page " + page + " of " + total, pageWidth - margin, 288, { align: "right" });
  };
  const nextPage = () => { doc.addPage(); drawHeader(); };
  const spaceFor = (height: number) => { if (y + height > 270) nextPage(); };
  const heading = (title: string) => {
    spaceFor(16); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(8, 107, 93); doc.text(clean(title), margin, y);
    doc.setDrawColor(201, 222, 217); doc.line(margin, y + 4, pageWidth - margin, y + 4); y += 12;
  };
  const body = (value: string, indent = 0) => {
    const lines = doc.splitTextToSize(clean(value), contentWidth - indent); spaceFor(lines.length * 5 + 3); doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(47, 65, 62);
    doc.text(lines, margin + indent, y); y += lines.length * 5 + 3;
  };
  const bulletList = (items: string[]) => items.forEach((item) => {
    const lines = doc.splitTextToSize(clean(item), contentWidth - 8); spaceFor(lines.length * 5 + 4); doc.setFillColor(8, 107, 93); doc.circle(margin + 1.5, y - 1.2, 1.25, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(47, 65, 62); doc.text(lines, margin + 7, y); y += lines.length * 5 + 4;
  });

  drawHeader(true);
  doc.setFillColor(8, 107, 93); doc.roundedRect(margin, y, 54, 9, 2, 2, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255); doc.text(verdictLabel, margin + 27, y + 5.8, { align: "center" }); y += 18;
  heading("Assessment");
  [["Verdict", details[analysis.verdict].title], ["Signal confidence", analysis.confidence + "%"], ["Pattern", displayScamCategory(analysis.scam_type)]].forEach(([label, value]) => {
    spaceFor(9); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(93, 107, 105); doc.text(clean(label), margin, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(21, 36, 35); doc.text(clean(value), margin + 42, y); y += 8;
  });
  y += 3; body(analysis.summary);
  if (analysis.evidence_chain.length) { y += 4; heading("What stood out"); bulletList(analysis.evidence_chain); }
  if (analysis.manipulation_tactics.length) { y += 4; heading("Possible tactics used"); bulletList(analysis.manipulation_tactics); }
  y += 4; heading("Recommended next steps");
  analysis.recommended_actions.forEach((action, index) => {
    const lines = doc.splitTextToSize(clean(action), contentWidth - 13); spaceFor(lines.length * 5 + 8); doc.setFillColor(8, 107, 93); doc.circle(margin + 3, y - 1.2, 3, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255); doc.text(String(index + 1), margin + 3, y + 1.4, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(47, 65, 62); doc.text(lines, margin + 10, y); y += lines.length * 5 + 4;
  });
  const pages = doc.getNumberOfPages(); for (let page = 1; page <= pages; page += 1) { doc.setPage(page); addFooter(page, pages); }
  doc.save("guidr-scan-report-" + new Date().toISOString().slice(0, 10) + ".pdf");
}

export default function VerdictView({ analysis }: { analysis: Analysis }) {
  const router = useRouter(); const verdict = details[analysis.verdict]; const Icon = verdict.icon;
  const assessment = analysis.verdict === "LIKELY_SAFE" ? "Likely safe" : analysis.verdict === "SCAM" ? "Scam" : "Suspicious";
  const presentation = {
    SCAM: { label: "HIGH RISK", accent: "bg-red-600", badge: "bg-red-700 text-white", note: "Stop responding. Do not send money, share a code, or open more links.", signals: "border-red-300 bg-red-50/60" },
    SUSPICIOUS: { label: "VERIFY FIRST", accent: "bg-amber-500", badge: "bg-amber-600 text-white", note: "Pause here. Verify the sender through an official channel before you reply.", signals: "border-amber-300 bg-amber-50/60" },
    LIKELY_SAFE: { label: "NO URGENT RISK", accent: "bg-emerald-600", badge: "bg-emerald-700 text-white", note: "No strong scam signals were found. Continue carefully and stay alert for changes.", signals: "border-emerald-300 bg-emerald-50/60" },
  }[analysis.verdict];

  return <section className="scan-panel scan-panel-elevated guidr-animate-in overflow-hidden">
    <header className={"scan-verdict-hero p-5 sm:p-7 " + verdict.tone}>
      <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3.5"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm"><Icon size={23} /></span><div><p className="text-xs font-bold tracking-[0.13em] opacity-70">GUIDR ASSESSMENT</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">{verdict.title}</h1></div></div><span className={"shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] " + presentation.badge}>{presentation.label}</span></div>
      <p className="mt-4 max-w-xl text-sm leading-6 opacity-85">{analysis.summary}</p>
      <div className="mt-5 rounded-xl border border-black/5 bg-white/65 p-4"><p className="text-xs font-bold tracking-[0.1em] opacity-65">RECOMMENDED FIRST MOVE</p><p className="mt-1.5 text-sm font-semibold leading-5">{presentation.note}</p></div>
      <div className="mt-5 flex items-center gap-4"><strong className="text-3xl leading-none">{analysis.confidence}%</strong><div className="min-w-0 flex-1"><div className="h-2 overflow-hidden rounded-full bg-black/10"><div className={"h-full rounded-full " + presentation.accent} style={{ width: analysis.confidence + "%" }} /></div><p className="mt-1.5 text-xs opacity-70">Signal confidence - not a guarantee of safety</p></div></div>
    </header>

    <div className="p-5 sm:p-6">{analysis.assessment_mode === "partial" && <div role="status" className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm leading-5 text-amber-800"><CircleHelp size={17} className="mt-0.5 shrink-0" /><p><strong>Partial AI assessment</strong><br />One independent analysis lane was unavailable. Verify this result through official channels before acting.</p></div>}{analysis.assessment_mode === "fallback" && <div role="status" className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm leading-5 text-amber-800"><CircleHelp size={17} className="mt-0.5 shrink-0" /><p><strong>Limited pattern check</strong><br />Live AI review is temporarily unavailable. This result is based on common risk cues in the supplied text and cannot confirm safety.</p></div>}
      {analysis.verdict === "SCAM" && <section className="mb-7" aria-labelledby="immediate-help"><h2 id="immediate-help" className="mb-3 flex items-center gap-2 font-bold text-red-800"><PhoneCall size={18} />If money was sent, act now</h2><ReportCard urgent title="Call NSRC 997 now" body="Call first, then contact your bank. Acting quickly can help protect your account and preserve your options." action="Call 997" icon={PhoneCall} href="tel:997" /></section>}
      <section aria-labelledby="verdict-summary"><h2 id="verdict-summary" className="flex items-center gap-2 font-bold"><ClipboardList size={18} className="text-guidr-primary" />At a glance</h2><dl className="mt-3 overflow-hidden rounded-xl border border-black/8 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-black/8"><div className="p-3.5"><dt className="text-xs font-medium text-guidr-muted">Assessment</dt><dd className="mt-1 text-sm font-bold">{assessment}</dd></div><div className="border-t border-black/8 p-3.5 sm:border-t-0"><dt className="text-xs font-medium text-guidr-muted">Signal confidence</dt><dd className="mt-1 text-sm font-bold">{analysis.confidence}%</dd></div><div className="border-t border-black/8 p-3.5 sm:border-t-0"><dt className="text-xs font-medium text-guidr-muted">Pattern</dt><dd className="mt-1 text-sm font-bold">{displayScamCategory(analysis.scam_type)}</dd></div></dl></section>

      {analysis.evidence_chain.length > 0 && <section className="mt-7" aria-labelledby="signals"><h2 id="signals" className="flex items-center gap-2 font-bold"><CircleHelp size={18} className="text-guidr-primary" />What stood out</h2><ul className="mt-3 space-y-2.5">{analysis.evidence_chain.map((item) => <li key={item} className={"flex gap-2.5 border-l-2 p-3 text-sm leading-5 text-guidr-muted " + presentation.signals}><ChevronRight size={16} className="mt-0.5 shrink-0 text-guidr-primary" />{item}</li>)}</ul></section>}

      {analysis.manipulation_tactics.length > 0 && <section className="mt-7" aria-labelledby="tactics"><h2 id="tactics" className="font-bold">Possible tactics used</h2><div className="mt-3 flex flex-wrap gap-2">{analysis.manipulation_tactics.map((tactic) => <span key={tactic} className="rounded-full border border-guidr-primary/15 bg-guidr-primary/[0.04] px-3 py-1.5 text-sm font-medium text-guidr-primary">{tactic}</span>)}</div></section>}

      <section className="mt-7 border-t border-black/5 pt-6" aria-labelledby="next-actions"><h2 id="next-actions" className="font-bold">What to do next</h2><p className="mt-1 text-sm text-guidr-muted">Follow these steps and keep any screenshots, numbers, and payment details.</p><ol className="mt-4 space-y-3">{analysis.recommended_actions.map((action, index) => <li key={action} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-guidr-primary text-xs font-bold text-white">{index + 1}</span><p className="pt-0.5 text-sm leading-5 text-guidr-muted">{action}</p></li>)}</ol></section>

      {analysis.verdict !== "LIKELY_SAFE" && <section className="mt-7 border-t border-black/5 pt-6" aria-labelledby="report-options"><h2 id="report-options" className="font-bold">{analysis.verdict === "SCAM" ? "Other reporting options" : "Need to report this?"}</h2><p className="mt-1 text-sm text-guidr-muted">If money was sent, act quickly. Otherwise, preserve the evidence and use the relevant reporting channel.</p>{analysis.verdict !== "SCAM" && <div className="mt-4"><ReportCard urgent title="Call NSRC 997 now" body="If money was sent, call first, then contact your bank." action="Call 997" icon={PhoneCall} href="tel:997" /></div>}<div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-guidr-primary"><a className="hover:underline underline-offset-4" href="https://aduan.mcmc.gov.my/" target="_blank" rel="noreferrer">Report a message to MCMC</a><a className="hover:underline underline-offset-4" href="https://www.rmp.gov.my/" target="_blank" rel="noreferrer">Make a police report</a></div></section>}

      <div className="mt-8 grid gap-3 border-t border-black/5 pt-6 sm:grid-cols-2"><button type="button" onClick={() => router.push("/scan")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-guidr-primary px-4 font-semibold text-white transition hover:bg-guidr-primary/90"><RotateCcw size={17} />Scan another message</button><button type="button" onClick={() => downloadReport(analysis)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-4 font-semibold transition hover:border-guidr-primary hover:text-guidr-primary"><Download size={17} />Download structured PDF</button></div>
    </div>
  </section>;
}
