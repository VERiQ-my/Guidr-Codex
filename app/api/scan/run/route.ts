import { getScanRunnerBinding } from "@/app/api/lib/cloudflare";
import { verifySlot } from "@/app/api/lib/scan-queue";
import type { ScanInput } from "@/lib/scan-types";

export async function POST(request: Request) {
  const body = await request.json() as ScanInput & { ticketId: string; slotToken: string };
  const userId = request.headers.get("x-guidr-user") || "anonymous";
  if (!verifySlot(body.ticketId, body.slotToken, userId)) return Response.json({ error: "lost_slot" }, { status: 403 });
  const scanRunner = await getScanRunnerBinding();
  // Local Next development has no SCAN_RUNNER binding, so it uses the SSE route.
  if (!scanRunner) return Response.json({ durable: false });
  const scanId = crypto.randomUUID();
  const stub = scanRunner.get(scanRunner.idFromName(scanId));
  void stub.fetch("https://scan-runner/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scanId, input: body }) }).catch(console.error);
  return Response.json({ durable: true, scanId });
}