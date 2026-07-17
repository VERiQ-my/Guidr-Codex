import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, verifyIdToken } from "../../lib/firebase-admin";
import type { QuerySnapshot } from "../../lib/firestore-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download-my-data (PDPA access request). Gathers everything we hold about the
 * signed-in user — profile, cases, trusted contacts, sessions, and guardian
 * links (both directions) — and returns it as a single JSON payload. The
 * client renders it into a plain-language PDF (lib/data-export-pdf.ts).
 */
export async function POST(req: NextRequest) {
  const uid = await verifyIdToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const userRef = db.collection("users").doc(uid);
  const [profileSnap, entitlementsSnap, contactsSnap, sessionsSnap, casesSnap, asWardSnap, asGuardianSnap] =
    await Promise.all([
      userRef.get(),
      // Subscription + scan-quota state (server-owned; previously lived on
      // the profile doc — still part of "everything we hold").
      userRef.collection("entitlements").doc("plan").get(),
      userRef.collection("trusted_contacts").get(),
      userRef.collection("sessions").get(),
      db.collection("cases").where("userId", "==", uid).get(),
      db.collection("guardian_links").where("wardUid", "==", uid).get(),
      db.collection("guardian_links").where("guardianUid", "==", uid).get(),
    ]);

  const docs = (snap: QuerySnapshot) =>
    snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Strip server-only/sensitive fields the user shouldn't need in an export.
  const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
  delete (profile as Record<string, unknown>).fcmTokens;

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { uid, ...profile },
    entitlements: entitlementsSnap.exists ? entitlementsSnap.data() : null,
    cases: docs(casesSnap),
    trustedContacts: docs(contactsSnap),
    sessions: docs(sessionsSnap),
    guardianLinks: {
      iAmProtectedBy: docs(asWardSnap),
      iProtect: docs(asGuardianSnap),
    },
  };

  return NextResponse.json(payload);
}
