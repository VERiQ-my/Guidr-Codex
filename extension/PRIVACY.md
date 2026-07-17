# Guidr extension: privacy and threat model

A scam-protection tool asks for enormous trust: to catch a fake bank page it has to be
able to read the page you are on. That capability, misused, is indistinguishable from
spyware. This document is the constraint we accept in exchange.

If you are adding code to `extension/`, read this first. Several of these rules are
enforced by the build and will stop you.

---

## The claim we make to users

The popup says, in the user's face:

> **0 requests sent. Ever.** Guidr works entirely on your computer. It does not send your
> browsing anywhere, does not keep a history, and never reads your passwords or TAC codes.
> It does not run on your bank's real website at all.

Every clause of that is load-bearing. Here is how each is kept.

---

## 1. Zero network requests

The extension makes no network calls. Not for telemetry, not for a blocklist update, not
for an "anonymous" ping.

**Enforced by the build.** `extension/build.mjs` greps the bundled output for `fetch(`,
`XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `EventSource`, and `importScripts(`
and **fails the build** if any appear.

This is the invariant that makes the rest of the privacy story credible. "Guidr can read
every page you visit" is only frightening if Guidr can also *talk to a server*. It cannot.
Reading without egress is a fundamentally different risk class from reading with egress.

If a future feature genuinely needs the network (see "Deferred", below), then the popup
copy, this file, and the Chrome Web Store listing all change in the *same commit* as the
guard. Do not simply delete the guard.

## 2. We never read the value of a secret

`content.ts` detects that a password field or a TAC/OTP field **exists**, and that the user
has **started typing** in it. It never reads what they typed.

Look at `isOtpField()`: it reads `input.autocomplete`, `input.name`, `input.id`,
`input.placeholder`, `input.maxLength`, `input.inputMode`. These are *page-author* strings.
They tell us what a field is **for**. They do not tell us what is **in** it.

`onPossibleAccountNumber()` is the single exception and it is fenced:

- It **returns early** on any password or OTP field, so it can never become a keylogger for
  the two things that actually matter.
- For an ordinary text field it reads `.value`, asks `looksLikeBankAccountNumber()` (is this
  10 to 16 digits?), and gets back a **boolean**. The string is not stored, not sent, not
  logged. It dies with the stack frame.
- We must do this, because "is the user about to wire money to an account number" cannot be
  answered without looking at the shape of what they typed.

## 3. No browsing history, ever

`chrome.storage.local` holds exactly three things:

| Key             | Contents                                        |
| --------------- | ----------------------------------------------- |
| `enabled`       | boolean                                         |
| `disabledHosts` | hostnames **the user explicitly turned off**    |
| `stats`         | two integers: `{ blocks, warnings }`            |

No URLs. No page content. No timestamps. The counters are deliberately **totals, not
events** — a list of `{url, time}` warnings would be a browsing history by another name,
and would be one subpoena away from being exactly that.

`disabledHosts` does record hostnames, but only ones the user typed a button to add, and it
never leaves the device.

## 4. Guidr does not run on a verified bank's website

`manifest.json` lists every **verified** domain from `lib/bank-domains.ts` under
`content_scripts[0].exclude_matches`, plus `*.gov.my`.

For those domains the extension is **structurally incapable** of observing your banking
session. Not "we choose not to look" — Chrome does not inject us at all. That is a much
stronger guarantee than a promise in code, because it does not depend on our code being
correct.

### Only VERIFIED domains are excluded, and that is a security property

Excluding a domain makes Guidr **completely silent** on it. So an exclusion is a statement
of trust, exactly as `verified: true` is. If unverified domains were also excluded, then a
bad entry in `bank-domains.ts` would silence the extension on an attacker's domain, and the
`verified` flag would be protecting nothing at all. That was a real bug in the first version
of this file.

So the rule is:

- **verified** → excluded. We trust it, we look away.
- **unverified** → *not* excluded. We do not trust it, so we keep watching.

The cost, honestly: on a real-but-unverified bank (currently BSN, Bank Rakyat, Affin, Bank
Islam and a few login domains) Guidr **will** run, and will probably over-warn. That is the
safe direction to fail, and it is loud, so it gets reported and fixed. Silence on an
unconfirmed domain is the dangerous direction.

**Enforced by the build, in both directions.** `build.mjs` fails if a verified domain is
missing from `exclude_matches`, *and* fails if an unverified domain is present in it.

### The cost of this choice, stated honestly

It means we **cannot** show an in-page "verified: this really is Maybank" badge, because
rendering that badge requires running on Maybank. We judged the privacy guarantee worth more
than the reassurance badge, and moved the passive signal to the toolbar icon, which needs no
page access. See the note at the bottom of `overlay.ts` for how to reverse this if the
product decides otherwise.

## 5. The permissions we refused

| Permission    | Why we do not request it                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `downloads`   | Would expose the user's entire download history. We read the `href` of a clicked link instead, which needs no permission. |
| `tabs`        | Standing access to the URL of every open tab, forever. We use `activeTab` (one tab, one click, then it lapses).        |
| `webRequest`  | Would let us observe every request the browser makes.                                                                  |
| `history`     | No.                                                                                                                    |
| `cookies`     | No.                                                                                                                    |

We do request the ability to run on all `http/https` pages. There is no way around this:
a fake Maybank page lives on an attacker's domain, and we cannot know that domain in advance.
Chrome will show the user "read and change all your data on all websites", and that warning
is **accurate**. Our answer is not to dispute it, but to make egress impossible (§1) and to
ship unminified (§6) so the claim is checkable.

## 6. The build is not minified

Deliberate. `build.mjs` sets `minify: false`. This extension asks for permission to read
every page a user visits; the least we owe them is that any person who wants to verify these
claims can read the shipped code and do so. A few kilobytes is a cheap price for that.

## 7. The engine cannot see page content, by type

`lib/point-of-harm.ts` is a pure function whose only input is `PageSignals`. Read that type:
booleans, a hostname, and an array of matched bank *names*. There is no field that can hold
page text, a URL path, a query string, or a form value.

Raw page content cannot reach the decision logic because **there is nowhere to put it**. The
content script reduces the DOM to these signals in-page and discards the rest.

Note also that we pass `location.hostname`, never `location.href`. A path or query string can
carry a password-reset token, an order ID, or a session ID. A hostname cannot.

---

## Deferred, and what each would cost

These are on the roadmap and each one **breaks a promise above**. None ships without an
explicit product decision and matching user-facing copy.

- **Cloud escalation to the Vertex scan pipeline.** Sending an ambiguous page to Guidr's AI
  breaks §1. The design if we do it: never send a full URL; send **hashed domain prefixes with
  k-anonymity ranges**, the way Have I Been Pwned does, so the server learns "someone asked
  about one of these 400 domains" and not "this user visited this site". User-initiated scans
  (the user clicks "scan this") are a different consent category and are the correct place to
  start.
- **A synced blocklist from Guidr's own `cases` collection.** This is our real moat: scams our
  Malaysian users confirm should protect every other Malaysian user the same day. It needs a
  *download* (safe: we fetch a bloom filter, the server learns nothing about the user) rather
  than a *lookup* (unsafe: the server learns what you visited). Build it as a download.
- **WhatsApp Web / Telegram Web message chips.** The strongest desktop-only feature we have and
  the most invasive. Reading a user's messages, even locally, deserves its own consent screen
  and its own section in this file before a line of it is written.
