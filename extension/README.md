# Guidr browser extension

Point-of-harm scam interception for desktop.

Competitors warn you about a **site**. But a scam site is harmless until you do one of about
five things: type a TAC, hand over a banking password, paste a bank account number, run a
downloaded installer, or press "pay". This extension watches for the **action**, not the page.

That is why it can stay silent almost all of the time and still catch the moment that
actually costs money. A blocker that cries wolf gets uninstalled, and an uninstalled blocker
protects nobody.

## Read this first

**[PRIVACY.md](./PRIVACY.md)** — the constraints this extension operates under, several of
which are enforced by the build and will fail your commit.

## Build and load

```bash
node extension/build.mjs      # -> extension/dist/
node extension/test.mjs       # engine tests (29 assertions)
npx tsc --noEmit -p extension/tsconfig.json
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select `extension/dist`.

## How it fits together

```
lib/bank-domains.ts     official bank domains + lookalike detection   (pure, no deps)
lib/point-of-harm.ts    the rules engine                              (pure, no deps, no network)
lib/malaysian-banks.ts  existing bank registry, reused for brand detection

extension/src/content.ts    the eyes: reads the DOM, reduces it to PageSignals, discards the rest
extension/src/overlay.ts    the interruption UI (closed shadow DOM, so the page cannot remove it)
extension/src/background.ts colours the toolbar icon. That is all it does.
extension/src/popup.ts      stats + kill switches
```

The engine is a **pure function** and lives in `lib/`, not in `extension/`, on purpose: the
web app can use the same rules, and there is exactly one source of truth for what counts as
a scam.

## The rules

| Rule | Fires when | Severity |
| ---- | ---------- | -------- |
| **R1** | A banking password or TAC is typed on a page that names a bank but is not that bank's domain | block |
| **R2** | The domain itself is imitating a bank (typo, embedded brand, punycode) | block |
| **R3** | Something shaped like a bank account number is typed on a site we cannot vouch for | warn |
| **R4** | An executable or `.apk` is downloaded | block |
| **R5** | Credentials entered over plain HTTP | warn |
| **R6** | A login form posts to a different origin | warn |
| **R7** | Paying on a page that name-drops a bank but is not the bank | warn |

**R1 is the one that matters.** It is fully deterministic: no AI, no network, no meaningful
false-positive risk, and it stops the single most expensive scam in Malaysia. If we only ever
ship one rule, ship R1.

## The bank allowlist

`lib/bank-domains.ts` decides when Guidr **stays silent**, so it is the most dangerous file in
the project. The two failure modes are not symmetric:

- **Omission** (a real bank domain missing) → we over-warn on a real bank. Annoying, visible,
  reported immediately, user still safe.
- **Commission** (a wrong domain in the list) → we go **silent** on that domain. If an attacker
  ever landed a domain on this list, Guidr would actively vouch for their phishing page.

So: **when in doubt, leave it out.** An incomplete allowlist degrades gracefully. A wrong one
is a weapon.

### How a domain becomes trusted

Not from search results, not from memory. The evidence is the TLS certificate's validated
`O=` organization field: banks use OV/EV certificates, so a Certificate Authority has checked
the legal entity. An attacker can get a domain-validated cert for `maybank2v.com.my` in
minutes, but cannot get one that says `O=Malayan Banking Berhad`.

Reproduce the check yourself:

```bash
node scripts/verify-bank-domains.mjs
```

It reports `ok` (cert org matches what we recorded), `NEW` (an unverified domain now presents
a validated org, so it is a candidate for promotion by hand), and `DRIFT` (a **trusted** domain
no longer proves the bank's identity — exit code 1).

**Status as of 2026-07-13: 15 verified, 11 not.** The unverified ones fail for three different
reasons and the notes in the file say which: a DV-only certificate, a connection timeout
(consistent with the bank geo-blocking non-Malaysian IPs), or the hostname not resolving at all
— and that last group may simply be domains that were guessed wrong. Find the bank's real
domain rather than re-checking a wrong one.
