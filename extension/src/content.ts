/**
 * Guidr content script — the eyes.
 *
 * This file is the ONLY code in the extension that touches page content, so
 * this file is where the privacy promise is kept or broken. Three rules:
 *
 *   1. NOTHING LEAVES THE PAGE. There is no fetch() here, no sendMessage
 *      carrying page data, no chrome.storage write containing page data. The
 *      only message we send to the background worker is a trust LEVEL
 *      ("unknown" / "trusted-bank" / "impersonation") so it can colour the
 *      toolbar icon. Grep this file for "fetch" and you should find nothing.
 *
 *   2. WE NEVER READ THE VALUE OF A SECRET. We detect that a password field
 *      or a TAC field EXISTS, and that the user has started typing in it. We
 *      never read what they typed. Look at collectSignals(): it reads
 *      input.type, input.autocomplete, input.maxLength. It never reads
 *      input.value on a credential field.
 *
 *   3. THE ONE EXCEPTION IS SHAPE-CHECKED AND DISCARDED. For the bank account
 *      rule we must look at what is being typed, because "is this 10 to 16
 *      digits" cannot be answered otherwise. That check runs inline, returns a
 *      boolean, and the string is never stored, never sent, never logged. It
 *      dies with the stack frame. See onPossibleAccountNumber().
 *
 * Everything is reduced to a PageSignals object, which by its type cannot
 * carry text, and handed to the pure engine in lib/point-of-harm.ts.
 */

import { detectBanks } from "../../lib/malaysian-banks";
import {
  assessPage,
  evaluate,
  looksLikeBankAccountNumber,
  type HarmAction,
  type Interception,
  type PageSignals,
} from "../../lib/point-of-harm";
import { showInterception } from "./overlay";

/** Rules we have already fired on this page. Prevents nagging. In memory only. */
const firedRules = new Set<string>();

let enabled = true;

// ─────────────────────────────────────────────────────────────────────────────
// Signal collection. Read the shape of the page, never its content.
// ─────────────────────────────────────────────────────────────────────────────

/** Does this input look like a Malaysian TAC / OTP box? Shape only, value never read. */
function isOtpField(el: HTMLInputElement): boolean {
  if (el.autocomplete === "one-time-code") return true;

  // The name/id/placeholder are page-author strings, not user secrets. Reading
  // them tells us what the field is FOR without telling us what is IN it.
  const hint = `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
  // "tac" is the Malaysian term. "kod" is Malay for code.
  if (/\b(otp|tac|kod|passcode|one[\s-]?time|verification code|security code)\b/.test(hint)) return true;

  // A short numeric box is very often a TAC box.
  const short = el.maxLength >= 4 && el.maxLength <= 8;
  const numeric = el.inputMode === "numeric" || el.type === "tel" || /^\d*$/.test(el.pattern ?? "");
  return short && numeric;
}

function isPasswordField(el: HTMLInputElement): boolean {
  return el.type === "password";
}

/**
 * Which banks are named on this page?
 *
 * This is the one place we look at page text. We take a bounded slice, run the
 * existing word-boundary matcher over it, keep ONLY the resulting bank names,
 * and let the text go out of scope immediately. The text is never stored and
 * never sent. What crosses into PageSignals is e.g. ["Maybank"], not the page.
 */
function brandsOnPage(): string[] {
  const MAX_CHARS = 20_000; // bounded so we do not stall on a huge document
  const text = `${document.title}\n${document.body?.innerText?.slice(0, MAX_CHARS) ?? ""}`;
  return detectBanks(text).map((b) => b.name);
  // `text` is unreachable from here on. Nothing retains it.
}

function hasCrossOriginFormTarget(): boolean {
  const forms = Array.from(document.querySelectorAll("form"));
  return forms.some((f) => {
    const action = f.getAttribute("action");
    if (!action) return false;
    try {
      return new URL(action, location.href).origin !== location.origin;
    } catch {
      return false;
    }
  });
}

/**
 * Signals are cached briefly.
 *
 * Without this, every single link click on every page would re-read
 * document.body.innerText, which forces a layout reflow. On a heavy page that
 * is a visible stall, and a scam blocker that makes the whole web feel slow
 * gets uninstalled just as fast as one that cries wolf.
 *
 * A 2 second window is short enough that a page mutating a login form into
 * existence is still picked up before the user can type into it.
 */
let cached: { at: number; signals: PageSignals } | null = null;
const SIGNALS_TTL_MS = 2000;

function getSignals(): PageSignals {
  const now = Date.now();
  if (cached && now - cached.at < SIGNALS_TTL_MS) return cached.signals;
  const signals = collectSignals();
  cached = { at: now, signals };
  return signals;
}

function collectSignals(): PageSignals {
  const inputs = Array.from(document.querySelectorAll("input"));
  return {
    // Hostname only. Never location.href — a path or query can carry a reset
    // token, an order id, a session id. A hostname cannot.
    hostname: location.hostname,
    isTopFrame: window.top === window.self,
    isSecureContext: location.protocol === "https:",
    hasPasswordField: inputs.some(isPasswordField),
    hasOtpField: inputs.some(isOtpField),
    brandsMentioned: brandsOnPage(),
    hasCrossOriginFormTarget: hasCrossOriginFormTarget(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The triggers. Each maps a user ACTION to a HarmAction and asks the engine.
// ─────────────────────────────────────────────────────────────────────────────

/** Rules the user has explicitly chosen to override by clicking "let me continue". */
const overridden = new Set<string>();

/**
 * Ask the engine, show the warning if there is one, and hand the verdict back to
 * the caller so it can actually STOP the action.
 *
 * Note the split between deciding and presenting. The UI is deduplicated (we do
 * not nag with the same warning twice), but the VERDICT is returned every time.
 * If we deduplicated the verdict, then the second click on a malicious download
 * link would sail through unblocked, which is precisely the click that matters.
 */
function fire(action: HarmAction): Interception | null {
  if (!enabled) return null;
  const verdict = evaluate(getSignals(), action);
  if (!verdict) return null;

  if (!firedRules.has(verdict.ruleId)) {
    firedRules.add(verdict.ruleId);
    bumpCounter(verdict.severity === "block" ? "blocks" : "warnings");
    showInterception(verdict, () => overridden.add(verdict.ruleId));
  }
  return verdict;
}

/** Should we physically prevent this action from happening? */
function shouldStop(verdict: Interception | null): boolean {
  return verdict?.severity === "block" && !overridden.has(verdict.ruleId);
}

/**
 * Credential entry. We fire on the FIRST keystroke, not on submit, because by
 * submit the TAC is already gone. We do not read the keystroke.
 */
function onCredentialInput(e: Event) {
  const el = e.target as HTMLInputElement | null;
  if (!el || el.tagName !== "INPUT") return;

  let verdict: Interception | null = null;
  if (isPasswordField(el)) {
    verdict = fire({ kind: "credential-entry", field: "password" });
  } else if (isOtpField(el)) {
    verdict = fire({ kind: "credential-entry", field: "otp" });
  } else {
    return;
  }

  // Showing a warning is not the same as stopping the harm. The overlay covers
  // the page, but keyboard focus is still sitting in the TAC box underneath it,
  // so without this the user can calmly finish typing their code into the scam
  // while our warning is on screen. Take focus away from the field.
  if (shouldStop(verdict)) {
    el.blur();
  }
}

/**
 * Bank account number entry. The only place we look at a typed value.
 *
 * The value is read, shape-checked, and dropped. It is not stored in a
 * variable that outlives this function, not put in chrome.storage, and not
 * sent anywhere. We also skip credential fields entirely so this can never
 * become a keylogger for passwords or TACs.
 */
function onPossibleAccountNumber(e: Event) {
  const el = e.target as HTMLInputElement | null;
  if (!el || el.tagName !== "INPUT") return;
  if (isPasswordField(el) || isOtpField(el)) return; // never inspect a secret's value

  const isTextish = el.type === "text" || el.type === "tel" || el.type === "number" || el.type === "";
  if (!isTextish) return;

  if (looksLikeBankAccountNumber(el.value)) {
    fire({ kind: "account-number-entry" });
  }
  // el.value is not retained. Nothing above this line kept a reference.
}

/**
 * Executable downloads. We read the href of a link the user clicked and take
 * the file extension from its path. This needs no "downloads" permission,
 * which means Guidr never sees your download history.
 */
function onClick(e: MouseEvent) {
  const target = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!target) return;
  let ext = "";
  try {
    const path = new URL(target.href, location.href).pathname;
    const dot = path.lastIndexOf(".");
    if (dot === -1) return;
    ext = path.slice(dot).toLowerCase();
  } catch {
    return;
  }
  if (!ext || ext.length > 6) return;

  const verdict = fire({ kind: "download", fileExtension: ext });

  // The interstitial says "Guidr blocked this". Make that true. Without the
  // preventDefault the file downloads anyway and we are just narrating the
  // theft as it happens.
  if (shouldStop(verdict)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

/** Payment submission. Detected from a card-number field, by autocomplete hint. */
function onSubmit(e: Event) {
  const form = e.target as HTMLFormElement | null;
  if (!form) return;
  const hasCardField = Array.from(form.querySelectorAll("input")).some(
    (i) => i.autocomplete === "cc-number" || /card.?number/i.test(`${i.name} ${i.id}`)
  );
  if (hasCardField) fire({ kind: "payment-submit" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Counters. Two integers. No URLs, no timestamps that could rebuild a history.
// ─────────────────────────────────────────────────────────────────────────────

function bumpCounter(kind: "blocks" | "warnings") {
  chrome.storage.local.get(["stats"], (res) => {
    const stats = res.stats ?? { blocks: 0, warnings: 0 };
    stats[kind] = (stats[kind] ?? 0) + 1;
    chrome.storage.local.set({ stats });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

function start() {
  const signals = collectSignals();
  const trust = assessPage(signals);

  // Tell the background worker the trust LEVEL so it can colour the toolbar
  // icon. This is the only message we ever send, and it carries no URL and no
  // page content: just "unknown" | "trusted-bank" | "impersonation".
  chrome.runtime.sendMessage({ type: "trust", level: trust.level }).catch(() => {});

  if (trust.level === "impersonation" && signals.isTopFrame) {
    // The domain itself is imitating a bank. Do not wait for the user to act:
    // by the time they act on a page like this, they have already lost.
    const verdict = evaluate(signals, { kind: "payment-submit" });
    if (verdict) {
      firedRules.add(verdict.ruleId);
      showInterception(verdict);
      bumpCounter("blocks");
    }
  }
  // On an ordinary site we show nothing in the page. The toolbar icon carries
  // the passive signal. See the note in overlay.ts on why the badge lives there.

  // Capture phase, so we see the event even if the page stops propagation.
  document.addEventListener("input", onCredentialInput, true);
  // "input" also fires for a paste, and unlike the "paste" event the field's
  // value is already updated by then. One listener covers both.
  document.addEventListener("input", onPossibleAccountNumber, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", onSubmit, true);
}

chrome.storage.local.get(["enabled", "disabledHosts"], (res) => {
  const disabledHosts: string[] = res.disabledHosts ?? [];
  enabled = res.enabled !== false && !disabledHosts.includes(location.hostname);
  if (enabled) start();
});
