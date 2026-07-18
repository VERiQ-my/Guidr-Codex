import patterns from "@/data/scam-patterns.json";
import { databricksBaseUrl, fetchJson, timeoutFromEnv } from "./http";
import type { ScamPattern } from "./types";

const STOP_WORDS = new Set(["the", "and", "for", "that", "this", "with", "your", "you", "sila", "anda", "yang", "dan", "untuk", "dengan", "akan", "saya", "kami", "dari", "now", "please"]);

function tokenize(value: string) {
  return new Set(value.toLowerCase().replace(/<[^>]+>/g, " ").split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

export function rankLocalPatterns(input: string, source: ScamPattern[] = patterns as ScamPattern[], limit = 3) {
  const query = tokenize(input);
  return source.map((pattern) => {
    const candidate = tokenize(`${pattern.example_text} ${pattern.red_flags.join(" ")}`);
    const overlap = [...query].filter((token) => candidate.has(token)).length;
    return { ...pattern, score: query.size ? overlap / Math.sqrt(query.size * Math.max(candidate.size, 1)) : 0 };
  }).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
}

function parseSearchResponse(payload: unknown): ScamPattern[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { manifest?: { columns?: Array<{ name?: string }> }; result?: { data_array?: unknown[][] } };
  const columns = record.manifest?.columns?.map((column) => column.name || "") || [];
  const rows = record.result?.data_array;
  if (!columns.length || !rows) return [];
  return rows.map((row) => {
    const value = Object.fromEntries(columns.map((name, index) => [name, row[index]]));
    const rawFlags = value.red_flags;
    const red_flags = Array.isArray(rawFlags) ? rawFlags.map(String) : typeof rawFlags === "string" ? rawFlags.split("|").map((item) => item.trim()).filter(Boolean) : [];
    return { id: String(value.id || ""), category: String(value.category || "Other"), language: String(value.language || "unknown"), dialect: String(value.dialect || "none"), example_text: String(value.example_text || ""), red_flags, source_url: String(value.source_url || ""), source_type: String(value.source_type || ""), verified_at: String(value.verified_at || "") };
  });
}

export async function retrieveScamPatterns(input: string): Promise<{ patterns: ScamPattern[]; source: "databricks_ai_search" | "local_fallback" }> {
  const token = process.env.DATABRICKS_TOKEN?.trim();
  const index = process.env.DATABRICKS_AI_SEARCH_INDEX?.trim();
  if (token && index && process.env.DATABRICKS_HOST) {
    try {
      const payload = await fetchJson(`${databricksBaseUrl()}/api/2.0/vector-search/indexes/${encodeURIComponent(index)}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query_text: input, columns: ["id", "category", "language", "dialect", "example_text", "red_flags", "source_url", "source_type", "verified_at"], num_results: 3, query_type: "HYBRID" }),
      }, timeoutFromEnv("DATABRICKS_TIMEOUT_MS", 20_000));
      const matches = parseSearchResponse(payload);
      if (matches.length) return { patterns: matches, source: "databricks_ai_search" };
    } catch (error) {
      console.warn("[guidr] AI Search unavailable; using local patterns", error);
    }
  }
  return { patterns: rankLocalPatterns(input), source: "local_fallback" };
}
