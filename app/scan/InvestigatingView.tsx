"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleDashed, SearchCheck, ShieldCheck } from "lucide-react";

const checks = ["extract_message_details", "review_requests_and_links", "assess_scam_signals", "prepare_safety_advice"];
const displayTool = (tool: string) => ({
  extract_message_details: "Reading the supplied content",
  review_requests_and_links: "Reviewing requests and links",
  assess_scam_signals: "Assessing scam signals",
  prepare_safety_advice: "Preparing safer next steps",
}[tool] || tool.replaceAll("_", " "));

type ScanTarget = { message: string; sourceChannel: string; senderContact?: string; image?: string };

export default function InvestigatingView({ message, tools, target }: { message: string; tools: string[]; target?: ScanTarget }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeIndex = tools.length ? Math.min(tools.length - 1, checks.length - 1) : -1;
  const completedChecks = activeIndex > 0 ? activeIndex : 0;
  const progress = useMemo(() => {
    const elapsedProgress = Math.min(18, Math.floor(elapsedSeconds / 2) * 2);
    const checkProgress = tools.length ? 18 + Math.min(tools.length, checks.length) * 18 : 0;
    return Math.min(92, Math.max(8, elapsedProgress, checkProgress));
  }, [elapsedSeconds, tools.length]);
  const currentLabel = activeIndex >= 0 ? displayTool(checks[activeIndex]) : "Preparing the first check";

  return <section className="scan-panel overflow-hidden">
    <div className="px-5 py-7 text-center sm:px-8 sm:py-9">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-guidr-primary text-white shadow-md shadow-guidr-primary/15"><SearchCheck size={24} /></div>
      <p className="mt-4 text-xs font-bold tracking-[0.13em] text-guidr-primary">GUIDR IS CHECKING</p>
      <h1 className="mt-2 text-2xl font-bold">Taking a careful look</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-guidr-muted" aria-live="polite">{message}</p>

      <div className="mx-auto mt-7 max-w-md text-left">
        <div className="flex items-end justify-between gap-3"><div><p className="text-sm font-semibold">{currentLabel}</p><p className="mt-0.5 text-xs text-guidr-muted">Usually ready in under two minutes.</p></div><strong className="text-3xl leading-none text-guidr-primary" aria-label={progress + " percent complete"}>{progress}%</strong></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-guidr-primary/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Scan progress"><div className="h-full rounded-full bg-guidr-primary transition-[width] duration-700 ease-out" style={{ width: progress + "%" }} /></div>
      </div>

      {target && <div className="mx-auto mt-5 max-w-md border-t border-black/5 pt-4 text-left"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-guidr-muted">Scanning</p><span className="text-xs font-semibold text-guidr-primary">{target.sourceChannel}</span></div><p className="mt-1.5 truncate text-sm font-medium">{target.image && !target.message.trim() ? "Screenshot attached for review" : target.message.trim() || "Attached content for review"}</p>{target.senderContact && <p className="mt-1 truncate text-xs text-guidr-muted">From {target.senderContact}</p>}</div>}
    </div>

    <div className="border-t border-black/5 px-5 py-5 sm:px-8">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold">Safety checks</p><p className="text-xs text-guidr-muted">{completedChecks} of {checks.length} complete</p></div>
      <div className="mt-4 flex items-start">
        {checks.map((tool, index) => {
          const isCurrent = index === activeIndex; const isComplete = index < activeIndex;
          return <div key={tool} className="relative flex flex-1 flex-col items-center text-center"><span className="relative z-10 flex size-7 items-center justify-center rounded-full bg-white">{isComplete ? <span className="flex size-6 items-center justify-center rounded-full bg-guidr-primary text-white"><Check size={13} /></span> : isCurrent ? <span className="flex size-6 items-center justify-center rounded-full bg-guidr-primary/15 text-guidr-primary"><CircleDashed className="animate-spin" size={15} /></span> : <span className="size-2 rounded-full bg-black/15" />}</span>{index < checks.length - 1 && <span className={"absolute left-1/2 top-3 h-px w-full " + (index < activeIndex ? "bg-guidr-primary" : "bg-black/10")} />}<span className={"mt-2 max-w-20 text-[11px] leading-4 " + (isCurrent || isComplete ? "font-medium text-guidr-ink" : "text-guidr-muted")}>{isCurrent ? "Checking" : isComplete ? "Checked" : "Next"}</span></div>;
        })}
      </div>
      <div className="mt-5 flex items-start gap-3 border-t border-black/5 pt-4 text-sm text-guidr-muted"><ShieldCheck className="mt-0.5 shrink-0 text-guidr-primary" size={17} />Keep this page open while the check continues.</div>
    </div>
  </section>;
}
