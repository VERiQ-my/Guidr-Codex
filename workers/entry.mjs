/**
 * Custom worker entrypoint: the OpenNext-generated Next.js handler plus our
 * Durable Object classes (which OpenNext can't emit itself).
 *
 * Kept as .mjs ON PURPOSE: `.open-next/worker.js` only exists after
 * `opennextjs-cloudflare build`, so a .ts entry would break Next's typecheck
 * (which runs before the bundle exists). Wrangler bundles this file — and the
 * TypeScript it imports — at deploy time, when the bundle is present.
 */
import handler from "../.open-next/worker.js";
import { runGuardianWeeklyDigest } from "./guardian-digest";
import { runDailyReminder } from "./daily-reminder";
import { runWeeklyScamWarning } from "./scam-trend";

export { ScanRunner } from "./scan-do";

export default {
  ...handler,
  /** Cron triggers — dispatched on the schedule string (wrangler.jsonc). */
  async scheduled(controller, env, ctx) {
    if (controller.cron === "0 1 * * 1") {
      ctx.waitUntil(runGuardianWeeklyDigest());
      return;
    }
    // Daily 20:00 MYT slot. Sundays carry the weekly scam-trend warning
    // instead of the personal reminder (never two pushes in one night);
    // if nothing trended this week, the reminder runs as usual.
    const mytDay = new Date(Date.now() + 8 * 3_600_000).getUTCDay();
    if (mytDay === 0) {
      ctx.waitUntil(runWeeklyScamWarning().then((r) => (r.sent ? null : runDailyReminder())));
    } else {
      ctx.waitUntil(runDailyReminder());
    }
  },
};
