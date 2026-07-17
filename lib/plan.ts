/**
 * Guidr Pro — single source of truth for Free vs Pro entitlements.
 *
 * This module is intentionally framework-agnostic (no Firebase/Next imports) so
 * it can be used identically on the client (gating UI) and on the server
 * (enforcing limits in route handlers). Keep all plan numbers here so a price
 * or limit change is a one-line edit, not a hunt across the codebase.
 */

// ── Free-tier limits ──────────────────────────────────────────────────────
/** AI scans a free account may run per day (resets at local Malaysian midnight). */
export const FREE_DAILY_SCANS = 5;

/** Trusted contacts (guardians) a free account may save. Mirrors the value
 *  historically inlined as FREE_CONTACT_LIMIT / TRUSTED_CONTACT_FREE_LIMIT. */
export const FREE_CONTACT_LIMIT = 5;

/** How much of a verdict a free account sees in full. The rest is blurred
 *  behind a Pro upsell. Pro accounts see everything. */
export const FREE_EVIDENCE_LIMIT = 1; // evidence-chain items shown in full
export const FREE_ACTION_LIMIT = 2;   // recommended actions shown in full

/**
 * NSRC report sections a free account may see/export in full. The detailed
 * forensic sections (evidence chain, suspicious parties, verbatim message,
 * recommended actions) are Pro-only — and the exported PDF mirrors exactly
 * what's shown on screen. Keys are the uppercased section titles produced by
 * generate-report. SUBMISSION CHANNELS (the NSRC 997 contacts) stays free so
 * the safety path is never paywalled.
 */
export const FREE_REPORT_SECTIONS: ReadonlySet<string> = new Set([
  "REPORTER INFORMATION",
  "INCIDENT CLASSIFICATION",
  "INCIDENT SUMMARY",
  "SUBMISSION CHANNELS",
]);

// ── Pricing (display only; the real price lives in the Stripe product) ──────
export const PRO_PRICE_LABEL = "RM 0.01";
export const PRO_PRICE_PERIOD = "month";

// ── Entitlements (server-owned) ─────────────────────────────────────────────
/**
 * Server-owned entitlement state, stored at users/{uid}/entitlements/plan.
 * Written ONLY via the Admin SDK — the Stripe webhook/confirm grant or revoke
 * Pro, and the scan-quota consumer counts scans. Firestore rules deny every
 * client write to this document (and block these keys on the profile doc), so
 * a user cannot flip isSubscribed or reset their own quota from the browser.
 */
export interface Entitlements {
  isSubscribed?: boolean | null;
  subscriptionStatus?: string; // mirrors Stripe: active | past_due | canceled | ...
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  scanQuota?: ScanQuota | null;
}

/** Firestore document path of a user's entitlements (client + Admin SDK). */
export function entitlementsPath(uid: string): string {
  return `users/${uid}/entitlements/plan`;
}

/** Whether the given entitlements grant Guidr Pro. */
export function isPro(ent: Entitlements | null | undefined): boolean {
  return !!ent?.isSubscribed;
}

// ── Daily scan quota ────────────────────────────────────────────────────────
/**
 * Per-user daily scan counter stored on the entitlements doc as:
 *   scanQuota: { date: "YYYY-MM-DD" (Malaysian), count: number }
 * A new day (different `date`) implicitly resets the count to 0.
 */
export interface ScanQuota {
  date: string;
  count: number;
}

/**
 * Today's date key in Asia/Kuala_Lumpur (UTC+8), as YYYY-MM-DD.
 *
 * Guidr's users are Malaysian, and the daily quota must reset on a single,
 * stable calendar boundary regardless of where the serverless function runs.
 * Pinning to MYT keeps the client's displayed count and the server's enforced
 * count in agreement.
 */
export function malaysianDayKey(date: Date = new Date()): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Scans the user has left today. Pro is unlimited (Infinity). A free user with
 * no quota doc, or a quota doc from a previous day, gets the full allowance.
 */
export function scansRemaining(
  quota: ScanQuota | null | undefined,
  pro: boolean,
  today: string = malaysianDayKey()
): number {
  if (pro) return Infinity;
  if (!quota || quota.date !== today) return FREE_DAILY_SCANS;
  return Math.max(0, FREE_DAILY_SCANS - (quota.count || 0));
}

/** Whether the user may start another scan right now. */
export function canScan(
  quota: ScanQuota | null | undefined,
  pro: boolean,
  today: string = malaysianDayKey()
): boolean {
  return scansRemaining(quota, pro, today) > 0;
}
