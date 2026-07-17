"use client";

import { useMemo } from "react";

interface ToolStep {
  tool: string;
  displayName: string;
  status: "running" | "done";
  result?: any;
}

interface InvestigatingViewProps {
  statusMessage: string;
  toolSteps: ToolStep[];
  // When true, the scan hasn't started yet — it's waiting in the queue. The log
  // is shown in a "queued" state alongside the game on the same page.
  queued?: boolean;
}

type StepStatus = "done" | "current" | "pending";

// ── Inline forensic icons (stroke=currentColor so the parent controls colour) ──
const ICON_PROPS = {
  width: 13,
  height: 13,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function FileTextIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function DatabaseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// Canonical forensic checklist. Live tool events light these up in order; the
// `read` step is implicitly done the moment the scan starts streaming.
const STEPS: { key: string; label: string; icon: () => React.ReactElement }[] = [
  { key: "read", label: "Reading message and extracting entities", icon: FileTextIcon },
  { key: "check_url_safety", label: "Checking URL safety", icon: LinkIcon },
  { key: "verify_company_existence", label: "Verifying company registration", icon: BuildingIcon },
  { key: "check_recruiter_pattern", label: "Cross-referencing contacts", icon: UsersIcon },
  { key: "search_scam_reports", label: "Searching public reports", icon: DatabaseIcon },
];

const KNOWN_KEYS = new Set(STEPS.map((s) => s.key));

function StepRow({
  status,
  label,
  icon,
  delay = 0,
}: {
  status: StepStatus;
  label: string;
  icon: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="flex items-center gap-2.5"
      style={{ animation: `guidr-fade-in-up 0.3s ease-out ${delay}s both` }}
    >
      {/* Status indicator */}
      {status === "done" ? (
        <span className="w-5 h-5 rounded-full bg-guidr-primary flex items-center justify-center shrink-0">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      ) : status === "current" ? (
        <span className="w-5 h-5 rounded-full border-2 border-[#5eead4] border-t-transparent animate-spin shrink-0" />
      ) : (
        <span className="w-5 h-5 rounded-full border-[1.5px] border-[#2d3f55] shrink-0" />
      )}

      {/* Entity icon */}
      <span
        className="shrink-0 flex"
        style={{ color: status === "current" ? "#5eead4" : "#334155" }}
      >
        {icon}
      </span>

      {/* Label */}
      <span
        className={
          status === "done"
            ? "text-[13px] text-[#64748b] line-through"
            : status === "current"
              ? "text-[13px] text-[#5eead4] font-medium"
              : "text-[13px] text-[#475569]/60"
        }
      >
        {label}
      </span>
    </div>
  );
}

export default function InvestigatingView({ statusMessage, toolSteps, queued = false }: InvestigatingViewProps) {
  // Resolve each canonical step's live status + preferred label.
  const rows = useMemo(() => {
    return STEPS.map((step) => {
      if (step.key === "read") {
        return { ...step, status: (queued ? "pending" : "done") as StepStatus, label: step.label };
      }
      const live = toolSteps.find((t) => t.tool === step.key);
      const status: StepStatus = !live ? "pending" : live.status === "done" ? "done" : "current";
      return { ...step, status, label: live?.displayName || step.label };
    });
  }, [toolSteps, queued]);

  // Any tools the model ran that aren't in the canonical list get appended.
  const extras = useMemo(
    () => toolSteps.filter((t) => !KNOWN_KEYS.has(t.tool)),
    [toolSteps]
  );

  const totalChecks = STEPS.length;
  const completedChecks = rows.filter((r) => r.status === "done").length;
  const hasCurrent = rows.some((r) => r.status === "current") || extras.some((e) => e.status === "running");

  const progress = useMemo(() => {
    if (queued) return 0;
    const pct = ((completedChecks + (hasCurrent ? 0.5 : 0)) / totalChecks) * 100;
    return Math.min(Math.max(Math.round(pct), 8), 95);
  }, [queued, completedChecks, hasCurrent, totalChecks]);

  const remaining = totalChecks - completedChecks;
  const estSeconds = Math.max(4, remaining * 7);

  return (
    <div className="flex flex-col gap-4 w-full guidr-animate-in">
      {/* ── Status row ── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="relative flex w-2.5 h-2.5 shrink-0">
            <span className="absolute inline-flex w-full h-full rounded-full bg-guidr-primary/40 animate-ping" />
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-guidr-primary" />
          </span>
          <h1 className="text-lg font-bold text-guidr-text tracking-tight">
            {queued ? "Preparing your scan…" : "Investigating..."}
          </h1>
        </div>
        <p className="text-xs text-guidr-muted pl-5 leading-relaxed">{statusMessage}</p>
      </div>

      {/* ── Live Forensic Log (dark card) ── */}
      <section className="rounded-2xl bg-[#1a2535] border border-[#334155] p-3.5">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5eead4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span className="text-xs font-semibold text-[#e2e8f0]">Live Forensic Log</span>
          </div>
          {queued ? (
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-orange-400/10 border border-orange-400/40">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-[10px] font-semibold text-orange-300">QUEUED</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-[#5eead4]/10 border border-[#5eead4]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5eead4] animate-pulse" />
              <span className="text-[10px] font-semibold text-[#5eead4]">RUNNING</span>
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          {rows.map((row, i) => (
            <StepRow
              key={row.key}
              status={row.status}
              label={row.label}
              icon={<row.icon />}
              delay={i * 0.05}
            />
          ))}
          {extras.map((extra, i) => (
            <StepRow
              key={`extra-${extra.tool}-${i}`}
              status={extra.status === "done" ? "done" : "current"}
              label={extra.displayName}
              icon={<SearchIcon />}
              delay={(rows.length + i) * 0.05}
            />
          ))}
        </div>
      </section>

      {/* ── Global Analysis Progress ── */}
      <section className="bg-white rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.08)] p-3.5 flex flex-col gap-2 border border-gray-100">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold tracking-widest text-guidr-muted uppercase">
            Global Analysis Progress
          </span>
          <span className="text-sm font-bold text-guidr-primary">{progress}%</span>
        </div>
        <div className="w-full h-2 bg-guidr-bg rounded-full overflow-hidden">
          <div
            className="h-full bg-guidr-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-guidr-muted">
            {queued
              ? "Waiting for an available slot"
              : `${completedChecks} of ${totalChecks} checks complete`}
          </span>
          <span className="text-[10px] text-guidr-muted">
            {queued
              ? "Starts automatically"
              : remaining <= 0
                ? "Finalizing…"
                : `~${estSeconds} seconds left`}
          </span>
        </div>
      </section>
    </div>
  );
}
