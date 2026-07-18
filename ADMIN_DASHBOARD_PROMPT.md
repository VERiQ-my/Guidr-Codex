# Prompt: Build the Guidr Admin Dashboard (separate project)

> Hand this entire file to an AI coding agent (Codex, Cursor, v0, etc.) in a
> **new empty folder** named `guidr-admin`, sitting next to the existing `guidr` app.
> It is self-contained: it describes the shared backend, the real data model, the
> admin-auth mechanism, the required pages, and the security rules.

---

## Role & goal

You are building **Guidr Admin** — an internal web dashboard for the operators of
Guidr, a Malaysian scam-detection app. Guidr's consumer app ships to the Play Store
as a wrapped Next.js web app and stores everything in **Firebase** (Auth + Firestore,
project id `guidr-d8709`). This dashboard is a **separate Next.js project** that
connects to that **same Firebase project** and lets staff view users, scans/cases,
subscriptions, feedback, and global stats.

Do **not** modify the consumer app. This is a standalone repo with its own deploy.

---

## Tech stack (match the consumer app)

- **Next.js (App Router, latest)** + React 19 + TypeScript
- **Tailwind CSS v4**
- **Firebase JS SDK** (`firebase`) for client auth
- **Firebase Admin SDK** (`firebase-admin`) for all privileged reads/writes in
  server-side route handlers (`app/api/**`)
- **Stripe** Node SDK (read-only here — surfacing subscription status only)

```bash
npm i firebase firebase-admin stripe
```

> ⚠️ This codebase uses a customized Next.js. If a `node_modules/next/dist/docs/`
> folder exists, read the relevant guide before writing routing/data code — APIs may
> differ from the public Next.js docs.

---

## The shared backend — how to connect

Both apps point at Firebase project **`guidr-d8709`**. Reuse the exact same
credentials as the consumer app — copy these into `guidr-admin/.env.local`:

```bash
# Client SDK (public) — same values as the consumer app
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=guidr-d8709
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Admin SDK (server-only secret) — service-account JSON, single line
# Firebase Console → Project settings → Service accounts → Generate new private key
FIREBASE_ADMIN_CREDENTIALS_JSON=

# Stripe (read-only; for subscription status)
STRIPE_SECRET_KEY=
```

Create two libs mirroring the consumer app's pattern:

- `lib/firebase.ts` — client app, `getAuth`, `getFirestore` from the
  `NEXT_PUBLIC_FIREBASE_*` vars (used only for the admin login screen).
- `lib/firebase-admin.ts` — initializes `firebase-admin` from
  `FIREBASE_ADMIN_CREDENTIALS_JSON`, exporting `getAdminAuth()`,
  `getAdminFirestore()`, and a `verifyIdToken(authHeader)` helper that returns the
  decoded token (uid + claims) from an `Authorization: Bearer <token>` header.

---

## Who is an admin — custom claims (do this, not an email allowlist)

Authorization is via a **Firebase Auth custom claim** `{ admin: true }` on the
operator's user account. Because Auth is shared, a claim set anywhere is honored
everywhere.

1. Provide a one-off script `scripts/grant-admin.ts` that takes an email or uid and
   calls `getAdminAuth().setCustomUserClaims(uid, { admin: true })`. Document running
   it with `npx tsx scripts/grant-admin.ts <email>`.
2. **Every** `app/api/**` route must call `verifyIdToken()` and reject with `403`
   unless `decoded.admin === true`. The UI guard is cosmetic; this server check is
   the real wall.
3. The consumer app's accounts and the admin's accounts live in the same Auth pool —
   admins simply sign in with a Google/email account that carries the claim.

---

## Firestore data model (READ-ONLY reference — this is the real schema)

All collections below already exist and are written by the consumer app. The
dashboard mostly **reads** these; any writes must go through the Admin SDK.

### `users/{uid}` — user profile

| Field | Type | Notes |
|---|---|---|
| `fullName`, `username`, `email`, `photoURL` | string | identity |
| `xp`, `casesScanned`, `scamsReported`, `quizzesPassed` | number | gamification stats |
| `isSubscribed` | boolean | **Guidr Pro flag** (source of truth for Pro) |
| `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus` | string | Stripe linkage; `subscriptionStatus` mirrors Stripe (`active`/`past_due`/`canceled`…) |
| `scanQuota` | `{ date: "YYYY-MM-DD", count }` | per-day free-tier scan counter (MYT) |
| `phone`, `phoneVerified` | string/bool | E.164 verified phone |
| `isIdentityVerified`, `mfaEnabled`, `appLockEnabled` | boolean | security flags |
| `language`, `theme` | string | preferences |
| `fcmTokens` | string[] | web-push tokens |
| `streakDays`, `articlesRead`, `lastActiveDate` | mixed | Learn & Earn progress |

Subcollections:
- `users/{uid}/trusted_contacts/{id}` — `{ name, phone, status, relationship, linkStatus, guardianUid }`
- `users/{uid}/sessions/{sessionId}` — active devices: `{ device, browser, os, location, userAgent, createdAt, lastSeenAt }`

### `cases/{id}` — saved scan results (a user's investigation history)
`{ userId, verdict: "SCAM"|"SUSPICIOUS"|"LIKELY_SAFE", confidence: "HIGH"|"MEDIUM"|"LOW", scamType, summary, originalMessage, manipulationTactics[], evidenceChain[], recommendedActions[], reportedToNSRC, reportedToPDRM, reportedToMCMC, channel, status: "pending"|"reported"|"resolved", createdAt }`

### `scans/{scanId}` — live/background scan jobs
`{ userId, status: "running"|"done"|"error", stage, statusMessage, toolSteps[], analysis, errorKind, errorMessage, createdAt, updatedAt }`

### `alerts/{id}` — public shareable scam warnings
`{ ownerUid, warnedByName, verdict, confidence, scamType, summary, manipulationTactics[], evidenceChain[], recommendedActions[], warnedContactCount, createdAt }`

### `guardian_links/{id}` — guardian relationships
`{ wardUid, wardName, guardianUid, guardianPhone, guardianName, status: "pending"|"active"|"declined", createdAt }`

### `scams/{categoryId}` — global trending leaderboard (aggregate)
`{ name, cases, cases7d, casesPrev7d, windowStartedAt, trend }`

### `stats/global` — single aggregate counters doc
`{ totalCases, reportedNSRC, totalUsers }`

### `presence/{uid}` — `{ uid, lastSeen }`
A user is "active now" if `lastSeen` is within the last **2 minutes**.

### `feedback` collection
User-submitted feedback (the consumer app writes via `/api/feedback`). Inspect for
shape and surface it in a feedback inbox.

---

## Plan / pricing model (for the subscriptions view)

- Pro is determined by `users/{uid}.isSubscribed` (set server-side by the Stripe
  webhook in the consumer app — the dashboard does not write it).
- Free-tier limits to display as context: **5 AI scans/day** (resets at Malaysian
  midnight, Asia/Kuala_Lumpur), **5 trusted contacts**.
- Pro price label: `RM 0.01 / month` (display only; real price lives in Stripe).
- For subscription detail, you may read the Stripe customer/subscription via
  `STRIPE_SECRET_KEY` keyed on `stripeCustomerId`. Read-only.

---

## Pages to build

A clean, sidebar-layout admin app. Every data page is backed by an admin-gated API
route; the client never talks to Firestore directly except for the login screen.

1. **Login** (`/login`) — Firebase sign-in; after sign-in, fetch the ID token, and if
   it lacks the `admin` claim, show "not authorized" and sign out.
2. **Overview** (`/`) — KPI cards from `stats/global` (total cases, reported to NSRC,
   total users), live active-user count from `presence`, recent scans feed, and the
   `scams` trending leaderboard.
3. **Users** (`/users`) — paginated, searchable table (name/email/phone). Row detail
   drawer showing profile, Pro/subscription status, stats, trusted contacts, and
   active sessions. Admin actions (all server-side, audited): grant/revoke Pro
   (`isSubscribed`), disable a Firebase Auth account, revoke sessions.
4. **Cases & Scans** (`/cases`) — filterable by verdict/confidence/status/scamType;
   detail view of a single case incl. evidence chain and reporting flags.
5. **Subscriptions** (`/subscriptions`) — users with `stripeSubscriptionId`, their
   `subscriptionStatus`, with a link out to the Stripe dashboard.
6. **Feedback** (`/feedback`) — inbox of the `feedback` collection.
7. **Guardian links** (`/guardians`) — view `guardian_links` and their statuses.

Build a reusable admin-gated `apiHandler` wrapper so every route enforces the claim
identically.

---

## Security requirements (do not skip)

1. **Server-side claim check on every route.** No `app/api/**` handler returns data
   without `verifyIdToken()` → `decoded.admin === true`.
2. **Firestore Security Rules.** Provide a `firestore.rules` snippet (to be deployed
   once on the shared project) that grants broad access only to admins, e.g.
   `allow read, write: if request.auth.token.admin == true;` — without weakening the
   consumer app's existing per-user rules.
3. **Never expose** `FIREBASE_ADMIN_CREDENTIALS_JSON` or `STRIPE_SECRET_KEY` to the
   client. Server-only.
4. **Audit log.** Write every mutating admin action (grant Pro, disable user, etc.)
   to an `admin_audit/{id}` doc: `{ actorUid, actorEmail, action, targetUid, before, after, at }`.
5. **No destructive bulk operations** in the UI without an explicit typed
   confirmation.

---

## Deployment

- Separate Vercel project, own domain (e.g. `admin.guidr.app`).
- Set all env vars above in Vercel project settings.
- The Play Store TWA must never link to this app.

---

## Deliverables

1. New `guidr-admin` Next.js project (App Router, TS, Tailwind v4).
2. `lib/firebase.ts`, `lib/firebase-admin.ts`, and the admin-gated API wrapper.
3. All pages above, wired to admin-gated routes reading the real schema.
4. `scripts/grant-admin.ts`, a `firestore.rules` snippet, and a `README.md`
   documenting setup, env vars, granting the first admin, and deploying.

Start by scaffolding the project, the two firebase libs, the auth gate, and the
Overview page; then iterate through the rest.
