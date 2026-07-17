"use client";

/**
 * Turns the /api/account/export payload into a human-readable PDF report.
 * The audience is a non-technical user exercising their PDPA access right,
 * so the layout is curated: known fields render in a fixed, sensible order
 * as label/value rows; internal plumbing (raw markdown reports, user-agent
 * strings, base64 photos, quota counters) never reaches the page.
 *
 * jsPDF is imported dynamically so it stays out of the initial bundle
 * (same pattern as the case-summary export in app/cases/page.tsx).
 */

import type { AccountExport } from "./account-security";
import { categoryName, displayCategoryName } from "@/app/components/ScamCategoryIcon";

type Rec = Record<string, unknown>;

const TEAL: [number, number, number] = [13, 115, 119];
const INK: [number, number, number] = [30, 30, 30];
const MUTED: [number, number, number] = [110, 117, 130];

const VERDICT_LABELS: Record<string, string> = {
  SCAM: "Scam detected",
  SUSPICIOUS: "Suspicious",
  LIKELY_SAFE: "Likely safe",
};

/* ── Field curation ─────────────────────────────────────────────── */

// Account fields, in the order a person would expect to read them.
const ACCOUNT_FIELDS: [key: string, label: string][] = [
  ["fullName", "Full name"],
  ["name", "Name"],
  ["username", "Username"],
  ["displayName", "Display name"],
  ["email", "Email"],
  ["phone", "Phone number"],
  ["phoneVerified", "Phone verified"],
  ["isIdentityVerified", "Identity verified"],
  ["uid", "Account ID"],
  ["createdAt", "Member since"],
  ["lastSeenAt", "Last seen"],
  ["language", "Language"],
  ["theme", "Theme"],
  ["defaultChannel", "Default scan channel"],
  ["mfaEnabled", "Two-factor authentication"],
  ["appLockEnabled", "App lock"],
  ["appLockBiometric", "App lock uses biometrics"],
  ["xp", "XP points"],
  ["streakDays", "Learning streak (days)"],
  ["quizzesPassed", "Quizzes passed"],
  ["casesScanned", "Messages scanned"],
  ["scamsReported", "Scams reported"],
  ["articlesRead", "Articles read"],
];

const PLAN_FIELDS: [key: string, label: string][] = [
  ["isSubscribed", "Subscribed to Guidr Pro"],
  ["subscriptionStatus", "Subscription status"],
  ["stripeCustomerId", "Payment customer reference"],
  ["stripeSubscriptionId", "Subscription reference"],
];

// Never shown anywhere: server plumbing or unreadable blobs.
const HIDDEN = new Set([
  "id",
  "userId",
  "fcmTokens",
  "photoURL",
  "scanQuota",
  "reportMarkdown",
  "evidenceChain",
  "userAgent",
  // Plan fields live in their own section; hide them when they appear on the profile doc too.
  ...PLAN_FIELDS.map(([k]) => k),
]);

/* ── Value formatting ───────────────────────────────────────────── */

/** Recognize the timestamp shapes that survive JSON serialization. */
function asDate(v: unknown): Date | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (v && typeof v === "object") {
    const o = v as { seconds?: number; _seconds?: number };
    const s =
      typeof o.seconds === "number" ? o.seconds : typeof o._seconds === "number" ? o._seconds : null;
    // Require a plausible epoch (after 2001) so counters aren't mistaken for dates.
    if (s !== null && s > 1e9) return new Date(s * 1000);
  }
  return null;
}

function fmtDate(d: Date): string {
  return d.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

function clip(s: string, max = 300): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Render a value as one short, plain-language string — or null to skip the row. */
function fmtValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = asDate(v);
  if (d) return fmtDate(d);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (!v.trim() || v.startsWith("data:")) return null; // embedded images etc. are unreadable
    return clip(v);
  }
  if (Array.isArray(v)) {
    const parts = v.map((item) => fmtValue(item)).filter(Boolean);
    return parts.length ? clip(parts.join("; "), 500) : null;
  }
  if (typeof v === "object") {
    const parts = Object.entries(v as Rec)
      .filter(([k]) => !HIDDEN.has(k))
      .map(([k, val]) => {
        const f = fmtValue(val);
        return f ? `${humanize(k)}: ${f}` : null;
      })
      .filter(Boolean);
    return parts.length ? clip(parts.join(", "), 500) : null;
  }
  return null;
}

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/* ── Filename ───────────────────────────────────────────────────── */

/**
 * username_dd-mm-yyyy_time, e.g. "Farid_11-07-2026_6.58am.pdf".
 * (Slashes aren't legal in file names, so the date uses dashes.)
 */
export function dataExportFilename(data: AccountExport): string {
  const account = (data.account as Rec) ?? {};
  const raw = String(account.username || account.displayName || account.fullName || account.name || "guidr-user");
  const username =
    raw.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "guidr-user";
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const ampm = now.getHours() >= 12 ? "pm" : "am";
  const h12 = now.getHours() % 12 || 12;
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${username}_${dd}-${mm}-${yyyy}_${h12}.${min}${ampm}.pdf`;
}

/* ── Report builder ─────────────────────────────────────────────── */

export async function buildDataExportPdf(data: AccountExport): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const LABEL_W = 48;
  let y = 27;

  const ensure = (height: number) => {
    if (y + height > 280) {
      pdf.addPage();
      y = 20;
    }
  };

  const text = (
    str: string,
    size: number,
    style: "normal" | "bold",
    color: [number, number, number],
    x = margin,
    width = contentWidth,
    lead = 4.4
  ) => {
    pdf.setFontSize(size);
    pdf.setFont("helvetica", style);
    pdf.setTextColor(...color);
    for (const line of pdf.splitTextToSize(str, width)) {
      ensure(lead);
      pdf.text(line, x, y);
      y += lead;
    }
  };

  /** Section header: light teal band with an uppercase title. */
  const section = (title: string) => {
    y += 6;
    ensure(14);
    pdf.setFillColor(230, 243, 243);
    pdf.rect(margin - 3, y - 4.6, contentWidth + 6, 7.6, "F");
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...TEAL);
    pdf.text(title.toUpperCase(), margin, y);
    y += 8;
  };

  /** Two-column row: muted bold label on the left, wrapped value on the right. */
  const row = (label: string, value: string | null | undefined) => {
    if (!value) return;
    ensure(5);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...MUTED);
    pdf.text(label, margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...INK);
    const valueW = contentWidth - LABEL_W;
    for (const line of pdf.splitTextToSize(value, valueW)) {
      ensure(4.2);
      pdf.text(line, margin + LABEL_W, y);
      y += 4.2;
    }
    y += 1.4;
  };

  /** Sub-heading inside a section (case titles, device names). */
  const subheading = (title: string, rightNote?: string) => {
    y += 2;
    ensure(8);
    pdf.setFontSize(10.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...TEAL);
    pdf.text(title, margin, y);
    if (rightNote) {
      pdf.setFontSize(8.5);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...MUTED);
      pdf.text(rightNote, pageWidth - margin, y, { align: "right" });
    }
    y += 5.5;
  };

  const muted = (str: string) => text(str, 9, "normal", MUTED);

  /** Curated fields first (fixed order), then whatever else the record holds. */
  const record = (obj: Rec, known: [string, string][]) => {
    const consumed = new Set(known.map(([k]) => k));
    for (const [key, label] of known) row(label, fmtValue(obj[key]));
    for (const [key, v] of Object.entries(obj)) {
      if (consumed.has(key) || HIDDEN.has(key)) continue;
      row(humanize(key), fmtValue(v));
    }
  };

  /* Header band */
  pdf.setFillColor(...TEAL);
  pdf.rect(0, 0, pageWidth, 18, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text("GUIDR — YOUR PERSONAL DATA", pageWidth / 2, 11, { align: "center" });

  /* Intro */
  const account = (data.account as Rec) ?? {};
  const cases = ((data.cases as Rec[]) ?? []).slice().sort((a, b) => {
    return (asDate(b.createdAt)?.getTime() ?? 0) - (asDate(a.createdAt)?.getTime() ?? 0);
  });
  const contacts = (data.trustedContacts as Rec[]) ?? [];
  const links = (data.guardianLinks as { iAmProtectedBy?: Rec[]; iProtect?: Rec[] }) ?? {};
  const protectedBy = links.iAmProtectedBy ?? [];
  const protects = links.iProtect ?? [];
  const sessions = (data.sessions as Rec[]) ?? [];

  const exportedAt = asDate(data.exportedAt) ?? new Date();
  muted(`Prepared for you on ${fmtDate(exportedAt)}`);
  text(
    "This report lists the information Guidr keeps about your account, in plain language. " +
      "You requested it from Privacy & Security > Download my data, as provided by Malaysia's " +
      "Personal Data Protection Act 2010. It contains personal information, so keep it somewhere safe.",
    9,
    "normal",
    MUTED
  );
  y += 2;
  text(
    `In this report:  ${cases.length} scan${cases.length === 1 ? "" : "s"} & cases  ·  ` +
      `${contacts.length} trusted contact${contacts.length === 1 ? "" : "s"}  ·  ` +
      `${protectedBy.length + protects.length} guardian link${protectedBy.length + protects.length === 1 ? "" : "s"}  ·  ` +
      `${sessions.length} signed-in device${sessions.length === 1 ? "" : "s"}`,
    9,
    "bold",
    INK
  );

  /* Your account */
  section("Your account");
  record(account, ACCOUNT_FIELDS);

  /* Your plan */
  section("Your plan");
  const entitlements = (data.entitlements as Rec | null) ?? null;
  const planSource = entitlements ?? account;
  const hasPlanInfo = PLAN_FIELDS.some(([k]) => planSource[k] !== undefined && planSource[k] !== null);
  if (hasPlanInfo) {
    for (const [key, label] of PLAN_FIELDS) row(label, fmtValue(planSource[key]));
  } else {
    muted("Free plan, no subscription on record.");
  }

  /* Scans & cases */
  section(`Your scans & cases (${cases.length})`);
  if (cases.length === 0) muted("No scans or cases on record.");
  else
    muted(
      "Newest first. Each entry is a message, link, or document you asked Guidr to check. " +
        "Open the case inside the app for its full evidence and recommended actions."
    );
  cases.forEach((c, i) => {
    const verdict = c.verdict as string | undefined;
    const canonical = categoryName(c.scamType as string | undefined);
    // A "None" category with a non-safe verdict must not read as "No threat
    // detected" — fall back to the verdict itself as the headline.
    const title =
      canonical === "None" && verdict && verdict !== "LIKELY_SAFE"
        ? VERDICT_LABELS[verdict] ?? "Scan result"
        : displayCategoryName(c.scamType as string | undefined, verdict);
    const when = asDate(c.createdAt);
    ensure(20); // keep the title with at least the first rows
    subheading(`Case ${i + 1}: ${title}`, when ? fmtDate(when) : undefined);

    const confidence = typeof c.confidence === "string" ? c.confidence.toLowerCase() : null;
    row(
      "Result",
      verdict
        ? `${VERDICT_LABELS[verdict] ?? verdict}${confidence ? ` (${confidence} confidence)` : ""}`
        : null
    );
    row("Summary", fmtValue(c.summary));
    row(
      "Message checked",
      typeof c.originalMessage === "string" && c.originalMessage.trim() && !c.originalMessage.startsWith("data:")
        ? clip(c.originalMessage, 220)
        : null
    );
    row("Tactics spotted", fmtValue(c.manipulationTactics));
    const agencies = [
      c.reportedToNSRC ? "NSRC" : null,
      c.reportedToPDRM ? "PDRM (police)" : null,
      c.reportedToMCMC ? "MCMC" : null,
    ].filter(Boolean);
    row("Reported to", agencies.length ? agencies.join(", ") : "Not yet reported to authorities");
    row("Case status", fmtValue(c.status));
    y += 2;
  });

  /* Trusted contacts */
  section(`Trusted contacts (${contacts.length})`);
  if (contacts.length === 0) muted("No trusted contacts on record.");
  contacts.forEach((c) => {
    const status = c.status === "pending" ? "invitation pending" : fmtValue(c.status) || "active";
    text(
      `•  ${fmtValue(c.name) ?? "Unnamed contact"}, ${fmtValue(c.phone) ?? "no phone"} (${status})`,
      9.5,
      "normal",
      INK
    );
    y += 1;
  });

  /* Guardians */
  section("Guardians");
  subheading(`People protecting you (${protectedBy.length})`);
  if (protectedBy.length === 0) muted("No one is protecting your account yet.");
  protectedBy.forEach((g) => {
    const since = asDate(g.createdAt);
    text(
      `•  ${fmtValue(g.guardianName) ?? "Guardian"}, ${fmtValue(g.guardianPhone) ?? "no phone"}` +
        `${since ? `, since ${fmtDate(since)}` : ""} (${fmtValue(g.status) ?? "active"})`,
      9.5,
      "normal",
      INK
    );
    y += 1;
  });
  subheading(`People you protect (${protects.length})`);
  if (protects.length === 0) muted("You aren't protecting anyone yet.");
  protects.forEach((g) => {
    const since = asDate(g.createdAt);
    text(
      `•  ${fmtValue(g.wardName) ?? "Protected person"}` +
        `${since ? `, since ${fmtDate(since)}` : ""} (${fmtValue(g.status) ?? "active"})`,
      9.5,
      "normal",
      INK
    );
    y += 1;
  });

  /* Devices */
  section(`Signed-in devices (${sessions.length})`);
  if (sessions.length === 0) muted("No signed-in devices on record.");
  sessions.forEach((s) => {
    const seen = asDate(s.lastSeenAt);
    const since = asDate(s.createdAt);
    text(`•  ${fmtValue(s.device) ?? "Unknown device"}`, 9.5, "bold", INK);
    text(
      [
        fmtValue(s.location),
        since ? `first signed in ${fmtDate(since)}` : null,
        seen ? `last active ${fmtDate(seen)}` : null,
      ]
        .filter(Boolean)
        .join("  ·  ") || "No details recorded",
      8.5,
      "normal",
      MUTED,
      margin + 4,
      contentWidth - 4
    );
    y += 1.5;
  });

  /* Footer with page numbers */
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Guidr data report, page ${p} of ${pages}`, pageWidth / 2, 290, { align: "center" });
  }

  return pdf.output("blob");
}
