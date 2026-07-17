import { NextRequest, NextResponse } from "next/server";
import { getAdminMessaging, getAdminFirestore, getAdminConfigStatus } from "../../lib/firebase-admin";
import { pushToTokens } from "../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin broadcast — send a web-push notification to every signed-up user
 * who has enabled Guardian Alerts (i.e. has at least one FCM token).
 *
 * Protected by a shared secret. Call with:
 *   POST /api/notify/broadcast
 *   header: x-admin-secret: <ADMIN_BROADCAST_SECRET>
 *   body:   { "title"?: string, "body"?: string, "url"?: string }
 *
 * Used to verify push delivery end-to-end before wiring Guardian Alerts to
 * real scam-verdict triggers.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_BROADCAST_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_BROADCAST_SECRET is not configured on the server." },
      { status: 500 }
    );
  }
  if (req.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messaging = getAdminMessaging();
  const db = getAdminFirestore();
  if (!messaging || !db) {
    const status = getAdminConfigStatus();
    const hint = {
      missing: "FIREBASE_ADMIN_CREDENTIALS_JSON is not set on this deployment (check it's added to the Production environment, then redeploy).",
      "parse-error": "FIREBASE_ADMIN_CREDENTIALS_JSON is set but is not valid JSON. Paste the entire service-account file contents, unmodified.",
      incomplete: "FIREBASE_ADMIN_CREDENTIALS_JSON is valid JSON but missing private_key/client_email — it may not be a service-account key.",
      ok: "Credentials loaded but Admin init failed; check server logs.",
    }[status];
    return NextResponse.json(
      { error: "Firebase Admin is not configured.", status, hint },
      { status: 500 }
    );
  }

  let title = "📢 Scam warning";
  let body = "A new scam is making the rounds. Take a look before it reaches you or your family.";
  let url = "/";
  let image: string | undefined;
  try {
    const json = await req.json();
    if (json?.title) title = String(json.title);
    if (json?.body) body = String(json.body);
    if (json?.url) url = String(json.url);
    if (json?.image) image = String(json.image);
  } catch {
    // No/invalid body — fall back to defaults.
  }

  // Collect every token, remembering which user owns it (for pruning later).
  const snap = await db.collection("users").get();
  const tokenOwners = new Map<string, string>(); // token -> uid
  snap.forEach((doc) => {
    const tokens: string[] = doc.data().fcmTokens || [];
    tokens.forEach((t) => tokenOwners.set(t, doc.id));
  });

  const allTokens = [...tokenOwners.keys()];
  if (allTokens.length === 0) {
    return NextResponse.json({
      usersWithTokens: 0,
      sent: 0,
      failed: 0,
      note: "No users have enabled Guardian Alerts yet, so there's nobody to push to.",
    });
  }

  // Data-only via the shared helper, so the service worker is the single
  // display path (same reasoning as pushToTokens) and dead tokens get pruned.
  const result = await pushToTokens(tokenOwners, { type: "broadcast", title, body, url, image });

  return NextResponse.json({
    usersWithTokens: snap.docs.filter((d) => (d.data().fcmTokens || []).length > 0).length,
    totalTokens: allTokens.length,
    ...result,
  });
}
