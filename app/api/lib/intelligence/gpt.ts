import type { ScanInput } from "@/lib/scan-types";
import { fetchJson, timeoutFromEnv } from "./http";
import { extractText, jsonObject, validateGptScan } from "./json";
import { GPT_SCAN_PROMPT, GPT_SCHEMA } from "./prompts";
import { maskSensitiveText } from "./pii";
import type { ExtractedScan } from "./types";

export const GPT_MODEL = "gpt-5.6-terra";

export async function buildGptInputContent(input: ScanInput): Promise<Array<Record<string, unknown>>> {
  const maskedSender = input.senderContact ? (await maskSensitiveText(input.senderContact)).text : "Not provided";
  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: `${GPT_SCAN_PROMPT}\n\n<untrusted_scan>\n${JSON.stringify({ message: input.message || "(No pasted text; inspect the attachment.)", source_channel: input.sourceChannel, sender_contact: maskedSender })}\n</untrusted_scan>`,
  }];
  if (input.image && input.imageMimeType === "application/pdf") content.push({ type: "input_file", file_data: `data:application/pdf;base64,${input.image}`, filename: input.attachmentName || "attachment.pdf" });
  if (input.image && input.imageMimeType?.startsWith("image/")) content.push({ type: "input_image", image_url: `data:${input.imageMimeType};base64,${input.image}`, detail: "high" });
  return content;
}

export async function scanWithGpt(input: ScanInput): Promise<ExtractedScan> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const content = await buildGptInputContent(input);

  const payload = await fetchJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: GPT_MODEL, store: false, max_output_tokens: 1_400, input: [{ role: "user", content }], text: { format: { type: "json_schema", name: "guidr_gpt56_attachment_scan", strict: true, schema: GPT_SCHEMA } } }),
  }, timeoutFromEnv("OPENAI_TIMEOUT_MS", 30_000));
  return validateGptScan(jsonObject(extractText(payload)));
}
