import { runScanAgent } from "@/app/api/lib/scan-runner";
import type { ScanEvent, ScanInput } from "@/lib/scan-types";

type Storage = { put(key: string, value: unknown): Promise<void>; get<T>(key: string): Promise<T | undefined> };
type DurableState = { storage: Storage };
type RunRequest = { scanId: string; input: ScanInput };

/** Cloudflare Durable Object entry point for production scan execution. */
export class ScanRunner {
  constructor(private readonly state: DurableState) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/status") {
      const scan = await this.state.storage.get(url.searchParams.get("scanId") || "");
      return scan ? Response.json(scan) : Response.json({ error: "not_found" }, { status: 404 });
    }
    if (request.method !== "POST" || url.pathname !== "/run") return new Response("Not found", { status: 404 });
    const { scanId, input } = await request.json() as RunRequest;
    await this.state.storage.put(scanId, { status: "investigating" });
    await runScanAgent({ input, emit: async (event: ScanEvent) => {
      await this.state.storage.put(scanId, event.analysis ? { analysis: event.analysis } : { status: event.message, event });
    } });
    return Response.json({ ok: true });
  }
}