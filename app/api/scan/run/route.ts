/**
 * POST /api/scan/run — durable, background-safe scan.
 *
 * Unlike /api/analyze-stream (which lives and dies with the client's SSE
 * connection), this route returns immediately with a `scanId` and hands the
 * investigation to the ScanRunner Durable Object (workers/scan-do.ts), whose
 * lifetime is independent of this request — so the scan COMPLETES even if the
 * user backgrounds or closes the app. Progress + the final verdict are written
 * to a Firestore `scans/{scanId}` doc, which the client watches in real time
 * and can re-attach to on return.
 *
 * Falls back to `{ durable: false }` (client uses the SSE endpoint) when the
 * admin credentials or the SCAN_RUNNER binding aren't available — e.g. plain
 * `next dev`, or SCAN_DURABLE_DISABLED=true as an emergency switch.
 */

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyRequest, checkRateLimit } from "../../lib/admin";
import { verifySlot } from "../../lib/scan-queue";
import type { ScanInput } from "../../lib/scan-runner";
import { getAdminFirestore } from "../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimal structural types for the Durable Object binding — the project
// doesn't ship Cloudflare ambient types.
interface DOStub {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}
interface DONamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DOStub;
}

export async function POST(req: NextRequest) {
  const uid = await verifyRequest(req.headers.get("authorization"));
  if (!uid && process.env.NODE_ENV === "production") {
    return Response.json({ error: "unauthorized", message: "Please sign in to run a scan." }, { status: 401 });
  }

  const limitKey = uid || "dev-anonymous";
  const allowed = await checkRateLimit(limitKey);
  if (!allowed) {
    return Response.json(
      { error: "rate_limited", message: "You're scanning very quickly. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  const { message, image, imageMimeType, ticketId, slotToken } = await req.json();

  const hasSlot = await verifySlot(ticketId, slotToken);
  if (!hasSlot) {
    return Response.json({ error: "no_slot", message: "Please start your scan from the queue." }, { status: 403 });
  }

  // Emergency switch: force every client onto the SSE streaming fallback.
  if (process.env.SCAN_DURABLE_DISABLED === "true") {
    return Response.json({ durable: false });
  }

  const db = getAdminFirestore();
  if (!db) {
    // No admin credentials — can't persist. Tell the client to use the
    // streaming endpoint instead (keeps local dev working).
    return Response.json({ durable: false });
  }

  // The Durable Object namespace only exists on the deployed worker (or
  // `wrangler dev`); plain `next dev` falls back to streaming.
  let scanRunner: DONamespace | undefined;
  try {
    scanRunner = (getCloudflareContext().env as Record<string, unknown>).SCAN_RUNNER as
      | DONamespace
      | undefined;
  } catch {
    /* not running on the Cloudflare runtime */
  }
  if (!scanRunner || typeof scanRunner.idFromName !== "function") {
    return Response.json({ durable: false });
  }

  const scanId = randomUUID();
  const input: ScanInput = { message, image, imageMimeType };

  // Seed the doc so the client's listener has something to attach to right away.
  await db.doc(`scans/${scanId}`).set({
    userId: uid || "dev-anonymous",
    status: "running",
    stage: "starting",
    statusMessage: "Reading the message...",
    toolSteps: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Hand the job to the Durable Object (one instance per scanId). It ACKs
  // with 202 and runs the investigation in the background.
  try {
    const stub = scanRunner.get(scanRunner.idFromName(scanId));
    const res = await stub.fetch("https://scan-runner.internal/start", {
      method: "POST",
      body: JSON.stringify({ scanId, uid: limitKey, ticketId, input }),
    });
    if (res.status !== 202) throw new Error(`DO start returned ${res.status}`);
  } catch (err) {
    console.error("[scan/run] durable dispatch failed:", err);
    // Don't leave the seeded doc orphaned at "running" — the client would
    // watch it forever. Best-effort delete, then stream instead.
    await db.doc(`scans/${scanId}`).delete().catch(() => {});
    return Response.json({ durable: false });
  }

  return Response.json({ durable: true, scanId });
}
