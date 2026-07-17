# Guidr — Technical Security Report

| | |
|---|---|
| **Document** | Technical Security Report — Findings, Impact & Remediation |
| **Product** | Guidr — AI-powered scam investigation platform (Malaysia) |
| **Version** | 1.0 |
| **Date** | 2026-07-05 |
| **Status** | Complete for the 2026-07 review cycle |
| **Author** | Security review |
| **Related** | `docs/SDD.md` §8 (Findings register), `docs/SDLC.md` §7 |

---

## 1. Executive Summary

A security review of the Guidr codebase surfaced **11 findings**. This cycle
**closed three** — the two high-severity issues and one functional bug found
during verification — and logged the remaining eight for founder
prioritisation.

| ID | Title | Severity | Status |
|---|---|---|---|
| **F-2** | Unauthenticated Vertex AI endpoints | **HIGH** | ✅ Fixed & verified |
| **F-1** | Client-writable entitlement fields (self-grant Pro) | **HIGH** | ✅ Fixed & verified |
| **F-11** | Preferences "Upgrade" button 401 (functional) | LOW | ✅ Fixed |
| F-3 | Client-written gamification stats | MEDIUM | Open |
| F-4 | Public `alerts` accept arbitrary content | MEDIUM | Open |
| F-5 | Unverified phone → guardian matching | MEDIUM | Open |
| F-6 | Rate limiting is per-instance memory | LOW | Open (mitigated) |
| F-7 | `presence` readable by any signed-in user | LOW | Open |
| F-8 | Fail-open enforcement | LOW | Open (by design) |
| F-9 | Misleading env var name (`GEMINI_API_KEY`) | INFO | Open |
| F-10 | Static admin broadcast secret | INFO | Open |

**Both high-severity findings shared one root cause pattern:** the server
trusted data that the client fully controlled. F-2 trusted *anonymous callers*
to run paid AI; F-1 trusted the *client-writable profile document* for
billing-critical state. Both fixes re-establish the correct trust boundary —
the server (or a payment event), not the browser, is the authority.

**Residual action:** the fixes are code-complete and verified locally, but are
**not live in production** until the Firestore rules are deployed and the
entitlements migration is run (§6).

## 2. Scope & Methodology

- **Scope:** the Next.js PWA in this repository — API routes, `firestore.rules`,
  client data-access layer, and payment/AI integrations.
- **Method:** manual source review deriving the actual trust boundaries, then
  targeted verification against the Firebase emulator (which loads the real
  `firestore.rules`) and the running dev server.
- **Out of scope:** the external admin dashboard, third-party service internals
  (Stripe, Vertex, Firebase infrastructure), and penetration testing of the
  live deployment.

## 3. Severity Rubric

| Severity | Meaning |
|---|---|
| **HIGH** | Directly exploitable by an ordinary user for financial loss, monetization bypass, or unbounded cost; low skill required. |
| **MEDIUM** | Exploitable with some constraints or limited blast radius; abuse, integrity, or privacy impact. |
| **LOW** | Weakness that is mitigated, self-scoped, or hard to exploit; or a functional defect with business impact but no security breach. |
| **INFO** | Hygiene/hardening item; no direct exploit. |

---

## 4. Closed Findings (detailed)

### F-2 — Unauthenticated Vertex AI endpoints — **HIGH** — ✅ Fixed & verified

**Affected:** `app/api/generate-report/route.ts`, `app/api/extract-text/route.ts`
(and the caller `app/scan/VerdictView.tsx`).

**Description.** Both routes invoked paid Vertex AI (report generation /
screenshot OCR) but performed **no authentication and no rate limiting**.
`generate-report` additionally accepted arbitrary reporter PII (name, phone,
email) with no validation, interpolating attacker-controlled strings into the
model prompt and the generated document.

**Impact if not closed.**
- **Unbounded billing / financial denial-of-wallet.** Anyone with the URL could
  script unlimited calls, each spending Vertex AI tokens on Guidr's account,
  and exhaust the project's per-minute quota — degrading service for real users.
- **Free anonymous LLM access** and a **prompt-abuse surface** via the
  unvalidated fields.
- **No accountability:** with no identity on the request, abuse could not be
  attributed, rate-limited per actor, or banned.

**Root cause.** Missing authentication meant there was no stable identity to
meter against; an IP-only limiter is defeated by rotating IPs, and the
in-memory limiter resets per serverless instance — so anonymous rate limiting
was effectively decorative.

**How we closed it.**
1. **Authentication** — added `verifyRequest()` (the same Firebase ID-token
   check the scan routes use) to `generate-report`; rejects with `401` in
   production, tolerant of anonymous in dev to keep local testing working.
2. **Rate limiting** — added `checkRateLimit()` keyed `generate-report:<uid>`
   at 5/min, in its own bucket so it can't starve the scan flow.
3. **Input validation** — added `firstValidationError()`, which rejects
   oversized or malformed input (length caps, email/phone format checks, array
   size limits) with `400 invalid_input` **before any Vertex call**.
4. **Attack-surface reduction** — `extract-text` had **no callers anywhere in
   the app** (dead code), so it was disabled to `410 Gone` rather than
   maintained; the original implementation is preserved commented for revival.
5. **Caller update** — `VerdictView.tsx` (the sole caller of `generate-report`)
   now attaches the ID token.

**Verification.**
| Check | Result |
|---|---|
| Invalid reporter email | `400 invalid_input` |
| Oversized `originalMessage` (>10k) | `400 invalid_input` |
| Rate limit (5/min) | `429` after budget spent |
| `extract-text` disabled | `410 gone` |
| Valid input (golden path) | `200` + report generated |
| No token, production build | `401 unauthorized` |

---

### F-1 — Client-writable entitlement fields — **HIGH** — ✅ Fixed & verified

**Affected:** `firestore.rules`, `lib/plan.ts`, `lib/firestore.ts`,
`app/api/lib/scan-quota.ts`, `app/api/stripe/{webhook,confirm}/route.ts`,
`app/api/account/export/route.ts`, `app/login/page.tsx`, and the client readers
(`ScanForm`, `VerdictView`, `scan/report`, `settings`, `preferences`); migration
`scripts/migrate-entitlements.mjs`.

**Description.** The Firestore rules allowed the document owner **full write
access to `users/{uid}`**, and the server read billing-critical state —
`isSubscribed` (Pro flag) and `scanQuota` (daily limit counter) — from that same
document. A signed-in user could therefore set those fields directly from the
browser developer console.

**Impact if not closed.**
- **Monetization bypass — self-granted Pro.** A user runs
  `updateDoc(doc(db,'users',uid),{isSubscribed:true})` and receives the full Pro
  entitlement — **unlimited paid Vertex scans, priority queue, unlimited
  guardians, full forensic reports** — with **no payment**. Direct revenue loss
  plus uncapped AI cost per free-riding account.
- **Cost-control bypass — quota reset.** Resetting `scanQuota.count` defeats the
  5-scan daily free limit, the primary guard on Vertex spend.
- **Trivially exploitable:** one console line, no special tooling, by any
  authenticated user.

**Root cause — the trust-boundary error.** Document *ownership* ("you are uid X,
so you may write doc X") was conflated with *entitlement authority* ("what the
business has agreed to provide you"). Self-asserted facts (name, theme) and
business-granted state (Pro status) lived in one client-writable document, but
Firestore's document-level rules cannot distinguish *who may set which field* —
so the permission to rename yourself also let you promote yourself. The
authority for `isSubscribed` is Stripe's payment record, not the user.

**How we closed it.**
1. **Relocated entitlements** to a dedicated **server-only** document,
   `users/{uid}/entitlements/plan`, holding `isSubscribed`, `scanQuota`, and the
   Stripe linkage. Rules: `allow read: if isOwner; allow write: if false` — the
   client can read (the UI still shows "scans left" and gates Pro live) but can
   never write.
2. **Field-level guard on the profile** — the `users/{uid}` rule was split into
   `read/create/update/delete`, and create/update now **reject any write that
   introduces or changes the entitlement keys**, so a look-alike copy cannot be
   planted on the profile either.
3. **Repointed every reader/writer** — the Stripe webhook and confirm route, and
   the quota accounting, now write/read the entitlements doc via the Admin SDK
   (which legitimately bypasses rules); client screens read it via a new
   `subscribeEntitlements()` listener. Entitlement fields were removed from the
   `UserProfile` type and from client signup writes.
4. **Migration** — `scripts/migrate-entitlements.mjs` moves existing
   subscribers' fields to the new doc so no paying user loses Pro on deploy.

**Verification.**
| Check | Result |
|---|---|
| Console attempt: `profile.isSubscribed = true` | **`permission-denied`** |
| Console attempt: reset `profile.scanQuota` | **`permission-denied`** |
| Console attempt: write `entitlements/plan` directly | **`permission-denied`** |
| Legitimate profile edit (`theme`) | Allowed |
| Owner reads own `entitlements/plan` | Allowed |
| Free quota decrements + daily-limit gate fires | Verified end-to-end |
| Stripe test upgrade writes `isSubscribed` to the locked doc | Verified end-to-end |

*(Rules verified against the Firebase emulator, which loads the production
`firestore.rules`.)*

---

### F-11 — Preferences "Upgrade" button 401 — **LOW (functional)** — ✅ Fixed

**Affected:** `app/preferences/page.tsx`.

**Description.** Found while verifying the F-1 upgrade flow. The Preferences
page's upgrade button called `POST /api/stripe/create-checkout` **without an
`Authorization` header**, so the route's `verifyIdToken` returned null and
checkout failed with `401 "Please sign in before upgrading."`. The Settings
page's equivalent button sent the token correctly; Preferences did not. The bug
**pre-dated** this review and affected **production**.

**Impact if not closed.** Any user who tried to upgrade from the Preferences
page was blocked — a **lost conversion / revenue path**. It is *not* a security
vulnerability: it fails closed (no access is wrongly granted).

**How we closed it.** The handler now fetches `auth.currentUser.getIdToken()`
and sends the Bearer header, mirroring the working Settings handler.

**Verification.** Type-check clean; behaviour now identical to the verified
Settings upgrade path.

---

## 5. Open Findings (logged, not yet remediated)

These remain for founder prioritisation. Included for completeness — none were
changed this cycle.

| ID | Severity | Impact if not closed | Recommended fix |
|---|---|---|---|
| **F-3** | MEDIUM | Users can forge XP / security rank / streaks by writing their own profile. Self-scoped today, but ranks are shown socially and could later gate perks. | Move XP/stat mutations behind a server route (Admin SDK), like the stats counters already are. |
| **F-4** | MEDIUM | Any signed-in user can create a **world-readable, immutable** alert with free-text content — a defamation/abuse vector on public pages, with no moderation or delete path. | Server-side validation + a moderation/delete capability; consider server-only creation. |
| **F-5** | MEDIUM | Profile phone is self-entered (no OTP on free plan); claiming another person's number surfaces their guardian invites. Acceptance is still required, limiting blast radius. | OTP-verify phone before it can be used for guardian matching. |
| **F-6** | LOW | In-memory per-instance rate limits reset on cold start / scale-out, so limits are soft. | Back with a shared store (e.g. Upstash Redis) for the sensitive endpoints. Partly mitigated for F-2 endpoints by requiring auth. |
| **F-7** | LOW | `presence` is readable by any signed-in user, exposing all uids + last-seen timestamps (enumeration vector). | Expose only an aggregate count, not per-user documents. |
| **F-8** | LOW | Quota/queue **fail open** if Admin creds are missing — a misconfigured deploy silently disables monetization limits and the Vertex concurrency cap. Deliberate design. | Add production monitoring/alerting for the fail-open path; consider fail-closed in prod. |
| **F-9** | INFO | `GEMINI_API_KEY` actually holds the Safe Browsing key; a future operator may paste a real Gemini key with broader scope. | Rename the variable to `SAFE_BROWSING_API_KEY`. |
| **F-10** | INFO | `/api/notify/broadcast` uses a single long-lived shared secret with no rotation or audit trail. | Rotate-able credential + audit logging; consider per-operator auth. |

## 6. Residual Actions to Close F-1 / F-2 in Production

The fixes are verified locally but require deployment steps to take effect live:

1. **Deploy rules + code together:** push to Vercel and run
   `firebase deploy --only firestore:rules`.
2. **Run the migration once** (immediately after deploy):
   `node scripts/migrate-entitlements.mjs --dry-run`, review, then run without
   the flag — moves existing subscribers to the entitlements doc so no one loses
   Pro.
3. **Confirm on the deploy:** unauthenticated `POST /api/generate-report` →
   `401`; a browser-console write of `isSubscribed` on the profile →
   `permission-denied`.

## 7. Remediation Priorities (open findings)

Priority weighs **severity × exploitability × blast radius**, then divides by
**effort** — so a cheap fix that removes real risk outranks an expensive one
that removes a little. Recommended order:

### Tier 1 — Address next

- **F-4 — Public `alerts` abuse (MEDIUM).** The highest *real-world* risk among
  the open items: it is the only one with **external, public, legal** exposure.
  Any signed-in user can publish a **world-readable, immutable** alert with
  free-text content, and Guidr's core function is naming suspected scammers — so
  defamatory or abusive alerts are directly on-brand risk, with no delete or
  moderation path. *Effort: medium* — add server-side validation, a
  moderation/delete capability, and consider making alert creation a server
  route.
- **F-9 — Rename `GEMINI_API_KEY` (INFO).** Bundle into the same PR as a
  **quick win**: near-zero effort, and it prevents a *future* HIGH-severity
  mistake — an operator pasting a real, broadly-scoped Gemini key into a
  variable they believe is for Gemini (it actually holds only the Safe Browsing
  key). *Effort: trivial.*

### Tier 2 — Schedule soon

- **F-3 — Forgeable XP / rank / streaks (MEDIUM).** Same vulnerability class as
  the F-1 issue just fixed — client-writable trusted state — and there is
  already a proven server-side pattern to copy (`/api/stats/bump`). Close it
  **before** ranks gate any real perk or reward. *Effort: low.*
- **F-8 — Fail-open monitoring (LOW).** Directly protects the F-1 fix: if Admin
  credentials ever drop, quota and Pro enforcement silently disable, undoing
  F-1's guarantees. Add production alerting on the fail-open path (and consider
  fail-closed in prod). *Effort: low.*
- **F-5 — Phone verification for guardians (MEDIUM).** Privacy /
  social-engineering risk, but blast radius is limited by the required
  acceptance step, so it can be scheduled deliberately. *Effort: higher* — needs
  an OTP verification flow.

### Tier 3 — Backlog / hardening

- **F-7 — `presence` exposure (LOW).** Expose an aggregate count instead of
  per-user documents. *Effort: low.*
- **F-6 — Shared rate-limit store (LOW).** Back the limiter with Redis (e.g.
  Upstash) for strict global limits; **already partly mitigated** for the
  F-2 endpoints now that they require auth. *Effort: medium (infra).*
- **F-10 — Admin secret rotation (INFO).** Low exposure (a single operator
  action); add a rotate-able credential + audit logging when convenient.
  *Effort: low.*

### Effort × impact summary

| Priority | Finding | Risk removed | Effort |
|---|---|---|---|
| 1 | F-4 public-alert abuse | High (public/legal) | Medium |
| 1 | F-9 env var rename | Prevents future HIGH | Trivial |
| 2 | F-3 forgeable stats | Medium (integrity) | Low |
| 2 | F-8 fail-open alerting | Protects F-1 | Low |
| 2 | F-5 phone OTP | Medium (privacy) | Higher |
| 3 | F-7 presence | Low (privacy) | Low |
| 3 | F-6 shared limiter | Low (mitigated) | Medium |
| 3 | F-10 admin secret | Info (hygiene) | Low |

**Suggested next PR:** F-4 + F-3 + F-9 together — one addresses the public-facing
risk, one closes the last client-writable-trust gap, and one is a free hardening
win. F-8 is a small, high-leverage follow-up given the F-1 work just landed.

## 8. Conclusion

The two high-severity findings — both direct monetization/cost bypasses
exploitable by any ordinary user — are fixed and verified, along with a
functional upgrade bug uncovered during testing. The remaining eight findings
are lower-severity and documented for a future cycle. Once the deployment steps
in §6 are completed, F-1 and F-2 are fully closed in production.

## 9. Revision History

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-07-05 | Initial report: F-1/F-2/F-11 closed and verified; F-3–F-10 logged. |
| 1.1 | 2026-07-05 | Added §7 Remediation Priorities (prioritised roadmap for open findings). |
