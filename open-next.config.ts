import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import incrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// This Cloudflare account does not have R2 enabled. Use the supported
// static-assets cache implementation instead of an R2-backed cache.
export default defineCloudflareConfig({
  incrementalCache,
});