import { runScanAgent } from "@/app/api/lib/scan-runner";
import { release, verifySlot } from "@/app/api/lib/scan-queue";
import { validateScanInput } from "@/lib/scan-validation";
import type { ScanEvent } from "@/lib/scan-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const eventLine = (event: ScanEvent) => encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

type ScanRequest = { ticketId?: string; slotToken?: string };

export async function POST(request: Request) {
  let body: ScanRequest & Record<string, unknown>;
  try {
    body = await request.json() as ScanRequest & Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = validateScanInput(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const userId = request.headers.get("x-guidr-user") || "anonymous";
  if (!body.ticketId || !body.slotToken || !verifySlot(body.ticketId, body.slotToken, userId)) {
    return Response.json({ error: "lost_slot" }, { status: 403 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runScanAgent({ input: parsed.input, emit: (event) => controller.enqueue(eventLine(event)) });
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      } finally {
        release(body.slotToken);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}