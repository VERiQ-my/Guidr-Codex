import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, verifyIdToken } from "../../lib/firebase-admin";
import { pushToTokens, tokensForUser } from "../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Guardian accepts or declines a pending request.
 *
 * Only the named guardian may respond to their own link (opt-in enforced here).
 * Body: { linkId: string, accept: boolean }
 */
export async function POST(req: NextRequest) {
  const uid = await verifyIdToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let linkId = "";
  let accept = false;
  try {
    const body = await req.json();
    linkId = String(body?.linkId || "");
    accept = body?.accept === true;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!linkId) return NextResponse.json({ error: "Missing linkId" }, { status: 400 });

  const ref = db.collection("guardian_links").doc(linkId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  const link = snap.data()!;
  if (link.guardianUid !== uid) {
    return NextResponse.json({ error: "Not your request to answer." }, { status: 403 });
  }

  await ref.update({ status: accept ? "active" : "declined" });

  // Sync the ward's trusted-contact entry so their UI reflects the new status
  // instead of staying stuck on "pending". We match by the phone the ward
  // saved (which equals link.guardianPhone, both are E.164).
  try {
    const contactsRef = db
      .collection("users")
      .doc(link.wardUid)
      .collection("trusted_contacts");
    const contactSnap = await contactsRef
      .where("phone", "==", link.guardianPhone)
      .limit(1)
      .get();
    if (!contactSnap.empty) {
      const update: Record<string, unknown> = accept
        ? { status: "verified", linkStatus: "active", guardianUid: uid }
        : { linkStatus: "declined" };
      await contactSnap.docs[0].ref.update(update);
    }
  } catch (err) {
    console.error("[Guidr Guardian] trusted_contact sync failed:", err);
  }

  // Let the ward know the outcome (best-effort).
  try {
    const guardianName = link.guardianName || "Your contact";
    const tokens = await tokensForUser(link.wardUid);
    if (tokens.size > 0) {
      await pushToTokens(tokens, {
        title: accept ? "Guardian confirmed" : "Guardian request declined",
        body: accept
          ? `${guardianName} is now your Guardian and will be alerted if you hit a scam.`
          : `${guardianName} declined your Guardian request.`,
        url: "/settings",
      });
    }
  } catch (err) {
    console.error("[Guidr Guardian] response push failed:", err);
  }

  return NextResponse.json({ status: accept ? "active" : "declined" });
}
