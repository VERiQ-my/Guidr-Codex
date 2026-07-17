import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Sign out all other sessions."
 *
 * Firebase Auth has no per-session revocation — revokeRefreshTokens(uid)
 * invalidates every refresh token for the account. That's the real security
 * action we want (any stolen/forgotten device can no longer mint new tokens).
 * The current device keeps working on its existing ID token until it expires
 * (~1h), so in practice it stays signed in while others are pushed out.
 *
 * We also delete the other devices' session docs so the sign-in history
 * reflects the change immediately, keeping the caller's own session row.
 *
 * Body: { sessionId: string }  — the caller's current device id to preserve.
 */
export async function POST(req: NextRequest) {
  const uid = await verifyIdToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = getAdminAuth();
  const db = getAdminFirestore();
  if (!auth || !db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let currentSessionId = "";
  try {
    const body = await req.json();
    currentSessionId = String(body?.sessionId || "").trim();
  } catch {
    /* body optional */
  }

  // Invalidate every refresh token for this user.
  await auth.revokeRefreshTokens(uid);

  // Prune other devices' session docs (keep the current one).
  const sessionsRef = db.collection("users").doc(uid).collection("sessions");
  const snap = await sessionsRef.get();
  let revoked = 0;
  const batch = db.batch();
  snap.docs.forEach((d) => {
    if (d.id !== currentSessionId) {
      batch.delete(d.ref);
      revoked++;
    }
  });
  if (revoked > 0) await batch.commit();

  return NextResponse.json({ ok: true, revoked });
}
