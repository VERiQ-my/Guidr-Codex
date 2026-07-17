/**
 * Core agentic scam investigation, decoupled from any transport.
 *
 * The same investigation drives two routes:
 *   - /api/analyze-stream  → emits Server-Sent Events to a connected client
 *   - /api/scan/run        → emits into a Firestore doc so the scan keeps
 *                            running (and finishing) even if the client leaves
 *
 * Callers provide an `emit(event, data)` sink and own the queue slot, heartbeat,
 * quota, and any persistence. `runScanAgent` never throws — failures are
 * emitted as an "error" event and reported via the returned result.
 */

import { Type } from "@google/genai";
import { executeTool, getToolDisplayName } from "./real-tools";
import { ai, MODEL_ID } from "./ai-client";
import {
  callWithRetry,
  withTimeout,
  extractJson,
  validateAnalysis,
  repairToJson,
  isTransient,
  TimeoutError,
  PER_CALL_TIMEOUT_MS,
  OVERALL_DEADLINE_MS,
  MIN_CALL_BUDGET_MS,
} from "./ai-utils";
import { CANONICAL_SCAM_CATEGORIES, SAFE_CATEGORY } from "@/lib/scam-categories";

export type ScanEmit = (event: string, data: any) => void;

export interface ScanInput {
  message?: string;
  image?: string;
  imageMimeType?: string;
}

export interface ScanOutcome {
  ok: boolean;
  analysis?: any;
}

// ── Tool declarations (shared) ──
const tools: any[] = [
  {
    functionDeclarations: [
      {
        name: "check_url_safety",
        description: "Check if a URL is suspicious using Google Safe Browsing and web intelligence. Returns domain reputation, threat flags, and public reports. Use this for any URL found in the message.",
        parameters: {
          type: Type.OBJECT,
          properties: { url: { type: Type.STRING, description: "The URL to investigate" } },
          required: ["url"],
        },
      },
      {
        name: "verify_company_existence",
        description: "Check if a company name corresponds to a real, registered business in Malaysia using live web intelligence. Use for any company or brand mentioned.",
        parameters: {
          type: Type.OBJECT,
          properties: { company_name: { type: Type.STRING, description: "Company or brand name" } },
          required: ["company_name"],
        },
      },
      {
        name: "check_recruiter_pattern",
        description: "Check if a recruiter contact (email, phone, or messaging handle) matches known job scam patterns using pattern analysis and web intelligence. Use for any recruiter contact info found.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            contact: { type: Type.STRING, description: "Recruiter's email, phone, or handle" },
            claimed_company: { type: Type.STRING, description: "What company they claim to represent" },
          },
          required: ["contact"],
        },
      },
      {
        name: "search_scam_reports",
        description: "Search for public scam reports about this entity using live web intelligence across Reddit, forums, and Malaysian scam databases. Use to find prior victim reports.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            entity: { type: Type.STRING, description: "What to search for" },
            entity_type: { type: Type.STRING, description: "phone, account, company, or url" },
          },
          required: ["entity", "entity_type"],
        },
      },
    ],
  },
];

const SYSTEM_INSTRUCTION = `You are an expert AI scam investigator for Malaysian users, protecting fresh graduates from job scams.

## YOUR GOAL: Accurate, balanced verdicts
You must avoid BOTH false positives (flagging real offers as scams) AND false negatives (missing real scams). Analyze the FULL CONTEXT of the message.

## Analysis Process:

### Step 1: Entity Verification & Cross-Platform Intelligence (use tools)
Extract and verify all entities: URLs, company names, contacts, bank accounts. CALL THE TOOLS.
**CRITICAL — call tools in PARALLEL:** In your FIRST response, emit a function call for EVERY entity that needs checking, all together in that single turn (the platform runs them concurrently). Do NOT verify entities one at a time across multiple turns — that is far slower and can exhaust the time budget before you reach a verdict. Only make a follow-up tool call if a result genuinely reveals a new entity you couldn't see initially. Don't issue redundant calls for the same entity.
Your tools will cross-reference across: Reddit, Facebook, Twitter/X, Instagram, Threads, Lowyat.NET, Semakmule, Google Reviews, news articles, and government advisories.
When reporting findings, cite the specific platform where evidence was found (e.g., "Reddit r/malaysia reported...", "Facebook group warning...").

### Step 2: Assess Communication Authenticity
After tool results, determine whether this message ACTUALLY comes from the claimed organization:

**Strong Legitimacy Signals (points TOWARD safe):**
- Sender uses an official company email domain (e.g., @maybank.com, @petronas.com, @tmrnd.com.my)
- Sender has a full name AND job title/department
- Professional formatting with company signature block
- Interview details are specific (date, time, platform, session ID)
- No financial requests whatsoever
- The user previously applied to this company
- The message references a specific role the user applied for

**Strong Scam Signals (points TOWARD scam):**
- Message received via WhatsApp, Telegram, SMS, or social media DM (not email)
- Sender uses personal email (Gmail, Yahoo, Outlook) for a corporate role
- No sender name or generic name ("HR Department", "Hiring Team")
- Salary is unusually high for simple work (e.g., RM5000/month for data entry)
- Requests for upfront payment, fees, deposits, or money transfers
- Requests for IC/MyKad, passport, bank details BEFORE an official offer
- Artificial urgency ("reply within 24 hours or lose the offer")
- Vague job description with unrealistic promises
- The company is real but contacted through unofficial channels (e.g., claiming to be Maybank but messaging via WhatsApp from a random number)

### Step 3: Weigh the Evidence
Count legitimacy signals vs scam signals. Consider context:
- A message from an @maybank.com email with a named HR person inviting to interview = likely legitimate
- A WhatsApp message claiming to be from TM R&D with urgency and fee requests = likely scam even though TM R&D is real
- When signals are mixed, lean SUSPICIOUS and explain what to verify

## Verdict Rules:
- "LIKELY_SAFE" = Company is verified AND message uses official channels AND has multiple legitimacy signals AND zero scam signals
- "SUSPICIOUS" = Mixed signals (e.g., real company but unusual channel, or minor red flags present). Always explain what specifically is suspicious.
- "SCAM" = Multiple scam signals present, OR financial/identity theft requests, OR entity is confirmed fake

After all tool calls complete, respond with a JSON object in this exact format:
{
  "verdict": "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "scam_type": ${CANONICAL_SCAM_CATEGORIES.map((c) => `"${c}"`).join(" | ")},  // pick exactly one — use "${SAFE_CATEGORY}" for LIKELY_SAFE, "Other" if the scam doesn't fit any listed category
  "language_detected": "string",
  "manipulation_tactics": ["array of manipulation tactics found — list at least one for any SCAM or SUSPICIOUS verdict (e.g. \"Urgency\", \"Impersonation\", \"Upfront payment\", \"Identity theft request\", \"Too good to be true\"); leave empty ONLY for LIKELY_SAFE"],
  "evidence_chain": [
    {
      "finding": "what was found",
      "source": "which tool or behavioral analysis",
      "severity": "HIGH" | "MEDIUM" | "LOW"
    }
  ],
  "recommended_actions": ["array of next steps for the user"],
  "summary": "2-3 sentence plain language summary for the user"
}`;

/**
 * Run the full investigation. Emits the same event vocabulary the client
 * already understands: status, tool_start, tool_complete, verdict, done, error.
 */
export async function runScanAgent(input: ScanInput, emit: ScanEmit): Promise<ScanOutcome> {
  try {
    emit("status", { stage: "starting", message: "Reading the message..." });

    // Start the overall clock NOW, before extraction — every second of file
    // extraction counts against the same budget the investigation must fit in.
    // `remaining()` is the single source of truth for "how much time is left",
    // and every downstream call is bounded by it so nothing can overrun.
    const deadline = Date.now() + OVERALL_DEADLINE_MS;
    const remaining = () => deadline - Date.now();

    const chat = ai.chats.create({
      model: MODEL_ID,
      config: {
        tools,
        thinkingConfig: { thinkingBudget: 512 },
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    // Extract attached file text once up front (see analyze-stream notes).
    // The default message for an attachment-only scan is a placeholder like
    // "[Screenshot attached for scanning]", so a leading "[" means we have no
    // real text yet and must rely on extraction.
    let analysisText = (input.message || "").trim();
    let extractErr: unknown = null;
    if (input.image && input.imageMimeType) {
      emit("status", { stage: "starting", message: "Reading the attached file..." });
      try {
        // Bound extraction by whatever budget is left (capped), and DON'T retry:
        // a slow extract must fail fast and leave the bulk of the budget for the
        // actual investigation rather than doubling latency up front. This is the
        // single biggest fix for screenshot/PDF scans timing out.
        const extracted: any = await callWithRetry(
          () =>
            withTimeout(
              ai.models.generateContent({
                model: MODEL_ID,
                contents: [
                  {
                    role: "user",
                    parts: [
                      { inlineData: { data: input.image, mimeType: input.imageMimeType } },
                      { text: "Extract ALL text from this file (a screenshot or PDF of a suspicious message). Preserve the exact wording, language, sender names, URLs, phone numbers and amounts. Return ONLY the raw extracted text — no commentary." },
                    ],
                  },
                ],
                config: { thinkingConfig: { thinkingBudget: 0 } },
              }),
              Math.min(15_000, remaining()),
              "extract"
            ),
          { label: "extract", retries: 0 }
        );

        const extractedText = (extracted.text || "").trim();
        if (extractedText) {
          analysisText =
            analysisText && !analysisText.startsWith("[")
              ? `${analysisText}\n\n--- Extracted from attached file ---\n${extractedText}`
              : extractedText;
        }
      } catch (e) {
        extractErr = e;
        console.error("[Extract Error]", e);
      }
    }

    if (!analysisText || analysisText.startsWith("[")) {
      // No usable text. If extraction failed because the AI service was busy
      // (throttle/timeout), say so and let the user retry — don't blame their
      // file. Only call the file genuinely unreadable when the service answered
      // but produced nothing (or there was no extractable text at all).
      const busy = extractErr != null && isTransient(extractErr);
      emit(
        "error",
        busy
          ? {
              kind: "busy",
              message: "Our systems are busy right now, so we couldn't finish reading your file. Please try again in a moment.",
            }
          : {
              kind: "format",
              message: input.image
                ? "We couldn't read any text from the attached file. Try a clearer screenshot, or paste the message text instead."
                : "Please paste or attach a message to analyze.",
            }
      );
      return { ok: false };
    }

    const messageParts: any[] = [{ text: `Analyze this message:\n\n"${analysisText}"` }];

    // Every model turn is bounded by the time actually left, not a fixed 40s.
    // We refuse to start a turn we know can't finish, and only retry when
    // there's comfortable room for a second attempt — so retries can never push
    // past the overall deadline (the old bug: 40s × 3 attempts ≫ 50s budget).
    const sendModel = async (parts: any) => {
      const budget = Math.min(PER_CALL_TIMEOUT_MS, remaining());
      if (budget < MIN_CALL_BUDGET_MS) {
        throw new TimeoutError("not enough time left for another model turn");
      }
      const retries = remaining() > PER_CALL_TIMEOUT_MS * 1.8 ? 1 : 0;
      return callWithRetry(
        () => withTimeout(chat.sendMessage({ message: parts }), budget, "model"),
        { label: "model", retries }
      );
    };

    let response = await sendModel(messageParts as any);

    emit("status", { stage: "analyzing", message: "Message read. Extracting entities..." });

    let iterations = 0;
    // The agent should resolve in ~2 turns (parallel tool calls, then verdict).
    // Cap low so a model that keeps re-calling tools can't burn the whole budget
    // across many slow round-trips; the deadline guard in sendModel is the
    // hard backstop.
    const MAX_ITERATIONS = 4;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      if (remaining() < MIN_CALL_BUDGET_MS) {
        throw new TimeoutError("analysis exceeded overall deadline");
      }

      if (!response.functionCalls || response.functionCalls.length === 0) {
        break;
      }

      for (const call of response.functionCalls) {
        emit("tool_start", {
          tool: call.name,
          args: call.args,
          display_name: getToolDisplayName(call.name || "", call.args),
        });
      }

      const toolResultParts = await Promise.all(
        response.functionCalls.map(async (call: any) => {
          let output: any;
          try {
            output = await withTimeout(
              executeTool(call.name, call.args),
              Math.min(PER_CALL_TIMEOUT_MS, remaining()),
              `tool:${call.name}`
            );
          } catch (toolErr: any) {
            console.error(`[Tool Error] ${call.name}:`, toolErr?.message || toolErr);
            output = { error: "tool_unavailable", note: "This check could not be completed; continuing without it." };
          }

          emit("tool_complete", { tool: call.name, args: call.args, result: output });

          return { functionResponse: { name: call.name, id: call.id, response: output } };
        })
      );

      emit("status", { stage: "thinking", message: "Synthesizing evidence..." });

      // After the first batch of tool results, push the model to finalize rather
      // than open another (slow) tool round. This keeps the typical scan at 2
      // turns. The model may still call a tool if a result genuinely revealed a
      // new entity, but the iteration cap + deadline guard bound that.
      const partsToSend: any[] = [...toolResultParts];
      if (iterations >= 1 || remaining() < PER_CALL_TIMEOUT_MS * 1.5) {
        partsToSend.push({
          text: "You now have the tool results above. Unless a result revealed a brand-new entity you could not see before, do NOT call any more tools — respond now with ONLY the final verdict as the required JSON object.",
        });
      }

      response = await sendModel(partsToSend as any);
    }

    // Final response — guarantee a well-formed verdict or fail loudly.
    const finalText = response.text || "";
    let analysis = validateAnalysis(extractJson(finalText));

    if (!analysis) {
      emit("status", { stage: "thinking", message: "Finalizing the verdict..." });
      analysis = await repairToJson(ai, MODEL_ID, finalText);
    }

    if (!analysis) {
      emit("error", {
        kind: "format",
        message: "We couldn't complete the analysis this time. Please try again.",
      });
      return { ok: false };
    }

    emit("verdict", { analysis, iterations });
    emit("done", { ok: true });
    return { ok: true, analysis };
  } catch (error: any) {
    const isTimeout = error instanceof TimeoutError;
    const msg = String(error?.message || "");
    const isBusy = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("overloaded");
    console.error("[Scan Runner Error]", error);
    emit("error", {
      kind: isTimeout ? "timeout" : isBusy ? "busy" : "failed",
      message: isTimeout
        ? "The investigation took too long to complete. Please try again."
        : isBusy
          ? "Our AI systems are handling a lot of requests right now. Please wait a moment and try again."
          : "Something went wrong during the analysis. Please try again.",
    });
    return { ok: false };
  }
}
