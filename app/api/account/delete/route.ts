import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "../../lib/firebase-admin";
import { pushToTokens, tokensForUser } from "../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Permanently delete the signed-in user's account and all associated data.
 *
 * Order matters: notify guardians first (we still have the links), then wipe
 * Firestore data, then delete the Auth user last so a failure can't orphan the
 * auth record while data lingers. Best-effort on the guardian push — never let
 * a notification failure block the deletion the user asked for.
 */
export async function POST(req: NextRequest) {
  const uid = await verifyIdToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = getAdminAuth();
  const db = getAdminFirestore();
  if (!auth || !db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const userRef = db.collection("users").doc(uid);

  // 1) Notify active guardians that this ward is leaving (best-effort).
  try {
    const wardName = (await userRef.get()).data()?.fullName || "A Guidr user";
    const links = await db
      .collection("guardian_links")
      .where("wardUid", "==", uid)
      .where("status", "==", "active")
      .get();
    for (const link of links.docs) {
      const guardianUid = link.data().guardianUid;
      if (!guardianUid) continue;
      const tokens = await tokensForUser(guardianUid);
      if (tokens.size > 0) {
        await pushToTokens(tokens, {
          title: "Guardian link ended",
          body: `${wardName} has deleted their Guidr account.`,
          url: "/settings",
        });
      }
    }
  } catch (err) {
    console.error("[Guidr Account] guardian notify on delete failed:", err);
  }

  // 2) Delete the user's data.
  try {
    // Guardian links in both directions.
    const [asWard, asGuardian] = await Promise.all([
      db.collection("guardian_links").where("wardUid", "==", uid).get(),
      db.collection("guardian_links").where("guardianUid", "==", uid).get(),
    ]);
    const cases = await db.collection("cases").where("userId", "==", uid).get();

    const batch = db.batch();
    [...asWard.docs, ...asGuardian.docs, ...cases.docs].forEach((d) => batch.delete(d.ref));
    batch.delete(db.collection("presence").doc(uid));
    await batch.commit();

    // recursiveDelete wipes the user doc plus its sub-collections
    // (trusted_contacts, sessions) in one call.
    await db.recursiveDelete(userRef);
  } catch (err) {
    console.error("[Guidr Account] data delete failed:", err);
    return NextResponse.json({ error: "Couldn't delete your data. Please try again." }, { status: 500 });
  }

  // 3) Delete the Auth user last.
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    console.error("[Guidr Account] auth deleteUser failed:", err);
    return NextResponse.json({ error: "Your data was removed but the login couldn't be deleted. Contact support." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
