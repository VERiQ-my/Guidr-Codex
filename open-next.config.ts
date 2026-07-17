import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache configured yet: the only ISR route is /api/scam-news
// (revalidate 1d), which degrades to per-request rendering without one. To
// restore ISR caching, add an R2 bucket + r2IncrementalCache here — see
// https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig();
