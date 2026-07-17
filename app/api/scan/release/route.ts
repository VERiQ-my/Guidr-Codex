/**
 * POST /api/scan/release — give up a queue ticket early.
 *
 * Called as a best-effort keepalive beacon when the user navigates away while
 * queued or mid-scan, so their slot/position frees immediately instead of
 * waiting for the TTL sweep. The (unguessable, random) ticketId is the
 * capability — no extra ownership check needed.
 */

import { NextRequest } from "next/server";
import { verifyRequest } from "../../lib/admin";
import { releaseScan } from "../../lib/scan-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const uid = await verifyRequest(req.headers.get("authorization"));
  if (!uid && process.env.NODE_ENV === "production") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ticketId = body?.ticketId;
  if (ticketId && typeof ticketId === "string") {
    await releaseScan(ticketId);
  }
  return Response.json({ ok: true });
}
