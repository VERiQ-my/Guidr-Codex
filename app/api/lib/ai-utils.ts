/**
 * Shared resilience helpers for the AI analysis pipeline:
 *  - withTimeout: bound any promise so a stuck model/tool call can't hang forever
 *  - callWithRetry: retry transient (rate-limit / 5xx / network) failures with backoff
 *  - extractJson / validateAnalysis / repairToJson: guarantee a well-formed verdict
 */

import { Type } from "@google/genai";

// ── Tunables ──
// These MUST be strictly nested: a single turn (incl. its retries) must fit well
// inside the overall deadline, which must fit inside the route's durable budget,
// which must fit inside the platform `maxDuration`. The agent enforces this at
// runtime by passing the *remaining* budget into each call (see scan-runner.ts),
// so a slow turn can never run past the overall deadline. The values below are
// just the per-step ceilings.
//
//   per-turn (30s) < overall (95s) < durable budget (105s) < maxDuration (120s)
//
// Sized for a constrained Vertex backend (observed 15–31s/turn) that needs ~2–3
// turns + tool latency. A high ceiling does NOT slow a healthy scan — it only
// bounds the worst case; fast turns finish far below it. The real latency wins
// come from co-locating Vertex with the Vercel region and using a quota'd
// project (see ai-client.ts) — not from squeezing these numbers.
export const PER_CALL_TIMEOUT_MS = 30_000; // single model turn (ceiling)
export const OVERALL_DEADLINE_MS = 95_000; // whole investigation (ceiling)
// Don't even start a model turn with less than this much budget left — better to
// fail fast with a clean "timeout" than to start a call we know can't finish.
export const MIN_CALL_BUDGET_MS = 4_000;
export const MAX_RETRIES = 2;

export type Verdict = "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE";

export interface Analysis {
  verdict: Verdict;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  scam_type: string;
  language_detected?: string;
  manipulation_tactics: string[];
  evidence_chain: { finding: string; source: string; severity: string }[];
  recommended_actions: string[];
  summary: string;
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reject if `promise` doesn't settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** Heuristic: is this error worth retrying? */
export function isTransient(err: any): boolean {
  if (err instanceof TimeoutError) return true;
  const status = err?.status ?? err?.code ?? err?.response?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("unavailable") ||
    msg.includes("deadline") ||
    msg.includes("overloaded") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up")
  );
}

/** Run `fn`, retrying transient failures with exponential backoff. */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelay?: number; label?: string } = {}
): Promise<T> {
  const { retries = MAX_RETRIES, baseDelay = 600, label = "ai-call" } = opts;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === retries) throw err;
      const delay = baseDelay * 2 ** attempt;
      console.warn(`[ai-utils] ${label} failed (attempt ${attempt + 1}/${retries + 1}); retrying in ${delay}ms:`, (err as any)?.message || err);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** Strip code fences and pull the first balanced-looking JSON object out of text. */
export function extractJson(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to substring extraction */
  }

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const candidate = cleaned.slice(first, last + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      /* give up */
    }
  }
  return null;
}

const VERDICTS = new Set(["SCAM", "SUSPICIOUS", "LIKELY_SAFE"]);

/** Coerce/validate a parsed object into a safe Analysis, or null if unusable. */
export function validateAnalysis(obj: any): Analysis | null {
  if (!obj || typeof obj !== "object") return null;
  if (!VERDICTS.has(obj.verdict)) return null;

  const arr = (v: any) => (Array.isArray(v) ? v : []);
  return {
    verdict: obj.verdict,
    confidence: ["HIGH", "MEDIUM", "LOW"].includes(obj.confidence) ? obj.confidence : "MEDIUM",
    scam_type: typeof obj.scam_type === "string" ? obj.scam_type : "unknown",
    language_detected: typeof obj.language_detected === "string" ? obj.language_detected : undefined,
    manipulation_tactics: arr(obj.manipulation_tactics).filter((x: any) => typeof x === "string"),
    evidence_chain: arr(obj.evidence_chain)
      .filter((e: any) => e && typeof e === "object")
      .map((e: any) => ({
        finding: String(e.finding ?? ""),
        source: String(e.source ?? ""),
        severity: ["HIGH", "MEDIUM", "LOW"].includes(e.severity) ? e.severity : "MEDIUM",
      })),
    recommended_actions: arr(obj.recommended_actions).filter((x: any) => typeof x === "string"),
    summary: typeof obj.summary === "string" ? obj.summary : "",
  };
}

/** Structured-output schema used by the JSON-repair pass. */
export const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, enum: ["SCAM", "SUSPICIOUS", "LIKELY_SAFE"] },
    confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
    scam_type: { type: Type.STRING },
    language_detected: { type: Type.STRING },
    manipulation_tactics: { type: Type.ARRAY, items: { type: Type.STRING } },
    evidence_chain: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          finding: { type: Type.STRING },
          source: { type: Type.STRING },
          severity: { type: Type.STRING },
        },
        required: ["finding", "source", "severity"],
      },
    },
    recommended_actions: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
  },
  required: [
    "verdict",
    "confidence",
    "scam_type",
    "manipulation_tactics",
    "evidence_chain",
    "recommended_actions",
    "summary",
  ],
};

/**
 * Last-resort: ask the model (no tools, JSON mode) to coerce free-form text
 * into the required schema. Returns a validated Analysis or null.
 */
export async function repairToJson(ai: any, model: string, rawText: string): Promise<Analysis | null> {
  if (!rawText?.trim()) return null;
  try {
    const result: any = await withTimeout(
      ai.models.generateContent({
        model,
        contents: `The following is a scam-analysis result that is not valid JSON. Convert it into the required JSON object. Preserve the findings; if a field is missing, infer a sensible value.\n\n${rawText}`,
        config: { responseMimeType: "application/json", responseSchema: ANALYSIS_SCHEMA },
      }),
      PER_CALL_TIMEOUT_MS,
      "json-repair"
    );
    return validateAnalysis(extractJson(result.text || ""));
  } catch (err) {
    console.error("[ai-utils] JSON repair failed:", (err as any)?.message || err);
    return null;
  }
}
