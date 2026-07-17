import { getCloudflareContext } from "@opennextjs/cloudflare";

type ScanRunnerStub = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
type ScanRunnerBinding = { idFromName(name: string): unknown; get(id: unknown): ScanRunnerStub };

export async function getScanRunnerBinding() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as CloudflareEnv & { SCAN_RUNNER?: ScanRunnerBinding }).SCAN_RUNNER;
  } catch {
    return undefined;
  }
}