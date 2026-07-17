"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import InvestigatingView from "../InvestigatingView";
import ScanQueueGame from "../ScanQueueGame";
import VerdictView from "../VerdictView";
import type { Analysis, ScanEvent, ScanInput } from "@/lib/scan-types";
import { VALID_VERDICTS } from "@/lib/scan-types";
import { awardXP, incrementScamType, incrementStat, saveCase } from "@/lib/firestore";
import { logger } from "@/lib/logger";

const QUEUE_POLL_MS = 2_500;
const QUEUE_DEADLINE_MS = 300_000;
const CLIENT_TIMEOUT_MS = 125_000;
type Phase = "queue" | "investigating" | "verdict" | "error";
type Admission = { admitted: boolean; slotToken?: string; position: number; expired?: boolean };

async function post<T>(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "The scan request could not be completed.");
  return data;
}

export default function ResultsPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("queue");
  const [queuePosition, setQueuePosition] = useState(0);
  const [message, setMessage] = useState("Preparing your scan.");
  const [tools, setTools] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<Analysis>();
  const [scanTarget, setScanTarget] = useState<ScanInput>();
  const terminal = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const slotToken = useRef<string | undefined>(undefined);
  const abortController = useRef<AbortController | undefined>(undefined);

  const releaseSlot = useCallback(() => {
    if (!slotToken.current) return;
    const token = slotToken.current;
    slotToken.current = undefined;
    void fetch("/api/scan/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotToken: token }), keepalive: true });
  }, []);

  const finish = useCallback(async (value: Analysis) => {
    if (terminal.current || !VALID_VERDICTS.includes(value.verdict)) return;
    terminal.current = true;
    if (watchdog.current) clearTimeout(watchdog.current);
    setAnalysis(value);
    releaseSlot();
    await Promise.allSettled([saveCase(value), awardXP(10), incrementStat("casesScanned"), incrementScamType(value.scam_type)]);
    sessionStorage.removeItem("guidr_active_scan");
    setTimeout(() => setPhase("verdict"), 500);
  }, [releaseSlot]);

  const handleEvent = useCallback((event: ScanEvent) => {
    if (event.message) setMessage(event.message);
    if (event.type === "tool_start" && event.tool) setTools((value) => value.includes(event.tool!) ? value : [...value, event.tool!]);
    if (event.type === "verdict" && event.analysis) void finish(event.analysis);
    if (event.type === "error") {
      if (watchdog.current) clearTimeout(watchdog.current);
      releaseSlot();
      setPhase("error");
    }
  }, [finish, releaseSlot]);

  const runStream = useCallback(async (input: ScanInput, ticketId: string, token: string) => {
    abortController.current = new AbortController();
    const response = await fetch("/api/analyze-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, ticketId, slotToken: token }),
      signal: abortController.current.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "The scan could not be started." }));
      throw new Error(body.error || "The scan could not be started.");
    }
    if (!response.body) throw new Error("Streaming is unavailable.");
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const packets = buffer.split("\n\n"); buffer = packets.pop() || "";
      for (const packet of packets) {
        const data = packet.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        if (data) handleEvent(JSON.parse(data) as ScanEvent);
      }
    }
  }, [handleEvent]);

  useEffect(() => {
    let cancelled = false;
    const inputText = sessionStorage.getItem("guidr_scan_input");
    if (!inputText) { router.replace("/scan"); return; }
    let input: ScanInput;
    try { input = JSON.parse(inputText) as ScanInput; } catch { router.replace("/scan"); return; }
    const start = async () => {
      try {
        const queued = await post<{ ticketId: string }>("/api/scan/enqueue", {});
        setScanTarget(input);
        const started = Date.now(); let admission: Admission;
        do {
          admission = await post<Admission>("/api/scan/admit", { ticketId: queued.ticketId });
          setQueuePosition(admission.position);
          if (admission.expired) throw new Error("The queue entry expired. Please start again.");
          if (!admission.admitted) await new Promise((resolve) => setTimeout(resolve, QUEUE_POLL_MS));
        } while (!admission.admitted && Date.now() - started < QUEUE_DEADLINE_MS);
        if (!admission.admitted || !admission.slotToken) throw new Error("The review queue is busy. Please try again shortly.");
        if (cancelled) return;
        slotToken.current = admission.slotToken;
        setPhase("investigating");
        watchdog.current = setTimeout(() => { if (!terminal.current) setMessage("Your scan is taking longer than usual. Please keep this page open."); }, CLIENT_TIMEOUT_MS);
        await runStream(input, queued.ticketId, admission.slotToken);
        if (!terminal.current && !cancelled) throw new Error("The scan ended before a result was returned.");
      } catch (error) {
        logger.error("scan_flow_failed", error);
        releaseSlot();
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          setMessage(error instanceof Error ? error.message : "This check could not be completed.");
          setPhase("error");
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      abortController.current?.abort();
      if (watchdog.current) clearTimeout(watchdog.current);
      releaseSlot();
    };
  }, [releaseSlot, router, runStream]);

  if (phase === "verdict" && analysis) return <main className="scan-page min-h-full px-4 py-7 pb-safe sm:px-5 sm:py-10"><VerdictView analysis={analysis} /></main>;
  if (phase === "error") return <main className="scan-page min-h-full px-4 py-7 pb-safe sm:px-5 sm:py-10"><section className="rounded-lg bg-white p-6"><h1 className="text-xl font-bold">We could not finish that check</h1><p className="mt-2 text-guidr-muted">{message}</p><button className="mt-5 rounded-lg bg-guidr-primary px-4 py-2 text-white" onClick={() => router.replace("/scan")}>Return to scan</button></section></main>;
  if (phase === "queue") return <main className="scan-page min-h-full px-4 py-7 pb-safe sm:px-5 sm:py-10"><ScanQueueGame position={queuePosition} /></main>;
  return <main className="scan-page min-h-full px-4 py-7 pb-safe sm:px-5 sm:py-10"><InvestigatingView message={message} tools={tools} target={scanTarget} /></main>;
}