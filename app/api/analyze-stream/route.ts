import { NextRequest } from "next/server";
import { verifyRequest, checkRateLimit } from "../lib/admin";
import { verifySlot, heartbeatScan, releaseScan, QUEUE_CONFIG } from "../lib/scan-queue";
import { consumeScanQuota } from "../lib/scan-quota";
import { notifyGuardiansOfVerdict } from "../lib/guardian-alert";
import { runScanAgent } from "../lib/scan-runner";

// ── Vercel serverless config ──
export const runtime = "nodejs"; // needs Node APIs (fs, admin SDK, genai)
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds — allow the agentic loop to finish (matches scan/run)

/**
 * Streaming (Server-Sent Events) scan endpoint. The connected client drives and
 * watches the investigation live. For a scan that survives the client leaving
 * the tab/app, see /api/scan/run (durable, Firestore-backed). Both share the
 * same agent in lib/scan-runner.ts.
 */
export async function POST(req: NextRequest) {
  // ── Verify the Firebase login. Enforced in production; in development we
  // allow anonymous calls so local testing isn't blocked by token refresh. ──
  const uid = await verifyRequest(req.headers.get("authorization"));

  if (!uid && process.env.NODE_ENV === "production") {
    return new Response(JSON.stringify({ error: "unauthorized", message: "Please sign in to run a scan." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Key the rate limit by uid when available, otherwise by a dev placeholder.
  const limitKey = uid || "dev-anonymous";

  // ── Per-user rate limit (protects paid Vertex AI from abuse) ──
  const allowed = await checkRateLimit(limitKey);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "rate_limited", message: "You're scanning very quickly. Please wait a moment and try again." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message, image, imageMimeType, ticketId, slotToken } = await req.json();

  // ── Concurrency gate ──
  const hasSlot = await verifySlot(ticketId, slotToken);
  if (!hasSlot) {
    return new Response(
      JSON.stringify({ error: "no_slot", message: "Please start your scan from the queue." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: any) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      // Keep the queue slot alive for the duration of this (long) scan.
      const heartbeat = ticketId
        ? setInterval(() => { void heartbeatScan(ticketId); }, QUEUE_CONFIG.heartbeatMs)
        : null;

      try {
        const result = await runScanAgent({ message, image, imageMimeType }, sendEvent);

        // Count this completed scan against the user's daily free quota
        // (no-op for Pro). Best-effort; must not affect the delivered verdict.
        if (result.ok && uid) {
          await consumeScanQuota(uid).catch(() => {});
        }
        // Server-side guardian alert — mirrors the durable (DO) path so both
        // scan transports alert identically. Never throws.
        if (result.ok && result.analysis) {
          await notifyGuardiansOfVerdict(uid ?? undefined, result.analysis);
        }
      } finally {
        // Free the concurrency slot the instant the scan ends.
        if (heartbeat) clearInterval(heartbeat);
        await releaseScan(ticketId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
