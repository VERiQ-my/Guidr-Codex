import { getScanRunnerBinding } from "@/app/api/lib/cloudflare";
import { getScan } from "@/app/api/lib/scan-store";

export async function POST(request: Request) {
  const { scanId } = await request.json() as { scanId: string };
  const local = getScan(scanId);
  if (local) return Response.json(local);
  const scanRunner = await getScanRunnerBinding();
  if (!scanRunner) return Response.json({ error: "not_found" }, { status: 404 });
  const response = await scanRunner.get(scanRunner.idFromName(scanId)).fetch(`https://scan-runner/status?scanId=${encodeURIComponent(scanId)}`);
  return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json" } });
}