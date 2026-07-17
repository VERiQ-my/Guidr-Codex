/**
 * Firebase Admin (server-side) — verifies the caller's Firebase ID token on
 * the scan endpoint, plus a lightweight rate limit.
 *
 * NOTE ON PROJECTS: the Vertex AI service account (google-credentials.json)
 * belongs to a *different* GCP project than the Firebase Auth project. ID-token
 * verification only needs the correct projectId (it validates against Google's
 * public certs, no authenticated call), so we pin projectId to the Firebase
 * project explicitly. We deliberately do NOT use Admin Firestore here, since the
 * Vertex SA has no access to the Firebase project's database.
 */

import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import * as fs from "fs";
import * as path from "path";

// The Firebase Auth project that issues user ID tokens.
const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";

function loadServiceAccount(): Record<string, any> | null {
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (json) {
    try {
      return JSON.parse(json);
    } catch {
      /* fall through */
    }
  }
  const local = path.join(process.cwd(), "google-credentials.json");
  if (fs.existsSync(local)) {
    try {
      return JSON.parse(fs.readFileSync(local, "utf8"));
    } catch {
      /* fall through */
    }
  }
  return null;
}

let app: App;
if (getApps().length) {
  app = getApps()[0];
} else {
  // verifyIdToken doesn't actually need a service-account credential — it
  // validates against Google's public JWT certs. So if no service account
  // is configured (or GOOGLE_APPLICATION_CREDENTIALS points at a stale
  // path, e.g. a co-founder's machine), we still initialize with just the
  // projectId and skip applicationDefault() to avoid an eager file-read
  // crash at module load.
  const sa = loadServiceAccount();
  app = initializeApp({
    ...(sa ? { credential: cert(sa as any) } : {}),
    projectId: FIREBASE_PROJECT_ID || undefined,
  });
}

export const adminAuth = getAuth(app);

/**
 * Verify a Firebase ID token from an `Authorization: Bearer <token>` header.
 * Returns the uid, or null if missing/invalid.
 */
export async function verifyRequest(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * Best-effort in-memory fixed-window rate limit, keyed by uid. Per serverless
 * instance (resets on cold start) — adequate to blunt rapid abuse. For strict
 * global limits, back this with a shared store (e.g. Upstash Redis) or a
 * same-project Admin Firestore.
 */
const buckets = new Map<string, { windowStart: number; count: number }>();
const BUCKET_MAX = 5000;

export async function checkRateLimit(uid: string, limit = 8, windowMs = 60_000): Promise<boolean> {
  const now = Date.now();
  const b = buckets.get(uid);
  if (!b || now - b.windowStart > windowMs) {
    if (buckets.size >= BUCKET_MAX) {
      const oldest = buckets.keys().next().value;
      if (oldest) buckets.delete(oldest);
    }
    buckets.set(uid, { windowStart: now, count: 1 });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}
