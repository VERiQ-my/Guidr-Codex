import type { DatabricksAnalysis, ExtractedScan, MallamAnalysis, RiskLabel } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown, limit: number) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, limit) : [];
}

function score(value: unknown, fallback = 50) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

export function extractText(payload: unknown) {
  if (!record(payload)) throw new Error("Provider returned an invalid response");
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const output = payload.output;
  if (!Array.isArray(output)) throw new Error("Provider response contains no text output");
  const parts: string[] = [];
  for (const item of output) {
    if (!record(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) if (record(content) && typeof content.text === "string") parts.push(content.text);
  }
  if (!parts.length) throw new Error("Provider response contains no text output");
  return parts.join("\n");
}

export function jsonObject(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Provider returned no JSON object");
  }
}

export function validateGptScan(value: unknown): ExtractedScan {
  if (!record(value) || typeof value.is_scam !== "boolean" || typeof value.category !== "string" || typeof value.reasoning !== "string") throw new Error("GPT-5.6 returned an invalid scan analysis");
  return {
    is_scam: value.is_scam,
    confidence: score(value.confidence),
    category: value.category.trim().slice(0, 80) || "Other",
    reasoning: value.reasoning.trim().slice(0, 1_000) || "No reasoning was returned.",
    evidence_chain: strings(value.evidence_chain, 6),
    manipulation_tactics: strings(value.manipulation_tactics, 6),
    extracted_text: typeof value.extracted_text === "string" ? value.extracted_text.trim().slice(0, 12_000) : "",
  };
}

export function validateMallam(value: unknown): MallamAnalysis {
  if (!record(value) || !record(value.entities) || typeof value.normalized_text !== "string") throw new Error("MaLLaM returned an invalid analysis");
  const entities = value.entities;
  return {
    languages: strings(value.languages, 8),
    normalized_text: value.normalized_text.trim().slice(0, 12_000),
    local_scam_signals: strings(value.local_scam_signals, 20),
    entities: { phones: strings(entities.phones, 20), bank_accounts: strings(entities.bank_accounts, 20), urls: strings(entities.urls, 20), organizations: strings(entities.organizations, 20) },
  };
}

export function validateDatabricks(value: unknown): DatabricksAnalysis {
  if (!record(value) || typeof value.reasoning !== "string" || !["low", "medium", "high"].includes(String(value.risk_label))) throw new Error("Databricks returned an invalid risk analysis");
  return { risk_score: score(value.risk_score), risk_label: value.risk_label as RiskLabel, reasoning: value.reasoning.trim().slice(0, 1_000) || "No reasoning was returned." };
}

export function extractChatText(payload: unknown) {
  if (!record(payload) || !Array.isArray(payload.choices) || !payload.choices.length || !record(payload.choices[0]) || !record(payload.choices[0].message)) throw new Error("Databricks response contains no choices");
  const content = payload.choices[0].message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content.filter(record).map((item) => typeof item.text === "string" ? item.text : "").filter(Boolean).join("\n");
    if (text) return text;
  }
  throw new Error("Databricks response contains no message text");
}
