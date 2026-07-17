/**
 * One-time migration: collapse fragmented `scams/*` docs into the canonical
 * taxonomy defined by lib/scam-categories.ts.
 *
 * Existing leaderboard rows like:
 *   - phishing                       (cases: 10)
 *   - phishing_payment_information_  (cases: 2)
 *   - phishing_attempt               (cases: 2)
 *
 * all represent the same category. This script normalizes each existing doc
 * to a canonical category, sums the cases into the canonical doc, then
 * deletes the stale ones.
 *
 *   node scripts/migrate-scam-categories.mjs           # dry-run, prints plan
 *   node scripts/migrate-scam-categories.mjs --apply   # actually writes
 *
 * Uses the Firebase Admin SDK with firebase-admin-credentials.json in the
 * project root. This bypasses Firestore rules (which require signedIn() for
 * scams writes) — the right pattern for one-off migrations.
 *
 * Idempotent — running it twice on already-canonical data is a no-op.
 *
 * NOTE: the category logic is duplicated from lib/scam-categories.ts so this
 * .mjs script doesn't need a TS build step. It's a one-off — drift is fine.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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

function canonicalDocId(category) {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "_");
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

async function main() {
  console.log(
    `Migration plan for project: ${serviceAccount.project_id} (${APPLY ? "APPLY" : "DRY RUN"})\n`
  );

  const snap = await db.collection("scams").get();
  if (snap.empty) {
    console.log("No scam docs found. Nothing to migrate.");
    process.exit(0);
  }

  // Group existing docs by their canonical target.
  const groups = new Map();

  snap.forEach((d) => {
    const data = d.data();
    const rawName = data.name || d.id;
    const cases = Number(data.cases) || 0;
    const canonicalName = normalizeScamType(rawName);

    if (canonicalName === SAFE_CATEGORY) {
      console.log(`  [drop] ${d.id} → safe verdict, will delete`);
      groups.set("__delete__:" + d.id, {
        canonicalName: SAFE_CATEGORY,
        totalCases: 0,
        sources: [{ id: d.id, name: rawName, cases }],
        deleteOnly: true,
      });
      return;
    }

    const canonicalId = canonicalDocId(canonicalName);
    if (!groups.has(canonicalId)) {
      groups.set(canonicalId, {
        canonicalName,
        totalCases: 0,
        sources: [],
      });
    }
    const g = groups.get(canonicalId);
    g.totalCases += cases;
    g.sources.push({ id: d.id, name: rawName, cases });
  });

  // Report the plan.
  let toDelete = 0;
  let toMerge = 0;
  for (const [canonicalId, g] of groups) {
    if (g.deleteOnly) {
      toDelete += g.sources.length;
      continue;
    }
    const needsMerge = g.sources.length > 1 || g.sources[0]?.id !== canonicalId;
    if (needsMerge) toMerge++;
    console.log(`  ${needsMerge ? "[merge]" : "[keep]"} ${canonicalId}  (${g.totalCases} cases)`);
    for (const s of g.sources) {
      console.log(`      ← ${s.id}  name="${s.name}"  cases=${s.cases}`);
    }
  }

  console.log(
    `\nSummary: ${groups.size - toDelete} canonical buckets, ${toMerge} merges, ${toDelete} drops.`
  );

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to perform writes.");
    process.exit(0);
  }

  console.log("\nApplying...");
  const now = Timestamp.now();

  for (const [canonicalId, g] of groups) {
    if (g.deleteOnly) {
      for (const s of g.sources) {
        await db.collection("scams").doc(s.id).delete();
        console.log(`  ✓ deleted ${s.id}`);
      }
      continue;
    }

    // Write canonical doc with merged totals. Rotation fields start fresh —
    // we can't reconstruct historical 7d windows from aggregate counts.
    await db.collection("scams").doc(canonicalId).set({
      name: g.canonicalName,
      cases: g.totalCases,
      cases7d: 0,
      casesPrev7d: 0,
      windowStartedAt: now,
      trend: "+0%",
    });
    console.log(`  ✓ wrote ${canonicalId} (cases=${g.totalCases})`);

    // Delete any source docs that aren't the canonical target.
    for (const s of g.sources) {
      if (s.id !== canonicalId) {
        await db.collection("scams").doc(s.id).delete();
        console.log(`    ✓ deleted stale ${s.id}`);
      }
    }
  }

  console.log("\n✓ Migration complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
