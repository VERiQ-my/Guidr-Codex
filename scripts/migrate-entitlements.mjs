/**
 * One-time migration for security fix F-1 (client-writable entitlements).
 *
 * Moves the server-owned entitlement fields — isSubscribed, scanQuota,
 * stripeCustomerId, stripeSubscriptionId, subscriptionStatus — off the
 * client-writable users/{uid} profile doc and into the locked-down
 * users/{uid}/entitlements/plan doc, then deletes the legacy copies.
 *
 * Without this, existing Pro subscribers would appear as free users the
 * moment the new server code (which reads only the entitlements doc) goes
 * live, until their next Stripe webhook event.
 *
 * ORDER: deploy the new firestore.rules + app code first, then run this
 * immediately after. (The script uses the Admin SDK, so rules don't gate it.)
 *
 *   node scripts/migrate-entitlements.mjs --dry-run   # preview only
 *   node scripts/migrate-entitlements.mjs             # migrate
 *
 * Credentials (same convention as app/api/lib/firebase-admin.ts):
 *   - FIREBASE_ADMIN_CREDENTIALS_JSON env var, or
 *   - firebase-admin-credentials.json in the repo root.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

const ENTITLEMENT_FIELDS = [
  "isSubscribed",
  "scanQuota",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "subscriptionStatus",
];

function loadCredentials() {
  const fromEnv = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (fromEnv) return JSON.parse(fromEnv);
  const localPath = join(__dirname, "..", "firebase-admin-credentials.json");
  if (existsSync(localPath)) return JSON.parse(readFileSync(localPath, "utf8"));
  console.error(
    "No Admin credentials. Set FIREBASE_ADMIN_CREDENTIALS_JSON or place " +
      "firebase-admin-credentials.json in the repo root."
  );
  process.exit(1);
}

initializeApp({ credential: cert(loadCredentials()) });
const db = getFirestore();

const users = await db.collection("users").get();
let migrated = 0;
let proCount = 0;
let unchanged = 0;

for (const userDoc of users.docs) {
  const data = userDoc.data();
  const present = ENTITLEMENT_FIELDS.filter((f) => data[f] !== undefined);
  if (present.length === 0) {
    unchanged++;
    continue;
  }

  const entitlements = {};
  for (const f of present) entitlements[f] = data[f];
  if (entitlements.isSubscribed === true) proCount++;

  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}${userDoc.id}: moving ${present.join(", ")}` +
      (entitlements.isSubscribed === true ? "  << PRO" : "")
  );

  if (!DRY_RUN) {
    await userDoc.ref
      .collection("entitlements")
      .doc("plan")
      .set(entitlements, { merge: true });
    await userDoc.ref.update(
      Object.fromEntries(present.map((f) => [f, FieldValue.delete()]))
    );
  }
  migrated++;
}

console.log(
  `\nDone${DRY_RUN ? " (dry run — nothing written)" : ""}: ` +
    `${migrated} migrated (${proCount} Pro), ${unchanged} had nothing to move, ` +
    `${users.size} total users.`
);
