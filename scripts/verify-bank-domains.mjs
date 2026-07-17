/**
 * Verifies every domain in lib/bank-domains.ts against the TLS certificate that
 * the domain actually serves, and reports drift.
 *
 *     node scripts/verify-bank-domains.mjs
 *
 * WHY THIS EXISTS
 *
 * lib/bank-domains.ts decides when Guidr STAYS SILENT. A wrong entry there means
 * Guidr vouches for a phishing page, so no domain may be marked `verified: true`
 * on anybody's say-so, including a model's. This script is the evidence.
 *
 * WHAT COUNTS AS PROOF
 *
 * The certificate's `O=` (Organization) field. Banks use Organization Validated
 * or Extended Validation certificates, meaning a Certificate Authority checked
 * the legal entity behind the domain. An attacker who registers a lookalike can
 * get a domain-validated cert in minutes, but cannot get one that says
 * `O=Malayan Banking Berhad`.
 *
 * A DV cert (no O= field) proves only that someone controls the domain. It says
 * nothing about who they are, so it is NOT sufficient.
 *
 * KNOWN LIMITATION
 *
 * Several Malaysian banks refuse connections from non-Malaysian IPs. From a
 * foreign network those show as UNREACHABLE, which is NOT evidence of anything
 * wrong. Run this from a Malaysian network before concluding.
 */

import tls from "node:tls";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Pull the domain records out of the TS source without needing a TS runtime. */
async function loadRecords() {
  const src = await readFile(path.join(root, "lib", "bank-domains.ts"), "utf8");
  const body = src.split("export const BANK_DOMAINS")[1]?.split("\n];")[0] ?? "";
  const records = [];
  for (const m of body.matchAll(/\{\s*domain:\s*"([^"]+)"\s*,\s*verified:\s*(true|false)([^}]*)\}/g)) {
    const certOrg = /certOrg:\s*"([^"]+)"/.exec(m[3])?.[1];
    records.push({ domain: m[1], verified: m[2] === "true", certOrg });
  }
  return records;
}

function getCertOrg(domain, timeoutMs = 12_000) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: domain, port: 443, servername: domain, timeout: timeoutMs, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate(false);
        const org = cert?.subject?.O;
        const sans = cert?.subjectaltname ?? "";
        socket.destroy();
        resolve({ ok: true, org: org ?? null, sans });
      }
    );
    const fail = (reason) => {
      socket.destroy();
      resolve({ ok: false, reason });
    };
    socket.on("timeout", () => fail("timeout"));
    socket.on("error", (e) => fail(e.code ?? e.message));
  });
}

/** Does the served cert actually cover this domain (CN or SAN)? */
function coversDomain(sans, domain) {
  if (!sans) return false;
  return sans
    .split(",")
    .map((s) => s.trim().replace(/^DNS:/, "").toLowerCase())
    .some((n) => n === domain || n === `www.${domain}` || (n.startsWith("*.") && domain.endsWith(n.slice(1))));
}

const records = await loadRecords();
if (records.length === 0) {
  console.error("Could not parse any domain records out of lib/bank-domains.ts. Refusing to report success.");
  process.exit(1);
}

console.log(`Checking ${records.length} domains from lib/bank-domains.ts\n`);

let drift = 0;
let unreachable = 0;

for (const rec of records) {
  const res = await getCertOrg(rec.domain);

  if (!res.ok) {
    unreachable++;
    const bad = rec.verified; // a domain we TRUST should not be unreachable
    if (bad) drift++;
    console.log(
      `${bad ? "DRIFT" : "  ?  "}  ${rec.domain.padEnd(24)} unreachable (${res.reason})` +
        (bad ? "  <-- marked verified but cannot be checked" : "")
    );
    continue;
  }

  const org = res.org;
  const covered = coversDomain(res.sans, rec.domain);

  if (rec.verified) {
    // Trusted: the org must still be there, must still match what we recorded,
    // and the cert must actually cover this domain.
    if (!org) {
      drift++;
      console.log(`DRIFT  ${rec.domain.padEnd(24)} verified, but now serves a DV cert with NO organization`);
    } else if (rec.certOrg && org !== rec.certOrg) {
      drift++;
      console.log(`DRIFT  ${rec.domain.padEnd(24)} org changed: recorded "${rec.certOrg}", now "${org}"`);
    } else if (!covered) {
      drift++;
      console.log(`DRIFT  ${rec.domain.padEnd(24)} cert does not cover this domain (SAN mismatch)`);
    } else {
      console.log(`  ok   ${rec.domain.padEnd(24)} O=${org}`);
    }
  } else {
    // Not trusted. If it now presents a validated org, it is a CANDIDATE for
    // promotion, but a human still decides.
    if (org && covered) {
      console.log(`  NEW  ${rec.domain.padEnd(24)} now presents O=${org}  <-- candidate, review and promote by hand`);
    } else {
      console.log(`  --   ${rec.domain.padEnd(24)} still no validated organization (DV only)`);
    }
  }
}

console.log(
  `\n${records.filter((r) => r.verified).length} trusted, ` +
    `${records.filter((r) => !r.verified).length} not trusted, ` +
    `${unreachable} unreachable, ${drift} drift`
);

if (drift > 0) {
  console.error(
    `\nDRIFT DETECTED. A domain marked verified: true no longer proves the bank's identity.\n` +
      `Until it is fixed, Guidr may be staying silent on a domain it should not trust.\n`
  );
  process.exit(1);
}
