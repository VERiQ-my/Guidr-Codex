import OpenAI from "openai";

export const MODEL_ID = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export function getAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}
