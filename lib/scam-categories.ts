/**
 * Canonical scam taxonomy.
 *
 * The model is prompted to pick from this list, and any string it returns is
 * mapped back to one of these names. Keeping a fixed taxonomy is what lets
 * the trending leaderboard aggregate "Phishing", "phishing_attempt", and
 * "Phishing (Payment Information)" into a single bucket.
 *
 * Order matters in normalizeScamType — more specific categories are checked
 * before catch-alls (e.g. "Crypto Scam" before "Investment Scam" before
 * "Phishing").
 */

interface ScamCategory {
  name: string;
  keywords: string[];
}

const CATEGORIES: ScamCategory[] = [
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

/**
 * The canonical category for a "safe" verdict. Callers should skip
 * incrementScamType when normalizeScamType returns this value.
 */
export const SAFE_CATEGORY = "None";

/** The full canonical list, exposed so the AI prompt can enumerate them. */
export const CANONICAL_SCAM_CATEGORIES = [
  ...CATEGORIES.map((c) => c.name),
  "Other",
  SAFE_CATEGORY,
] as const;

/**
 * Map an AI-produced scam_type string to one canonical category.
 * Returns SAFE_CATEGORY for safe/non-scam outputs.
 */
export function normalizeScamType(raw: string | undefined | null): string {
  if (!raw) return "Other";
  const input = raw.toLowerCase().trim();
  if (!input || SAFE_TOKENS.has(input)) return SAFE_CATEGORY;

  for (const cat of CATEGORIES) {
    if (cat.keywords.some((kw) => input.includes(kw))) return cat.name;
  }
  return "Other";
}

/**
 * Format a week-over-week trend for display in the trending leaderboard.
 *
 * - "+New" when there's no prior week to compare against
 * - "+X%" or "-X%" otherwise, rounded to nearest integer
 * - "+0%" when both windows are zero (shouldn't normally happen)
 */
export function formatTrend(cases7d: number, casesPrev7d: number): string {
  if (casesPrev7d === 0) {
    return cases7d > 0 ? "+New" : "+0%";
  }
  const pct = Math.round(((cases7d - casesPrev7d) / casesPrev7d) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}%`;
}
