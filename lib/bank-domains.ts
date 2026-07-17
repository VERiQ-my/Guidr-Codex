/**
 * Official Malaysian bank domains — the allowlist the point-of-harm
 * interceptor uses to decide "is this the REAL bank, or something wearing
 * its clothes?"
 *
 * ─────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE EDITING. The two kinds of mistake are NOT symmetric.
 *
 *   Omission (real bank domain missing from this list)
 *     → the interceptor warns on a legitimate bank login. Annoying, visible,
 *       reported immediately, and the user is still safe. Recoverable.
 *
 *   Commission (a domain in this list is not actually the bank's)
 *     → the interceptor goes SILENT on that domain. If an attacker ever got
 *       a domain onto this list, Guidr would actively vouch for their
 *       phishing page. This is the worst failure this codebase can have.
 *
 * Therefore: WHEN IN DOUBT, LEAVE IT OUT. An incomplete allowlist degrades
 * gracefully. A wrong one is a weapon.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW A DOMAIN GETS `verified: true`
 *
 * NOT from search results (phishers buy their way to the top of those), NOT
 * from an email, and NOT from memory, including a model's.
 *
 * The evidence we accept is the TLS certificate's validated `O=` organization
 * field. Banks use Organization Validated or Extended Validation certificates,
 * which means a Certificate Authority has checked the legal entity behind the
 * domain, often recording the company's SSM registration number. An attacker
 * who registers "maybank2v.com.my" can trivially get a domain-validated cert
 * for it, but cannot get one that says `O=Malayan Banking Berhad`.
 *
 * A domain-validated (DV) certificate proves only that someone controls the
 * domain. It says nothing about who they are, so it is NOT sufficient here.
 *
 * Re-run the check any time — it is reproducible, and it does not take my word
 * for it:
 *
 *     node scripts/verify-bank-domains.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT `verified: false` ACTUALLY BUYS YOU
 *
 * An unverified domain is NOT trusted (isOfficialBankDomain returns false), so
 * the engine keeps warning on it, AND it is NOT added to the content script's
 * exclude_matches, so Guidr keeps running there.
 *
 * That second half is the important one and it was a bug once. If unverified
 * domains were excluded from the content script, then a bad entry in this file
 * would silence Guidr on that domain completely, and the `verified` flag would
 * be protecting nothing. Unverified means "we still watch this domain", not
 * "we quietly ignore it". extension/build.mjs enforces the split.
 *
 * The cost: on a real-but-unverified bank we will over-warn. That is the safe
 * direction, and it is loud, so it gets reported and fixed.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** A registrable domain (eTLD+1), lowercase, no scheme, no port, no path. */
export type RegistrableDomain = string;

export interface BankDomainRecord {
  /**
   * Registrable domain. Subdomains are implicitly covered: "maybank2u.com.my"
   * also covers "www.maybank2u.com.my". Do NOT list bare subdomains here.
   */
  domain: RegistrableDomain;
  /**
   * Confirmed against a CA-validated certificate organization. Only these are
   * trusted for warning suppression, and only these are excluded from the
   * content script.
   */
  verified: boolean;
  /** The `O=` field from the TLS certificate, as evidence. Present iff verified. */
  certOrg?: string;
  /** ISO date the certificate was last checked. */
  checkedOn?: string;
  /** Why this domain is NOT verified. Required whenever verified is false. */
  note?: string;
}

export interface BankDomains {
  /** Must match the `name` in MAJOR_BANKS (lib/malaysian-banks.ts). */
  bank: string;
  domains: BankDomainRecord[];
}

/**
 * Verification pass: 2026-07-13, via TLS certificate organization fields.
 *
 * Unverified domains are left in the list on purpose. They still feed lookalike
 * detection (so "maybank2v.com.my" is caught by comparison against the real
 * Maybank domains), they are simply not trusted and not excluded.
 *
 * The unverified entries below failed for three DIFFERENT reasons, and the
 * difference matters when you go to fix them:
 *
 *   DV-ONLY      The domain resolves and serves TLS, but with a domain-validated
 *                certificate carrying no organization. Real site, almost certainly;
 *                we just cannot prove the entity this way. Needs other evidence.
 *
 *   TIMEOUT      Resolved, but the connection was filtered. Consistent with these
 *                banks refusing non-Malaysian IPs. Re-check from a Malaysian network.
 *
 *   DID NOT      The hostname did not resolve in DNS at all. Note that Maybank and
 *   RESOLVE      CIMB resolve fine from the same host, so DNS itself works. These
 *                may well be domains that were GUESSED WRONG and do not exist.
 *                Do not just "re-check" them: find the bank's real domain first.
 *
 * Nothing here is verified on vibes. If you cannot produce a certificate with a
 * matching organization, leave it false.
 */
export const BANK_DOMAINS: BankDomains[] = [
  {
    bank: "Maybank",
    domains: [
      { domain: "maybank2u.com.my", verified: true, certOrg: "Malayan Banking Berhad", checkedOn: "2026-07-13" },
      { domain: "maybank.com", verified: true, certOrg: "Malayan Banking Berhad", checkedOn: "2026-07-13" },
      { domain: "maybank.com.my", verified: true, certOrg: "Malayan Banking Berhad", checkedOn: "2026-07-13" },
    ],
  },
  {
    bank: "CIMB Bank",
    domains: [
      { domain: "cimbclicks.com.my", verified: true, certOrg: "CIMB Bank Berhad", checkedOn: "2026-07-13" },
      { domain: "cimb.com.my", verified: true, certOrg: "CIMB Bank Berhad", checkedOn: "2026-07-13" },
      { domain: "cimbbank.com.my", verified: true, certOrg: "CIMB Bank Berhad", checkedOn: "2026-07-13" },
    ],
  },
  {
    bank: "Public Bank",
    domains: [
      { domain: "pbebank.com", verified: true, certOrg: "Public Bank Berhad", checkedOn: "2026-07-13" },
    ],
  },
  {
    bank: "RHB Bank",
    domains: [
      { domain: "rhbgroup.com", verified: true, certOrg: "RHB Bank Berhad", checkedOn: "2026-07-13" },
    ],
  },
  {
    bank: "Hong Leong Bank",
    domains: [
      { domain: "hlb.com.my", verified: true, certOrg: "Hong Leong Bank Berhad", checkedOn: "2026-07-13" },
      { domain: "hlbconnect.com.my", verified: false, note: "DID NOT RESOLVE (ENOTFOUND) on 2026-07-13. Possibly not a real domain. Find HLB Connect's actual login domain before trusting this." },
    ],
  },
  {
    bank: "Bank Islam",
    domains: [
      { domain: "bankislam.com", verified: false, note: "Serves a domain-validated cert only (no O= field) as of 2026-07-13, so the certificate cannot prove the legal entity. Needs a different form of evidence." },
    ],
  },
  {
    bank: "AmBank",
    domains: [
      { domain: "amonline.com.my", verified: true, certOrg: "AmBank (M) Berhad", checkedOn: "2026-07-13" },
      { domain: "ambank.com.my", verified: false, note: "Domain-validated cert only (no O= field) as of 2026-07-13. Note amonline.com.my, AmBank's online banking domain, IS verified." },
    ],
  },
  {
    bank: "Bank Simpanan Nasional",
    domains: [
      { domain: "bsn.com.my", verified: false, note: "DID NOT RESOLVE (ENOTFOUND) on 2026-07-13, while other bank domains resolved fine from the same host. Confirm BSN's real domain; this one may be wrong." },
      { domain: "mybsn.com.my", verified: false, note: "DID NOT RESOLVE (ENOTFOUND) on 2026-07-13. Confirm BSN's real online banking domain; this one may be wrong." },
    ],
  },
  {
    bank: "Bank Rakyat",
    domains: [
      { domain: "bankrakyat.com.my", verified: false, note: "Resolved, but the connection TIMED OUT on 2026-07-13. Consistent with geo-blocking of non-Malaysian IPs. Re-check from a Malaysian network." },
      { domain: "irakyat.com.my", verified: false, note: "Resolved, but the connection TIMED OUT on 2026-07-13. Consistent with geo-blocking. Re-check from a Malaysian network." },
    ],
  },
  {
    bank: "OCBC Bank",
    domains: [
      { domain: "ocbc.com.my", verified: true, certOrg: "Oversea-Chinese Banking Corporation Limited", checkedOn: "2026-07-13" },
    ],
  },
  {
    bank: "HSBC Bank",
    domains: [
      { domain: "hsbc.com.my", verified: true, certOrg: "HSBC Group Management Services Limited", checkedOn: "2026-07-13" },
    ],
  },
  {
    bank: "Standard Chartered",
    domains: [
      { domain: "sc.com", verified: true, certOrg: "STANDARD CHARTERED BANK", checkedOn: "2026-07-13" },
      { domain: "standardchartered.com.my", verified: false, note: "Resolved, but the connection TIMED OUT on 2026-07-13. Re-check from a Malaysian network. Note sc.com, which Standard Chartered actually serves from, IS verified." },
    ],
  },
  {
    bank: "Affin Bank",
    domains: [
      { domain: "affinbank.com.my", verified: false, note: "DID NOT RESOLVE (ENOTFOUND) on 2026-07-13. Confirm Affin Bank's real domain; this one may be wrong." },
      { domain: "affinalways.com", verified: false, note: "Resolves and serves TLS, but a domain-validated cert only (no O= field) as of 2026-07-13, so it cannot prove the entity." },
    ],
  },
  {
    bank: "Alliance Bank",
    domains: [
      { domain: "alliancebank.com.my", verified: true, certOrg: "Alliance Bank Malaysia Berhad", checkedOn: "2026-07-13" },
      { domain: "allianceonline.com.my", verified: false, note: "DID NOT RESOLVE (ENOTFOUND) on 2026-07-13. Confirm Alliance Bank's real online banking domain; this one may be wrong." },
    ],
  },
  {
    bank: "MBSB Bank",
    domains: [
      { domain: "mbsbbank.com", verified: true, certOrg: "MBSB Bank Berhad", checkedOn: "2026-07-13" },
    ],
  },
];

/** Every domain we list, verified or not. Used for lookalike scoring only. */
export function allBankDomainRecords(): BankDomainRecord[] {
  return BANK_DOMAINS.flatMap((e) => e.domains);
}

/** Only the domains confirmed against a CA-validated organization. */
export function verifiedBankDomains(): RegistrableDomain[] {
  return allBankDomainRecords().filter((d) => d.verified).map((d) => d.domain);
}

/**
 * Multi-part public suffixes we must handle so that the registrable domain of
 * "www.maybank2u.com.my" is "maybank2u.com.my" and not "com.my".
 *
 * This is a deliberately small, hand-checked slice of the Public Suffix List
 * covering the suffixes Malaysian users actually encounter. It is not
 * exhaustive by design: an unknown multi-part suffix degrades to a longer
 * registrable domain, which makes an allowlist match LESS likely, i.e. it
 * fails toward warning. Safe direction.
 */
const MULTIPART_SUFFIXES = new Set([
  "com.my", "net.my", "org.my", "gov.my", "edu.my", "mil.my", "name.my",
  "com.sg", "com.au", "co.uk", "com.hk", "co.id", "co.th", "com.ph", "com.vn",
  "co.jp", "com.cn", "com.tw", "com.bn",
]);

/**
 * Reduce a hostname to its registrable domain (eTLD+1), lowercased.
 * Returns "" for IPs, localhost, and anything that isn't a real hostname —
 * callers must treat "" as "not a bank domain".
 */
export function getRegistrableDomain(hostname: string): RegistrableDomain {
  const host = (hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) return "";
  // Bare IPs and single-label hosts (localhost) have no registrable domain.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return "";
  if (host.includes(":")) return ""; // IPv6
  const parts = host.split(".");
  if (parts.length < 2) return "";

  const lastTwo = parts.slice(-2).join(".");
  if (MULTIPART_SUFFIXES.has(lastTwo)) {
    // Need three labels: <name>.com.my
    if (parts.length < 3) return "";
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

/** Flat set of every VERIFIED domain. Unverified domains never suppress a warning. */
function trustedDomainSet(): Set<RegistrableDomain> {
  return new Set(verifiedBankDomains());
}

/**
 * Is this hostname served by a bank we have VERIFIED?
 *
 * Used only to SUPPRESS warnings, never to raise them. Because an unverified
 * entry returns false, the interceptor will warn on a real-but-unverified
 * bank rather than stay quiet on a fake one.
 */
export function isOfficialBankDomain(hostname: string): boolean {
  const registrable = getRegistrableDomain(hostname);
  if (!registrable) return false;
  return trustedDomainSet().has(registrable);
}

/** Which bank owns this hostname, if any (verified domains only). */
export function bankForDomain(hostname: string): string | null {
  const registrable = getRegistrableDomain(hostname);
  if (!registrable) return null;
  for (const entry of BANK_DOMAINS) {
    if (entry.domains.some((d) => d.verified && d.domain === registrable)) return entry.bank;
  }
  return null;
}

/**
 * Every bank domain we know of, verified or not, for lookalike scoring.
 *
 * Unverified domains belong here: we still want "maybank2v.com.my" compared
 * against the real Maybank domains. Listing a domain for COMPARISON is a very
 * different act from TRUSTING it, and only the latter needs verification.
 */
function allKnownBankDomains(): RegistrableDomain[] {
  return allBankDomainRecords().map((d) => d.domain);
}

/**
 * Levenshtein distance, capped: we bail out once the distance exceeds
 * `max`, since we only ever care about "very close" and the cap keeps this
 * cheap enough to run on every page load.
 */
function editDistanceWithin(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1; // no cell in this row can lead to <= max
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Does `needle` appear as a contiguous run of WHOLE labels inside `haystack`?
 *
 *   ["maybank2u","com","my","login","xyz"] contains ["maybank2u","com","my"] -> true
 *   ["disc","com"]                         contains ["sc","com"]              -> false
 *
 * The second case is the whole reason this function exists.
 */
function containsLabelSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

export interface LookalikeMatch {
  /** The real bank domain this hostname appears to be imitating. */
  imitates: RegistrableDomain;
  /** Why we think so — shown to the user, so it must be plain language. */
  reason: "punycode" | "embedded-brand" | "typo";
}

/**
 * Does this hostname look like it is pretending to be a bank domain?
 *
 * Three signals, all computed locally, no network, no page content:
 *
 *   punycode        the hostname uses an IDN "xn--" label AND resembles a bank
 *                   domain once stripped. Classic homograph attack.
 *   embedded-brand  a real bank domain appears as a LABEL inside someone
 *                   else's domain: "maybank2u.com.my.secure-login.xyz".
 *   typo            within a small edit distance of a real bank domain:
 *                   "maybank2v.com.my", "cimbclics.com.my".
 *
 * Returns null for the real thing — an exact match is not a lookalike.
 */
export function detectLookalikeBankDomain(hostname: string): LookalikeMatch | null {
  const host = (hostname || "").trim().toLowerCase();
  const registrable = getRegistrableDomain(host);
  if (!registrable) return null;

  const known = allKnownBankDomains();

  // An exact match is the real domain (or an unverified-but-real one). Not a lookalike.
  if (known.includes(registrable)) return null;

  // ── embedded-brand: the bank's domain appears in the host but is not the
  // registrable domain. "maybank2u.com.my.login-secure.xyz" — the user reads
  // left-to-right and sees their bank; the browser reads right-to-left and
  // sees login-secure.xyz.
  //
  // This MUST match whole labels, not substrings. A naive host.includes("sc.com")
  // for Standard Chartered matches "disc.com", and blocking a real site is not a
  // cosmetic bug. Compare label sequences instead.
  const hostLabels = host.split(".");

  for (const bankDomain of known) {
    if (containsLabelSequence(hostLabels, bankDomain.split("."))) {
      // An exact suffix match would mean registrable === bankDomain, which we
      // already returned null for above. So reaching here means the bank's
      // domain is embedded somewhere it does not belong.
      return { imitates: bankDomain, reason: "embedded-brand" };
    }
  }

  // ── punycode / homograph
  if (host.includes("xn--")) {
    for (const bankDomain of known) {
      const stripped = host.replace(/xn--/g, "");
      if (editDistanceWithin(stripped, bankDomain, 3) <= 3) {
        return { imitates: bankDomain, reason: "punycode" };
      }
    }
  }

  // ── typo squat. Distance 1-2 on a domain of reasonable length. We require
  // the candidate to be long enough that a 1-char edit isn't just a different
  // legitimate word ("bsn.com.my" is too short to typo-score safely).
  //
  // This runs BEFORE the loose brand-label check below, and the order matters
  // for the message, not the verdict. "maybank2v.com.my" would satisfy both
  // (it blocks either way), but "the address is a near copy with one character
  // changed" is a truer and more useful thing to show a user than "the bank's
  // name appears in the address". Precise check first.
  for (const bankDomain of known) {
    if (bankDomain.length < 10) continue;
    const d = editDistanceWithin(registrable, bankDomain, 2);
    if (d >= 1 && d <= 2) {
      return { imitates: bankDomain, reason: "typo" };
    }
  }

  // ── The brand name glued into a label: "cimb-verify.top", "maybank2u-login.xyz".
  // Requires >= 4 chars so short, generic bank abbreviations ("sc", "hlb", "bsn")
  // cannot fire on innocent domains. Loosest check, so it goes last.
  for (const bankDomain of known) {
    const brandLabel = bankDomain.split(".")[0];
    if (brandLabel.length < 4) continue;
    const hit = hostLabels.some((l) => l !== brandLabel && l.includes(brandLabel));
    if (hit) return { imitates: bankDomain, reason: "embedded-brand" };
  }

  return null;
}
