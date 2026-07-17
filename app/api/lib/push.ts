/**
 * Shared server-side web-push helper (Guardian Alerts).
 *
 * Sends an FCM multicast to a set of tokens and prunes any that FCM reports
 * as permanently invalid (so future sends stay clean).
 */

import { FieldValue } from "./firestore-rest";
import { getAdminMessaging, getAdminFirestore } from "./firebase-admin";

export interface PushResult {
  sent: number;
  failed: number;
  prunedStaleTokens: number;
}

/**
 * Push `{title, body, url}` to every token in `tokenOwners` (token → owner uid),
 * pruning dead tokens from the owner's profile.
 *
 * `type` selects a presentation preset in firebase-messaging-sw.js
 * (tag, urgency, vibration, action buttons, hero banner); `image` overrides
 * the preset's banner with a sender-supplied one.
 */
export async function pushToTokens(
  tokenOwners: Map<string, string>,
  payload: { title: string; body: string; url?: string; type?: string; image?: string }
): Promise<PushResult> {
  const messaging = getAdminMessaging();
  const db = getAdminFirestore();
  if (!messaging || !db) {
    throw new Error("Firebase Admin not configured");
  }
  // sendEachForMulticast defaults to HTTP/2, which workerd doesn't implement
  // (ERR_METHOD_NOT_IMPLEMENTED: http2.connect). Force the HTTP/1.1 transport.
  messaging.enableLegacyHttpTransport();

  const tokens = [...tokenOwners.keys()];
  if (tokens.length === 0) return { sent: 0, failed: 0, prunedStaleTokens: 0 };

  const url = payload.url || "/";
  // Data-only on purpose: a `notification` payload is auto-displayed by the
  // FCM SDK *and* re-displayed by firebase-messaging-sw.js's
  // onBackgroundMessage handler — every alert showed up twice. With data-only
  // the service worker is the single display path (it already reads
  // data.title/body/url), and its shared notification tag also dedupes
  // multiple tokens registered for the same device.
  const data: Record<string, string> = { title: payload.title, body: payload.body, url };
  if (payload.type) data.type = payload.type;
  if (payload.image) data.image = payload.image;
  const message = { data };

  let sent = 0;
  let failed = 0;
  const staleTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({ tokens: batch, ...message });
    sent += res.successCount;
    failed += res.failureCount;
    res.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code || "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          staleTokens.push(batch[idx]);
        }
      }
    });
  }

  await Promise.all(
    staleTokens.map((token) => {
      const uid = tokenOwners.get(token);
      if (!uid) return Promise.resolve();
      return db
        .collection("users")
        .doc(uid)
        .update({ fcmTokens: FieldValue.arrayRemove(token) })
        .catch(() => {});
    })
  );

  return { sent, failed, prunedStaleTokens: staleTokens.length };
}

/** Collect a single user's tokens as a token→uid map. */
export async function tokensForUser(uid: string): Promise<Map<string, string>> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firebase Admin not configured");
  const snap = await db.collection("users").doc(uid).get();
  const tokens: string[] = (snap.exists ? snap.data()?.fcmTokens : []) || [];
  const map = new Map<string, string>();
  tokens.forEach((t) => map.set(t, uid));
  return map;
}
