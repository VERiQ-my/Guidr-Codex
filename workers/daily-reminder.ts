/**
 * Daily protection reminder — the habit push (cron: 20:00 MYT, see entry.mjs
 * + wrangler.jsonc). Duolingo's model: remind daily, but ONLY the people who
 * didn't show up today, so active users never feel nagged.
 *
 * Recipients: every push-enabled user, minus anyone whose presence heartbeat
 * (presence/{uid}.lastSeen) already landed today (MYT), minus anyone who
 * turned the reminder off in Settings (users/{uid}.dailyReminder === false —
 * absent means ON, since push permission was itself an explicit opt-in).
 *
 * Content rotates by calendar day across four elder-friendly nudges (scan
 * prompt, scam tip, quiz, security check-in) so the push never feels like the
 * same robot twice. All copy plain-spoken, no em dashes.
 */

import { getAdminFirestore } from "../app/api/lib/firebase-admin";
import { Timestamp } from "../app/api/lib/firestore-rest";
import { pushToTokens } from "../app/api/lib/push";

const MS_DAY = 86_400_000;
// MYT is UTC+8 with no DST, so a fixed offset is safe.
const MYT_OFFSET_MS = 8 * 3_600_000;

/** Rotating scam tips, Malaysian context. Keep each under ~110 chars. */
const TIPS = [
  "Banks never ask for your OTP or TAC. Anyone who does is a scammer, no matter who they claim to be.",
  "Feeling rushed by a message? Pressure is the scammer's favourite tool. Slow down and check with Guidr.",
  "A call from 'the police' or 'LHDN' about money? Hang up and dial the official number yourself.",
  "Deals that expire 'today only' are bait. Real shops don't panic you into paying.",
  "A friend asking for money over chat? Call their real number first. Accounts get stolen every day.",
  "Don't tap links in SMS about parcels or fines. Open the official app or website instead.",
  "No bank will ever ask you to move money to a 'safe account'. That account IS the scam.",
];

interface Reminder {
  title: string;
  body: string;
  url: string;
}

/** Pick today's nudge. `dayIdx` is a running day count, so each template
 *  appears every 4th day and the tip inside it also rotates. */
function reminderForDay(dayIdx: number): Reminder {
  switch (dayIdx % 4) {
    case 0:
      return {
        title: "🛡️ A 10-second check keeps you safe",
        body: "Got a strange message or link today? Scan it with Guidr and know for sure.",
        url: "/scan",
      };
    case 1:
      return {
        title: "💡 Today's scam tip",
        body: TIPS[dayIdx % TIPS.length],
        url: "/learn",
      };
    case 2:
      return {
        title: "🎯 Sharpen your scam radar",
        body: "Two minutes of practice today makes the next scam easier to spot.",
        url: "/learn",
      };
    default:
      return {
        title: "🛡️ How protected are you today?",
        body: "See your security level and one thing you can strengthen tonight.",
        url: "/profile/security-level",
      };
  }
}

function toMs(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "string") {
    const n = Date.parse(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export async function runDailyReminder(): Promise<{
  candidates: number;
  recipients: number;
  sent: number;
}> {
  const db = getAdminFirestore();
  if (!db) {
    console.error("[daily-reminder] no admin Firestore; skipping");
    return { candidates: 0, recipients: 0, sent: 0 };
  }

  const now = Date.now();
  const todayStartMs = Math.floor((now + MYT_OFFSET_MS) / MS_DAY) * MS_DAY - MYT_OFFSET_MS;

  // Whoever already opened the app today keeps their peace.
  const presenceSnap = await db.collection("presence").limit(5000).get();
  const activeToday = new Set<string>();
  presenceSnap.forEach((d) => {
    if (toMs(d.data()?.lastSeen) >= todayStartMs) activeToday.add(d.id);
  });

  const usersSnap = await db.collection("users").limit(5000).get();
  const tokenOwners = new Map<string, string>();
  let candidates = 0;
  let recipients = 0;
  usersSnap.forEach((d) => {
    const x = d.data() || {};
    const tokens: string[] = Array.isArray(x.fcmTokens)
      ? x.fcmTokens.filter((t: unknown) => typeof t === "string")
      : [];
    if (tokens.length === 0) return;
    candidates++;
    if (x.dailyReminder === false) return; // opted out in Settings
    if (activeToday.has(d.id)) return; // already came back today
    recipients++;
    tokens.forEach((t) => tokenOwners.set(t, d.id));
  });

  if (tokenOwners.size === 0) {
    console.log(`[daily-reminder] nobody to remind (${candidates} push users, all active or opted out)`);
    return { candidates, recipients: 0, sent: 0 };
  }

  const dayIdx = Math.floor((now + MYT_OFFSET_MS) / MS_DAY);
  const msg = reminderForDay(dayIdx);
  const res = await pushToTokens(tokenOwners, { type: "daily", ...msg });

  console.log(
    `[daily-reminder] done: ${candidates} push users, ${recipients} reminded, ${res.sent} sent, ${res.failed} failed`
  );
  return { candidates, recipients, sent: res.sent };
}
