/**
 * Shared Vertex AI client initialization for Guidr.
 * 
 * Supports two environments:
 * 1. LOCAL: Reads from google-credentials.json file in project root
 * 2. VERCEL: Reads from GOOGLE_APPLICATION_CREDENTIALS_JSON env var
 *    (paste the entire JSON content as the env var value)
 * 
 * The @google/genai SDK uses ADC — we write a temp credentials file
 * and point GOOGLE_APPLICATION_CREDENTIALS at it.
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

let projectFromCreds: string | undefined;
// Service-account JSON handed straight to the SDK (no filesystem involved) —
// required on Cloudflare Workers, where there is no real temp dir to point
// GOOGLE_APPLICATION_CREDENTIALS at.
let credentials: Record<string, string> | undefined;

// Strategy 1: Local file exists (local dev on a real Node runtime)
try {
  const localCredPath = path.join(process.cwd(), "google-credentials.json");
  if (fs.existsSync(localCredPath)) {
    const parsed = JSON.parse(fs.readFileSync(localCredPath, "utf8"));
    credentials = parsed;
    projectFromCreds = parsed.project_id;
  }
} catch { /* ignore — fall through to env var */ }

// Strategy 2: hosted (Cloudflare/Vercel) — credentials JSON in an env var
if (!credentials) {
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credsJson) {
    try {
      credentials = JSON.parse(credsJson);
      projectFromCreds = credentials?.project_id;
      console.log("[Guidr AI] Loaded credentials from env var");
    } catch (e) {
      console.warn("[Guidr AI] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:", e);
    }
  }
}

const project = process.env.GCP_PROJECT_ID || projectFromCreds || "gmp-demo-project-523521543";
// LATENCY: the app deploys to Vercel `sin1` (Singapore) but defaults Vertex to
// `us-central1` (Iowa). Every model + grounded-search call in the agent loop
// then makes a trans-Pacific round trip, and a multi-turn scan pays that several
// times over — a major contributor to slow scans. To co-locate, set
// GCP_LOCATION=asia-southeast1 in production (verify gemini-2.5-flash /
// -flash-lite quota is provisioned for the project in that region first). The
// default is left at us-central1 so a project without Singapore quota keeps
// working unchanged.
const location = process.env.GCP_LOCATION || "us-central1";

// The model version available on this GCP project.
// MODEL_ID: the main agent (reasoning + tool orchestration).
// SEARCH_MODEL_ID: a faster/cheaper model for the per-tool web-intelligence
// lookups, where we only need quick grounded summarization.
export const MODEL_ID = "gemini-2.5-flash";
export const SEARCH_MODEL_ID = "gemini-2.5-flash-lite";

// Backend selection. GUIDR_AI_BACKEND=gemini-api routes all model calls to the
// Gemini API (generativelanguage.googleapis.com) using GEMINI_API_KEY — needed
// while the Vertex project has billing disabled. Default remains Vertex.
const useGeminiApi =
  process.env.GUIDR_AI_BACKEND === "gemini-api" && !!process.env.GEMINI_API_KEY;

export const ai = useGeminiApi
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : new GoogleGenAI({
      vertexai: true,
      project,
      location,
      // Explicit scopes force a real OAuth access-token exchange. Without
      // them the auth library sends a self-signed JWT, which Vertex rejects
      // (401 ACCESS_TOKEN_TYPE_UNSUPPORTED) when running on Workers.
      ...(credentials
        ? {
            googleAuthOptions: {
              credentials,
              scopes: ["https://www.googleapis.com/auth/cloud-platform"],
            },
          }
        : {}),
    });

export { project, location };
