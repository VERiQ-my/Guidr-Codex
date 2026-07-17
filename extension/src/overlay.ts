/**
 * The interruption UI.
 *
 * Rendered into a CLOSED shadow root so that (a) the page's CSS cannot restyle
 * our warning into invisibility, and (b) the page's JavaScript cannot read or
 * remove it. A scam page that can delete Guidr's warning is worse than no
 * warning at all, because the user believes they are protected.
 *
 * Copy rules, learned the hard way:
 *   - No jargon. Not "phishing", not "credential harvesting", not "TLS".
 *   - Say what to DO, not just what is wrong. "Close this tab" beats "be careful".
 *   - The escape hatch exists but is deliberately the quieter option. People do
 *     click through warnings, and if we make that impossible they will disable
 *     the extension instead, which is strictly worse.
 */

import type { Interception } from "../../lib/point-of-harm";

const HOST_ID = "guidr-shield-host";

const SEVERITY_RANK: Record<Interception["severity"], number> = { block: 3, warn: 2, notice: 1 };

/** Severity of the warning currently on screen, if any. */
let showing: Interception["severity"] | null = null;

function mountHost(): ShadowRoot {
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement("div");
  host.id = HOST_ID;
  // Sit above everything. 2147483647 is the max 32-bit signed int, which is
  // the ceiling browsers accept for z-index, so nothing can outrank us.
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  (document.documentElement || document.body).appendChild(host);
  return host.attachShadow({ mode: "closed" });
}

const BASE_STYLES = `
  :host, * { box-sizing: border-box; }
  .scrim {
    position: fixed; inset: 0; pointer-events: auto;
    background: rgba(8, 10, 20, 0.82);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    animation: fade 160ms ease-out;
  }
  @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
  .card {
    width: 100%; max-width: 520px;
    background: #fff; color: #0b1020;
    border-radius: 16px; padding: 28px;
    box-shadow: 0 24px 64px rgba(0,0,0,.45);
    border-top: 6px solid var(--accent);
  }
  .eyebrow {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 700; letter-spacing: .08em;
    text-transform: uppercase; color: var(--accent); margin-bottom: 12px;
  }
  h1 { font-size: 22px; line-height: 1.25; margin: 0 0 10px; font-weight: 700; }
  p  { font-size: 15px; line-height: 1.55; margin: 0 0 16px; color: #39415a; }
  ul { margin: 0 0 22px; padding-left: 18px; }
  li { font-size: 14px; line-height: 1.6; color: #39415a; margin-bottom: 7px; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  button {
    font: inherit; font-size: 15px; font-weight: 600;
    padding: 12px 16px; border-radius: 10px; cursor: pointer; border: none;
  }
  .primary { background: var(--accent); color: #fff; }
  .primary:hover { filter: brightness(1.08); }
  .ghost { background: transparent; color: #8b93a8; font-weight: 500; font-size: 13px; }
  .ghost:hover { color: #39415a; text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    .card { background: #141826; color: #eef1f7; }
    p, li { color: #a8b0c4; }
  }
`;

/**
 * @param onContinue called if the user chooses to proceed anyway, so the caller
 *   can stop physically blocking the action. Without it, a user who clicks
 *   "let me continue" on a blocked download would find the link permanently dead.
 */
export function showInterception(v: Interception, onContinue?: () => void) {
  // A less-severe warning must not paper over a more-severe one that is already
  // up. Previously any second warning was silently dropped, which meant a WARN
  // arriving first could swallow the BLOCK that came after it.
  if (showing !== null && SEVERITY_RANK[v.severity] <= SEVERITY_RANK[showing]) return;

  const shadow = mountHost();
  showing = v.severity;

  const accent = v.severity === "block" ? "#e5322d" : "#e8890c";
  const style = document.createElement("style");
  style.textContent = `:host { --accent: ${accent}; }\n${BASE_STYLES}`;

  const scrim = document.createElement("div");
  scrim.className = "scrim";

  const card = document.createElement("div");
  card.className = "card";

  // Build with DOM APIs, not innerHTML. The strings are ours, but this file
  // must never become a place where page-derived text could reach innerHTML.
  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = v.severity === "block" ? "Guidr blocked this" : "Guidr warning";

  const h1 = document.createElement("h1");
  h1.textContent = v.title;

  const body = document.createElement("p");
  body.textContent = v.body;

  const list = document.createElement("ul");
  for (const line of v.advice) {
    const li = document.createElement("li");
    li.textContent = line;
    list.appendChild(li);
  }

  const actions = document.createElement("div");
  actions.className = "actions";

  const leave = document.createElement("button");
  leave.className = "primary";
  leave.textContent = "Get me out of here";
  leave.onclick = () => {
    // history.back() can land them right back on the scam. about:blank is a
    // dead end, which is what we want.
    location.href = "about:blank";
  };

  const stay = document.createElement("button");
  stay.className = "ghost";
  stay.textContent = v.severity === "block"
    ? "I understand the risk, let me continue"
    : "Dismiss";
  stay.onclick = () => {
    document.getElementById(HOST_ID)?.remove();
    showing = null;
    onContinue?.();
  };

  actions.append(leave, stay);
  card.append(eyebrow, h1, body, list, actions);
  scrim.appendChild(card);
  shadow.append(style, scrim);
}

/**
 * ── Where is the passive trust badge? ────────────────────────────────────────
 *
 * It lives on the TOOLBAR ICON (see background.ts), not in the page, and that
 * is a forced move rather than a preference.
 *
 * An in-page green "this really is Maybank" pill can only render if the content
 * script RUNS on maybank2u.com.my. But manifest.json deliberately excludes every
 * bank domain, so that Guidr is structurally incapable of reading your real
 * banking session. You cannot have both properties. We chose the privacy one.
 *
 * The toolbar icon needs no page access, so it can carry the passive signal for
 * free: grey on an ordinary site, red when we detect impersonation.
 *
 * If you ever want the in-page green pill back, the change is:
 *   1. remove the bank domains from exclude_matches in manifest.json, and
 *   2. early-return in content.ts start() when bankForDomain(hostname) matches,
 *      BEFORE collectSignals() runs, so we still never read the bank's page.
 * That is weaker: the permission to read the page would exist, and only our own
 * code would be stopping us from using it. Today, Chrome itself stops us.
 */
