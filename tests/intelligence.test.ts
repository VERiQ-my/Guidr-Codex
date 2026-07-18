import assert from "node:assert/strict";
import test from "node:test";
import { buildGptInputContent } from "../app/api/lib/intelligence/gpt";
import { preprocessWithMallam } from "../app/api/lib/intelligence/mallam";
import { maskSensitiveText } from "../app/api/lib/intelligence/pii";
import { rankLocalPatterns } from "../app/api/lib/intelligence/retrieval";
import { reconcileProviders, toUiAnalysis } from "../app/api/lib/intelligence/service";

test("masks Malaysian phone and bank identifiers before the Databricks path", async () => {
  const raw = "Call 012-3456789 and transfer to 123456789012 immediately.";
  const masked = await maskSensitiveText(raw);
  assert.equal(masked.text.includes("012-3456789"), false);
  assert.equal(masked.text.includes("123456789012"), false);
  assert.match(masked.text, /<PHONE_[a-f0-9]{12}>/);
  assert.match(masked.text, /<BANK_[a-f0-9]{12}>/);
});

test("GPT-5.6 request content carries images and PDFs in the supported attachment fields", async () => {
  const imageContent = await buildGptInputContent({ message: "Read this screenshot", sourceChannel: "WhatsApp", image: "aW1hZ2U=", imageMimeType: "image/png", attachmentName: "chat.png" });
  const pdfContent = await buildGptInputContent({ message: "", sourceChannel: "Email", image: "cGRm", imageMimeType: "application/pdf", attachmentName: "invoice.pdf" });

  assert.deepEqual(imageContent.at(-1), { type: "input_image", image_url: "data:image/png;base64,aW1hZ2U=", detail: "high" });
  assert.deepEqual(pdfContent.at(-1), { type: "input_file", file_data: "data:application/pdf;base64,cGRm", filename: "invoice.pdf" });
});

test("MaLLaM fallback remains usable without Databricks credentials and contains no raw financial PII", async () => {
  const original = process.env.DATABRICKS_TOKEN;
  delete process.env.DATABRICKS_TOKEN;
  try {
    const result = await preprocessWithMallam("Bank security sini lah, call 012-3456789 dan transfer ke 123456789012 sekarang.");
    assert.equal(result.usedFallback, true);
    assert.equal(JSON.stringify(result).includes("012-3456789"), false);
    assert.equal(JSON.stringify(result).includes("123456789012"), false);
    assert.equal(result.analysis.languages.includes("Manglish"), true);
  } finally {
    if (original === undefined) delete process.env.DATABRICKS_TOKEN;
    else process.env.DATABRICKS_TOKEN = original;
  }
});

test("local pattern retrieval matches a Manglish task-scam message", () => {
  const results = rankLocalPatterns("Easy job bro, deposit dulu and earn RM500 daily lah, slot limited.");
  assert.equal(results.length, 3);
  assert.equal(results.some((item) => item.category === "job_scam"), true);
});

test("provider disagreement maps safely to the existing suspicious verdict UI", () => {
  const reconciled = reconcileProviders(
    { is_scam: false, confidence: 82, category: "legitimate notice", reasoning: "No direct request for money.", evidence_chain: ["No payment request."], manipulation_tactics: [], extracted_text: "" },
    { risk_score: 76, risk_label: "high", reasoning: "Impersonation indicators.", },
    null,
    [],
  );
  assert.ok(reconciled);
  const ui = toUiAnalysis(reconciled);
  assert.equal(ui.verdict, "SUSPICIOUS");
  assert.equal(ui.confidence, 0);
  assert.equal(ui.assessment_mode, "ai");
  assert.doesNotMatch(ui.summary, /(gpt|openai|databricks|mallam|llama)/i);
});
