export const PER_CALL_TIMEOUT_MS = 25_000;
export const OVERALL_DEADLINE_MS = 105_000;
export const MIN_CALL_BUDGET_MS = 5_000;

export function extractJson(value: string) {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The model returned no structured analysis.");
  return JSON.parse(match[0]) as unknown;
}
