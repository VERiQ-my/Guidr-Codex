/**
 * Weekly scam-trend warning — Sunday 20:00 MYT (dispatched by entry.mjs on
 * the daily cron; the personal daily reminder is skipped that evening so
 * nobody gets two pushes in one night).
 *
 * Picks the scam category the Guidr community flagged most this week
 * (scams/{id}.cases7d, maintained server-side by /api/stats/bump) and warns
 * EVERY push-enabled user — a genuine warning goes to active users too,
 * unlike the daily reminder. Also writes an announcements/ doc (same schema
 * the admin dashboard writes) so the in-app notification bell carries it.
 *
 * Skips entirely when the week had fewer than MIN_CASES reports of any
 * category — a trend warning built on one case is noise, and noise trains
 * people to revoke push permission. entry.mjs falls back to the daily
 * reminder when this skips.
 */

import { getAdminFirestore } from "../app/api/lib/firebase-admin";
import { Timestamp } from "../app/api/lib/firestore-rest";
import { pushToTokens } from "../app/api/lib/push";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Fewer weekly reports than this and there's no "trend" worth waking phones.
const MIN_CASES = 2;

export async function runWeeklyScamWarning(): Promise<{ sent: number }> {
  const db = getAdminFirestore();
  if (!db) {
    console.error("[scam-trend] no admin Firestore; skipping");
    return { sent: 0 };
  }

  // One doc per canonical category — this is a tiny collection.
  const scamsSnap = await db.collection("scams").limit(50).get();
  const now = Date.now();
  let top: { name: string; count: number } | null = null;
  scamsSnap.forEach((d) => {
    const x = d.data() || {};
    const name = String(x.name || "");
    if (!name || name === "None") return;
    // cases7d resets lazily on the next bump; an untouched doc may carry a
    // stale count from an expired window.
    const startedMs = x.windowStartedAt instanceof Timestamp ? x.windowStartedAt.toMillis() : 0;
    const count = startedMs && now - startedMs < WEEK_MS ? Number(x.cases7d) || 0 : 0;
    if (count > (top?.count ?? 0)) top = { name, count };
  });

  if (!top || (top as { count: number }).count < MIN_CASES) {
    console.log("[scam-trend] nothing trending this week; skipping");
    return { sent: 0 };
  }
  const { name, count } = top as { name: string; count: number };
  const label = name === "Other" ? "A new scam wave" : name;

  const title = `📢 ${label} is trending this week`;
  const body = `The Guidr community flagged it ${count} times in 7 days. Learn the signs before it reaches you or your family.`;
  const url = "/learn";

  // In-app announcement (same shape the admin dashboard writes; the bell
  // reads title/body/segment/active/createdAt).
  await db
    .collection("announcements")
    .add({
      title,
      body,
      segment: "all",
      active: true,
      createdByUid: "system-scam-trend",
      createdByEmail: null,
      createdAt: new Date().toISOString(),
    })
    .catch((e) => console.error("[scam-trend] announcement write failed:", (e as Error)?.message));

  // Every push-enabled user; warnings are not throttled by activity.
  const usersSnap = await db.collection("users").limit(5000).get();
  const tokenOwners = new Map<string, string>();
  usersSnap.forEach((d) => {
    const t = d.data()?.fcmTokens;
    if (Array.isArray(t)) {
      t.filter((v: unknown) => typeof v === "string").forEach((tok: string) =>
        tokenOwners.set(tok, d.id)
      );
    }
  });
  if (tokenOwners.size === 0) {
    console.log("[scam-trend] announcement written; no push tokens to warn");
    return { sent: 1 }; // the announcement still counts as this week's warning
  }

  const res = await pushToTokens(tokenOwners, { type: "broadcast", title, body, url });
  console.log(`[scam-trend] warned about "${name}" (${count} cases): ${res.sent} sent, ${res.failed} failed`);
  return { sent: Math.max(res.sent, 1) };
}
