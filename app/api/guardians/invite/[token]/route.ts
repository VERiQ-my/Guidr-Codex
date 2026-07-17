import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public preview of a guardian invite: "Aisyah wants you as their Guardian."
 *
 * Unauthenticated on purpose — the recipient has to see who is asking BEFORE
 * they decide to create an account. Holding the token is what proves they were
 * invited, so the response deliberately carries the bare minimum: the ward's
 * display name and the link state. Never the ward's uid, never the phone the
 * invite was addressed to, never the token back again.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const snap = await db
    .collection("guardian_links")
    .where("inviteToken", "==", token)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ error: "This invite link is no longer valid." }, { status: 404 });
  }

  const link = snap.docs[0].data();
  return NextResponse.json({
    wardName: link.wardName || "A Guidr user",
    guardianName: link.guardianName || "",
    // "invited" = still open. "active" = somebody already claimed it.
    status: link.status === "invited" ? "invited" : "claimed",
  });
}
