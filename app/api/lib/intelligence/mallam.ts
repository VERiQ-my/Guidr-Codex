import { invokeDatabricksJson } from "./databricks";
import { validateMallam } from "./json";
import { MALLAM_SCHEMA, MALLAM_SYSTEM_PROMPT } from "./prompts";
import { maskSensitiveText } from "./pii";
import type { MallamAnalysis } from "./types";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const MALAY_WORDS = /\b(?:anda|awak|sila|segera|bayar|akaun|wang|hadiah|kerja|parcel|tindakan|polis|mahkamah|pelaburan|untung|tahniah)\b/i;
const MANGLISH_WORDS = /\b(?:lah|lor|leh|meh|bossku|bro|sis|settle|confirm|fast|now|claim)\b/i;
const ENGLISH_WORDS = /\b(?:you|your|please|payment|account|job|parcel|bank|investment|urgent)\b/i;

export type MallamResult = { analysis: MallamAnalysis; maskedInput: string; usedFallback: boolean };

function fallback(maskedInput: string, phones: string[], bankAccounts: string[]): MallamAnalysis {
  const languages = [MALAY_WORDS.test(maskedInput) ? "Bahasa Melayu" : "", MANGLISH_WORDS.test(maskedInput) ? "Manglish" : "", ENGLISH_WORDS.test(maskedInput) ? "English" : ""].filter(Boolean);
  if (languages.length > 1) languages.push("code-switching");
  if (!languages.length) languages.push("undetermined");
  const signals = [
    [/\b(?:segera|sekarang|hari ini|dalam masa|urgent|immediately|last warning)\b/i, "Urgency or deadline pressure"],
    [/\b(?:kwsp|pdrm|nsrc|lhdn|bnm|bank negara|mahkamah|polis)\b/i, "Reference to a Malaysian authority or institution"],
    [/\b(?:otp|tac|password|kata laluan|pin)\b/i, "Request involving authentication credentials"],
    [/\b(?:transfer|bank in|bayar|deposit|processing fee|yuran)\b/i, "Payment or transfer language"],
  ].filter(([pattern]) => (pattern as RegExp).test(maskedInput)).map(([, signal]) => signal as string);
  return { languages, normalized_text: maskedInput, local_scam_signals: signals, entities: { phones, bank_accounts: bankAccounts, urls: [...new Set(maskedInput.match(URL_PATTERN) || [])], organizations: [...new Set([...maskedInput.matchAll(/\b(KWSP|PDRM|NSRC|LHDN|BNM|Bank Negara|Maybank|CIMB|RHB|Pos Malaysia|J&T)\b/gi)].map((match) => match[1]))] } };
}

async function sanitize(analysis: MallamAnalysis): Promise<MallamAnalysis> {
  const clean = async (value: string) => (await maskSensitiveText(value)).text;
  return { languages: await Promise.all(analysis.languages.map(clean)), normalized_text: await clean(analysis.normalized_text), local_scam_signals: await Promise.all(analysis.local_scam_signals.map(clean)), entities: { phones: await Promise.all(analysis.entities.phones.map(clean)), bank_accounts: await Promise.all(analysis.entities.bank_accounts.map(clean)), urls: await Promise.all(analysis.entities.urls.map(clean)), organizations: await Promise.all(analysis.entities.organizations.map(clean)) } };
}

export async function preprocessWithMallam(rawInput: string): Promise<MallamResult> {
  const masked = await maskSensitiveText(rawInput);
  const local = fallback(masked.text, masked.phones, masked.bankAccounts);
  const endpoint = process.env.DATABRICKS_MALLAM_ENDPOINT_NAME?.trim() || process.env.DATABRICKS_ENDPOINT_NAME?.trim() || "databricks-meta-llama-3-3-70b-instruct";
  try {
    const result = await invokeDatabricksJson(endpoint, [{ role: "system", content: MALLAM_SYSTEM_PROMPT }, { role: "user", content: `<untrusted_scan>\n${masked.text}\n</untrusted_scan>` }], "guidr_mallam_preprocess", MALLAM_SCHEMA);
    const analysis = await sanitize(validateMallam(result));
    analysis.entities.phones = [...new Set([...analysis.entities.phones, ...masked.phones])];
    analysis.entities.bank_accounts = [...new Set([...analysis.entities.bank_accounts, ...masked.bankAccounts])];
    return { analysis, maskedInput: masked.text, usedFallback: false };
  } catch (error) {
    console.warn("[guidr] MaLLaM unavailable; using privacy-safe local normalization", error);
    return { analysis: local, maskedInput: masked.text, usedFallback: true };
  }
}
