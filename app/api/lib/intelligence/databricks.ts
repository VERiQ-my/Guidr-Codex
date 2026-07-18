import { databricksBaseUrl, fetchJson, timeoutFromEnv } from "./http";
import { extractChatText, jsonObject, validateDatabricks } from "./json";
import { DATABRICKS_RISK_SYSTEM_PROMPT, DATABRICKS_SCHEMA } from "./prompts";
import type { DatabricksAnalysis } from "./types";

export async function invokeDatabricksJson(endpoint: string, messages: Array<{ role: "system" | "user"; content: string }>, schemaName: string, schema: Record<string, unknown>) {
  const token = process.env.DATABRICKS_TOKEN?.trim();
  if (!token) throw new Error("DATABRICKS_TOKEN is not configured");
  const payload = await fetchJson(`${databricksBaseUrl()}/ai-gateway/mlflow/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: endpoint, messages, temperature: 0, max_tokens: 1_000, response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } } }),
  }, timeoutFromEnv("DATABRICKS_TIMEOUT_MS", 25_000));
  return jsonObject(extractChatText(payload));
}

export async function scoreWithDatabricks(maskedOriginal: string, malaysiaContext: unknown, patterns: unknown[]): Promise<DatabricksAnalysis> {
  const endpoint = process.env.DATABRICKS_ENDPOINT_NAME?.trim() || "databricks-meta-llama-3-3-70b-instruct";
  const result = await invokeDatabricksJson(endpoint, [
    { role: "system", content: DATABRICKS_RISK_SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify({ masked_original: maskedOriginal, malaysia_context: malaysiaContext, retrieved_patterns: patterns }) },
  ], "guidr_databricks_risk", DATABRICKS_SCHEMA);
  return validateDatabricks(result);
}
