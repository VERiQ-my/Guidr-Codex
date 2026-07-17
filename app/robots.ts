import type { MetadataRoute } from "next";

// Crawling stays open for app routes ON PURPOSE: they answer with an
// X-Robots-Tag noindex header (next.config.ts), and a robots.txt disallow
// would stop crawlers from ever seeing it. Only /api is blocked outright —
// it serves no indexable content and just burns crawl budget.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: "https://guidr.my/sitemap.xml",
  };
}
