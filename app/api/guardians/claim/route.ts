import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, verifyIdToken } from "../../lib/firebase-admin";
import { pushToTokens, tokensForUser } from "../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Claim a share-link guardian invite: the signed-in caller becomes the
 * guardian on the link carrying `token`.
 *
 * Opening the link and signing in IS the acceptance, so this lands the link
 * straight in "active" (no second accept step in /settings — that would be a
 * confirmation of a confirmation, and every extra tap here costs us the
 * relationship we're trying to form).
 *
 * A token is single-use: only a link still in "invited" can be claimed, so a
 * forwarded URL can't quietly reassign a guardian who already accepted.
 *
 * Body: { token: string }
 */
export async function POST(req: NextRequest) {
  const uid = await verifyIdToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let token = "";
  try {
    const body = await req.json();
    token = String(body?.token || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const snap = await db
    .collection("guardian_links")
    .where("inviteToken", "==", token)
    .limit(1)
    .get();
  if (snap.empty) {
    return NextResponse.json({ error: "This invite link is no longer valid." }, { status: 404 });
  }

  const ref = snap.docs[0].ref;
  const link = snap.docs[0].data();

  if (link.wardUid === uid) {
    return NextResponse.json({ error: "You can't be your own guardian." }, { status: 400 });
  }
  if (link.status !== "invited") {
    // Already claimed. Idempotent for the person who claimed it; a dead end
    // for anyone else the link was forwarded to.
    if (link.guardianUid === uid) {
      return NextResponse.json({ status: "active", wardName: link.wardName || "" });
    }
    return NextResponse.json(
      { error: "This invite has already been used." },
      { status: 409 }
    );
  }

  await ref.update({ guardianUid: uid, status: "active" });

  // Point the ward's contact card at the real account, so their Guardian hub
  // stops showing "invite sent" and starts showing an active guardian. Matched
  // by the phone the invite was addressed to (both sides store E.164).
  try {
    const contactSnap = await db
      .collection("users")
      .doc(link.wardUid)
      .collection("trusted_contacts")
      .where("phone", "==", link.guardianPhone)
      .limit(1)
      .get();
    if (!contactSnap.empty) {
      await contactSnap.docs[0].ref.update({
        status: "verified",
        linkStatus: "active",
        guardianUid: uid,
      });
    }
  } catch (err) {
    console.error("[Guidr Guardian] claim trusted_contact sync failed:", err);
  }

  // Tell the ward the good news (best-effort — never fail the claim on push).
  try {
    const guardianName = link.guardianName || "Your contact";
    const tokens = await tokensForUser(link.wardUid);
    if (tokens.size > 0) {
      await pushToTokens(tokens, {
        type: "guardian-linked",
        title: "Guardian confirmed",
        body: `${guardianName} joined Guidr and is now your Guardian. They'll be alerted if you hit a scam.`,
        url: "/settings",
      });
    }
  } catch (err) {
    console.error("[Guidr Guardian] claim push failed:", err);
  }

  return NextResponse.json({ status: "active", wardName: link.wardName || "" });
}
