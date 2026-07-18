import { scanWithGuidrIntelligence } from "@/app/api/lib/intelligence/service";
import { SAFE_CATEGORY } from "@/lib/scam-categories";
import type { Analysis, ScanEvent, ScanInput, Verdict } from "@/lib/scan-types";

type Emit = (event: ScanEvent) => Promise<void> | void;
type Pattern = { expression: RegExp; evidence: string; tactic?: string; category?: string; weight: number };

const stages = [
  ["extract_message_details", "Reading the message and attachment."],
  ["review_requests_and_links", "Normalizing Malaysian-language signals."],
  ["assess_scam_signals", "Cross-checking independent safety signals."],
  ["prepare_safety_advice", "Preparing safer next steps."],
] as const;

const fallbackPatterns: Pattern[] = [
  { expression: /\b(otp|one[- ]?time pass(?:word|code)?|verification code|tac|password)\b/i, evidence: "It asks for a one-time code, password, or verification detail.", tactic: "Credential harvesting", category: "Phishing", weight: 3 },
  { expression: /\b(click|tap|open|visit)\b.{0,42}\b(link|https?:\/\/|www\.)|https?:\/\/|\b(bit\.ly|tinyurl)\b/i, evidence: "It contains a link or asks you to open one.", tactic: "Link-based redirection", category: "Phishing", weight: 2 },
  { expression: /\b(urgent|immediately|today only|act now|within \d+ (minutes?|hours?)|last chance|suspended|blocked|locked)\b/i, evidence: "It uses urgency or a threat of account consequences.", tactic: "Urgency and pressure", weight: 2 },
  { expression: /\b(send money|transfer|payment|pay now|processing fee|release fee|deposit|refund fee|bank transfer)\b/i, evidence: "It asks for money or refers to a payment.", tactic: "Financial pressure", weight: 2 },
  { expression: /\b(bank|polis|police|lhdn|macc|government|customs|tnb)\b/i, evidence: "It invokes an organisation or authority that should be verified independently.", tactic: "Possible impersonation", category: "Impersonation", weight: 1 },
  { expression: /\b(invest(?:ment|ing)?|trading|forex|guaranteed return|high return|crypto|bitcoin|btc|usdt)\b/i, evidence: "It mentions an investment or unusually strong returns.", tactic: "Financial lure", category: "Investment Scam", weight: 2 },
  { expression: /\b(job|hiring|recruit(?:ment)?|task[- ]?based|commission)\b/i, evidence: "It mentions a job, recruitment, or paid task.", tactic: "Opportunity lure", category: "Job Scam", weight: 1 },
  { expression: /\b(parcel|package|delivery|courier|pos malaysia|shipping)\b/i, evidence: "It mentions a parcel, delivery, or courier.", tactic: "Service impersonation", category: "Delivery Scam", weight: 1 },
];

function unique(values: Array<string | undefined>) { return [...new Set(values.filter((value): value is string => Boolean(value)))]; }

function fallbackAnalysis(input: ScanInput): Analysis {
  const matches = fallbackPatterns.filter((pattern) => pattern.expression.test(input.message));
  const score = matches.reduce((total, pattern) => total + pattern.weight, 0);
  const verdict: Verdict = input.image && !input.message.trim() ? "SUSPICIOUS" : score >= 5 ? "SCAM" : score ? "SUSPICIOUS" : "LIKELY_SAFE";
  return {
    verdict,
    confidence: input.image && !input.message.trim() ? 45 : verdict === "SCAM" ? Math.min(78, 54 + score * 4) : verdict === "SUSPICIOUS" ? Math.min(68, 46 + score * 6) : 35,
    scam_type: matches.find((pattern) => pattern.category)?.category || (score ? "Other" : SAFE_CATEGORY),
    summary: verdict === "SCAM" ? "Live AI review is temporarily unavailable. Guidr's limited pattern check found several high-risk cues, so treat this as a likely scam until you verify it independently." : verdict === "SUSPICIOUS" ? "Live AI review is temporarily unavailable. Guidr's limited pattern check found cues that need independent verification before you respond." : "Live AI review is temporarily unavailable. This limited pattern check found no strong common scam cues, but it cannot confirm that a message is safe.",
    manipulation_tactics: unique(matches.map((pattern) => pattern.tactic)).slice(0, 4),
    evidence_chain: matches.length ? matches.slice(0, 4).map((pattern) => pattern.evidence) : [input.image ? "An attachment was provided, but live attachment analysis is unavailable." : "No common high-risk phrases or links were found in the pasted text."],
    recommended_actions: verdict === "SCAM" ? ["Do not reply, open links, send money, or share any OTP, password, or verification code.", "Contact the organisation through its official website, app, or phone number - not the details in this message.", "Keep screenshots and report the message. If money was sent, call your bank and NSRC 997 immediately."] : ["Pause before replying, opening links, or sharing personal or banking information.", "Verify the sender through an official channel you find independently.", "Keep the message as evidence and seek help quickly if money or account access may be involved."],
    assessment_mode: "fallback",
  };
}

export async function runScanAgent({ input, emit }: { input: ScanInput; emit: Emit }) {
  let completed = 0;
  const start = async (index: number) => emit({ type: "tool_start", tool: stages[index][0], message: stages[index][1] });
  const complete = async (index: number) => { completed = Math.max(completed, index + 1); await emit({ type: "tool_complete", tool: stages[index][0], message: "Step complete." }); };
  try {
    await start(0);
    await emit({ type: "status", message: "Reviewing the supplied message and attachment." });
    const analysis = await scanWithGuidrIntelligence(input);
    await complete(0);
    await start(1); await complete(1);
    await start(2); await complete(2);
    await start(3); await complete(3);
    await emit({ type: "verdict", analysis });
  } catch (error) {
    console.error("Guidr intelligence lanes failed; using limited pattern check", error);
    for (let index = completed; index < stages.length; index += 1) { await start(index); await complete(index); }
    await emit({ type: "status", message: "Live AI review is unavailable. Finishing a limited pattern check." });
    await emit({ type: "verdict", analysis: fallbackAnalysis(input) });
  }
}
