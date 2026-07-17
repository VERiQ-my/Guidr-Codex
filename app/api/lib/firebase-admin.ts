/**
 * Firebase Admin initialization for server-side Guardian Alerts.
 *
 * IMPORTANT: FCM tokens are minted by the Firebase project (`guidr-d8709`),
 * so the Admin SDK must authenticate as a service account from THAT project —
 * not the Vertex AI GCP project used elsewhere in the app.
 *
 * Provide credentials via one of:
 *   1. FIREBASE_ADMIN_CREDENTIALS_JSON  — full service-account JSON (Vercel)
 *   2. firebase-admin-credentials.json  — file in project root (local dev)
 *
 * Generate the key at: Firebase Console → Project settings → Service accounts
 * → "Generate new private key".
 */

import { initializeApp, getApp, cert, type App, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
// NOT the real firebase-admin/firestore: that client needs protobufjs runtime
// codegen, which Cloudflare Workers forbid. See firestore-rest.ts.
import { getFirestore } from "./firestore-rest";
import { getAuth } from "firebase-admin/auth";
import * as fs from "fs";
import * as path from "path";

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "guidr-d8709";

// Named app so this Firebase-credentialed instance (Firestore + Messaging +
// Auth) never collides with the Vertex-credentialed default app in admin.ts.
const APP_NAME = "guidr-firebase-admin";

type ServiceAccountJson = Record<string, string>;

/** Why credential loading failed — surfaced to admin callers for diagnosis. */
export type AdminConfigStatus =
  | "ok"
  | "missing" // neither env var nor file present
  | "parse-error" // env var/file present but not valid JSON
  | "incomplete"; // JSON present but missing required fields

let lastStatus: AdminConfigStatus = "missing";

/** Human-readable detail about the last credential-loading attempt. */
export function getAdminConfigStatus(): AdminConfigStatus {
  return lastStatus;
}

function loadServiceAccount(): ServiceAccountJson | null {
  // Strategy 1: env var (Vercel / production)
  const fromEnv = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (fromEnv) {
    try {
      const parsed = JSON.parse(fromEnv) as ServiceAccountJson;
      if (!parsed.private_key || !parsed.client_email) {
        lastStatus = "incomplete";
        console.warn("[Guidr Admin] Credentials JSON missing private_key/client_email");
        return null;
      }
      lastStatus = "ok";
      return parsed;
    } catch (e) {
      lastStatus = "parse-error";
      console.warn("[Guidr Admin] Failed to parse FIREBASE_ADMIN_CREDENTIALS_JSON:", e);
      return null;
    }
  }

  // Strategy 2: local file
  const localPath = path.join(process.cwd(), "firebase-admin-credentials.json");
  if (fs.existsSync(localPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localPath, "utf8")) as ServiceAccountJson;
      lastStatus = "ok";
      return parsed;
    } catch (e) {
      lastStatus = "parse-error";
      console.warn("[Guidr Admin] Failed to read firebase-admin-credentials.json:", e);
      return null;
    }
  }

  lastStatus = "missing";
  return null;
}

let cachedApp: App | null = null;

/** Returns the initialized Admin app, or null if credentials are missing. */
export function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;

  // Reuse our named app if it already exists (hot reload / repeated calls).
  try {
    cachedApp = getApp(APP_NAME);
    return cachedApp;
  } catch {
    /* not initialized yet */
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.error(
      "[Guidr Admin] No Firebase Admin credentials found. " +
        "Set FIREBASE_ADMIN_CREDENTIALS_JSON or add firebase-admin-credentials.json."
    );
    return null;
  }

  cachedApp = initializeApp(
    {
      credential: cert(serviceAccount as unknown as ServiceAccount),
      projectId: serviceAccount.project_id || FIREBASE_PROJECT_ID,
    },
    APP_NAME
  );
  return cachedApp;
}

export function getAdminMessaging() {
  const app = getAdminApp();
  return app ? getMessaging(app) : null;
}

let firestoreSettingsApplied = false;

export function getAdminFirestore() {
  const app = getAdminApp();
  if (!app) return null;
  const db = getFirestore(app);
  // Cloudflare Workers can't open gRPC channels; route Firestore through REST.
  // settings() throws if called twice or after first use, hence the guard.
  if (!firestoreSettingsApplied) {
    try {
      db.settings({ preferRest: true });
    } catch {
      /* already in use — keep whatever transport is active */
    }
    firestoreSettingsApplied = true;
  }
  return db;
}

export function getAdminAuth() {
  const app = getAdminApp();
  return app ? getAuth(app) : null;
}

/**
 * Verify a Firebase ID token from an `Authorization: Bearer <token>` header,
 * using the Firebase-credentialed app. Returns the uid, or null.
 */
export async function verifyIdToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const auth = getAdminAuth();
  if (!auth) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}
