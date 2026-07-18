import type { Analysis, ScanInput } from "@/lib/scan-types";
import { normalizeScamType, SAFE_CATEGORY } from "@/lib/scam-categories";
import { scoreWithDatabricks } from "./databricks";
import { scanWithGpt } from "./gpt";
import { preprocessWithMallam } from "./mallam";
import { retrieveScamPatterns } from "./retrieval";
import type { DatabricksAnalysis, ExtractedScan, InternalVerdict, MallamAnalysis, ReconciledScan } from "./types";

const unique = (values: Array<string | undefined>) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
const average = (left: number, right: number) => Math.round((left + right) / 2);

function fromGpt(result: ExtractedScan): InternalVerdict {
  return result.is_scam ? (result.confidence >= 75 ? "scam" : "suspicious") : "safe";
}

function fromDatabricks(result: DatabricksAnalysis): InternalVerdict {
  return result.risk_label === "high" ? "scam" : result.risk_label === "medium" ? "suspicious" : "safe";
}

export function reconcileProviders(openai: ExtractedScan | null, databricks: DatabricksAnalysis | null, mallam: MallamAnalysis | null, patterns: ReconciledScan["patterns"]): ReconciledScan | null {
  if (!openai && !databricks) return null;
  if (openai && !databricks) return { verdict: fromGpt(openai), confidence: openai.confidence, openai, databricks: null, mallam, patterns, partial: true };
  if (!openai && databricks) return { verdict: fromDatabricks(databricks), confidence: databricks.risk_label === "low" ? 100 - databricks.risk_score : databricks.risk_score, openai: null, databricks, mallam, patterns, partial: true };

  const gpt = openai as ExtractedScan;
  const db = databricks as DatabricksAnalysis;
  if (gpt.is_scam !== (db.risk_label !== "low")) return { verdict: "needs_review", confidence: 0, openai: gpt, databricks: db, mallam, patterns, partial: false };
  if (!gpt.is_scam) return { verdict: "safe", confidence: average(gpt.confidence, 100 - db.risk_score), openai: gpt, databricks: db, mallam, patterns, partial: false };
  const risk = average(gpt.confidence, db.risk_score);
  return { verdict: risk >= 75 ? "scam" : "suspicious", confidence: risk, openai: gpt, databricks: db, mallam, patterns, partial: false };
}

function recommendedActions(verdict: InternalVerdict) {
  if (verdict === "scam") return ["Do not reply, open links, send money, or share any OTP, password, or verification code.", "Contact the organisation using an official app, website, or number you find independently.", "Keep screenshots and report the message. If money was sent, call your bank and NSRC 997 immediately."];
  if (verdict === "needs_review" || verdict === "suspicious") return ["Pause before replying, opening links, or sharing personal or banking information.", "Verify the sender through an official channel you find independently.", "Keep the message as evidence and seek help quickly if money or account access may be involved."];
  return ["No strong risk signals were found, but still verify unexpected requests independently.", "Do not share passwords, OTPs, or banking details in response to an unexpected message.", "Run another scan if the sender asks for money, a link click, or urgent action later."];
}

export function toUiAnalysis(result: ReconciledScan): Analysis {
  const verdict = result.verdict === "scam" ? "SCAM" : result.verdict === "safe" ? "LIKELY_SAFE" : "SUSPICIOUS";
  const patternEvidence = result.patterns.flatMap((pattern) => pattern.red_flags.map((flag) => `${pattern.category.replaceAll("_", " ")}: ${flag}`));
  const evidence = unique([...(result.openai?.evidence_chain || []), result.openai?.reasoning, result.databricks?.reasoning, ...patternEvidence]).slice(0, 6);
  const tactics = unique([...(result.openai?.manipulation_tactics || []), ...(result.mallam?.local_scam_signals || [])]).slice(0, 6);
  const category = normalizeScamType(result.openai?.category || result.patterns[0]?.category || (verdict === "LIKELY_SAFE" ? SAFE_CATEGORY : "Other"));
  const summary = result.verdict === "needs_review"
    ? "GPT-5.6 and the independent Databricks risk lane reached different conclusions. Treat this as suspicious and verify it through official channels before acting."
    : result.partial
      ? `Partial assessment: ${result.openai ? "GPT-5.6" : "the Databricks Malaysian intelligence lane"} was available while the other provider was unavailable. ${result.openai?.reasoning || result.databricks?.reasoning || "Verify independently before acting."}`
      : result.openai?.reasoning || result.databricks?.reasoning || "Guidr completed a cross-provider scam assessment.";
  return { verdict, confidence: result.confidence, scam_type: category, summary, manipulation_tactics: tactics, evidence_chain: evidence.length ? evidence : ["No provider evidence was available beyond the combined risk assessment."], recommended_actions: recommendedActions(result.verdict), assessment_mode: result.partial ? "partial" : "ai" };
}

function sourceText(input: ScanInput, gpt: ExtractedScan | null) {
  return unique([input.message, gpt?.extracted_text]).join("\n\n").slice(0, 20_000);
}

export async function scanWithGuidrIntelligence(input: ScanInput) {
  let gpt: ExtractedScan | null = null;
  try {
    gpt = await scanWithGpt(input);
  } catch (error) {
    console.warn("[guidr] GPT-5.6 lane unavailable", error);
  }

  const text = sourceText(input, gpt);
  let databricks: DatabricksAnalysis | null = null;
  let mallam: MallamAnalysis | null = null;
  let patterns: ReconciledScan["patterns"] = [];
  if (text) {
    try {
      const preprocessing = await preprocessWithMallam(text);
      mallam = preprocessing.analysis;
      const retrieval = await retrieveScamPatterns(`${preprocessing.maskedInput}\n${mallam.normalized_text}\n${mallam.local_scam_signals.join(" ")}`);
      patterns = retrieval.patterns;
      databricks = await scoreWithDatabricks(preprocessing.maskedInput, mallam, patterns.map(({ category, language, dialect, example_text, red_flags, source_type }) => ({ category, language, dialect, example_text, red_flags, source_type })));
    } catch (error) {
      console.warn("[guidr] Databricks lane unavailable", error);
    }
  }
  const result = reconcileProviders(gpt, databricks, mallam, patterns);
  if (!result) throw new Error("Both GPT-5.6 and Databricks analysis lanes are unavailable.");
  return toUiAnalysis(result);
}
