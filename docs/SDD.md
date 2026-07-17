# Guidr — Software Design Document (SDD)

| | |
|---|---|
| **Document** | Software Design Document |
| **Product** | Guidr — AI-powered scam investigation platform (Malaysia) |
| **Version** | 1.0 |
| **Date** | 2026-07-05 |
| **Status** | Draft for founder review |
| **Owners** | [TBD: founder names / roles] |
| **Parent process** | `docs/SDLC.md` (Design phase output) |
| **Companion** | `docs/SRS.md` (requirements realised here) |

> **Traceability rule.** Every design claim traces to a source file (in
> parentheses). `[TBD]` marks founder/product decisions. **§8 Findings** is the
> security register; F-1/F-2/F-11 were fixed and verified in the 2026-07 cycle,
> and this document reflects the **post-fix** state of the system.

---

## 1. System Architecture

**Stack (from `package.json`/config):** Next.js 16 (App Router), React 19,
TypeScript 5, Tailwind CSS 4. Vercel (`sin1`); Firebase Auth + Firestore
(`asia-southeast1`); Vertex AI Gemini for investigations; Stripe for payments;
FCM for web push; PWA (manifest + FCM service worker). DNS: [TBD: Cloudflare per
founders — not verifiable from this repo].

### 1.1 Data-flow (architecture diagram, described)

```
┌─────────────────────────────  Browser (PWA)  ─────────────────────────────┐
│ Next.js client (React 19)                                                 │
│  • Firebase JS SDK ──(1) Auth (email/pw, Google) ──► Firebase Auth        │
│  • Firestore client SDK ──(2) direct reads/writes gated by rules ──►      │
│      users/* (profile), cases/*, alerts/*, presence/*; realtime listeners │
│      on scans/{id}, scan_tickets, guardian_links, stats/global,           │
│      users/{uid}/entitlements/plan (READ-ONLY to client)                  │
│  • fetch + Bearer <Firebase ID token> ──(3)──► Next.js API routes         │
│  • firebase-messaging-sw.js ◄── FCM web push                              │
└───────────────────────────────────────────────────────────────────────────┘
                                     │ (3)
┌──────────────────────  Vercel serverless (sin1)  ─────────────────────────┐
│ app/api/* route handlers (Node runtime)                                   │
│  • verify Firebase ID token (firebase-admin/auth)                         │
│  • scan pipeline: enqueue → admit (queue in Firestore) → run              │
│      run = agentic loop on Vertex AI gemini-2.5-flash (4 tools);          │
│      tool web-intel via gemini-2.5-flash-lite; URL checks via Safe        │
│      Browsing v4 (API key)                                                │
│  • durable scans: progress/verdict via Admin SDK ──► scans/{id}           │
│  • quota + Pro: Admin SDK reads/writes ──► users/{uid}/entitlements/plan  │
│  • Stripe: create-checkout / confirm / webhook (signature-verified)       │
│  • FCM pushes: guardian-alert, broadcast (Admin SDK messaging)            │
│  • feedback ──► Google Apps Script ──► Google Sheet                       │
│  • scam-news ──► public RSS feeds (24h cache)                             │
└───────────────────────────────────────────────────────────────────────────┘
                                     │
┌──────────────  Firebase project guidr-d8709 (asia-southeast1) ────────────┐
│ Auth · Firestore · FCM · Cloud Functions (onCaseCreated / onUserCreated → │
│   increment stats/global)                                                 │
└───────────────────────────────────────────────────────────────────────────┘
```

**Key decision — two GCP identities:** the Vertex AI service account (separate
project) powers the AI; the Firebase project's service account powers Admin
Firestore/FCM/Auth (`admin.ts`, `firebase-admin.ts`).

**Two scan transports, one engine (`scan-runner.ts`):** `/api/analyze-stream`
(SSE, dies with the connection) and `/api/scan/run` (returns `scanId`, continues
in `after()`; client re-attaches via Firestore listener, `/api/scan/status` as
a rules-independent polling fallback).

## 2. Data Model (Firestore)

| Path | Written by | Read by | Shape (source) |
|---|---|---|---|
| `users/{uid}` | Owner (client) — **entitlement keys blocked by rules** | Owner | `UserProfile`: identity, xp/stats, prefs, `fcmTokens[]`, `phone`, learn progress, security flags (`lib/firestore.ts`) |
| `users/{uid}/entitlements/plan` | **Server only** (Admin SDK) | Owner (read) | `Entitlements`: `isSubscribed`, `scanQuota{date,count}`, `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus` (`lib/plan.ts`) — **moved here in fix F-1** |
| `users/{uid}/trusted_contacts/{id}` | Owner | Owner | name, phone (E.164), status, relationship, `linkStatus`, `guardianUid` |
| `users/{uid}/sessions/{sessionId}` | Owner | Owner | device, browser, os, location, timestamps |
| `cases/{caseId}` | Owner | Owner | `CaseData`: verdict, confidence, scamType (canonical), summary, originalMessage, tactics[], evidenceChain[], actions[], report fields, agency flags, status |
| `scans/{scanId}` | **Server only** | Owner (read) | `ScanDoc`: status, stage, toolSteps[], analysis, error fields |
| `scan_tickets/{ticketId}` | **Server only** | Owner (read) | uid, status, heartbeatAt, slotToken |
| `scan_control/slots` | **Server only** | Signed-in (read) | `{active, max, updatedAt}` concurrency counter |
| `guardian_links/{linkId}` | **Server only** | Ward or guardian | wardUid/Name, guardianUid/Phone/Name, status |
| `alerts/{alertId}` | Signed-in create (owner-tagged); immutable | **Public** | `AlertData`: verdict, scamType, summary, gated details |
| `stats/global` | **Server only** (bump API + Cloud Functions) | **Public** | totalCases, reportedNSRC, totalUsers |
| `scams/{scamId}` | **Server only** (canonical taxonomy) | **Public** | trending counters per category |
| `presence/{uid}` | Owner | Signed-in | `{uid, lastSeen}` heartbeat |
| `config/pricing` | External admin dashboard | Server routes | `{amount, currency, interval, unitAmount}` |

- Composite indexes: `firestore.indexes.json`. [TBD: enumerate on schema review.]
- No Cloud Storage; screenshots are sent as base64 in request bodies, not
  persisted.

## 3. API Contracts (as implemented)

All routes under `app/api/`. Auth = `Authorization: Bearer <Firebase ID token>`
unless noted. Non-production allows anonymous on scan/AI routes for local dev.

### 3.1 Scan pipeline & AI
| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/scan/enqueue` | POST | Yes + rate limit + daily quota | — | `{ticketId}` \| 429 |
| `/api/scan/admit` | POST | Yes | `{ticketId}` | `{admitted, slotToken?, position?}` |
| `/api/scan/run` | POST | Yes + rate limit + slot | `{message?, image?, imageMimeType?, ticketId, slotToken}` | `{durable:true, scanId}` \| `{durable:false}` |
| `/api/analyze-stream` | POST | Yes + rate limit + slot | same | SSE: `status`, `tool_start`, `tool_complete`, `verdict`, `done`, `error` |
| `/api/scan/status` | POST | Yes (owner check) | `{scanId}` | scan doc snapshot |
| `/api/scan/release` | POST | Yes | `{ticketId}` | ack |
| `/api/generate-report` | POST | **Yes + rate limit (5/min) + input validation** *(fix F-2)* | case JSON incl. reporter PII (validated) | NSRC report \| `400 invalid_input` \| `401` \| `429` |
| `/api/extract-text` | POST | **Disabled** *(fix F-2)* | — | `410 gone` |

### 3.2 Payments
| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/stripe/create-checkout` | POST | Yes | Price from `config/pricing` (fallback RM 0.01/mo); uid in session metadata |
| `/api/stripe/confirm` | POST | Yes | Re-fetches session; verifies paid + uid match; writes Pro to **entitlements doc** |
| `/api/stripe/webhook` | POST | Stripe signature | Source of truth; writes Pro to **entitlements doc** |
| `/api/pricing` | GET | Public | `{amount, currency, interval, label, period}` |

### 3.3 Guardians, notifications, account, misc
| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/guardians/request` | POST | Yes (ward) | `{phone (E.164), name?}` → match profile phone → pending link + push |
| `/api/guardians/respond` | POST | Yes (guardian only) | `{linkId, accept}` |
| `/api/notify/guardian-alert` | POST | Yes (ward from token) | `{scamType?}` → FCM to active guardians |
| `/api/notify/broadcast` | POST | `x-admin-secret` | Push to all users with FCM tokens |
| `/api/account/export` | POST | Yes | Full export incl. `entitlements` block |
| `/api/account/delete` | POST | Yes | Notify guardians → wipe Firestore (recursive) → delete Auth user |
| `/api/account/sessions/revoke` | POST | Yes | `{sessionId}` to keep; revokes all refresh tokens |
| `/api/account/whereami` | GET | None | City/country from Vercel geo headers |
| `/api/stats/bump` | POST | Yes + rate limit (30/min) | allowlisted field or canonical scamType; server fixes +1 |
| `/api/feedback` | POST | Yes | `{category, rating 1-5, message, replyOptIn}` → Apps Script |
| `/api/scam-news` | GET | Public | Aggregated RSS, `revalidate = 86400` |

## 4. Component Breakdown

- **Pages (`app/`):** home, `scan` (+results/report), `cases`, `learn`,
  `analytics`, `alert/[id]` (public), `login`, `onboarding`, `profile`
  (+security-level, verification), `settings` (+privacy), `preferences`, `help`,
  `auth/action`.
- **Scan flow (`app/scan/`):** `ScanForm`, `CameraCapture`, `ChannelPills`,
  `SubmitConsentModal`, `ScanQueueGame`, `InvestigatingView`, `VerdictView`.
- **Shared (`app/components/`):** `Header`, `BottomNav`, `AppLock`,
  `GuardianSettings`, `NotificationsBell`, `ScamNewsCarousel`, `StatsCards`,
  `InstallPrompt`, `OfflineBanner`, `EmailComposerModal`, `UpgradeCelebration`.
- **Contexts (`app/context/`):** `UserContext`, `PrefsContext`, `ToastContext`.
- **Client lib (`lib/`):** `firebase.ts` (SDK + emulator wiring), `firestore.ts`
  (data access incl. `subscribeEntitlements`), `plan.ts` (entitlements +
  quota — shared client/server), `scam-categories.ts`, `security-level.ts`,
  `i18n.ts`, `messaging.ts`, `app-lock.ts`, `account-security.ts`, `guardians.ts`,
  `learn-content.ts`, `malaysian-banks.ts`.
- **Server lib (`app/api/lib/`):** `admin.ts`, `firebase-admin.ts`, `ai-client.ts`,
  `ai-utils.ts`, `scan-runner.ts`, `real-tools.ts`, `scan-queue.ts`,
  `scan-quota.ts`, `push.ts`.
- **Cloud Functions (`functions/index.js`):** `onCaseCreated`, `onUserCreated`.
- **Scripts (`scripts/`):** `migrate-entitlements.mjs` (fix F-1), `backfill-stats.mjs`,
  `migrate-case-categories.mjs`, `migrate-scam-categories.mjs`.

## 5. Security Design (current state)

- **AuthN:** Firebase ID tokens verified server-side on mutating routes
  (`verifyIdToken`/`verifyRequest`). Scan/AI routes skip auth outside production
  for local dev. **`generate-report` now requires auth** (fix F-2).
- **AuthZ (`firestore.rules`):** default-deny; per-owner on `users/**` and
  `cases`; **server-only writes** for `scans`, `scan_tickets`, `scan_control`,
  `guardian_links`, `stats`, `scams`, and **`users/{uid}/entitlements/**`**.
  The profile doc is split into `read/create/update/delete`, and create/update
  **reject any write touching the entitlement keys** at field level (fix F-1).
  Public read only where intended (`stats`, `scams`, `alerts`).
- **Entitlement integrity (fix F-1):** Pro status + scan quota live at
  `users/{uid}/entitlements/plan`, written only by the Admin SDK (Stripe
  webhook/confirm, quota accounting). The client can read but not write, so a
  user cannot self-grant Pro or reset quota from the browser console.
- **Paid-AI protection (fix F-2):** `generate-report` gained auth +
  rate-limiting + strict input validation (rejecting oversized/malformed PII
  before any Vertex call); `extract-text` (unused) disabled.
- **Payments integrity:** Pro granted only by the signature-verified webhook or
  a server-side session re-fetch matched to the signed-in uid.
- **Abuse controls:** per-uid fixed-window rate limits (in-memory, per-instance);
  global scan concurrency cap; daily quota; allowlisted stats fields; canonical
  taxonomy prevents defamatory trending entries.
- **Secrets:** service-account JSONs via env vars; local key files gitignored;
  none committed. Broadcast admin uses a static shared secret.
- **Fail-open posture:** queue + quota degrade to "allow" when Admin credentials
  are unavailable (`QUEUE_FALLBACK_OPEN`).

## 6. Third-Party Integration Points

| Service | Purpose | Where | Credential |
|---|---|---|---|
| Firebase Auth | Sign-in, MFA flag, token revocation | client + `admin.ts` | `NEXT_PUBLIC_FIREBASE_*` |
| Firestore | Primary datastore + realtime | client SDK + Admin SDK | rules / `FIREBASE_ADMIN_CREDENTIALS_JSON` |
| Vertex AI (Gemini) | `gemini-2.5-flash` agent; `-flash-lite` web intel | `ai-client.ts` | `GOOGLE_APPLICATION_CREDENTIALS_JSON`; region default `us-central1` |
| Google Safe Browsing v4 | URL threat lookup | `real-tools.ts` | `GEMINI_API_KEY` (legacy name — it is the Safe Browsing key) |
| Stripe | Guidr Pro subscriptions | `app/api/stripe/*` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| FCM (web push) | Guardian alerts, broadcast | `push.ts`, `lib/messaging.ts` | Firebase Admin |
| Google Apps Script → Sheets | Feedback ingest | `/api/feedback` | `GOOGLE_FEEDBACK_WEBHOOK_URL` + `_SECRET` |
| RSS feeds | Scam-news carousel | `/api/scam-news` | none |
| Vercel | Hosting, geo headers, analytics | `vercel.json` | — |
| Cloudflare | DNS | [TBD: not verifiable from repo] | — |

## 7. Known Gaps

- **No automated tests, no CI.** No test files, no `.github/` workflows.
- **Missing referenced files:** `DEPLOY.md` cites `.env.example` (absent —
  swallowed by the `.env*` gitignore rule); `firestore.rules` cites
  `SECURITY_REVIEW.md` (absent).
- **Possible stats double-count:** Cloud Functions (`onCaseCreated`,
  `onUserCreated`) *and* the client `/api/stats/bump` path both increment
  `stats/global`. [Verify which is live; `backfill-stats.mjs` suggests prior
  drift.]
- **Email guardian alerts:** `alertEmailEnabled` preference exists; no
  email-sending integration found.
- **Default README** is the create-next-app template.
- **Vertex region mismatch:** app in `sin1`, Vertex default `us-central1`
  (`ai-client.ts`). [TBD: confirm production sets `asia-southeast1`.]
- **Admin tooling out-of-repo** (`config/pricing` editor); access control not
  reviewable here.
- **No payload size limit** on scan image bodies (base64). [Consider a cap.]

## 8. Findings (security register)

> Severity is a first read. Fix status current as of 2026-07-05.

- **F-1 (HIGH) — Client-writable entitlements. ✅ FIXED (verified).** Profile
  doc allowed the owner to write `isSubscribed`/`scanQuota`, which the server
  trusted — a user could self-grant Pro / reset quota from the console. **Fix:**
  moved these to server-only `users/{uid}/entitlements/plan`; field-level rules
  block the keys on the profile; readers repointed via `subscribeEntitlements`;
  `migrate-entitlements.mjs` migrates existing subscribers. Verified: emulator
  rules test (exploit denied, legit allowed) + end-to-end (quota decrement, Pro
  upgrade writes the locked doc).
- **F-2 (HIGH) — Unauthenticated Vertex AI endpoints. ✅ FIXED (verified).**
  `generate-report`/`extract-text` had no auth or rate limit but ran paid Vertex
  AI. **Fix:** `generate-report` gained auth + rate-limit + input validation;
  `extract-text` (no callers) disabled (`410`). Verified: `400`/`429`/`410` and
  a production-build `401`.
- **F-3 (MED) — Gamification stats client-written.** `awardXP`, `incrementStat`,
  `markArticleRead`, `completeDailyChallenge` write the user's own doc; XP/rank
  /streaks are forgeable. Low direct harm (self-scoped). *Open.*
- **F-4 (MED) — Public `alerts` accept arbitrary content.** Any signed-in user
  can create a world-readable, immutable alert with free-text fields; defamation
  /abuse vector, no moderation/delete path. *Open.*
- **F-5 (MED) — Unverified phone → guardian matching.** Self-entered profile
  phone (no OTP on free plan); claiming another's number surfaces their guardian
  invites (acceptance still required, limiting blast radius). *Open.*
- **F-6 (LOW) — Rate limiting is per-instance memory.** Cold starts / scaling
  reset buckets; soft limits. Acceptable backstop; not the primary control.
  *Open (mitigated by auth on F-2 endpoints).*
- **F-7 (LOW) — `presence` readable by any signed-in user.** Exposes all uids +
  last-seen; enumeration vector. Consider aggregate-only. *Open.*
- **F-8 (LOW) — Fail-open enforcement.** Quota/queue allow scans when Admin
  creds are missing — a misconfigured deploy silently disables monetization
  limits + concurrency cap. Deliberate; flag for prod monitoring. *Open.*
- **F-9 (INFO) — Misleading env var name.** `GEMINI_API_KEY` holds the Safe
  Browsing key. Rename to avoid a future mis-paste. *Open.*
- **F-10 (INFO) — Static admin secret.** `/api/notify/broadcast` uses a single
  long-lived shared secret, no rotation/audit. *Open.*
- **F-11 (FUNCTIONAL BUG) — Preferences "Upgrade" button 401. ✅ FIXED.** Found
  while verifying F-1: `app/preferences/page.tsx` called `create-checkout` with
  no `Authorization` header → `401` for all users (affected production; not
  caused by F-1/F-2). **Fix:** send the ID token, mirroring the Settings handler.
  Not a security hole (fails closed) — a broken monetization path.

## 9. Deployment checklist (for the fixed build)

1. Deploy app code + rules together: push to Vercel + `firebase deploy --only
   firestore:rules`.
2. Run the data migration once: `node scripts/migrate-entitlements.mjs --dry-run`
   then without the flag (moves existing subscribers to the entitlements doc).
3. Verify on the preview/prod deploy: unauthenticated `POST /api/generate-report`
   → `401`; a console attempt to write `isSubscribed` on the profile →
   `permission-denied`.

## 10. Revision History

| Version | Date | Author | Notes |
|---|---|---|---|
| 0.1 | 2026-07-04 | — | Skeleton, code-derived; initial Findings F-1…F-10. |
| 1.0 | 2026-07-05 | — | Full draft; F-1/F-2 fixed and verified; F-11 added; data model + API contracts updated to post-fix state. |
