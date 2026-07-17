import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "../../lib/firestore-rest";
import { getAdminFirestore, verifyIdToken } from "../../lib/firebase-admin";
import { pushToTokens, tokensForUser } from "../../lib/push";
import { newInviteToken, inviteUrl } from "../../lib/guardian-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ward → guardian request.
 *
 * The signed-in caller (the ward) asks the person at `phone` to become their
 * guardian. Two paths, depending on whether that phone belongs to a Guidr
 * account:
 *
 *  - Account exists → PENDING guardian_link + a push invite. They accept via
 *    /api/guardians/respond before any alerts reach them.
 *  - No account    → INVITED guardian_link carrying a share-link token. We
 *    return the URL so the ward can send it over WhatsApp/SMS themselves; the
 *    recipient claims it via /api/guardians/claim after signing in.
 *
 * Either way the guardian opts in explicitly. Nobody is enrolled by a ward
 * simply typing their number.
 *
 * Body: { phone: string (E.164), name?: string }
 */
export async function POST(req: NextRequest) {
  const wardUid = await verifyIdToken(req.headers.get("authorization"));
  if (!wardUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminFirestore();
  if (!db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  let phone = "";
  let name = "";
  try {
    const body = await req.json();
    phone = String(body?.phone || "").trim();
    name = String(body?.name || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    return NextResponse.json({ error: "Phone must be E.164 (e.g. +60123456789)" }, { status: 400 });
  }

  const wardSnapEarly = await db.collection("users").doc(wardUid).get();
  const wardDisplayName = wardSnapEarly.data()?.fullName || "A Guidr user";

  // Match the phone to a Guidr account by looking it up on user PROFILES
  // (users/{uid}.phone). On the free plan we don't OTP-verify phones, so we
  // can't use Firebase Auth's phone index — we match self-entered profile
  // numbers instead.
  const matches = await db.collection("users").where("phone", "==", phone).limit(2).get();

  // Nobody at that number yet. Rather than dead-ending (which used to strand
  // the ward with a contact who could never be a guardian), mint a share-link
  // invite the ward can send through WhatsApp/SMS themselves. The person who
  // opens it and signs in claims the link — see /api/guardians/claim.
  if (matches.empty) {
    // One invite per (ward, phone) so re-sending reuses the same URL and any
    // link already sitting in a chat thread keeps working.
    const priorSnap = await db
      .collection("guardian_links")
      .where("wardUid", "==", wardUid)
      .where("guardianPhone", "==", phone)
      .limit(1)
      .get();
    const prior = priorSnap.docs[0];
    const priorToken = prior?.data()?.inviteToken;

    if (prior && prior.data()?.status === "active") {
      return NextResponse.json({ linkStatus: "active", message: "Already your guardian." });
    }

    const token = typeof priorToken === "string" && priorToken ? priorToken : newInviteToken();
    let linkId: string;
    if (prior) {
      linkId = prior.id;
      await prior.ref.update({
        status: "invited",
        inviteToken: token,
        guardianName: name || prior.data()?.guardianName || "",
      });
    } else {
      const ref = await db.collection("guardian_links").add({
        wardUid,
        wardName: wardDisplayName,
        guardianUid: "", // filled in when the invite is claimed
        guardianPhone: phone,
        guardianName: name,
        status: "invited",
        inviteToken: token,
        createdAt: FieldValue.serverTimestamp(),
      });
      linkId = ref.id;
    }

    return NextResponse.json({
      linkStatus: "invited",
      linkId,
      inviteUrl: inviteUrl(token, req.nextUrl.origin),
    });
  }

  // Pick the first match that isn't the ward themselves.
  const guardianDoc = matches.docs.find((d) => d.id !== wardUid);
  if (!guardianDoc) {
    return NextResponse.json({ error: "You can't add yourself as a guardian." }, { status: 400 });
  }
  const guardianUid = guardianDoc.id;

  const wardName = wardDisplayName;

  // Idempotency: one link per (ward, guardian) pair.
  const existing = await db
    .collection("guardian_links")
    .where("wardUid", "==", wardUid)
    .where("guardianUid", "==", guardianUid)
    .limit(1)
    .get();

  let linkId: string;
  if (!existing.empty) {
    linkId = existing.docs[0].id;
    const status = existing.docs[0].data().status;
    if (status === "active") {
      return NextResponse.json({ linkStatus: "active", message: "Already your guardian." });
    }
    // Re-send a pending invite (e.g. previously declined).
    await db.collection("guardian_links").doc(linkId).update({
      status: "pending",
      guardianName: name || existing.docs[0].data().guardianName || "",
    });
  } else {
    const ref = await db.collection("guardian_links").add({
      wardUid,
      wardName,
      guardianUid,
      guardianPhone: phone,
      guardianName: name,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
    linkId = ref.id;
  }

  // Notify the prospective guardian (best-effort — never fail the request on push).
  try {
    const tokens = await tokensForUser(guardianUid);
    if (tokens.size > 0) {
      await pushToTokens(tokens, {
        title: "Guardian request",
        body: `${wardName} wants you as their Guardian on Guidr.`,
        url: "/settings",
      });
    }
  } catch (err) {
    console.error("[Guidr Guardian] invite push failed:", err);
  }

  return NextResponse.json({ linkStatus: "pending", guardianUid, linkId });
}
