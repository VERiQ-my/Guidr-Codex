import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Analysis } from "@/lib/scan-types";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function loadServiceAccount(): ServiceAccount | undefined {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || join(process.cwd(), ".firebase-service-account.json");
    return JSON.parse(readFileSync(path, "utf8")) as ServiceAccount;
  } catch {
    return undefined;
  }
}

function adminApp(): App | undefined {
  const account = loadServiceAccount();
  if (!account?.project_id || !account.client_email || !account.private_key) return undefined;
  return getApps()[0] || initializeApp({ credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key }) });
}

export async function saveCompletedScan({ scanId, userId, analysis }: { scanId: string; userId: string; analysis: Analysis }) {
  try {
    const app = adminApp();
    if (!app) return;
    await getFirestore(app).collection("cases").doc(scanId).set({
      userId,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      scamType: analysis.scam_type,
      summary: analysis.summary,
      manipulationTactics: analysis.manipulation_tactics,
      evidenceChain: analysis.evidence_chain,
      recommendedActions: analysis.recommended_actions,
      reportedToNSRC: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // A database outage must not prevent the user from receiving their safety verdict.
  }
}
