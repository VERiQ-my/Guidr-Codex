/**
 * Malaysian banks registry — used to surface "who to contact" guidance when
 * a scam involves a bank transaction.
 *
 * IMPORTANT — verify before shipping any of these contacts in production:
 *   - Phone numbers and emails change. The `verifyAt` URL points to the
 *     bank's official fraud reporting / customer service page where the
 *     authoritative contact lives.
 *   - The UI must always link to verifyAt next to displayed contacts so
 *     users can cross-check. Wrong details sent to a panicked victim are
 *     worse than no details.
 *
 * Aliases are lowercased; detection uses case-insensitive substring match
 * on the user's message text. Order matters in MAJOR_BANKS — longer / more
 * specific aliases come before short ones (e.g. "maybank" before "may"
 * which we don't want to match alone).
 */

export interface Bank {
  /** Canonical display name. */
  name: string;
  /** Lowercase substrings to match against scam message text. */
  aliases: string[];
  /** Publicly published general customer service / fraud hotline. */
  hotline: string;
  /** Where to verify the up-to-date fraud-reporting channel. */
  verifyAt: string;
  /** Optional general contact email — only set if from the bank's official site. */
  email?: string;
}

export const MAJOR_BANKS: Bank[] = [
  {
    name: "Maybank",
    aliases: ["maybank", "malayan banking", "mbb"],
    hotline: "1-300-88-6688",
    verifyAt: "https://www.maybank2u.com.my/maybank2u/malaysia/en/personal/help/contact_us.page",
  },
  {
    name: "CIMB Bank",
    aliases: ["cimb"],
    hotline: "+603 6204 7788",
    verifyAt: "https://www.cimb.com.my/en/personal/help-support/ways-to-reach-us.html",
  },
  {
    name: "Public Bank",
    aliases: ["public bank", "pbb", "pbe bank"],
    hotline: "1-800-22-5555",
    verifyAt: "https://www.pbebank.com/en/customer-service/contact-us.html",
  },
  {
    name: "RHB Bank",
    aliases: ["rhb"],
    hotline: "+603 9206 8118",
    verifyAt: "https://www.rhbgroup.com/contact-us/index.html",
  },
  {
    name: "Hong Leong Bank",
    aliases: ["hong leong", "hlb", "hlbb"],
    hotline: "+603 7626 8899",
    verifyAt: "https://www.hlb.com.my/en/personal-banking/help-support/contact-us.html",
  },
  {
    name: "Bank Islam",
    aliases: ["bank islam", "bimb"],
    hotline: "+603 26 900 900",
    verifyAt: "https://www.bankislam.com/contact-us/",
  },
  {
    name: "AmBank",
    aliases: ["ambank", "am bank"],
    hotline: "+603 2178 8888",
    verifyAt: "https://www.ambank.com.my/eng/contact-us",
  },
  {
    name: "Bank Simpanan Nasional",
    aliases: ["bank simpanan nasional", "bsn"],
    hotline: "1-300-88-1900",
    verifyAt: "https://www.bsn.com.my/contact",
  },
  {
    name: "Bank Rakyat",
    // "br" was removed — it matched "talentBRidge" and any random "br"
    // substring. Aliases must be either full bank names or distinctive
    // abbreviations long enough to avoid noise.
    aliases: ["bank rakyat", "bank kerjasama rakyat"],
    hotline: "1-300-80-5454",
    verifyAt: "https://www.bankrakyat.com.my/contact-us",
  },
  {
    name: "OCBC Bank",
    aliases: ["ocbc"],
    hotline: "+603 8317 5000",
    verifyAt: "https://www.ocbc.com.my/personal-banking/help-and-support/contact-us",
  },
  {
    name: "HSBC Bank",
    aliases: ["hsbc"],
    hotline: "+603 8321 5400",
    verifyAt: "https://www.hsbc.com.my/help/contact/",
  },
  {
    name: "Standard Chartered",
    aliases: ["standard chartered", "stanchart", "scb"],
    hotline: "+603 7711 7000",
    verifyAt: "https://www.sc.com/my/contact-us/",
  },
  {
    name: "Affin Bank",
    aliases: ["affin bank", "affin"],
    hotline: "+603 8230 2222",
    verifyAt: "https://www.affinbank.com.my/Useful-Tools/Contact-Us.aspx",
  },
  {
    name: "Alliance Bank",
    aliases: ["alliance bank", "alliancebank"],
    hotline: "+603 5516 9988",
    verifyAt: "https://www.alliancebank.com.my/Contact-Us.aspx",
  },
  {
    name: "MBSB Bank",
    aliases: ["mbsb"],
    hotline: "+603 2096 3000",
    verifyAt: "https://www.mbsbbank.com/contact-us",
  },
];

/**
 * Bank Negara Malaysia — the central regulator, useful for cases the
 * commercial bank can't or won't act on quickly.
 */
export const BNM_CONTACT = {
  name: "Bank Negara Malaysia (BNMTELELINK)",
  hotline: "1-300-88-5465",
  verifyAt: "https://www.bnm.gov.my/contact-us",
};

/** Escape regex metacharacters in an alias before building a word-boundary pattern. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect which banks (if any) are mentioned in a piece of free-form scam
 * text. Returns the matched Bank objects in their canonical order.
 *
 * Matching is word-boundary based — "mbb" matches "MBB" or "via MBB" but
 * NOT "embedded". This is critical to avoid false positives like
 * "TalentBridge" matching short bank abbreviations and sending a scam
 * victim to the wrong bank's fraud line.
 */
export function detectBanks(text: string | undefined | null): Bank[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  const found: Bank[] = [];
  for (const bank of MAJOR_BANKS) {
    const matched = bank.aliases.some((alias) => {
      const pattern = new RegExp(`\\b${escapeRegex(alias)}\\b`, "i");
      return pattern.test(haystack);
    });
    if (matched) found.push(bank);
  }
  return found;
}
