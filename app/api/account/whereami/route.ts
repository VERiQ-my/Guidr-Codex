import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Approximate location of the caller, used to label a device in the sign-in
 * history ("Kuala Lumpur, MY"). Reads Cloudflare's request.cf geo first (the
 * production runtime), then falls back to Vercel's edge headers so a residual
 * Vercel deploy keeps working. Empty string when geo isn't available (e.g.
 * local dev), and never exposes the raw IP. No auth needed — it only reflects
 * the request's own IP.
 */
export async function GET(req: NextRequest) {
  let city = "";
  let region = "";
  let country = "";

  try {
    const cf = getCloudflareContext().cf as
      | { city?: string; region?: string; country?: string }
      | undefined;
    city = cf?.city ?? "";
    region = cf?.region ?? "";
    country = cf?.country ?? "";
  } catch {
    /* not running on the Cloudflare runtime */
  }

  if (!city && !region && !country) {
    const vercelCity = req.headers.get("x-vercel-ip-city");
    city = vercelCity ? decodeURIComponent(vercelCity) : "";
    region = req.headers.get("x-vercel-ip-country-region") ?? "";
    country = req.headers.get("x-vercel-ip-country") ?? "";
  }

  const parts = [city || region, country].filter(Boolean);
  return NextResponse.json({ location: parts.join(", ") });
}
