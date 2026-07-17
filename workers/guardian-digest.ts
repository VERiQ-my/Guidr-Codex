/**
 * Guardian weekly digest — run by the Worker's cron trigger (see entry.mjs +
 * wrangler.jsonc). For every guardian whose wards hit risky verdicts in the
 * last 7 days, sends one push summarizing who encountered what, so guardians
 * get a weekly nudge to check in even if they missed the real-time alerts.
 *
 * Reads the same `users/{guardianUid}/guardian_events` docs the real-time
 * alert path writes (app/api/lib/guardian-alert.ts). Guardians with no events
 * this week get nothing — the digest must never become noise.
 */

import { getAdminFirestore } from "../app/api/lib/firebase-admin";
import { pushToTokens, tokensForUser } from "../app/api/lib/push";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface WardWeek {
  wardName: string;
  scams: number;
  suspicious: number;
}

/** "Ali (3 scams, 1 suspicious)" — compact, elder-friendly phrasing. */
function wardSummary(w: WardWeek): string {
  const parts: string[] = [];
  if (w.scams > 0) parts.push(`${w.scams} scam${w.scams > 1 ? "s" : ""}`);
  if (w.suspicious > 0) parts.push(`${w.suspicious} suspicious message${w.suspicious > 1 ? "s" : ""}`);
  return `${w.wardName} (${parts.join(", ")})`;
}

export async function runGuardianWeeklyDigest(): Promise<{ guardians: number; sent: number }> {
  const db = getAdminFirestore();
  if (!db) {
    console.error("[guardian-digest] no admin Firestore; skipping");
    return { guardians: 0, sent: 0 };
  }

  // Every guardian who currently protects someone. Equality-only filter so it
  // rides the automatic index, like the rest of the codebase's queries.
  const links = await db
    .collection("guardian_links")
    .where("status", "==", "active")
    .limit(1000)
    .get();
  const guardianUids = [...new Set(links.docs.map((d) => d.data().guardianUid as string))];

  const cutoff = Date.now() - WEEK_MS;
  let sent = 0;

  for (const guardianUid of guardianUids) {
    try {
      const events = await db
        .collection(`users/${guardianUid}/guardian_events`)
        .where("at", ">=", cutoff)
        .limit(200)
        .get();
      if (events.empty) continue;

      // Aggregate the week per ward.
      const byWard = new Map<string, WardWeek>();
      for (const doc of events.docs) {
        const e = doc.data();
        const w = byWard.get(e.wardUid) || { wardName: e.wardName || "Someone you protect", scams: 0, suspicious: 0 };
        if (e.verdict === "SCAM") w.scams++;
        else w.suspicious++;
        byWard.set(e.wardUid, w);
      }

      const tokens = await tokensForUser(guardianUid);
      if (tokens.size === 0) continue;

      const summaries = [...byWard.values()].map(wardSummary);
      // Keep the push body readable if someone guards many people.
      const shown = summaries.slice(0, 3).join("; ") + (summaries.length > 3 ? "…" : "");

      const res = await pushToTokens(tokens, {
        type: "guardian-digest",
        title: "🛡️ Your weekly Guidr check-in",
        body: `This week: ${shown}. A quick call goes a long way.`,
        url: "/settings",
      });
      if (res.sent > 0) sent++;
    } catch (err) {
      // One guardian's failure must not stop the rest of the digest run.
      console.error(`[guardian-digest] failed for ${guardianUid}:`, (err as Error)?.message || err);
    }
  }

  console.log(`[guardian-digest] done: ${guardianUids.length} guardians, ${sent} digests sent`);
  return { guardians: guardianUids.length, sent };
}
