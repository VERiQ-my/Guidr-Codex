/**
 * One-time backfill: canonicalize the `scamType` field on existing `cases`
 * and `alerts` documents so stored data matches lib/scam-categories.ts.
 *
 * Going forward, saveCase()/createAlert() normalize on write — this script
 * fixes the records created before that change. It updates the field in place
 * (no merging/deleting, unlike migrate-scam-categories.mjs which collapses the
 * aggregate `scams` leaderboard).
 *
 *   node scripts/migrate-case-categories.mjs           # dry-run, prints plan
 *   node scripts/migrate-case-categories.mjs --apply   # actually writes
 *
 * Uses the Firebase Admin SDK with firebase-admin-credentials.json in the
 * project root (bypasses Firestore rules). Idempotent — re-running on
 * already-canonical data is a no-op.
 *
 * NOTE: category logic is duplicated from lib/scam-categories.ts so this .mjs
 * needs no TS build step. One-off — drift is acceptable.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// ── Canonical taxonomy (mirrors lib/scam-categories.ts) ─────────────
const CATEGORIES = [
  { name: "Crypto Scam",          keywords: ["crypto", "bitcoin", "ether", "btc", "blockchain", "nft", "web3"] },
  { name: "Investment Scam",      keywords: ["invest", "trading", "stock", "forex", "fund", "return on", "high return"] },
  { name: "Romance Scam",         keywords: ["romance", "dating", "relationship", "love scam"] },
  { name: "Lottery Scam",         keywords: ["lottery", "prize", "winner", "jackpot", "lucky draw", "you won", "you've won"] },
  { name: "Job Scam",             keywords: ["job", "recruit", "interview", "employ", "hiring", "vacancy", "career", "task-based"] },
  { name: "Loan Scam",            keywords: ["loan", "pinjaman", "kredit peribadi", "instant credit"] },
  { name: "Online Shopping Scam", keywords: ["shopping", "purchase", "e-commerce", "shopee", "lazada", "fake product", "fake order"] },
  { name: "Tech Support Scam",    keywords: ["tech support", "technical support", "virus", "microsoft support", "apple support"] },
  { name: "Delivery Scam",        keywords: ["delivery", "parcel", "package", "courier", "pos malaysia", "shipping", "customs"] },
  { name: "Charity Scam",         keywords: ["charity", "donat", "fundrais", "nonprofit"] },
  { name: "Impersonation",        keywords: ["impersonat", "lhdn", "polis", "police", "bank impersonat", "government", "macc", "spr", "tnb"] },
  { name: "Phishing",             keywords: ["phish", "credential", "otp", "password reset", "verify your account", "account suspended"] },
];
const SAFE_TOKENS = new Set(["none", "n/a", "na", "not applicable", "safe", "legitimate", "legit"]);
const SAFE_CATEGORY = "None";

function normalizeScamType(raw) {
  if (!raw) return "Other";
  const input = String(raw).toLowerCase().trim();
  if (!input || SAFE_TOKENS.has(input)) return SAFE_CATEGORY;
  for (const cat of CATEGORIES) {
    if (cat.keywords.some((kw) => input.includes(kw))) return cat.name;
  }
  return "Other";
}

// ── Load Firebase Admin credentials ──────────────────────────────────
const credsPath = join(projectRoot, "firebase-admin-credentials.json");
if (!existsSync(credsPath)) {
  console.error(`Missing ${credsPath}`);
  console.error("This script needs the Admin SDK service account JSON to bypass Firestore rules.");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(credsPath, "utf8"));
} catch (e) {
  console.error(`Failed to parse firebase-admin-credentials.json: ${e.message}`);
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

/** Plan + (optionally) apply scamType canonicalization for one collection. */
async function migrateCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) {
    console.log(`\n[${name}] empty — nothing to do.`);
    return { scanned: 0, changed: 0 };
  }

  const changes = [];
  snap.forEach((d) => {
    const raw = d.data().scamType;
    const canonical = normalizeScamType(raw);
    if (raw !== canonical) {
      changes.push({ id: d.id, from: raw ?? "(missing)", to: canonical });
    }
  });

  console.log(`\n[${name}] ${snap.size} scanned, ${changes.length} need canonicalizing:`);
  // Summarize by transition so the output stays readable on large datasets.
  const byTransition = new Map();
  for (const c of changes) {
    const key = `"${c.from}" → "${c.to}"`;
    byTransition.set(key, (byTransition.get(key) || 0) + 1);
  }
  for (const [key, count] of [...byTransition.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${count.toString().padStart(5)} × ${key}`);
  }

  if (!APPLY || changes.length === 0) return { scanned: snap.size, changed: changes.length };

  // Firestore batches cap at 500 writes.
  let written = 0;
  for (let i = 0; i < changes.length; i += 450) {
    const batch = db.batch();
    for (const c of changes.slice(i, i + 450)) {
      batch.update(db.collection(name).doc(c.id), { scamType: c.to });
    }
    await batch.commit();
    written += Math.min(450, changes.length - i);
    console.log(`    ✓ committed ${written}/${changes.length}`);
  }

  return { scanned: snap.size, changed: changes.length };
}

async function main() {
  console.log(
    `Case category backfill for project: ${serviceAccount.project_id} (${APPLY ? "APPLY" : "DRY RUN"})`
  );

  const results = {};
  for (const name of ["cases", "alerts"]) {
    results[name] = await migrateCollection(name);
  }

  const totalChanged = Object.values(results).reduce((a, r) => a + r.changed, 0);
  console.log(`\nSummary: ${totalChanged} document(s) ${APPLY ? "updated" : "to update"}.`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to perform writes.");
  } else {
    console.log("\n✓ Backfill complete.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
