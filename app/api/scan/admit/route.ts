/**
 * POST /api/scan/admit — ask whether a queued ticket may start now.
 *
 * Body: { ticketId }
 * Returns one of:
 *   { admitted: true,  slotToken }          → start the scan (pass slotToken on)
 *   { admitted: false, position }            → still queued; show position + game
 *   { admitted: false, position, expired }   → ticket aged out; client re-enqueues
 *
 * No rate limit here: clients poll this every few seconds while waiting.
 */

import { NextRequest } from "next/server";
import { verifyRequest } from "../../lib/admin";
import { admitScan } from "../../lib/scan-queue";

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

  const body = await req.json().catch(() => ({}));
  const ticketId = body?.ticketId;
  if (!ticketId || typeof ticketId !== "string") {
    return Response.json({ error: "bad_request", message: "Missing ticketId." }, { status: 400 });
  }

  const result = await admitScan(ticketId, limitKey);
  return Response.json(result);
}
