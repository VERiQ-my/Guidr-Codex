/**
 * POST /api/scan/status — read a durable scan's result via the Admin SDK.
 *
 * The client's primary channel for a background scan is a realtime Firestore
 * listener on `scans/{scanId}`. That listener depends on the deployed security
 * rules permitting the owner to read the doc AND on Firestore's streaming
 * transport reaching the browser. If either is unavailable (rules not deployed,
 * a proxy that blocks WebChannel, etc.), the scan still COMPLETES server-side
 * but the verdict never reaches the client — it just spins to the watchdog.
 *
 * This endpoint is the rules-independent safety net: it reads the same doc with
 * the Admin SDK (which bypasses client security rules) so the client can poll
 * for the result even when the live listener is dead. Authorization is enforced
 * here instead — only the scan's owner may read it.
 */

import { NextRequest } from "next/server";
import { verifyRequest } from "../../lib/admin";
import { getAdminFirestore } from "../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const uid = await verifyRequest(req.headers.get("authorization"));
  if (!uid && process.env.NODE_ENV === "production") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { scanId } = await req.json().catch(() => ({}));
  if (!scanId || typeof scanId !== "string") {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return Response.json({ error: "unavailable" }, { status: 503 });

  const snap = await db.doc(`scans/${scanId}`).get();
  if (!snap.exists) return Response.json({ status: "missing" }, { status: 404 });

  const data = snap.data()!;
  // Only the owner may read their scan. (In dev, uid may be null — allow it so
  // local testing without a token still works, mirroring the other routes.)
  if (uid && data.userId && data.userId !== uid && data.userId !== "dev-anonymous") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  return Response.json({
    status: data.status,
    stage: data.stage,
    statusMessage: data.statusMessage,
    toolSteps: data.toolSteps || [],
    analysis: data.analysis || null,
    errorKind: data.errorKind,
    errorMessage: data.errorMessage,
  });
}
