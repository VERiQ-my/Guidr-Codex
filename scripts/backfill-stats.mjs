/**
 * One-time backfill for the aggregate stats counter doc (`stats/global`).
 *
 * The home page used to count by reading the entire `cases`/`users`
 * collections. We've switched to a counter doc that is incremented going
 * forward — this script seeds that doc from the existing data so the
 * displayed totals don't reset to zero.
 *
 * IMPORTANT: run this ONCE, BEFORE deploying the locked-down firestore.rules.
 * It reads whole collections, which the permissive (current) rules still
 * allow. After it completes, deploy the new rules.
 *
 *   node scripts/backfill-stats.mjs
 *
 * It loads Firebase web config from .env.local.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
} from "firebase/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load NEXT_PUBLIC_FIREBASE_* from .env.local ──
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch (e) {
    console.error("Could not read .env.local:", e.message);
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error("Missing Firebase config in .env.local");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  console.log(`Backfilling stats for project: ${firebaseConfig.projectId}`);

  const casesSnap = await getDocs(collection(db, "cases"));
  const totalCases = casesSnap.size;
  let reportedNSRC = 0;
  casesSnap.forEach((d) => {
    if (d.data().reportedToNSRC === true) reportedNSRC++;
  });

  const usersSnap = await getDocs(collection(db, "users"));
  const totalUsers = usersSnap.size;

  const stats = { totalCases, reportedNSRC, totalUsers };
  console.log("Computed:", stats);

  await setDoc(doc(db, "stats", "global"), stats, { merge: true });
  console.log("✓ Wrote stats/global");
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
