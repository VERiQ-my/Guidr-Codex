/**
 * Server-side enforcement of the free-tier daily scan limit.
 *
 * Free accounts may run FREE_DAILY_SCANS successful scans per Malaysian day;
 * Pro accounts are unlimited. Both the Pro flag and the counter live on the
 * server-owned entitlements doc (users/{uid}/entitlements/plan — see
 * lib/plan.ts), written with the Firebase-project Admin SDK. Firestore rules
 * deny all client writes there, so neither value can be forged or reset from
 * the browser (security fix F-1).
 *
 * FAIL-OPEN: if admin credentials are missing or Firestore is unreachable, we
 * allow the scan rather than hard-blocking paying/legit users — consistent with
 * how the concurrency queue degrades.
 *
 * COUNTING MODEL: we check the gate at enqueue time (block the 6th scan) but
 * only *consume* a unit when a verdict is actually produced. Failed/aborted
 * scans therefore don't burn the user's daily allowance.
 */

import { getAdminFirestore } from "./firebase-admin";
import { FREE_DAILY_SCANS, malaysianDayKey, entitlementsPath } from "@/lib/plan";

export interface QuotaCheck {
  allowed: boolean;
  remaining: number; // Infinity for Pro
  pro: boolean;
}

/** Read-only quota check for the gate. Never throws (fails open). */
export async function checkScanQuota(uid: string): Promise<QuotaCheck> {
  const db = getAdminFirestore();
  if (!db) return { allowed: true, remaining: FREE_DAILY_SCANS, pro: false };
  try {
    const snap = await db.doc(entitlementsPath(uid)).get();
    const data = snap.exists ? snap.data()! : {};
    if (data.isSubscribed) return { allowed: true, remaining: Infinity, pro: true };

    const today = malaysianDayKey();
    const q = data.scanQuota;
    const count = q && q.date === today ? q.count || 0 : 0;
    const remaining = Math.max(0, FREE_DAILY_SCANS - count);
    return { allowed: remaining > 0, remaining, pro: false };
  } catch (err) {
    console.error("[scan-quota] check failed (failing open):", (err as Error)?.message || err);
    return { allowed: true, remaining: FREE_DAILY_SCANS, pro: false };
  }
}

/**
 * Count one completed scan against the daily quota. Transactional so concurrent
 * scans by the same user can't lose a count; handles the day rollover. No-op
 * for Pro users. Best-effort — never throws.
 */
export async function consumeScanQuota(uid: string): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  const ref = db.doc(entitlementsPath(uid));
  const today = malaysianDayKey();
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data()! : {};
      if (data.isSubscribed) return; // Pro: unlimited, don't track
      const q = data.scanQuota;
      const count = q && q.date === today ? (q.count || 0) + 1 : 1;
      tx.set(ref, { scanQuota: { date: today, count } }, { merge: true });
    });
  } catch (err) {
    console.error("[scan-quota] consume failed:", (err as Error)?.message || err);
  }
}
