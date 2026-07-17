/**
 * Builds the Guidr extension into extension/dist/, which is what you load via
 * chrome://extensions -> "Load unpacked".
 *
 *   node extension/build.mjs
 *
 * Beyond bundling, this script enforces the two invariants the extension's
 * privacy claims rest on. Both FAIL THE BUILD rather than warn, because a
 * warning in a build log is a thing nobody reads:
 *
 *   GUARD 1  No network primitives in the shipped code. The popup tells users
 *            "0 requests sent. Ever." This makes that mechanically true instead
 *            of aspirationally true.
 *
 *   GUARD 2  Every bank domain in lib/bank-domains.ts is excluded from the
 *            content script. If someone adds a bank to the allowlist and
 *            forgets the manifest, Guidr would start running on that bank's
 *            real website. The build stops them.
 */

import * as esbuild from "esbuild";
import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "src");
const dist = path.join(root, "dist");
const repo = path.join(root, "..");

/** Network primitives that must never appear in a build. */
const FORBIDDEN = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bnavigator\s*\.\s*sendBeacon\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bimportScripts\s*\(/,
];

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  // ── Bundle. IIFE, not ESM: a classic content script cannot use import, and a
  // classic service worker keeps the manifest simpler.
  const result = await esbuild.build({
    entryPoints: {
      content: path.join(src, "content.ts"),
      background: path.join(src, "background.ts"),
      popup: path.join(src, "popup.ts"),
    },
    outdir: dist,
    bundle: true,
    format: "iife",
    target: "chrome110",
    platform: "browser",
    // No minify: this extension asks users to trust it with every page they
    // visit. Shipping readable code means anyone can check that the privacy
    // claims are true. That is worth more than a few kilobytes.
    minify: false,
    legalComments: "inline",
    write: true,
    metafile: true,
  });

  // ── GUARD 1: no network primitives.
  for (const file of ["content.js", "background.js", "popup.js"]) {
    const code = await readFile(path.join(dist, file), "utf8");
    for (const pattern of FORBIDDEN) {
      if (pattern.test(code)) {
        throw new Error(
          `PRIVACY GUARD FAILED\n\n` +
            `  ${file} contains ${pattern}\n\n` +
            `  The Guidr extension must make zero network requests. The popup tells\n` +
            `  users "0 requests sent. Ever." If this build is meant to change that,\n` +
            `  that is a product decision: update the popup copy, PRIVACY.md, and the\n` +
            `  Chrome Web Store listing in the SAME commit, then relax this guard.\n` +
            `  Do not simply delete it.\n`
        );
      }
    }
  }

  // ── GUARD 2: exclusions must track VERIFIED domains exactly, in BOTH
  // directions. This one is subtle, so it is worth being precise about.
  //
  // Excluding a domain makes Guidr completely silent on it (the content script
  // never runs). So an exclusion is a statement of TRUST, exactly like
  // verified: true is.
  //
  //   verified but NOT excluded  -> we read the real bank's pages. Privacy leak.
  //   excluded but NOT verified  -> we go silent on a domain nobody confirmed.
  //                                 If a bad entry ever landed in bank-domains.ts,
  //                                 this is how it would disarm us. Worse of the two.
  //
  // Both are build failures.
  const manifestSrc = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  const excluded = manifestSrc.content_scripts[0].exclude_matches ?? [];

  const bankDomainsSrc = await readFile(path.join(repo, "lib", "bank-domains.ts"), "utf8");
  const arrayBody = bankDomainsSrc.split("export const BANK_DOMAINS")[1]?.split("\n];")[0] ?? "";
  const records = [...arrayBody.matchAll(/\{\s*domain:\s*"([^"]+)"\s*,\s*verified:\s*(true|false)/g)].map((m) => ({
    domain: m[1],
    verified: m[2] === "true",
  }));

  if (records.length === 0) {
    throw new Error("GUARD 2 could not parse any domain records out of lib/bank-domains.ts. Refusing to build blind.");
  }

  const verified = records.filter((r) => r.verified).map((r) => r.domain);
  const known = new Set(records.map((r) => r.domain));
  const pattern = (d) => `*://*.${d}/*`;

  // Non-bank exclusions we allow on purpose.
  const ALLOWED_NON_BANK = new Set(["*://*.gov.my/*"]);

  const missing = verified.filter((d) => !excluded.includes(pattern(d)));
  if (missing.length > 0) {
    throw new Error(
      `PRIVACY GUARD FAILED\n\n` +
        `  These domains are VERIFIED in lib/bank-domains.ts but are NOT excluded\n` +
        `  from the content script, so Guidr would run on a real bank's website:\n\n` +
        missing.map((d) => `    ${pattern(d)}`).join("\n") +
        `\n\n  Add each line to content_scripts[0].exclude_matches in manifest.json.\n`
    );
  }

  const stray = excluded.filter((p) => {
    if (ALLOWED_NON_BANK.has(p)) return false;
    const domain = /^\*:\/\/\*\.(.+)\/\*$/.exec(p)?.[1];
    if (!domain) return true; // unparseable exclusion: refuse it
    if (!known.has(domain)) return true; // excluding something not in bank-domains.ts at all
    return !verified.includes(domain); // excluding an UNVERIFIED domain
  });

  if (stray.length > 0) {
    throw new Error(
      `SECURITY GUARD FAILED\n\n` +
        `  These domains are excluded from the content script but are NOT verified\n` +
        `  in lib/bank-domains.ts:\n\n` +
        stray.map((p) => `    ${p}`).join("\n") +
        `\n\n  Excluding a domain makes Guidr SILENT on it. Doing that for a domain\n` +
        `  nobody has confirmed is exactly how a bad entry would disarm the extension.\n` +
        `  Either verify the domain (node scripts/verify-bank-domains.mjs) or remove\n` +
        `  the exclusion. Do not "fix" this by marking the domain verified by hand.\n`
    );
  }

  // ── Emit the manifest, stripping our "//"-prefixed documentation keys, which
  // Chrome would otherwise flag as unrecognised.
  const manifestOut = stripCommentKeys(manifestSrc);
  await writeFile(path.join(dist, "manifest.json"), JSON.stringify(manifestOut, null, 2));

  await copyFile(path.join(src, "popup.html"), path.join(dist, "popup.html"));
  await copyFile(path.join(repo, "public", "icons", "icon-192.png"), path.join(dist, "icon128.png"));

  const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
  console.log(`✓ built extension/dist  (${(bytes / 1024).toFixed(1)} kB)`);
  console.log(`✓ guard: no network primitives in shipped code`);
  console.log(
    `✓ guard: exclusions match verified domains exactly ` +
      `(${verified.length} verified and excluded, ${records.length - verified.length} unverified and still watched)`
  );
}

function stripCommentKeys(value) {
  if (Array.isArray(value)) return value.map(stripCommentKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !k.startsWith("//"))
        .map(([k, v]) => [k, stripCommentKeys(v)])
    );
  }
  return value;
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
