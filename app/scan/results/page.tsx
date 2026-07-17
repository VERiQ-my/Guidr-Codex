"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/app/components/BottomNav";
import InvestigatingView from "../InvestigatingView";
import VerdictView from "../VerdictView";
import ScanQueueGame from "../ScanQueueGame";
import { useUser } from "@/app/context/UserContext";
import { auth } from "@/lib/firebase";
import { saveCase, awardXP, incrementStat, incrementScamType, subscribeScan, type ScanDoc } from "@/lib/firestore";

// sessionStorage key holding the id of an in-flight durable scan, so a reload
// or returning to the app re-attaches to it instead of starting over.
const ACTIVE_SCAN_KEY = "guidr_active_scan";

interface ToolStep {
  tool: string;
  displayName: string;
  status: "running" | "done";
  result?: any;
}

type Phase = "queued" | "investigating" | "verdict" | "error";
type ErrorKind = "timeout" | "busy" | "format" | "failed" | "stream" | "limit";

// Client-side guard: if the investigation hasn't produced a verdict in this
// long *after it starts*, give up and show a retry rather than spinning forever.
// (The queue wait before the scan starts has its own, longer deadline.)
// MUST stay comfortably above the server's own budget (the durable run writes a
// terminal verdict/error by ~105s, see scan/run/route.ts) plus Firestore
// propagation, so this only fires if the result doc never lands at all — not as
// the normal path. If this is lower than the server budget, the client gives up
// on perfectly good scans that are about to finish.
const CLIENT_TIMEOUT_MS = 125_000;

// Queue tunables: how often to ask whether a slot has freed, and how long to
// wait in line before telling the user to come back later.
const QUEUE_POLL_MS = 2_500;
const QUEUE_DEADLINE_MS = 5 * 60_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const VALID_VERDICTS = new Set(["SCAM", "SUSPICIOUS", "LIKELY_SAFE"]);

export default function ScanResultsPage() {
  const router = useRouter();
  const { user } = useUser();
  const [phase, setPhase] = useState<Phase>("queued");
  const [statusMessage, setStatusMessage] = useState("Reading the message...");
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [toolCalls, setToolCalls] = useState<any[]>([]);
  const [originalMessage, setOriginalMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKind, setErrorKind] = useState<ErrorKind>("failed");
  // Durable (background) scan tracking. When set, an effect subscribes to the
  // scans/{id} doc; the scan runs server-side and survives leaving the app.
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  // Once true, the server owns the queue slot (it heartbeats it in the
  // background), so the client must NOT release it on pagehide.
  const durableRef = useRef(false);
  // One-time notice letting the user know the scan continues in the background.
  const [showBgNotice, setShowBgNotice] = useState(false);
  const hasStarted = useRef(false);
  const savedCaseId = useRef<string | null>(null);
  const inputRef = useRef<{ message: string; image?: string; imageMimeType?: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotVerdictRef = useRef(false);
  const gotErrorRef = useRef(false);
  // Queue/slot tracking. runIdRef invalidates stale async loops on retry.
  const runIdRef = useRef(0);
  const ticketIdRef = useRef<string | null>(null);
  const slotTokenRef = useRef<string | null>(null);
  const slotRetriesRef = useRef(0);
  const tokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    // Carry forward the original message (for the verdict view / report),
    // when it's still available this session.
    try {
      const inputRaw = sessionStorage.getItem("guidr_scan_input");
      if (inputRaw) {
        const input = JSON.parse(inputRaw);
        inputRef.current = input;
        setOriginalMessage(input.message || "");
      }
    } catch {
      /* non-fatal */
    }

    // If a durable scan is already in flight (e.g. the user left and came
    // back, or reloaded), re-attach to it rather than starting a new one. The
    // scan kept running server-side, so the verdict may already be waiting.
    let activeScanId: string | null = null;
    try {
      const raw = sessionStorage.getItem(ACTIVE_SCAN_KEY);
      if (raw) activeScanId = JSON.parse(raw).scanId || null;
    } catch {
      /* ignore */
    }
    if (activeScanId) {
      durableRef.current = true;
      attachToScan(activeScanId);
      return;
    }

    if (!inputRef.current) {
      router.replace("/scan");
      return;
    }

    startAnalysis();

    // NOTE: intentionally no abort-on-unmount here. React Strict Mode (dev)
    // mounts → unmounts → remounts; aborting on that throwaway unmount while
    // the `hasStarted` guard blocks the remount would kill the scan before it
    // ever runs. The watchdog timeout is cleared in failWith/verdict/stream-end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Best-effort: free our queue slot/position if the tab is closed or the user
  // leaves to an external page. SPA navigation falls back to the server-side
  // TTL sweep. Kept out of the main effect (and off React unmount) so Strict
  // Mode's dev mount→unmount→remount cycle can't fire it spuriously.
  useEffect(() => {
    function releaseBeacon() {
      const ticketId = ticketIdRef.current;
      // For a durable (background) scan the server holds and heartbeats the
      // slot — releasing it here would kill an in-progress scan when the user
      // simply switches tabs. Leave it to the server / TTL sweep.
      if (durableRef.current) return;
      if (!ticketId || gotVerdictRef.current || gotErrorRef.current) return;
      try {
        fetch("/api/scan/release", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}),
          },
          body: JSON.stringify({ ticketId }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("pagehide", releaseBeacon);
    return () => window.removeEventListener("pagehide", releaseBeacon);
  }, []);

  function failWith(kind: ErrorKind, message: string) {
    if (gotVerdictRef.current) return; // verdict already shown; ignore late errors
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    gotErrorRef.current = true;
    setErrorKind(kind);
    setErrorMessage(message);
    setPhase("error");
  }

  // Acquire a Firebase ID token, capped so a stuck refresh can't hang the flow.
  async function getIdToken(): Promise<string | undefined> {
    try {
      const tokenPromise = auth.currentUser?.getIdToken();
      if (!tokenPromise) return undefined;
      return await Promise.race([
        tokenPromise,
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 8000)),
      ]);
    } catch {
      return undefined;
    }
  }

  function authHeaders(token?: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  // Entry point. Joins the global scan queue, then runs the scan once a
  // concurrency slot is granted. `isSlotRetry` is set only when we re-enter
  // after losing a slot (403), so the retry counter isn't reset.
  async function startAnalysis(isSlotRetry = false) {
    const input = inputRef.current;
    if (!input) {
      router.replace("/scan");
      return;
    }

    const runId = ++runIdRef.current; // invalidate any in-flight queue loop

    // Reset transient state (supports retry-in-place)
    gotVerdictRef.current = false;
    gotErrorRef.current = false;
    durableRef.current = false;
    ticketIdRef.current = null;
    slotTokenRef.current = null;
    if (!isSlotRetry) slotRetriesRef.current = 0;
    setActiveScanId(null);
    try { sessionStorage.removeItem(ACTIVE_SCAN_KEY); } catch { /* ignore */ }
    setToolSteps([]);
    setAnalysis(null);
    setToolCalls([]);
    setStatusMessage("Reading the message...");
    setPhase("queued");
    setQueuePosition(null);

    const token = await getIdToken();
    tokenRef.current = token;
    if (runId !== runIdRef.current) return;

    const slot = await acquireSlot(token, runId);
    if (!slot || runId !== runIdRef.current) return;

    await startRun(input, token, slot);
  }

  // Join the queue and resolve once a slot frees. Returns the granted slot, or
  // null if it failed / was superseded by a newer run.
  async function acquireSlot(
    token: string | undefined,
    runId: number
  ): Promise<{ ticketId: string; slotToken: string } | null> {
    const deadline = Date.now() + QUEUE_DEADLINE_MS;

    const enqueue = async (): Promise<string | null> => {
      const res = await fetch("/api/scan/enqueue", {
        method: "POST",
        headers: authHeaders(token),
        body: "{}",
      });
      if (res.status === 401) {
        failWith("failed", "Your session has expired. Please sign in again, then retry.");
        return null;
      }
      if (res.status === 429) {
        let msg = "You're scanning very quickly. Please wait a moment and try again.";
        let kind: ErrorKind = "busy";
        try {
          const data = await res.json();
          msg = data.message || msg;
          // Daily free-scan allowance exhausted — distinct from "system busy".
          if (data.error === "scan_limit") kind = "limit";
        } catch { /* keep default */ }
        failWith(kind, msg);
        return null;
      }
      if (!res.ok) {
        failWith("failed", "Couldn't join the scan queue. Please try again.");
        return null;
      }
      const data = await res.json().catch(() => ({}));
      return data.ticketId || null;
    };

    let ticketId = await enqueue();
    if (!ticketId || runId !== runIdRef.current) return null;
    ticketIdRef.current = ticketId;

    while (runId === runIdRef.current) {
      if (Date.now() > deadline) {
        failWith("busy", "We're handling a lot of scans right now. Please try again in a few minutes.");
        return null;
      }

      let res: Response;
      try {
        res = await fetch("/api/scan/admit", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ ticketId }),
        });
      } catch {
        await wait(QUEUE_POLL_MS);
        continue;
      }
      if (runId !== runIdRef.current) return null;
      if (!res.ok) {
        await wait(QUEUE_POLL_MS);
        continue;
      }

      const data = await res.json().catch(() => ({}));
      if (data.admitted) {
        slotTokenRef.current = data.slotToken;
        return { ticketId, slotToken: data.slotToken };
      }
      if (data.expired) {
        // Our ticket aged out while polling — rejoin the back of the line.
        ticketId = await enqueue();
        if (!ticketId || runId !== runIdRef.current) return null;
        ticketIdRef.current = ticketId;
        continue;
      }
      setQueuePosition(typeof data.position === "number" ? data.position : null);
      await wait(QUEUE_POLL_MS);
    }
    return null;
  }

  // Start a durable, background-safe scan once a slot is held. The scan runs
  // server-side and is written to scans/{scanId}; we subscribe to that doc.
  // Falls back to the streaming endpoint if the server can't persist (e.g.
  // local dev without admin credentials).
  async function startRun(
    input: { message: string; image?: string; imageMimeType?: string },
    token: string | undefined,
    slot: { ticketId: string; slotToken: string }
  ) {
    setPhase("investigating");
    setStatusMessage("Reading the message...");

    try {
      const body: any = {
        message: input.message,
        ticketId: slot.ticketId,
        slotToken: slot.slotToken,
      };
      if (input.image && input.imageMimeType) {
        body.image = input.image;
        body.imageMimeType = input.imageMimeType;
      }

      const res = await fetch("/api/scan/run", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        failWith("failed", "Your session has expired. Please sign in again, then retry.");
        return;
      }
      if (res.status === 429) {
        let msg = "You're scanning very quickly. Please wait a moment and try again.";
        let kind: ErrorKind = "busy";
        try {
          const data = await res.json();
          msg = data.message || msg;
          if (data.error === "scan_limit") kind = "limit";
        } catch { /* keep default */ }
        failWith(kind, msg);
        return;
      }
      if (res.status === 403) {
        // Lost our slot before the scan started — rejoin the queue (bounded).
        if (slotRetriesRef.current < 2) {
          slotRetriesRef.current++;
          startAnalysis(true);
        } else {
          failWith("busy", "We're handling a lot of scans right now. Please try again.");
        }
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (data.durable && data.scanId) {
        // Hand the scan off to the server. From here it survives the user
        // leaving the app; we just watch the result doc.
        durableRef.current = true;
        try {
          sessionStorage.setItem(ACTIVE_SCAN_KEY, JSON.stringify({ scanId: data.scanId }));
          if (localStorage.getItem("guidr_bg_scan_ack") !== "1") setShowBgNotice(true);
        } catch { /* ignore */ }
        attachToScan(data.scanId);
      } else {
        // Server can't persist — use the live streaming path instead.
        await runStream(input, token, slot);
      }
    } catch (err) {
      // Network error starting the durable run — fall back to streaming.
      logger.error("Durable scan start error:", err);
      await runStream(input, token, slot);
    }
  }

  // Subscribe to a durable scan's result doc and arm the client watchdog.
  function attachToScan(scanId: string) {
    setPhase("investigating");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!gotVerdictRef.current && !gotErrorRef.current) {
        failWith("timeout", "The investigation took too long. Your scan keeps running in the background, so please try again or check back shortly.");
      }
    }, CLIENT_TIMEOUT_MS);
    setActiveScanId(scanId);
  }

  // Render progress / verdict / error from a durable scan doc snapshot.
  function handleScanDoc(scan: ScanDoc | null) {
    if (!scan) return; // doc not created yet, or removed
    if (gotVerdictRef.current || gotErrorRef.current) return;

    if (scan.statusMessage) setStatusMessage(scan.statusMessage);
    if (scan.toolSteps) {
      setToolSteps(
        scan.toolSteps.map((s) => ({
          tool: s.tool,
          displayName: s.displayName,
          status: s.status,
          result: s.result,
        }))
      );
    }

    if (scan.status === "error") {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      try { sessionStorage.removeItem(ACTIVE_SCAN_KEY); } catch { /* ignore */ }
      setActiveScanId(null);
      failWith(
        (scan.errorKind as ErrorKind) || "failed",
        scan.errorMessage || "Something went wrong during the analysis. Please try again."
      );
      return;
    }

    if (scan.status === "done" && scan.analysis) {
      const a = scan.analysis;
      if (!VALID_VERDICTS.has(a.verdict)) {
        try { sessionStorage.removeItem(ACTIVE_SCAN_KEY); } catch { /* ignore */ }
        setActiveScanId(null);
        failWith("format", "We couldn't complete the analysis this time. Please try again.");
        return;
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      gotVerdictRef.current = true;
      setAnalysis(a);
      // Rebuild tool_calls (with args) so the NSRC report can extract entities.
      setToolCalls(
        (scan.toolSteps || [])
          .filter((s) => s.status === "done")
          .map((s) => ({ tool: s.tool, args: s.args, result: s.result }))
      );
      autoSaveAndTrack(a);
      try { sessionStorage.removeItem(ACTIVE_SCAN_KEY); } catch { /* ignore */ }
      setActiveScanId(null); // unsubscribe — result is in hand
      setTimeout(() => setPhase("verdict"), 800);
    }
  }

  // Rules-independent safety net for a durable scan. The realtime listener
  // below only delivers if the deployed Firestore rules permit reading
  // scans/{scanId} AND the streaming transport reaches the browser. When either
  // fails, the scan still finishes server-side but the verdict never arrives —
  // the page just spins to the watchdog. Polling the Admin-SDK-backed status
  // route (which bypasses client rules) guarantees the result lands either way.
  // handleScanDoc is idempotent, so whichever channel reports terminal first wins.
  async function pollScanStatus(scanId: string) {
    if (gotVerdictRef.current || gotErrorRef.current) return;
    try {
      const token = tokenRef.current || (await getIdToken());
      tokenRef.current = token;
      const res = await fetch("/api/scan/status", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ scanId }),
      });
      if (!res.ok) return; // 404 (doc not seeded yet) / transient — try again next tick
      const data = await res.json().catch(() => null);
      if (data && data.status && data.status !== "missing") {
        handleScanDoc(data as ScanDoc);
      }
    } catch {
      /* best-effort — the listener may still deliver */
    }
  }

  // Lifecycle of the durable-scan listener (+ polling fallback). Keyed on
  // activeScanId so React Strict Mode's double-invoke resolves to a single live
  // subscription, and navigating away cleans both up.
  useEffect(() => {
    if (!activeScanId) return;
    const unsub = subscribeScan(activeScanId, handleScanDoc);
    void pollScanStatus(activeScanId); // immediate check, then on an interval
    const poll = setInterval(() => void pollScanStatus(activeScanId), 2_500);
    return () => {
      unsub();
      clearInterval(poll);
    };
    // handleScanDoc/pollScanStatus only close over stable setters/refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScanId]);

  // Run the streaming analysis once a slot is held.
  async function runStream(
    input: { message: string; image?: string; imageMimeType?: string },
    token: string | undefined,
    slot: { ticketId: string; slotToken: string }
  ) {
    setPhase("investigating");
    setStatusMessage("Reading the message...");

    const controller = new AbortController();
    abortRef.current = controller;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => controller.abort("timeout"), CLIENT_TIMEOUT_MS);

    try {
      const body: any = {
        message: input.message,
        ticketId: slot.ticketId,
        slotToken: slot.slotToken,
      };
      if (input.image && input.imageMimeType) {
        body.image = input.image;
        body.imageMimeType = input.imageMimeType;
      }

      const res = await fetch("/api/analyze-stream", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 401) {
        failWith("failed", "Your session has expired. Please sign in again, then retry.");
        return;
      }
      if (res.status === 429) {
        let msg = "You're scanning very quickly. Please wait a moment and try again.";
        try { msg = (await res.json()).message || msg; } catch { /* keep default */ }
        failWith("busy", msg);
        return;
      }
      if (res.status === 403) {
        // Lost our slot between admit and stream start (rare; reclaimed by the
        // sweep). Transparently rejoin the queue a bounded number of times.
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (slotRetriesRef.current < 2) {
          slotRetriesRef.current++;
          startAnalysis(true);
        } else {
          failWith("busy", "We're handling a lot of scans right now. Please try again.");
        }
        return;
      }
      if (!res.ok || !res.body) {
        throw new Error("Failed to start analysis");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              handleStreamEvent(currentEvent, data);
            } catch {
              // Skip malformed JSON
            }
            currentEvent = "";
          }
        }
      }

      // Stream ended. If we never received a verdict or an explicit error,
      // the connection closed prematurely — surface a retryable error.
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (!gotVerdictRef.current && !gotErrorRef.current) {
        failWith("stream", "The connection closed before the analysis finished. Please try again.");
      }
    } catch (err: any) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const aborted = controller.signal.aborted || err?.name === "AbortError";
      if (aborted && controller.signal.reason === "timeout") {
        failWith("timeout", "The investigation took too long. Please try again.");
      } else if (aborted) {
        // Navigated away or replaced by a retry — no error UI needed.
      } else {
        logger.error("Stream error:", err);
        failWith("failed", err?.message || "Something went wrong during the analysis. Please try again.");
      }
    }
  }

  // Auto-save case + update personal & global analytics on verdict
  async function autoSaveAndTrack(verdictAnalysis: any) {
    if (!user || savedCaseId.current) return; // Already saved or no user
    try {
      const caseId = await saveCase({
        userId: user.uid,
        verdict: verdictAnalysis.verdict,
        confidence: verdictAnalysis.confidence,
        scamType: verdictAnalysis.scam_type || "unknown",
        summary: verdictAnalysis.summary || "",
        originalMessage,
        manipulationTactics: verdictAnalysis.manipulation_tactics || [],
        evidenceChain: verdictAnalysis.evidence_chain || [],
        recommendedActions: verdictAnalysis.recommended_actions || [],
        reportedToNSRC: false,
        reportedToPDRM: false,
        reportedToMCMC: false,
      });
      savedCaseId.current = caseId;

      // Personal analytics: XP + casesScanned
      await awardXP(user.uid, 10);
      await incrementStat(user.uid, "casesScanned");

      // Global analytics: update scam type trends. The normalizer inside
      // incrementScamType skips safe verdicts ("None"/"none"/"safe"/etc),
      // so we just hand over whatever the model returned.
      if (verdictAnalysis.scam_type) {
        await incrementScamType(verdictAnalysis.scam_type);
      }

      // Guardian Alerts now fire SERVER-SIDE from the scan pipeline itself
      // (app/api/lib/guardian-alert.ts, called by both the durable DO path and
      // the SSE route) — so they reach guardians even when this page never
      // loads because the ward closed the app mid-scan. Triggering here too
      // would double-alert.

      logger.log("[Guidr] Case auto-saved:", caseId);
    } catch (err) {
      logger.error("[Guidr] Auto-save error:", err);
    }
  }

  function handleStreamEvent(event: string, data: any) {
    switch (event) {
      case "status":
        setStatusMessage(data.message);
        break;

      case "tool_start":
        setToolSteps((prev) => [
          ...prev,
          {
            tool: data.tool,
            displayName: data.display_name,
            status: "running",
          },
        ]);
        break;

      case "tool_complete":
        setToolSteps((prev) =>
          prev.map((step) =>
            step.tool === data.tool && step.status === "running"
              ? { ...step, status: "done", result: data.result }
              : step
          )
        );
        setToolCalls((prev) => [
          ...prev,
          { tool: data.tool, args: data.args, result: data.result },
        ]);
        break;

      case "verdict": {
        // Guard: only show a verdict that's actually well-formed.
        const a = data.analysis;
        if (!a || !VALID_VERDICTS.has(a.verdict)) {
          failWith("format", "We couldn't complete the analysis this time. Please try again.");
          break;
        }
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        gotVerdictRef.current = true;
        setAnalysis(a);
        // Auto-save case and update analytics immediately
        autoSaveAndTrack(a);
        // Brief pause so user sees all steps complete before transition
        setTimeout(() => {
          setPhase("verdict");
        }, 800);
        break;
      }

      case "error":
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        failWith(
          (data.kind as ErrorKind) || "failed",
          data.message || "An error occurred during analysis."
        );
        break;

      case "done":
        // Verdict event handles the transition
        break;
    }
  }

  const live = phase === "queued" || phase === "investigating";

  // Best-effort share of the verdict from the header (Web Share API → clipboard).
  async function handleShareResult() {
    if (!analysis) return;
    const text = `Guidr result: ${analysis.verdict} (${analysis.confidence} confidence). ${analysis.summary || ""}`.trim();
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Guidr investigation result", text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* user cancelled or unsupported — no-op */
    }
  }

  return (
    <div className="guidr-container">
      {/* ── Sub-page header ── */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-3 py-2.5 pt-safe-top bg-white/95 backdrop-blur-md border-b border-gray-100">
        <button
          type="button"
          onClick={() => router.push("/scan")}
          aria-label="Back to scan"
          className="w-9 h-9 flex items-center justify-center rounded-full text-slate-600 hover:bg-gray-100 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-guidr-text">
          {phase === "verdict" ? "Investigation Result" : "Investigation"}
        </span>
        {live ? (
          <span className="flex items-center gap-1.5 bg-guidr-primary-light border border-guidr-primary/20 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-guidr-primary animate-pulse" />
            <span className="text-[10px] font-bold tracking-wider text-guidr-primary">LIVE</span>
          </span>
        ) : phase === "verdict" ? (
          <button
            type="button"
            onClick={handleShareResult}
            aria-label="Share result"
            className="w-9 h-9 flex items-center justify-center rounded-full text-slate-600 hover:bg-gray-100 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
        ) : (
          <span className="w-9" aria-hidden="true" />
        )}
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar px-5 py-5 pb-safe">
        {(phase === "queued" || phase === "investigating") && (
          <div className="flex flex-col gap-4">
            {showBgNotice && (
              <div className="flex items-start gap-2.5 rounded-xl bg-guidr-primary-light/40 border border-guidr-primary/20 px-3.5 py-3 guidr-animate-in">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-guidr-text leading-snug">
                    <strong className="font-semibold">This scan now runs in the background.</strong> You can switch apps or lock your phone. We&apos;ll finish the investigation and your result will be here when you return.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    try { localStorage.setItem("guidr_bg_scan_ack", "1"); } catch { /* ignore */ }
                    setShowBgNotice(false);
                  }}
                  aria-label="Dismiss"
                  className="shrink-0 text-guidr-primary text-[11px] font-bold hover:underline"
                >
                  Got it
                </button>
              </div>
            )}
            <InvestigatingView
              statusMessage={
                phase === "queued"
                  ? "High demand right now. Your scan will start automatically."
                  : statusMessage
              }
              toolSteps={toolSteps}
              queued={phase === "queued"}
            />
            <ScanQueueGame position={queuePosition} showQueueBanner={phase === "queued"} />
          </div>
        )}

        {phase === "verdict" && analysis && (
          <VerdictView
            analysis={analysis}
            originalMessage={originalMessage}
            toolCalls={toolCalls}
          />
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 guidr-animate-in">
            <div className="w-20 h-20 rounded-full bg-guidr-red-light flex items-center justify-center">
              {errorKind === "timeout" ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e05252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e05252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
            </div>
            <h2 className="text-xl font-bold text-guidr-text text-center">
              {errorKind === "timeout"
                ? "Taking too long"
                : errorKind === "busy"
                  ? "System Busy"
                  : errorKind === "limit"
                    ? "Daily scan limit reached"
                    : "Analysis didn't finish"}
            </h2>
            <div className="bg-white/80 p-4 rounded-xl border border-gray-100 shadow-sm w-full">
              <p className="text-sm text-guidr-muted text-center leading-relaxed">
                {errorMessage}
              </p>
            </div>
            {errorKind === "limit" ? (
              <button
                onClick={() => router.push("/settings?upgrade=1")}
                className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-4 bg-guidr-primary text-white rounded-xl font-semibold hover:bg-guidr-primary-dark transition-all active:scale-[0.98] shadow-lg shadow-guidr-primary/25"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Upgrade to Guidr Pro
              </button>
            ) : (
              <button
                onClick={() => startAnalysis()}
                className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-4 bg-guidr-primary text-white rounded-xl font-semibold hover:bg-guidr-primary-dark transition-all active:scale-[0.98] shadow-lg shadow-guidr-primary/25"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Try Again
              </button>
            )}
            <button
              onClick={() => router.push("/scan")}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 text-guidr-muted font-medium hover:text-guidr-text transition-colors"
            >
              Back to Scan
            </button>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
