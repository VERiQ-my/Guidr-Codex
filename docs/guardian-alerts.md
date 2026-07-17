# Guardian Alerts — Web Push Setup

Guardian Alerts deliver real web-push notifications to signed-up Guidr users
via Firebase Cloud Messaging (FCM). This works on the free Spark plan — the
server send happens from a Next.js route handler using the Admin SDK, so no
Cloud Functions / Blaze upgrade is required.

## How it works

1. **Enable** — In **Settings → Guardian Alerts**, a user taps "Enable Guardian
   Alerts". The browser asks for notification permission, we register
   `public/firebase-messaging-sw.js`, mint an FCM token, and store it on the
   user's profile (`users/{uid}.fcmTokens`).
2. **Deliver** — A server route reads users' tokens and sends a push. Background
   pushes are shown by the service worker; foreground ones via `onMessage`.

## Required configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Client (public) | Web Push certificate key pair. Firebase Console → Project settings → **Cloud Messaging** → **Web Push certificates** → "Generate key pair". |
| `FIREBASE_ADMIN_CREDENTIALS_JSON` | Server (secret) | Full service-account JSON for the **`guidr-d8709`** Firebase project. Firebase Console → Project settings → **Service accounts** → "Generate new private key". Paste the whole JSON as the value. (Locally you may instead drop the file at `firebase-admin-credentials.json` in the project root — it's git-ignored.) |
| `ADMIN_BROADCAST_SECRET` | Server (secret) | Shared secret guarding the broadcast endpoint. Use any long random string. |

> The existing `NEXT_PUBLIC_FIREBASE_*` client vars must already be set.
> Note the Admin credential must belong to the **Firebase** project
> (`guidr-d8709`), not the Vertex AI GCP project used for scanning.

## Testing — broadcast to all enabled users

After deploying and enabling alerts on at least one device:

```bash
curl -X POST https://<your-app>/api/notify/broadcast \
  -H "x-admin-secret: $ADMIN_BROADCAST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"title":"Guidr test","body":"Guardian Alerts are live 🎉","url":"/"}'
```

Response reports `usersWithTokens`, `sent`, `failed`, and any
`prunedStaleTokens` (dead tokens are removed automatically).

> Only users who have **enabled** alerts (and thus have a stored token) receive
> the push. Existing accounts won't have tokens until they open the app and opt
> in — so the very first broadcast reaches only opted-in devices.

## Automatic Guardian Alerts (real feature)

Beyond the manual broadcast, Guidr now auto-notifies a user's **guardians**
when that user (the "ward") hits a **HIGH-confidence SCAM** verdict.

### Model
- `users/{uid}.phone` — self-entered number, normalized to E.164
  (Settings → Guardian Network → "Save my number"). NOT OTP-verified:
  Firebase Phone Auth requires the Blaze plan, so on the free plan we store a
  self-entered number and match against profiles. `phoneVerified` stays false
  (kept for a future OTP upgrade).
- `guardian_links/{id}` — `{ wardUid, guardianUid, guardianPhone, status }`.
  Created/mutated **server-side only** (Admin SDK); clients can read their own
  links but never write them (see `firestore.rules`).

### Flow
1. Ward adds a trusted contact by phone in Settings (any format; normalized to
   E.164, Malaysia default).
   → `POST /api/guardians/request` matches the phone against user **profiles**
   (`users.where("phone","==",…)`), creates a **pending** link, and pushes an
   invite to that user.
2. The prospective guardian accepts/declines in Settings → Guardian Network.
   → `POST /api/guardians/respond` flips the link to **active**/**declined**
   (opt-in enforced — only the named guardian may respond).
3. When the ward hits a HIGH-confidence SCAM, the scan flow calls
   `POST /api/notify/guardian-alert`, which pushes every **active** guardian.
   The ward is derived from the verified ID token, so a user can only trigger
   alerts about themselves.

All three routes require an `Authorization: Bearer <Firebase ID token>` header.

### Requirements / caveats
- Works on the **free Spark plan** — no SMS/Phone Auth required.
- Numbers are self-entered and **not verified**, so matching trusts that a user
  entered their own number. To upgrade to OTP-verified phones later, switch to
  Firebase Phone Auth (needs Blaze) and set `phoneVerified`.
- The `guardian_links` rule must be deployed to Firebase
  (`npx firebase deploy --only firestore:rules`) — it does not ship with the
  Vercel app.
- Uses the same `FIREBASE_ADMIN_CREDENTIALS_JSON` service account as broadcast.
