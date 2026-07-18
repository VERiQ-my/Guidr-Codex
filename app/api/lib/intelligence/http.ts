export class ProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ProviderError";
  }
}

export function timeoutFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1_000 ? value : fallback;
}

export async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) throw new ProviderError(`Provider returned ${response.status}: ${body.replace(/\s+/g, " ").slice(0, 300)}`, response.status);
    try {
      return JSON.parse(body);
    } catch {
      throw new Error("Provider response was not valid JSON");
    }
  } finally {
    clearTimeout(timer);
  }
}

export function databricksBaseUrl() {
  const host = process.env.DATABRICKS_HOST?.trim();
  if (!host) throw new Error("DATABRICKS_HOST is not configured");
  return `${host.startsWith("http") ? host : `https://${host}`}`.replace(/\/+$/, "");
}
