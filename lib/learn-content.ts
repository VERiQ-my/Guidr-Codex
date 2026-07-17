/**
 * Static content for the Learn & Earn page: articles (grouped by the canonical
 * scam taxonomy so they share icons/colors with the rest of the app), the
 * daily-challenge bank, and leveling config.
 *
 * Category names MUST match lib/scam-categories.ts so ScamCategoryIcon resolves.
 */

export interface Article {
  id: string;
  category: string;   // canonical category (see lib/scam-categories.ts)
  title: string;
  minutes: number;    // estimated read time
  xp: number;         // awarded once on completion
  summary: string;
  body: string[];     // paragraphs
}

export const ARTICLES: Article[] = [
  {
    id: "phishing-red-flags",
    category: "Phishing",
    title: "Red flags in phishing emails",
    minutes: 5,
    xp: 50,
    summary: "Spot the tells that separate a real message from a credential-stealing fake.",
    body: [
      "Phishing messages are built to rush you. They create urgency (“your account will be suspended”, “verify within 24 hours”) so you act before you think.",
      "Check the sender's real address, not just the display name. Hover over links before tapping: a button that says maybank2u.com may actually point somewhere else entirely.",
      "Watch for slightly-off domains (maybank-2u.com, paypa1.com), generic greetings (“Dear customer”), and any request for your password, full card number, or one-time code. No legitimate bank will ever ask for those.",
    ],
  },
  {
    id: "phishing-otp",
    category: "Phishing",
    title: "Why you should never share your OTP",
    minutes: 3,
    xp: 50,
    summary: "The one-time code is the last lock on your account. Sharing it hands over everything.",
    body: [
      "A one-time password (OTP) is the final step that authorizes a login or a transaction. Anyone who has your OTP can complete an action as if they were you.",
      "Scammers will pose as bank staff or delivery agents and say they need the code “to verify you” or “to release your parcel”. That is always a lie. Verification codes are for you to enter yourself, never to read out.",
      "If someone pressures you for an OTP, hang up. Then call the institution using the number on the back of your card or their official app.",
    ],
  },
  {
    id: "romance-warning-signs",
    category: "Romance Scam",
    title: "Romance scam warning signs",
    minutes: 4,
    xp: 50,
    summary: "How to tell affection from a long con built to drain your savings.",
    body: [
      "Romance scammers invest weeks building trust before any ask. They profess strong feelings fast, but always have a reason they can't meet or video call.",
      "The story bends toward money: a medical emergency, a stuck shipment, customs fees, or a “guaranteed” investment they want to share with you.",
      "Real red flags: they ask you to keep the relationship secret, move you off the dating app quickly, and request gift cards, crypto, or bank transfers. Never send money to someone you haven't met in person.",
    ],
  },
  {
    id: "delivery-parcel-sms",
    category: "Delivery Scam",
    title: "Parcel & SMS scams in Malaysia",
    minutes: 4,
    xp: 75,
    summary: "Fake Pos Malaysia and courier texts that lead to cloned payment pages.",
    body: [
      "“Your parcel is held, pay RM2 to release it” is one of the most common smishing texts in Malaysia. The tiny fee is bait; the real goal is your card details on a cloned page.",
      "Couriers don't collect duties by random SMS links. If you're expecting a parcel, open the official courier app or website and check the tracking number yourself.",
      "Delete texts with shortened links (bit.ly, tinyurl) claiming to be Pos Malaysia, J&T, or customs. Report the number to NSRC 997.",
    ],
  },
  {
    id: "job-task-scam",
    category: "Job Scam",
    title: "The 'easy task' job scam",
    minutes: 5,
    xp: 75,
    summary: "Get paid to like videos, until they ask you to top up first.",
    body: [
      "Task scams reach you on WhatsApp or Telegram offering easy money for liking videos, rating hotels, or completing “merchant tasks”. Early small payouts feel real.",
      "Then the trap: to unlock bigger commissions you must “top up” your own money into a wallet. The balance shown is fake, and withdrawals never come.",
      "Legitimate employers never ask you to deposit money to earn. If a job requires you to pay first, it's a scam. Walk away.",
    ],
  },
  {
    id: "job-fake-offer",
    category: "Job Scam",
    title: "Spotting a fake job offer",
    minutes: 4,
    xp: 50,
    summary: "Recruiters that move fast, pay too much, and ask for your IC up front.",
    body: [
      "Be cautious when an offer arrives with no interview, a salary far above market, and pressure to start immediately.",
      "Verify the company on SSM and look for an official domain email, not gmail or a numbered address like hr07@.",
      "Never hand over your IC copy, bank login, or an upfront “training fee” to a recruiter you haven't verified.",
    ],
  },
  {
    id: "investment-too-good",
    category: "Investment Scam",
    title: "If returns look too good, they are",
    minutes: 5,
    xp: 75,
    summary: "Guaranteed profits and time pressure are the signature of an investment scam.",
    body: [
      "No real investment guarantees high returns with no risk. “Fixed 10% monthly” or “double your money in 30 days” is a promise only a scam can make.",
      "Check whether the operator is licensed by the Securities Commission Malaysia (SC). Use the SC's public Investor Alert List.",
      "Pressure to deposit quickly, recruit friends, or move to a private chat are all signs to stop and verify before sending a sen.",
    ],
  },
  {
    id: "impersonation-macau",
    category: "Impersonation",
    title: "Macau scam: fake police & officials",
    minutes: 5,
    xp: 75,
    summary: "Callers posing as PDRM, LHDN, or Bank Negara to frighten you into transferring money.",
    body: [
      "In a Macau scam, the caller claims you're linked to a crime or owe money, then transfers you to a fake “officer” who demands you move funds to a “safe account”.",
      "Real authorities never ask for transfers over the phone, never demand secrecy, and never threaten immediate arrest to force payment.",
      "Hang up. Call the agency back on its official published number. Report the call to NSRC 997.",
    ],
  },
  {
    id: "lottery-prize",
    category: "Lottery Scam",
    title: "You 'won' a prize you never entered",
    minutes: 3,
    xp: 50,
    summary: "Winning a contest you never joined is the oldest trick online.",
    body: [
      "If you're told you won a lucky draw, iPhone, or cash from a brand you never entered, it's a scam designed to collect a “processing fee” or your bank details.",
      "Genuine prizes never require you to pay to receive them.",
      "Ignore the link, don't reply, and block the sender.",
    ],
  },
  {
    id: "loan-ah-long",
    category: "Loan Scam",
    title: "Instant-loan and Ah Long traps",
    minutes: 4,
    xp: 50,
    summary: "Upfront “processing fees” for loans that never arrive.",
    body: [
      "Scam lenders advertise instant approval with no documents, then demand an upfront fee, insurance, or “GST” before releasing the loan, which never comes.",
      "Licensed moneylenders are registered with KPKT and never ask for payment before disbursing.",
      "Never pay a fee to receive a loan, and never share your banking credentials with a lender.",
    ],
  },
  {
    id: "shopping-fake-store",
    category: "Online Shopping Scam",
    title: "Fake online stores & deals",
    minutes: 4,
    xp: 50,
    summary: "Unbelievable prices and bank-transfer-only checkouts are warning signs.",
    body: [
      "Scam stores lure with prices far below market and pressure you to pay by direct bank transfer instead of a protected platform checkout.",
      "Check seller ratings, account age, and reviews. Reverse-image-search product photos, because stolen images are common.",
      "Pay through the platform's protected method so you can dispute if goods never arrive.",
    ],
  },
  {
    id: "crypto-rug",
    category: "Crypto Scam",
    title: "Crypto 'guaranteed profit' schemes",
    minutes: 5,
    xp: 75,
    summary: "Fake trading platforms that let you 'win' until you try to withdraw.",
    body: [
      "Crypto scams often start with a friendly mentor or group promising a winning trading signal. The platform shows your balance growing fast.",
      "When you try to withdraw, you're told to pay “tax” or “unlock fees” first. More money in, nothing out.",
      "Use only well-known exchanges, never send crypto to someone promising returns, and be wary of anyone who DMs you a “sure thing”.",
    ],
  },
  {
    id: "tech-support",
    category: "Tech Support Scam",
    title: "The fake tech-support call",
    minutes: 3,
    xp: 50,
    summary: "“Your computer is infected” pop-ups and callers who want remote access.",
    body: [
      "Scammers claim to be from Microsoft or Apple and say your device is infected, then ask you to install remote-access software.",
      "Once in, they can steal files, install malware, or open your banking apps.",
      "Real tech companies don't cold-call you. Never grant remote access to an unsolicited caller.",
    ],
  },
  {
    id: "charity-fake",
    category: "Charity Scam",
    title: "Fake charity & donation drives",
    minutes: 3,
    xp: 50,
    summary: "Disasters and sob stories used to funnel donations to a personal account.",
    body: [
      "After a disaster, fake fundraisers spread fast, often copying a real charity's name and logo.",
      "Donate only through the charity's official website or verified channels, never to a personal bank account or e-wallet.",
      "If you're pressured to give immediately, pause. Real charities are happy to wait while you verify.",
    ],
  },
  {
    id: "phishing-bank-impersonation",
    category: "Phishing",
    title: "Cloned bank login pages",
    minutes: 4,
    xp: 50,
    summary: "A pixel-perfect copy of your bank's site, one wrong character in the URL.",
    body: [
      "Phishing sites copy a bank's login page exactly. The only tell is often the web address, so check it character by character.",
      "Type your bank's address yourself or use the official app; don't follow links from SMS or email.",
      "If you've entered details on a suspicious page, change your password and call your bank immediately.",
    ],
  },
  {
    id: "impersonation-gov",
    category: "Impersonation",
    title: "Fake government & agency messages",
    minutes: 4,
    xp: 50,
    summary: "“Bantuan” payouts and tax refunds that just want your bank login.",
    body: [
      "Messages promising government aid, subsidies, or tax refunds with a link to “claim” them are a common impersonation scam.",
      "Government agencies don't collect your banking password through a link. Use official portals (e.g. MyGov) directly.",
      "When in doubt, verify through the agency's official channels before clicking anything.",
    ],
  },
];

export interface Challenge {
  id: string;
  message: string;
  isScam: boolean;
  explanation: string;
}

/** Daily-challenge bank. One is shown per day, chosen deterministically by date. */
export const CHALLENGES: Challenge[] = [
  {
    id: "ch-prize",
    message: "Tahniah! Akaun anda menang RM10,000. Klik sekarang untuk tuntut hadiah: bit.ly/claim-prize",
    isScam: true,
    explanation: "A prize you never entered + an urgent shortened link = classic lottery/phishing scam.",
  },
  {
    id: "ch-parcel",
    message: "Pos Malaysia: Your parcel is on hold. Pay RM2.00 customs fee to release: pos-my.delivery-fee.com",
    isScam: true,
    explanation: "Couriers don't collect fees via random links. The tiny fee is bait for your card details.",
  },
  {
    id: "ch-otp",
    message: "This is Maybank. To stop a suspicious transaction, please read me the 6-digit code we just sent you.",
    isScam: true,
    explanation: "Banks never ask for your OTP. The code authorizes the scammer's own transaction.",
  },
  {
    id: "ch-legit-bank",
    message: "Maybank: RM250.00 spent at SHELL KL on 8 Jun. Not you? Open the Maybank app to report.",
    isScam: false,
    explanation: "A transaction alert that tells you to use the official app, with no link and no request for details, is legitimate.",
  },
  {
    id: "ch-job",
    message: "Hi! Earn RM300/day liking videos from home. Just top up RM50 to activate your earning account.",
    isScam: true,
    explanation: "Pay-to-earn “task” jobs are scams. No real job asks you to deposit money first.",
  },
  {
    id: "ch-legit-otp",
    message: "Your Guidr verification code is 482910. Enter it on the login screen. Do not share this code.",
    isScam: false,
    explanation: "A code for you to enter yourself, with a warning not to share it, is a normal login OTP.",
  },
  {
    id: "ch-invest",
    message: "Join my VIP crypto signal group. Guaranteed 15% daily profit, withdraw anytime. Limited slots!",
    isScam: true,
    explanation: "Guaranteed high daily returns and urgency are the signature of an investment scam.",
  },
];

/** Returns the deterministic daily challenge for the given date. */
export function challengeForDay(d: Date = new Date()): Challenge {
  const dayIndex = Math.floor(d.getTime() / 86_400_000);
  return CHALLENGES[dayIndex % CHALLENGES.length];
}

/* ── Leveling ── */
export const XP_PER_LEVEL = 500;
export const LEVEL_NAME = "Scam Detector";
export const DAILY_CHALLENGE_XP = 100;

export function levelFromXp(xp: number) {
  const total = Math.max(0, xp || 0);
  const level = Math.floor(total / XP_PER_LEVEL) + 1;
  const intoLevel = total % XP_PER_LEVEL;
  return {
    level,
    intoLevel,
    toNext: XP_PER_LEVEL - intoLevel,
    pct: Math.round((intoLevel / XP_PER_LEVEL) * 100),
  };
}
