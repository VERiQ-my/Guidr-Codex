import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, verifyIdToken } from "../../lib/firebase-admin";
import { pushToTokens } from "../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fired when a ward hits a HIGH-confidence SCAM verdict. Notifies all of the
 * ward's ACTIVE guardians that the ward may be a target, so they can check in.
 *
 * The caller (the ward) is authenticated via their ID token; we derive the
 * ward from the token, never from the body, so a user can only trigger alerts
 * about themselves.
 *
 * Body: { scamType?: string }
 */
export async function POST(req: NextRequest) {
  const wardUid = await verifyIdToken(req.headers.get("authorization"));
  if (!wardUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let scamType = "";
  try {
    const body = await req.json();
    scamType = String(body?.scamType || "").trim();
  } catch {
    /* body optional */
  }

  const wardSnap = await db.collection("users").doc(wardUid).get();
  const wardName = wardSnap.data()?.fullName || "Someone you protect";

  // Active guardians for this ward.
  const links = await db
    .collection("guardian_links")
    .where("wardUid", "==", wardUid)
    .where("status", "==", "active")
    .get();

  if (links.empty) {
    return NextResponse.json({ guardians: 0, sent: 0, note: "No active guardians." });
  }

  // Gather every active guardian's tokens into one token→uid map.
  const tokenOwners = new Map<string, string>();
  await Promise.all(
    links.docs.map(async (d) => {
      const guardianUid = d.data().guardianUid as string;
      const gSnap = await db.collection("users").doc(guardianUid).get();
      const tokens: string[] = gSnap.data()?.fcmTokens || [];
      tokens.forEach((t) => tokenOwners.set(t, guardianUid));
    })
  );

  if (tokenOwners.size === 0) {
    return NextResponse.json({ guardians: links.size, sent: 0, note: "Guardians have no devices enabled." });
  }

  const result = await pushToTokens(tokenOwners, {
    title: "⚠️ Guidr Guardian Alert",
    body: `${wardName} just encountered a ${scamType || "scam"}. Check in with them.`,
    url: "/",
  });

  return NextResponse.json({ guardians: links.size, ...result });
}
