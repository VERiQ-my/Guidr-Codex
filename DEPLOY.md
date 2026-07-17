# Deploying Guidr to Vercel

## 1. Prerequisites
- A Firebase project (Auth + Firestore) — currently `guidr-d8709`.
- A Google Cloud service account with **Vertex AI User** and access to the
  Firebase project (for Admin SDK token verification). Download its JSON key.
- A Google **Safe Browsing** API key (optional but recommended for URL checks).

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)
Set every key from [`.env.example`](.env.example):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | From Firebase web app config. |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | The **entire** service-account JSON, pasted as one value. Powers Vertex AI + Admin SDK. |
| `GCP_PROJECT_ID` / `GCP_LOCATION` | Optional; default to the SA project / `us-central1`. |
| `GEMINI_API_KEY` | Google Safe Browsing key. |
| `GUIDR_DEMO_MODE` | Leave **unset** in production. |

> Do not upload `google-credentials.json` — it's gitignored. Use the env var instead.

## 3. Runtime / region
- The scan route ([`app/api/analyze-stream/route.ts`](app/api/analyze-stream/route.ts))
  runs on the **Node.js** runtime with `maxDuration = 60s`.
- [`vercel.json`](vercel.json) pins functions to **`sin1`** (Singapore), close to the
  Firestore database (`asia-southeast1`). Adjust if your users/data are elsewhere.

## 4. Firestore
Rules are already deployed (per-user lockdown + public `stats`/`scams`). If you
change [`firestore.rules`](firestore.rules):
```bash
firebase deploy --only firestore:rules
```

### 4a. Scan concurrency gate (required for multi-user load)
The scan endpoint is fronted by a **global concurrency gate + FIFO queue**
([`app/api/lib/scan-queue.ts`](app/api/lib/scan-queue.ts)) so that many
simultaneous users don't exceed the Vertex AI per-minute quota. It stores state
in Firestore (`scan_control/slots`, `scan_tickets/*`), written **server-side via
the Admin SDK**.

**Credentials — no new IAM grant needed.** The queue reuses the existing
**Firebase Admin** credentials (`FIREBASE_ADMIN_CREDENTIALS_JSON`, the
`guidr-d8709` service account already required for Guardian Alerts) via
`getAdminFirestore()`. If you've configured Guardian Alerts, the queue works
out of the box. Deploy the updated rules so the new collections are locked down:
```bash
firebase deploy --only firestore:rules
```

> **Fail-open:** if `FIREBASE_ADMIN_CREDENTIALS_JSON` is missing (or Firestore is
> unreachable), the queue can't run and scans fall back to **ungated** (current
> behavior) — they won't break, but the concurrency cap isn't enforced. Set
> `QUEUE_FALLBACK_OPEN=false` to instead fail *closed* (return "busy").

**Index:** the queue only uses equality/single-field filters, so Firestore's
automatic indexes suffice — no composite index needed.

**Tunables (env vars, all optional):**

| Variable | Default | Notes |
|---|---|---|
| `SCAN_MAX_CONCURRENT` | `12` | Max scans hitting Vertex at once. Keep below your Vertex requests/min quota ÷ (calls per scan). |
| `SCAN_TICKET_TTL_MS` | `30000` | A scan/queue slot with no heartbeat for this long is reclaimed (covers crashed/closed clients). |
| `SCAN_HEARTBEAT_MS` | `10000` | How often a running scan refreshes its slot. |
| `QUEUE_FALLBACK_OPEN` | `true` | `false` = fail closed if Firestore is unreachable. |

## 5. Important production caveats
- **Cross-project service account.** The Vertex AI service account
  (`guidr-vertex-access@gmp-demo-project-523521543`) is in a *different* GCP
  project than Firebase Auth (`guidr-d8709`). ID-token verification is pinned to
  `FIREBASE_PROJECT_ID`, so auth works — but set that env var explicitly.
- **Vertex on a demo project.** `gmp-demo-project-523521543` looks like a
  trial/demo project. When its credits run out, **scans will stop working.** For
  production, move Vertex AI to a billing-enabled project (ideally grant Vertex
  access to a `guidr-d8709` service account and use one SA for everything).
- **Rate limiting is in-memory** (per serverless instance, 8 scans/min/user) and
  remains as a per-user anti-abuse backstop. The **global** protection against
  Vertex-quota exhaustion under many concurrent users is now the Firestore-backed
  concurrency gate (see §4a), which caps simultaneous scans and queues the rest.

## 6. Counter integrity (optional, needs Blaze)
Aggregate counters in `stats/global` are currently incremented client-side. To make
them tamper-proof, upgrade the Firebase project to the **Blaze** plan and deploy the
Cloud Functions, then lock `stats` writes:
```bash
firebase deploy --only functions
# then set `allow write: if false;` on /stats in firestore.rules and redeploy rules,
# and remove the client-side bumpGlobalStat() calls.
```

## 7. Deploy
```bash
vercel            # preview
vercel --prod     # production
```
(Or connect the GitHub repo for automatic deploys.)

## 8. Post-deploy smoke test
1. Sign up / log in.
2. Run a scan — should complete and show a verdict.
3. Confirm an unauthenticated `POST /api/analyze-stream` returns **401**.
4. Rapid-fire scans should eventually return **429** (rate limit: 8/min per user).
