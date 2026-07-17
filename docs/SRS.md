# Guidr — Software Requirements Specification (SRS)

| | |
|---|---|
| **Document** | Software Requirements Specification |
| **Product** | Guidr — AI-powered scam investigation platform (Malaysia) |
| **Version** | 1.0 |
| **Date** | 2026-07-05 |
| **Status** | Draft for founder review |
| **Owners** | [TBD: founder names / roles] |
| **Parent process** | `docs/SDLC.md` (Requirements phase output) |
| **Companion** | `docs/SDD.md` (design/implementation of these requirements) |

> **Traceability rule.** Every requirement traces to something in the codebase
> (files in parentheses) or is explicitly marked `[TBD]` for a founder/product
> decision. This document describes what the app **does today**; it is not a
> wishlist. Numbers (SLAs, performance, retention) are only stated where code
> or config backs them.

---

## 1. Purpose & Scope

- **Purpose.** Guidr lets a Malaysian user paste a suspicious message (or upload
  a screenshot/PDF) and receive an AI-driven verdict — `SCAM` / `SUSPICIOUS` /
  `LIKELY_SAFE` — with confidence, evidence, manipulation tactics, and
  recommended actions (`app/api/lib/scan-runner.ts`, `app/scan/VerdictView.tsx`).
- **Product goal.** Protect at-risk users (fresh graduates targeted by job
  scams; elderly users protected by family "guardians") from online fraud, and
  streamline reporting to Malaysian authorities (NSRC / PDRM / MCMC).
- **In scope of this SRS.** The Next.js PWA in this repository, its API routes,
  Firebase backing services, and third-party integrations.
- **Out of scope.** The external "Guidr Admin dashboard" that edits
  `config/pricing` (not in this repo — `app/api/stripe/create-checkout/route.ts`).
  [TBD: document or link it separately.]

## 2. Definitions, Acronyms & Abbreviations

| Term | Meaning (as used in code) |
|---|---|
| **Scan / Investigation** | One agentic AI run over a submitted message/screenshot (`scan-runner.ts`). |
| **Case** | A saved scan result in the user's history (`cases` collection, `lib/firestore.ts`). |
| **Verdict** | `SCAM` \| `SUSPICIOUS` \| `LIKELY_SAFE`, each with confidence `HIGH` \| `MEDIUM` \| `LOW`. |
| **Entitlements** | Server-owned Pro flag + daily scan quota + Stripe linkage, at `users/{uid}/entitlements/plan` (`lib/plan.ts`). |
| **Ward** | A protected user whose HIGH-confidence scam encounters alert their guardians (`guardian_links.wardUid`). |
| **Guardian** | A user who accepted a ward's invite and receives Guardian Alerts (push). |
| **Trusted contact** | A phone-book entry a user saves; may be promoted to a guardian link. |
| **Guidr Pro** | Paid tier via Stripe subscription; `entitlements.isSubscribed` (`lib/plan.ts`). |
| **NSRC / PDRM / MCMC** | Malaysian National Scam Response Centre / Royal Malaysia Police / Malaysian Communications & Multimedia Commission. |
| **Scan ticket / slot** | Entry in the global FIFO concurrency queue for AI scans (`scan-queue.ts`). |
| **PWA** | Progressive Web App (installable, offline-aware; `public/manifest.json`). |

## 3. Overall Description

- **Product perspective.** A standalone client-server web application: a Next.js
  App-Router frontend (also a PWA), Next.js API routes on Vercel serverless, and
  Firebase (Auth, Firestore, FCM, Cloud Functions) as the backend. AI is Vertex
  AI Gemini; payments are Stripe; URL safety is Google Safe Browsing.
- **Operating environment.** Modern browsers, mobile-first (portrait), installable
  as a PWA. Hosted on Vercel (`sin1`); data in Firebase `asia-southeast1`.
- **Design & implementation constraints.** See §7.
- **User documentation.** In-app Help (`app/help`) and Learn hub (`app/learn`).

## 4. User Roles / Personas

- **Fresh graduates (primary).** The AI system prompt is explicitly tuned to
  "protecting fresh graduates from job scams" (`scan-runner.ts`), with tooling
  for recruiter-pattern and company-existence checks.
- **Elderly / protected users (wards).** Served by the Guardian system: trusted
  contacts, ward→guardian links, push alerts to family on HIGH-confidence scams
  (`app/api/guardians/*`, `app/api/notify/*`).
- **Guardians (family members).** Receive/accept invites; get push alerts about
  their wards.
- **Anonymous recipients.** Non-users who open a shared public alert link
  (`app/alert/[id]`); full details gated behind sign-up.
- **Admin (operator).** No in-app admin UI in this repo. Current admin surface: a
  shared-secret broadcast endpoint (`/api/notify/broadcast`) and an external
  dashboard writing `config/pricing`. [TBD: define the admin role model.]

## 5. Functional Requirements

*IDs are for traceability. "Verified" = observed working during this cycle.*

### FR-1 Authentication & Account
- FR-1.1 Email/password sign-up with enforced password rules (≥8 chars,
  uppercase, number, special char) (`app/login/page.tsx`).
- FR-1.2 Google sign-in (popup) (`app/login/page.tsx`).
- FR-1.3 Email verification + password reset (`app/auth/action`, `app/login`).
- FR-1.4 Onboarding after first sign-in (`app/onboarding`).
- FR-1.5 Device session history with approximate geo label (`lib/firestore.ts`
  sessions, `/api/account/whereami`).
- FR-1.6 "Sign out all other sessions" via Firebase refresh-token revocation
  (`/api/account/sessions/revoke`).
- FR-1.7 Account deletion — wipes profile, cases, links, sessions, then the Auth
  user; notifies guardians first (`/api/account/delete`).
- FR-1.8 Data export (PDPA access request) as JSON, incl. entitlements
  (`/api/account/export`).
- FR-1.9 App lock: PIN and/or biometric (WebAuthn) on app open (`lib/app-lock.ts`,
  `app/components/AppLock.tsx`).
- FR-1.10 SMS two-factor (Firebase MFA; `mfaEnabled`) (`app/settings/privacy`).
  [TBD: confirm end-to-end enrollment UX.]

### FR-2 Scam Investigation (core)
- FR-2.1 Submit text, or upload/camera a screenshot/PDF (`app/scan/ScanForm.tsx`,
  `CameraCapture.tsx`). Screenshots are scanned directly by the multimodal agent.
- FR-2.2 Channel tagging (WhatsApp/SMS/Email/LinkedIn/Other) (`ChannelPills.tsx`).
- FR-2.3 Global concurrency queue: enqueue → poll admit → run with slot token;
  gamified wait UI (`/api/scan/enqueue|admit|release`, `ScanQueueGame.tsx`).
- FR-2.4 Durable background scan that survives the client leaving; progress +
  verdict persisted for live re-attach (`/api/scan/run`, `subscribeScan`);
  fallbacks: SSE (`/api/analyze-stream`), Admin-SDK poll (`/api/scan/status`).
- FR-2.5 Agentic tool use: URL safety (Google Safe Browsing + web intel),
  Malaysian company verification, recruiter-pattern check, public scam-report
  search (`scan-runner.ts`, `real-tools.ts`).
- FR-2.6 Verdict output: verdict, confidence, canonical scam type
  (`lib/scam-categories.ts`), summary, manipulation tactics, evidence chain,
  recommended actions (`VerdictView.tsx`).
- FR-2.7 **Free-tier daily limit: 5 scans/day**, reset at Malaysian midnight,
  enforced server-side at enqueue, consumed only on a produced verdict
  (`lib/plan.ts`, `app/api/lib/scan-quota.ts`). Pro: unlimited + priority queue.
  *Verified this cycle.*

### FR-3 Cases & Reporting
- FR-3.1 Save results as cases with lifecycle status pending → reported →
  resolved (`lib/firestore.ts`, `app/cases`).
- FR-3.2 Generate an NSRC-formatted incident report with an AI-written summary
  (`/api/generate-report`, **now authenticated + validated + rate-limited**);
  export as PDF (jsPDF, client-side). *Verified this cycle.*
- FR-3.3 Track reported-to flags per agency: NSRC, PDRM, MCMC (`CaseData`).
- FR-3.4 Free tier sees a gated subset of evidence/actions/report sections; NSRC
  submission channels are never paywalled (`lib/plan.ts`).

### FR-4 Alerts & Community
- FR-4.1 Create shareable, publicly readable scam alerts to warn contacts;
  non-users get a gated preview (`app/alert/[id]`, `createAlert`).
- FR-4.2 Global community stats (total cases, NSRC reports, total users) and a
  trending-scam leaderboard; server-write-only counters (`/api/stats/bump`,
  `stats/global`, `scams/*`, and Cloud Functions).
- FR-4.3 Daily scam-news carousel from RSS feeds (Google News, Malwarebytes,
  BleepingComputer, The Hacker News), 24 h cache (`/api/scam-news`).
- FR-4.4 Live "active users" presence count (`presence` collection).

### FR-5 Guardian Network
- FR-5.1 Save trusted contacts (free limit: 5) with relationship labels
  (`lib/firestore.ts`).
- FR-5.2 Ward requests a guardian by phone (E.164); server matches to a Guidr
  profile and creates a pending link (`/api/guardians/request`).
- FR-5.3 Guardian explicitly accepts/declines (`/api/guardians/respond`).
- FR-5.4 On a HIGH-confidence SCAM verdict, active guardians receive an FCM web
  push (`/api/notify/guardian-alert`, `lib/messaging.ts`); email channel
  preference exists (`alertEmailEnabled`). [TBD: no email-sending code found —
  confirm whether email alerts are actually delivered.]

### FR-6 Learn & Earn (gamification)
- FR-6.1 Educational articles with XP; daily streaks; daily challenge
  (`app/learn`, `lib/learn-content.ts`, `lib/firestore.ts`).
- FR-6.2 Security-level ladder: 5 ranks, Novice Observer (0 XP) → Cyber Sentinel
  (600 XP) (`lib/security-level.ts`).
- FR-6.3 Personal analytics: case stats over time (`app/analytics`).

### FR-7 Guidr Pro (payments)
- FR-7.1 Stripe Checkout subscription; buyer identified by uid in session
  metadata (`/api/stripe/create-checkout`).
- FR-7.2 Pro granted/revoked **only** via signed Stripe webhook events, plus an
  instant server-verified confirm on checkout return, both writing to the
  **server-owned entitlements doc** (`/api/stripe/webhook`, `/api/stripe/confirm`).
  *Verified this cycle.*
- FR-7.3 Price is admin-editable at `config/pricing`; public display endpoint
  (`/api/pricing`). Fallback default: RM 0.01/month (test value). [TBD: real
  launch price — founder decision.]

### FR-8 Platform & Settings
- FR-8.1 PWA: manifest, install prompt, offline banner (`public/manifest.json`,
  `InstallPrompt.tsx`, `OfflineBanner.tsx`).
- FR-8.2 i18n: English, Bahasa Melayu, Chinese (`lib/i18n.ts`).
- FR-8.3 Theme (light/dark/system) + scan-default preferences (`app/preferences`).
- FR-8.4 In-app feedback (category/rating/message) → Google Sheets Apps Script
  webhook (`/api/feedback`).
- FR-8.5 Admin broadcast push to all opted-in users, shared-secret protected
  (`/api/notify/broadcast`).

## 6. Non-Functional Requirements

- **NFR-1 Latency (scans).** Code-set budgets: overall agent deadline ~95 s,
  per-call timeout, durable-scan budget 105 s, Vercel `maxDuration` 120 s
  (`ai-utils.ts`, `vercel.json`). Target *user-perceived* scan time:
  [TBD: product decision].
- **NFR-2 Throughput / concurrency.** Global cap of **12 concurrent scans**
  (`SCAN_MAX_CONCURRENT`, env-overridable) to stay inside Vertex quota; FIFO
  queue beyond that (`scan-queue.ts`). Expected peak load: [TBD].
- **NFR-3 Availability / uptime SLA.** [TBD: none set in code/config.]
- **NFR-4 Data residency.** Firestore `asia-southeast1`; Vercel `sin1`
  (`firebase.json`, `vercel.json`). **Vertex AI defaults to `us-central1`
  unless `GCP_LOCATION` is set** (`ai-client.ts`) — scan content may transit
  the US by default. [TBD: confirm production sets `asia-southeast1`.]
- **NFR-5 Privacy / PDPA.** Export + delete-account flows exist
  (`/api/account/export|delete`). Formal PDPA compliance statement, retention
  policy, and privacy-policy text: [TBD: legal review — do not claim compliance
  from these endpoints alone].
- **NFR-6 Security.** Firebase ID-token auth on mutating APIs; server-authoritative
  writes for counters, verdicts, queue, **entitlements**, and Pro status;
  per-user rate limits; field-level Firestore rules. See SDD §5 and §8.
- **NFR-7 Accessibility.** [TBD: no explicit a11y standard targeted.]
- **NFR-8 Browser/device support.** PWA-first, portrait (`manifest.json`).
  Minimum supported browsers: [TBD].
- **NFR-9 Cost controls.** Free-tier scan quota, scan concurrency cap, web-intel
  cache (1 h TTL), RSS cache (24 h), and **auth + rate-limits on paid-AI
  endpoints** (security fix F-2). Monthly AI/API budget: [TBD].

## 7. Constraints

- Vercel serverless: `maxDuration = 120 s`; rate limits and caches are
  per-instance in-memory (reset on cold start) (`admin.ts`).
- Two separate GCP identities: Firebase project `guidr-d8709` (Auth, Firestore,
  FCM) and a separate Vertex AI project; each needs its own credentials env var
  (`admin.ts`, `firebase-admin.ts`).
- Vertex AI per-minute quota drives the queue design.
- Next.js 16 (App Router) with breaking changes vs. common docs (`AGENTS.md`).
- Daily quota pinned to Asia/Kuala_Lumpur regardless of server region
  (`lib/plan.ts`).

## 8. Assumptions

- Users are primarily Malaysian; phone matching, banks list, taxonomy, and
  reporting bodies are Malaysia-specific.
- Guardian phone matching uses **self-entered, un-verified** profile numbers
  (free plan has no OTP — `/api/guardians/request`).
- Stripe webhook is configured/reachable in production; `confirm` covers the gap
  when it is slow/absent.
- Queue and quota **fail open** if Admin credentials are missing (documented in
  `scan-queue.ts`, `scan-quota.ts`).
- Cloud Functions in `functions/` are deployed. [TBD: verify — see SDD Known
  Gaps re: possible stats double-counting.]

## 9. Out of Scope (current build)

- Native mobile apps (PWA only; native deferred).
- OTP phone verification on the free plan.
- Email delivery of guardian alerts (preference flag exists; no sender found).
- In-repo admin dashboard (external tool edits `config/pricing`).
- Automated tests and CI (none in the repo).
- Direct electronic filing to NSRC/PDRM/MCMC (the app formats reports and tracks
  flags; it does not submit on the user's behalf).

## 10. Revision History

| Version | Date | Author | Notes |
|---|---|---|---|
| 0.1 | 2026-07-04 | — | Skeleton, code-derived. |
| 1.0 | 2026-07-05 | — | Full draft; reflects security fixes F-1/F-2 (entitlements now server-owned; paid-AI endpoints authenticated). |
