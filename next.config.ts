import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  // This repository can be opened inside the Guidr backend workspace; keep
  // tracing within this app instead of inheriting the parent lockfile root.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
};

export default nextConfig;

// Lets `next dev` expose local Cloudflare bindings to server routes.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();
