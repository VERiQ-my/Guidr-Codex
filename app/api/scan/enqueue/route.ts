/**
 * POST /api/scan/enqueue — join the scan queue.
 *
 * Returns a `ticketId` the client then polls against /api/scan/admit until a
 * concurrency slot frees. Keeps the per-user rate limit as an anti-abuse
 * backstop (limits how fast a user can *start* scans; admit polls are free).
 */

import { NextRequest } from "next/server";
import { verifyRequest, checkRateLimit } from "../../lib/admin";
import { enqueueScan } from "../../lib/scan-queue";
import { checkScanQuota } from "../../lib/scan-quota";
import { FREE_DAILY_SCANS } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const uid = await verifyRequest(req.headers.get("authorization"));
  if (!uid && process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "unauthorized", message: "Please sign in to run a scan." },
      { status: 401 }
    );
  }

  const limitKey = uid || "dev-anonymous";

  const allowed = await checkRateLimit(limitKey);
  if (!allowed) {
    return Response.json(
      { error: "rate_limited", message: "You're scanning very quickly. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  // Daily free-tier scan limit (Pro is unlimited). Enforced here so a 6th scan
  // can't even join the queue. Consumed later, on a produced verdict. The same
  // check tells us whether the user is Pro, which we use to give them a
  // priority lane in the concurrency queue.
  let priority = false;
  if (uid) {
    const quota = await checkScanQuota(uid);
    if (!quota.allowed) {
      return Response.json(
        {
          error: "scan_limit",
          message: `You've used all ${FREE_DAILY_SCANS} free scans for today. Upgrade to Guidr Pro for unlimited scans, or come back tomorrow.`,
          remaining: 0,
        },
        { status: 429 }
      );
    }
    priority = quota.pro;
  }

  const { ticketId } = await enqueueScan(limitKey, priority);
  return Response.json({ ticketId });
}
