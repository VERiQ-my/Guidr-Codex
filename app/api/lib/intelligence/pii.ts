const PHONE_PATTERN = /(?<!\d)(?:\+?60[\s-]?|0)1[0-9](?:[\s-]?\d){7,8}(?!\d)/g;
const BANK_PATTERN = /(?<![\dA-Za-z])(?:\d[\s-]?){10,18}(?![\dA-Za-z])/g;

export type MaskedText = { text: string; phones: string[]; bankAccounts: string[] };

async function hashToken(kind: "PHONE" | "BANK", raw: string) {
  const canonical = raw.replace(/\D/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${kind}:${canonical}`));
  const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return `<${kind}_${hex.slice(0, 12)}>`;
}

async function replaceMatches(input: string, pattern: RegExp, kind: "PHONE" | "BANK") {
  const values = [...input.matchAll(pattern)].map((match) => match[0]);
  const replacements = new Map<string, string>();
  await Promise.all([...new Set(values)].map(async (value) => replacements.set(value, await hashToken(kind, value))));
  pattern.lastIndex = 0;
  return { text: input.replace(pattern, (value) => replacements.get(value) || value), tokens: [...new Set(values.map((value) => replacements.get(value)!))] };
}

export async function maskSensitiveText(input: string): Promise<MaskedText> {
  const phoneResult = await replaceMatches(input, PHONE_PATTERN, "PHONE");
  const bankResult = await replaceMatches(phoneResult.text, BANK_PATTERN, "BANK");
  return { text: bankResult.text, phones: phoneResult.tokens, bankAccounts: bankResult.tokens };
}
