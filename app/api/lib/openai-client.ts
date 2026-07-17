/**
 * Shared OpenAI client for Guidr (hackathon build — OpenAI only).
 *
 * Reads OPENAI_API_KEY from the environment. This module is SERVER-ONLY: never
 * import it from a client component, or the key would end up in the browser
 * bundle. Only route handlers under app/api/** may use it.
 *
 * Add to .env.local (already gitignored):
 *   OPENAI_API_KEY=sk-...
 *   OPENAI_MODEL=gpt-4o-mini   # optional; defaults below
 */

import "server-only";
import OpenAI from "openai";

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** True when a key is configured — used to gracefully fall back to static content. */
export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

let client: OpenAI | null = null;

/**
 * Construct lazily so routes can return their static fallback when the key is
 * absent. Importing this server-only module must never make local development
 * fail before a route handler has a chance to handle that case.
 */
export function getOpenAI(): OpenAI | null {
  if (!hasOpenAIKey()) return null;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}
