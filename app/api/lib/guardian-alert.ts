/**
 * Server-side Guardian Alerts, fired from the scan pipeline itself.
 *
 * WHY SERVER-SIDE: the old trigger lived in the results page, so a ward who
 * backgrounded or closed the app during a durable scan never alerted their
 * guardians even though the verdict landed. Both scan paths (ScanRunner DO and
 * the SSE route) call this after a successful verdict, so guardians hear about
 * every risky encounter regardless of what the ward's device is doing.
 *
 * Besides the push, each active guardian gets a doc under
 * `users/{guardianUid}/guardian_events` (guardian-readable via security rules,
 * server-write-only) powering the "recent alerts" feed and the weekly digest.
 * The subcollection lives under the guardian so the feed's `orderBy(at)`
 * query rides the automatic single-field index.
 */

import { getAdminFirestore } from "./firebase-admin";
import { pushToTokens } from "./push";
import { normalizeScamType } from "../../../lib/scam-categories";
import type { Analysis } from "./ai-utils";

/** Should this verdict alert the ward's guardians at all? */
export function verdictAlertsGuardians(analysis: Analysis): boolean {
  if (analysis.verdict === "SCAM") return true;
  // SUSPICIOUS with LOW confidence is too weak a signal to page a guardian.
  return analysis.verdict === "SUSPICIOUS" && analysis.confidence !== "LOW";
}

/**
 * Notify all of `wardUid`'s active guardians about a risky scan verdict.
 * Best-effort and never throws — a failed alert must never affect the scan.
 */
export async function notifyGuardiansOfVerdict(
  wardUid: string | undefined,
  analysis: Analysis
): Promise<void> {
  try {
    if (!wardUid || wardUid === "dev-anonymous") return;
    if (!verdictAlertsGuardians(analysis)) return;

    const db = getAdminFirestore();
    if (!db) return;

    const links = await db
      .collection("guardian_links")
      .where("wardUid", "==", wardUid)
      .where("status", "==", "active")
      .get();
    if (links.empty) return;

    const wardSnap = await db.collection("users").doc(wardUid).get();
    const wardName = wardSnap.data()?.fullName || "Someone you protect";

    const isScam = analysis.verdict === "SCAM";
    const scamType = analysis.scam_type || "";
    const now = Date.now();

    // One event doc per guardian (rules: guardian reads own, server writes).
    const tokenOwners = new Map<string, string>();
    await Promise.all(
      links.docs.map(async (d) => {
        const guardianUid = d.data().guardianUid as string;
        await db
          .collection(`users/${guardianUid}/guardian_events`)
          .doc()
          .set({
            wardUid,
            wardName,
            verdict: analysis.verdict,
            confidence: analysis.confidence,
            scamType,
            at: now,
            read: false,
          })
          .catch(() => {});
        const gSnap = await db.collection("users").doc(guardianUid).get();
        const tokens: string[] = gSnap.data()?.fcmTokens || [];
        tokens.forEach((t) => tokenOwners.set(t, guardianUid));
      })
    );

    if (tokenOwners.size === 0) return;

    // Push copy is personal and plain-spoken: lead with WHO needs checking
    // on, not with the brand (the OS already shows the app origin). The
    // category label follows the displayCategoryName rule — the internal
    // None/Other buckets are never shown to people.
    const canonical = normalizeScamType(scamType);
    const known = canonical !== "None" && canonical !== "Other";
    const label = known
      ? (canonical.includes("Scam") ? canonical : `${canonical} scam`).toLowerCase()
      : "scam";
    const article = /^[aeiou]/i.test(label) ? "an" : "a";
    const who = wardSnap.data()?.fullName ? wardName : "your loved one";

    await pushToTokens(tokenOwners, {
      type: isScam ? "guardian-alert" : "guardian-notice",
      title: isScam ? `⚠️ Check on ${who}` : `🔎 Keep an eye on ${who}`,
      body: isScam
        ? `They just came across ${article} ${label}. Call them now, before they reply.`
        : `They scanned a message that looks suspicious. A gentle check-in wouldn't hurt.`,
      url: "/settings",
    });
  } catch (err) {
    console.error("[guardian-alert] failed:", (err as Error)?.message || err);
  }
}
