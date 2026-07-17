/**
 * Engine tests. Run with:  node extension/test.mjs
 *
 * The most important assertions in this file are the ones under "must stay
 * SILENT on ordinary sites". A scam-blocker that cries wolf gets uninstalled,
 * and an uninstalled blocker protects nobody. Silence on github.com is a
 * feature with the same standing as a block on a fake Maybank.
 */
import { evaluate, type PageSignals, type HarmAction, looksLikeBankAccountNumber } from "../../lib/point-of-harm";
import { getRegistrableDomain, detectLookalikeBankDomain } from "../../lib/bank-domains";

// This file runs under node, but the extension tsconfig sets "types": [] so
// that browser code cannot accidentally reach for node globals. Declaring the
// one global the test needs is cheaper than pulling @types/node into the
// extension's type space.
declare const process: { exit(code: number): never };

let failed = 0;
let passed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

const base: PageSignals = {
  hostname: "example.com",
  isTopFrame: true,
  isSecureContext: true,
  hasPasswordField: false,
  hasOtpField: false,
  brandsMentioned: [],
  hasCrossOriginFormTarget: false,
};

const pw: HarmAction = { kind: "credential-entry", field: "password" };
const otp: HarmAction = { kind: "credential-entry", field: "otp" };

console.log("\n── registrable domain (Malaysian multi-part suffixes) ──");
check("www.maybank2u.com.my", getRegistrableDomain("www.maybank2u.com.my"), "maybank2u.com.my");
check("github.com", getRegistrableDomain("github.com"), "github.com");
check("a.b.shop.com.my", getRegistrableDomain("a.b.shop.com.my"), "shop.com.my");
check("ip address", getRegistrableDomain("192.168.1.1"), "");

console.log("\n── lookalike detection ──");
check("real maybank is not a lookalike", detectLookalikeBankDomain("www.maybank2u.com.my"), null);
check("embedded brand", detectLookalikeBankDomain("maybank2u.com.my.secure-login.xyz")?.reason, "embedded-brand");
check("glued brand label", detectLookalikeBankDomain("cimb-verify.top")?.reason, "embedded-brand");
check("typo squat", detectLookalikeBankDomain("maybank2v.com.my")?.reason, "typo");
check("REGRESSION disc.com is not Standard Chartered", detectLookalikeBankDomain("disc.com"), null);
check("REGRESSION music.com is clean", detectLookalikeBankDomain("music.com"), null);
check("REGRESSION github.com is clean", detectLookalikeBankDomain("github.com"), null);
check("REGRESSION google.com is clean", detectLookalikeBankDomain("google.com"), null);

console.log("\n── THE BIG ONE: must stay SILENT on ordinary sites ──");
check(
  "password on github (no bank named)",
  evaluate({ ...base, hostname: "github.com", hasPasswordField: true }, pw),
  null
);
check(
  "password on gmail (no bank named)",
  evaluate({ ...base, hostname: "accounts.google.com", hasPasswordField: true }, pw),
  null
);
check(
  "typing a long number on a normal shop (10-16 digits) still warns",
  evaluate({ ...base, hostname: "shopee.com.my" }, { kind: "account-number-entry" })?.severity,
  "warn"
);
check(
  "downloading a PDF is fine",
  evaluate({ ...base, hostname: "example.com" }, { kind: "download", fileExtension: ".pdf" }),
  null
);

console.log("\n── R1: bank credentials off-domain ──");
const fakeMaybank: PageSignals = {
  ...base,
  hostname: "maybank2u.com.my.secure-login.xyz",
  hasPasswordField: true,
  brandsMentioned: ["Maybank"],
};
check("fake maybank + password => block", evaluate(fakeMaybank, pw)?.severity, "block");
check("fake maybank + password => R1", evaluate(fakeMaybank, pw)?.ruleId, "R1_BANK_CREDENTIALS_OFF_DOMAIN");
check("fake maybank names the bank", evaluate(fakeMaybank, pw)?.bank, "Maybank");

const tacPage: PageSignals = {
  ...base,
  hostname: "mybank-verify.xyz",
  hasOtpField: true,
  brandsMentioned: ["CIMB Bank"],
};
check("TAC on a page name-dropping CIMB => block", evaluate(tacPage, otp)?.severity, "block");
check("TAC title warns about TAC", evaluate(tacPage, otp)?.title, "Stop. Do not enter your TAC here.");

console.log("\n── R4: executable downloads ──");
check(
  "APK on desktop => block (no innocent reason for it)",
  evaluate({ ...base, hostname: "loan-cepat.xyz" }, { kind: "download", fileExtension: ".apk" })?.severity,
  "block"
);
check(
  "EXE => warn, NOT block (people download real installers)",
  evaluate({ ...base, hostname: "free-stuff.xyz" }, { kind: "download", fileExtension: ".exe" })?.severity,
  "warn"
);
check(
  "REGRESSION clicking a .js link is NOT flagged (github, CDNs, sourcemaps)",
  evaluate({ ...base, hostname: "github.com" }, { kind: "download", fileExtension: ".js" }),
  null
);
check(
  "REGRESSION a path ending .com is NOT flagged (redirect URLs)",
  evaluate({ ...base, hostname: "example.com" }, { kind: "download", fileExtension: ".com" }),
  null
);
check(
  "images are fine",
  evaluate({ ...base, hostname: "example.com" }, { kind: "download", fileExtension: ".png" }),
  null
);

console.log("\n── R5: credentials over plain HTTP ──");
check(
  "password over http => warn",
  evaluate({ ...base, hostname: "example.com", isSecureContext: false, hasPasswordField: true }, pw)?.ruleId,
  "R5_INSECURE_CREDENTIAL_ENTRY"
);

console.log("\n── account number shape ──");
check("10 digits", looksLikeBankAccountNumber("1234567890"), true);
check("16 digits with spaces", looksLikeBankAccountNumber("1234 5678 9012 3456"), true);
check("9 digits is too short", looksLikeBankAccountNumber("123456789"), false);
check("phone-ish 11 digits still counts (deliberately loose)", looksLikeBankAccountNumber("01123456789"), true);
check("not a number", looksLikeBankAccountNumber("hello there"), false);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
