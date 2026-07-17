/**
 * Server-side counter bump for global stats and the trending-scams board.
 *
 * Why this exists: the client used to write directly to `stats/global` and
 * `scams/{id}` via Firestore rules that allowed any signed-in user to write.
 * That made two attacks trivial — (a) inflating/zeroing the public counters,
 * and (b) creating a `scams/microsoft_is_a_scam` document that surfaces on the
 * home page (defamation). The Firestore rules for both collections are now
 * `allow write: if false`; the only path is through here, with the Admin SDK
 * doing the writes and this route enforcing the schema.
 *
 * Security boundary:
 *   - Caller must present a valid Firebase ID token.
 *   - Per-uid rate limit so a single account can't run an inflation loop.
 *   - Allowed fields/categories are validated against fixed allowlists; the
 *     server picks the increment amount (always 1), never the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "../../lib/firestore-rest";
import { verifyIdToken, getAdminFirestore } from "../../lib/firebase-admin";
import { checkRateLimit } from "../../lib/admin";
import {
  normalizeScamType,
  CANONICAL_SCAM_CATEGORIES,
  SAFE_CATEGORY,
  formatTrend,
} from "@/lib/scam-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_GLOBAL_FIELDS = new Set(["totalCases", "reportedNSRC", "totalUsers"]);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const uid = await verifyIdToken(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`stats-bump:${uid}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { kind?: string; field?: string; scamType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) {
    const errorId = crypto.randomUUID();
    console.error(`[STATS-BUMP errorId=${errorId}] Admin SDK unavailable`);
    return NextResponse.json({ error: "service_unavailable", errorId }, { status: 503 });
  }

  try {
    if (body.kind === "global") {
      if (!body.field || !ALLOWED_GLOBAL_FIELDS.has(body.field)) {
        return NextResponse.json({ error: "unknown_field" }, { status: 400 });
      }
      await db
        .collection("stats")
        .doc("global")
        .set({ [body.field]: FieldValue.increment(1) }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (body.kind === "scam") {
      const canonical = normalizeScamType(body.scamType);
      if (canonical === SAFE_CATEGORY) {
        return NextResponse.json({ ok: true, skipped: "safe" });
      }
      if (!CANONICAL_SCAM_CATEGORIES.includes(canonical as typeof CANONICAL_SCAM_CATEGORIES[number])) {
        return NextResponse.json({ error: "unknown_category" }, { status: 400 });
      }

      const docId = canonical.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const scamRef = db.collection("scams").doc(docId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(scamRef);
        const now = Timestamp.now();

        if (!snap.exists) {
          tx.set(scamRef, {
            name: canonical,
            cases: 1,
            cases7d: 1,
            casesPrev7d: 0,
            windowStartedAt: now,
            trend: formatTrend(1, 0),
          });
          return;
        }

        const data = snap.data() as {
          cases?: number;
          cases7d?: number;
          casesPrev7d?: number;
          windowStartedAt?: Timestamp;
        };

        let cases7d = data.cases7d ?? 0;
        let casesPrev7d = data.casesPrev7d ?? 0;
        let windowStartedAt = data.windowStartedAt;

        if (windowStartedAt) {
          const ageMs = now.toMillis() - windowStartedAt.toMillis();
          if (ageMs >= WEEK_MS) {
            const weeksElapsed = Math.floor(ageMs / WEEK_MS);
            casesPrev7d = weeksElapsed >= 2 ? 0 : cases7d;
            cases7d = 0;
            windowStartedAt = Timestamp.fromMillis(
              windowStartedAt.toMillis() + weeksElapsed * WEEK_MS
            );
          }
        } else {
          windowStartedAt = now;
        }

        cases7d += 1;

        tx.update(scamRef, {
          name: canonical,
          cases: FieldValue.increment(1),
          cases7d,
          casesPrev7d,
          windowStartedAt,
          trend: formatTrend(cases7d, casesPrev7d),
        });
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown_kind" }, { status: 400 });
  } catch (error: any) {
    const errorId = crypto.randomUUID();
    console.error(`[STATS-BUMP errorId=${errorId}]`, error);
    return NextResponse.json({ error: "internal_error", errorId }, { status: 500 });
  }
}
