/**
 * Point-of-harm interception engine.
 *
 * Competitors warn you about a SITE. A scam site is harmless until you do one
 * of about five things: type a TAC, hand over a password, paste a bank account
 * number, run a downloaded file, or press "pay". This engine watches for the
 * ACTION, not the page. That is why it can stay silent almost all the time and
 * still catch the moment that actually costs money.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRIVACY IS ENFORCED BY THE TYPE SYSTEM, NOT BY A PROMISE.
 *
 * The only input is `PageSignals`. Look at it: booleans, a hostname, and the
 * names of banks that were matched. There is no field that can hold page text,
 * a URL path, a query string, a form value, a password, or a TAC. Raw page
 * content cannot reach this engine because there is nowhere to put it.
 *
 * The caller (the browser extension's content script) reads the DOM, reduces
 * it to these signals in-page, and discards everything else. Nothing here
 * touches the network. There is no fetch, no import that fetches, and no
 * logging. Keep it that way: the moment this file needs a network call, the
 * privacy story changes and that is a product decision, not a refactor.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  BANK_DOMAINS,
  isOfficialBankDomain,
  bankForDomain,
  detectLookalikeBankDomain,
  type LookalikeMatch,
} from "./bank-domains";

/**
 * Everything the engine is allowed to know about the page.
 *
 * Note what is absent and keep it absent: no URL path, no query string, no
 * page text, no field values, no filenames, no cookies, no referrer.
 */
export interface PageSignals {
  /** Hostname ONLY. Never the full URL. A path or query can carry secrets (reset tokens, order ids); a hostname cannot. */
  hostname: string;
  /** Is this the top-level page, or an embedded iframe? Credential fields in a cross-origin iframe are worth extra suspicion. */
  isTopFrame: boolean;
  /** Is the page served over HTTPS? */
  isSecureContext: boolean;
  /** Does the page contain a password input? Presence only. The value is never read. */
  hasPasswordField: boolean;
  /** Does the page contain something shaped like a TAC/OTP input (short numeric / one-time-code)? Presence only. */
  hasOtpField: boolean;
  /**
   * Which banks are named on this page, by canonical name (e.g. "Maybank").
   * The content script matches page text locally and throws the text away.
   * Only these names cross the boundary.
   */
  brandsMentioned: string[];
  /** Does a form on this page submit to a different origin than the page itself? */
  hasCrossOriginFormTarget: boolean;
}

/**
 * The thing the user is about to do. This is the trigger. Note that even here
 * we carry shape, not content: a file's EXTENSION, not its name; the FACT of
 * an account-number-shaped value, not the number.
 */
export type HarmAction =
  | { kind: "credential-entry"; field: "password" | "otp" }
  | { kind: "account-number-entry" }
  | { kind: "download"; fileExtension: string }
  | { kind: "payment-submit" };

export type Severity =
  /** Stop the user. Full-screen, requires a deliberate action to proceed. */
  | "block"
  /** Interrupt but do not stop. Banner with a clear way forward. */
  | "warn"
  /** Passive. The trust badge. No interruption. */
  | "notice";

export interface Interception {
  ruleId: string;
  severity: Severity;
  /** Plain-language headline. Written for a panicking 22-year-old, not a security engineer. */
  title: string;
  /** One or two sentences on what is actually happening. */
  body: string;
  /** Concrete next steps. Never just "be careful". */
  advice: string[];
  /** The bank being impersonated, when we know it. Lets the UI show the real hotline from MAJOR_BANKS. */
  bank?: string;
}

/**
 * Malaysian bank account numbers run roughly 10 to 16 digits, and users type
 * them with spaces or dashes. We check SHAPE ONLY, in the caller, and pass a
 * boolean. This helper lives here so the shape rule is defined in one place
 * and can be unit tested without a DOM.
 *
 * Deliberately loose: a false "yes" costs one extra confirmation step, and a
 * false "no" costs someone their savings.
 */
export function looksLikeBankAccountNumber(value: string): boolean {
  const digits = (value || "").replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return false;
  return digits.length >= 10 && digits.length <= 16;
}

/**
 * Android installers. On a desktop browser there is essentially no innocent
 * reason to be handed one of these by a website, and it is THE delivery vector
 * for the fake loan, fake delivery, and fake investment apps in Malaysia.
 */
const ANDROID_INSTALLER = ".apk";

/**
 * Executable or installable files, other than APKs.
 *
 * NOTE what is deliberately NOT here: `.js` and `.com`.
 *
 *   .js   Clicking a link to a .js file is completely routine — a source file on
 *         GitHub, a CDN URL, a sourcemap. Our target user is a student who does
 *         this constantly. Blocking it would be a false positive on an ordinary
 *         action, and a scam-blocker that cries wolf gets uninstalled.
 *   .com  As a file extension it is a DOS executable, but in a URL path it is far
 *         more likely to be part of a domain name in a redirect
 *         ("/out?url=google.com"). The ambiguity is not worth the false positives.
 *
 * Neither is a realistic vector for the scams we exist to stop.
 */
const EXECUTABLE_EXTENSIONS = new Set([
  ".exe", ".msi", ".scr", ".bat", ".cmd", ".pif",
  ".jar", ".vbs", ".ps1", ".dmg", ".pkg", ".deb",
]);

/**
 * The passive trust badge. Computed on page load, no action required.
 * This is the quiet half of the product: it is always right there, and it
 * never nags.
 */
export type PageTrust =
  | { level: "trusted-bank"; bank: string }
  | { level: "impersonation"; imitates: string; reason: LookalikeMatch["reason"] }
  | { level: "unknown" };

export function assessPage(signals: PageSignals): PageTrust {
  const lookalike = detectLookalikeBankDomain(signals.hostname);
  if (lookalike) {
    return { level: "impersonation", imitates: lookalike.imitates, reason: lookalike.reason };
  }
  const bank = bankForDomain(signals.hostname);
  if (bank) return { level: "trusted-bank", bank };
  return { level: "unknown" };
}

/**
 * The core decision. Given what we know about the page and what the user is
 * about to do, should we get in the way?
 *
 * Returns the single most severe interception, or null to stay silent.
 * Staying silent is the common case and that is the point.
 */
export function evaluate(signals: PageSignals, action: HarmAction): Interception | null {
  const hits: Interception[] = [];

  const onRealBank = isOfficialBankDomain(signals.hostname);
  const lookalike = detectLookalikeBankDomain(signals.hostname);
  const impersonatedBank = lookalike
    ? BANK_BY_DOMAIN_HINT(lookalike.imitates)
    : signals.brandsMentioned[0];

  // ── R1. The one that matters. A bank credential or TAC being typed into a
  // page that is not the bank. This is deterministic: no AI, no network, no
  // false-positive risk worth speaking of, and it is the single most expensive
  // scam in Malaysia. If we only ever ship one rule, this is the rule.
  if (action.kind === "credential-entry" && !onRealBank) {
    const namesABank = signals.brandsMentioned.length > 0;
    if (namesABank || lookalike) {
      hits.push({
        ruleId: "R1_BANK_CREDENTIALS_OFF_DOMAIN",
        severity: "block",
        title: action.field === "otp"
          ? "Stop. Do not enter your TAC here."
          : "Stop. This is not your bank's website.",
        body: lookalike
          ? `This page is pretending to be ${impersonatedBank ?? "your bank"}. The web address is not one your bank owns.`
          : `This page mentions ${impersonatedBank ?? "your bank"} and is asking for your ${action.field === "otp" ? "TAC" : "banking password"}, but it is not a website your bank owns.`,
        advice: [
          "Do not type anything else on this page.",
          "Close this tab and open your bank by typing its address yourself, or use the bank's own app.",
          "If you already entered something, call your bank's hotline now and freeze your account.",
          "Your bank will never ask for your TAC on a page like this. A TAC is what approves a transfer, so giving it away is the same as approving one.",
        ],
        bank: impersonatedBank,
      });
    }
  }

  // ── R2. Impersonation detected on the domain itself, regardless of what the
  // user is doing. Weaker than R1 but fires on more actions.
  if (lookalike && action.kind !== "credential-entry") {
    hits.push({
      ruleId: "R2_LOOKALIKE_BANK_DOMAIN",
      severity: "block",
      title: "This website is imitating a bank.",
      body: reasonToPlainLanguage(lookalike),
      advice: [
        "Do not enter any details and do not send any money.",
        "Close this tab.",
        `Reach ${impersonatedBank ?? "the bank"} by typing their address yourself or using their app.`,
      ],
      bank: impersonatedBank,
    });
  }

  // ── R3. Money about to leave. An account-number-shaped value being typed on
  // a site we cannot vouch for. This is the marketplace and job-scam pattern:
  // "just transfer the deposit to this account".
  if (action.kind === "account-number-entry" && !onRealBank) {
    hits.push({
      ruleId: "R3_ACCOUNT_NUMBER_ON_UNKNOWN_SITE",
      severity: "warn",
      title: "You are about to send money to an account we cannot check.",
      body: "This looks like a bank account number, and this website is not one we recognise. Money sent to the wrong account is very hard to get back.",
      advice: [
        "Confirm the account holder's name with the person, on a channel you already trust.",
        "Be suspicious if they are rushing you, or if the account name does not match the seller or employer.",
        "Scan the offer with Guidr before you pay.",
      ],
    });
  }

  // ── R4. Installers. Downloading and running an APK or EXE handed to you by
  // a stranger is how the fake loan, fake delivery, and fake investment apps
  // get on your device. Real Malaysian banks and real employers do not send
  // you an APK.
  if (action.kind === "download") {
    const ext = (action.fileExtension || "").toLowerCase();
    const isAndroidInstaller = ext === ANDROID_INSTALLER;

    if (isAndroidInstaller || EXECUTABLE_EXTENSIONS.has(ext)) {
      hits.push({
        ruleId: "R4_EXECUTABLE_DOWNLOAD",
        // An APK on a desktop browser is a hard block: there is no innocent
        // reason for it, so a false positive is nearly impossible.
        //
        // Every other executable is a WARN, not a block. People download real
        // installers all the time, and a full-screen interstitial on every .exe
        // would be wrong far more often than it is right. The interstitial is a
        // scarce resource: spend it where we are certain.
        severity: isAndroidInstaller ? "block" : "warn",
        title: isAndroidInstaller
          ? "This is an Android app installer, not a normal file."
          : "This file can run programs on your computer.",
        body: isAndroidInstaller
          ? "Installing an app this way skips the Play Store's safety checks. Scammers use fake loan, delivery, and investment apps to take over your phone and empty your bank account."
          : "Files like this can install software, record what you type, or give someone else control of your computer.",
        advice: isAndroidInstaller
          ? [
              "Do not install it. Get the app from the Play Store or the App Store instead.",
              "No real bank, government agency, or employer in Malaysia will ask you to install an app from a link.",
              "If someone is pressuring you to install this, that pressure is the scam.",
            ]
          : [
              "Only run this if you went looking for it from a source you already trust.",
              "If it arrived in a message, an email, or a pop-up, delete it.",
            ],
      });
    }
  }

  // ── R5. Credentials over plain HTTP. Rare now, and a screaming red flag.
  if (action.kind === "credential-entry" && !signals.isSecureContext) {
    hits.push({
      ruleId: "R5_INSECURE_CREDENTIAL_ENTRY",
      severity: "warn",
      title: "This page is not secure.",
      body: "Anything you type here, including your password, is sent unprotected and can be read by others on your network.",
      advice: ["Do not enter a password or any personal details.", "Close this tab."],
    });
  }

  // ── R6. The login form quietly ships your password to somebody else's
  // server. A legitimate login posts to its own site.
  if (action.kind === "credential-entry" && signals.hasCrossOriginFormTarget && !onRealBank) {
    hits.push({
      ruleId: "R6_CROSS_ORIGIN_CREDENTIAL_POST",
      severity: "warn",
      title: "This login form sends your details to another website.",
      body: "The form on this page does not submit to the site you are looking at. That is unusual for a real login page.",
      advice: ["Do not sign in here.", "Go to the real website yourself and sign in there."],
    });
  }

  // ── R7. Paying on a site impersonating a bank is already covered by R2, but
  // paying on an unknown site while the page name-drops a bank is its own tell.
  if (action.kind === "payment-submit" && !onRealBank && signals.brandsMentioned.length > 0) {
    hits.push({
      ruleId: "R7_PAYMENT_ON_BANK_IMPERSONATING_PAGE",
      severity: "warn",
      title: "Check this payment page carefully.",
      body: `This page is using ${signals.brandsMentioned[0]}'s name, but it is not your bank's website.`,
      advice: [
        "Real bank payment pages live on the bank's own address.",
        "If you are not sure, stop and open your banking app directly to check.",
      ],
    });
  }

  return mostSevere(hits);
}

const SEVERITY_ORDER: Record<Severity, number> = { block: 3, warn: 2, notice: 1 };

function mostSevere(hits: Interception[]): Interception | null {
  if (hits.length === 0) return null;
  return hits.reduce((worst, h) => (SEVERITY_ORDER[h.severity] > SEVERITY_ORDER[worst.severity] ? h : worst));
}

function reasonToPlainLanguage(m: LookalikeMatch): string {
  switch (m.reason) {
    case "punycode":
      return "The web address uses look-alike characters to appear as a bank you trust. It is a different website.";
    case "embedded-brand":
      return `The bank's name appears in the address, but the website is not owned by them. Scammers put the real name at the front so it looks right at a glance.`;
    case "typo":
      return "The web address is a near copy of a real bank's address, with a character changed. It is a different website.";
  }
}

/**
 * Map a bank DOMAIN back to the bank's display name, so the UI can pull the
 * real hotline out of MAJOR_BANKS.
 *
 * Note this looks across ALL entries, verified or not, while bankForDomain()
 * only answers for verified ones. The difference is deliberate: bankForDomain
 * grants trust, so it must be strict. This function only names the bank an
 * attacker is targeting, which is a label on a warning we are already showing.
 */
function BANK_BY_DOMAIN_HINT(domain: string): string | undefined {
  return BANK_DOMAINS.find((e) => e.domains.some((d) => d.domain === domain))?.bank;
}
