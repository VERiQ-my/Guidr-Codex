# Guidr — Software Development Lifecycle (SDLC)

| | |
|---|---|
| **Document** | Software Development Lifecycle (process & methodology) |
| **Product** | Guidr — AI-powered scam investigation platform (Malaysia) |
| **Version** | 1.0 |
| **Date** | 2026-07-05 |
| **Status** | Draft for founder review |
| **Owners** | [TBD: founder names / roles] |
| **Related** | `docs/SRS.md` (requirements), `docs/SDD.md` (design) |

> **Purpose of this document.** It defines *how* Guidr is built and maintained —
> the lifecycle model, the phases, who does what, and which artifact each phase
> produces. It is the parent document: the **SRS** is the output of the
> Requirements phase, and the **SDD** is the output of the Design phase. Every
> claim here is grounded in the actual repository (files referenced in
> parentheses); process choices not yet evidenced are marked `[TBD]`.

---

## 1. Lifecycle model

Guidr follows an **iterative & incremental** model (Agile-leaning), not a
single waterfall pass. Evidence in the repository:

- Work lands as **feature branches merged via pull request** — e.g.
  `feature/guidr-pro-and-background-scans` (PR #9), `feature/...` merges in the
  git history, and the current `haziq/srs_sdd` branch.
- Features ship independently and are refined in place (e.g. Guidr Pro pricing
  was first hard-coded, then made admin-editable via `config/pricing`).
- Security hardening happens as its own iteration on top of shipped features
  (the F-1/F-2/F-11 review — see §7).

**Why this model fits:** a two-/small-founder team shipping a live PWA to real
users needs short cycles and the ability to correct course (pricing, quota
rules, security) without a big-design-up-front freeze.

**Cadence / sprint length:** [TBD: needs founder decision — not derivable from
the repo.]

## 2. Phases and their artifacts

| Phase | What happens in Guidr | Primary artifact |
|---|---|---|
| **1. Requirements** | Capture what the product must do, derived from user needs (fresh grads, elderly wards, admin) and the live code. | **SRS** (`docs/SRS.md`) |
| **2. Design** | System architecture, data model, API contracts, security design. | **SDD** (`docs/SDD.md`) |
| **3. Implementation** | Build in Next.js (App Router) + Firebase; feature branches. | Source in `app/`, `lib/`, `functions/` |
| **4. Testing / Verification** | Manual + Firebase-emulator verification today; automated tests are a known gap. | §5, test evidence in review notes |
| **5. Deployment / Release** | Vercel (app) + Firebase (rules, functions); env-var config. | `DEPLOY.md`, `vercel.json`, `firebase.json` |
| **6. Maintenance & Security** | Migrations, security reviews, bug fixes. | `scripts/*`, SDD §8 Findings |

The phases are **iterative**: a maintenance-phase finding (e.g. F-1) loops back
to Design (rules change) and Implementation (code change) and Testing
(emulator verification) before re-release.

## 3. Roles & responsibilities

- **Founders / product owners** — own the `[TBD]` product decisions the SRS/SDD
  surface (pricing, SLAs, data-retention policy, launch scope).
- **Developer(s)** — implementation, code review, deployment.
- **AI/agentic assistant** — used for documentation, security
  review, and implementation support in this project.
- Formal RACI / individual assignments: [TBD: founder decision].

## 4. Tooling & environments

**Toolchain (verified):**
- Language/framework: TypeScript 5, Next.js 16 (App Router), React 19,
  Tailwind CSS 4 (`package.json`).
- Backend services: Firebase Auth, Firestore, Cloud Functions, FCM
  (`firebase.json`, `functions/`).
- AI: Vertex AI Gemini (`app/api/lib/ai-client.ts`).
- Payments: Stripe (`app/api/stripe/*`).
- Hosting: Vercel, region `sin1` (`vercel.json`).
- Source control: Git + GitHub (PR-based).

**Environments:**
| Environment | App | Data | Notes |
|---|---|---|---|
| **Local dev** | `next dev` on `:3000` | **Firebase Emulators** (Firestore `:8080`, Auth `:9099`, UI `:4000`) | Gated by `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`; server also needs `FIREBASE_AUTH_EMULATOR_HOST` + `FIRESTORE_EMULATOR_HOST` so the Admin SDK targets the emulator, not prod. |
| **Production** | Vercel | Firebase project `guidr-d8709` (`asia-southeast1`) | Config via Vercel env vars (see `DEPLOY.md`). |
| **Staging** | [TBD: none evidenced] | | |

## 5. Testing & verification strategy

**Current state (verified):**
- **No automated test suite and no CI** exist in the repo (no test files, no
  `.github/` workflows).
- Verification is **manual + emulator-based**. The Firebase Firestore emulator
  loads the real `firestore.rules`, so security rules *can* be exercised
  locally (this is how F-1 was verified).
- Type safety is enforced via `tsc --noEmit` and ESLint (`eslint.config.mjs`).

**Verification performed for the current security iteration (§7):**
- F-1 (entitlement tampering): scripted rules test against the emulator —
  exploit writes denied, legitimate writes allowed; plus end-to-end manual
  test (quota decrement, Pro upgrade writing to the locked doc).
- F-2 (unauth AI endpoints): API tests — validation `400`, rate-limit `429`,
  disabled route `410`, golden-path `200`, and `401` in a production build.

**Recommended additions:** [TBD: founder decision] — unit tests for
`lib/plan.ts` / `scam-categories.ts`, a `@firebase/rules-unit-testing` suite
for `firestore.rules`, and CI on pull requests.

## 6. Release & change management

- **Branching:** feature branches → pull request → merge to `main`.
- **App deploy:** push to the Vercel-connected branch; functions serve from
  `sin1`.
- **Rules/functions deploy:** `firebase deploy --only firestore:rules` /
  `--only functions` (`DEPLOY.md`).
- **Data migrations:** one-off scripts in `scripts/` (e.g.
  `migrate-entitlements.mjs`, `backfill-stats.mjs`), run once around the
  matching deploy.
- **Secrets:** service-account JSON + API keys via environment variables;
  key files are gitignored (`.gitignore`). Never committed.
- **Rollback / release approval process:** [TBD: founder decision].

## 7. Security in the lifecycle

Security is treated as a recurring maintenance-phase activity, not a one-off.
The most recent iteration reviewed the codebase and produced the Findings in
**SDD §8**. Two were fixed and verified in this cycle, plus one functional bug
found during testing:

- **F-2 — Unauthenticated AI endpoints (FIXED).** `generate-report` gained
  auth + rate-limiting + input validation; the unused `extract-text` route was
  disabled (`410`).
- **F-1 — Client-writable entitlements (FIXED).** Pro status and scan quota
  were moved from the client-writable profile doc to a server-only
  `users/{uid}/entitlements/plan` doc; `firestore.rules` now also blocks those
  keys on the profile at field level.
- **F-11 — Preferences "Upgrade" button 401 (FIXED).** Missing auth header on
  the checkout call; found while verifying F-1.

Remaining findings (F-3…F-10) are logged in the SDD for founder
prioritisation. This closes the loop: review → design change → implementation →
emulator/prod verification → documentation.

## 8. Traceability

- **This SDLC** defines the process and points to the two detail documents.
- **SRS** (`docs/SRS.md`) — every functional requirement (`FR-*`) traces to a
  route/component; non-functional requirements cite config or are `[TBD]`.
- **SDD** (`docs/SDD.md`) — architecture, data model, API contracts, and the
  Findings register (including fix status) trace to source files.

A requirement → design → code → test traceability matrix is
[TBD: to be maintained as the docs mature].

## 9. Open process decisions (`[TBD]` register)

| Item | Needed from |
|---|---|
| Sprint cadence / release schedule | Founders |
| Staging environment (yes/no) | Founders |
| Automated test + CI adoption | Founders / dev |
| Rollback & release-approval policy | Founders |
| RACI / individual role assignments | Founders |
