import { NextResponse } from "next/server";
import { normalizeScamType } from "@/lib/scam-categories";

// Refresh the headlines once a day. The feeds are cached for 24h so we don't
// hammer the upstream sources on every page view, and the carousel reads as a
// stable daily digest. Route handlers aren't cached by default; this opts in.
// Note: `revalidate` must be a literal — Next statically analyzes it and
// rejects a reference to another variable ("invalid segment configuration").
export const revalidate = 86_400; // 24h in seconds
const DAY = 86_400; // reused for per-fetch cache hints below

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  /** Article thumbnail (og/media image). Empty when the feed has none — the
   *  client then falls back to a category icon. */
  image: string;
  /** Canonical scam category derived from the headline, for icon + accent. */
  category: string;
}

// Each source: an RSS URL, a display name to fall back to when the item has no
// <source>, and whether items need to be filtered for scam relevance (the
// security blogs cover more than scams; Google News is already scam-scoped).
interface Source {
  url: string;
  name: string;
  filter: boolean;
}

const SOURCES: Source[] = [
  {
    // Google News search — broad, fresh, global scam/fraud headlines, no key.
    url:
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent('scam OR fraud "scam" when:7d') +
      "&hl=en-US&gl=US&ceid=US:en",
    name: "Google News",
    filter: false,
  },
  // Image-rich security blogs — these embed real article thumbnails, so cards
  // get a proper photo instead of the icon fallback. Filtered to scam topics.
  { url: "https://www.malwarebytes.com/blog/feed/index.xml", name: "Malwarebytes", filter: true },
  { url: "https://www.bleepingcomputer.com/feed/", name: "BleepingComputer", filter: true },
  { url: "https://feeds.feedburner.com/TheHackersNews", name: "The Hacker News", filter: true },
];

// A headline from a general security feed only makes the cut if it reads like a
// scam/fraud story.
const RELEVANCE = /scam|fraud|phish|fake|impersonat|romance|sextortion|extort|fraudster|spoof|smish|vishing|deepfake|419|catfish/i;

/** Pull the first capture group of `re` out of `xml`, or "" if absent. */
function extract(xml: string, re: RegExp): string {
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

/** Strip CDATA wrappers and decode the handful of XML entities we may hit. */
function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// Reject images that make poor thumbnails: vector icons, inline data URIs, and
// 1×1 tracking/spacer pixels.
function usableImage(url: string): boolean {
  if (!url || url.startsWith("data:")) return false;
  if (/\.svg(\?|$)/i.test(url)) return false;
  if (/(spacer|pixel|1x1|blank|tracking)/i.test(url)) return false;
  return /^https?:\/\//i.test(url);
}

/** Best-effort article image from an <item> block: media tags, enclosure, or
 *  the first usable <img> inside the (often CDATA-wrapped) description/content. */
function parseImage(block: string): string {
  const media = block.match(/<media:(?:content|thumbnail)[^>]*\burl="([^"]+)"/i);
  if (media && usableImage(media[1])) return media[1];
  const encUrlFirst = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image/i);
  if (encUrlFirst && usableImage(encUrlFirst[1])) return encUrlFirst[1];
  const encTypeFirst = block.match(/<enclosure[^>]*type="image[^"]*"[^>]*\burl="([^"]+)"/i);
  if (encTypeFirst && usableImage(encTypeFirst[1])) return encTypeFirst[1];
  // Scan every <img> and take the first one that looks like a real photo.
  for (const m of block.matchAll(/<img[^>]*\bsrc="([^"]+)"/gi)) {
    if (usableImage(m[1])) return m[1];
  }
  return "";
}

/** Parse one feed's XML into NewsItems. Never throws. */
function parseFeed(xml: string, src: Source): NewsItem[] {
  const blocks = xml.split(/<item>/).slice(1);
  const out: NewsItem[] = [];

  for (const block of blocks) {
    const rawTitle = clean(extract(block, /<title>([\s\S]*?)<\/title>/));
    if (!rawTitle) continue;

    // Google News titles look like "Headline - Source"; split the source off.
    const sourceFromTag = clean(extract(block, /<source[^>]*>([\s\S]*?)<\/source>/));
    const dashIdx = rawTitle.lastIndexOf(" - ");
    const hasInlineSource = !sourceFromTag && dashIdx > 0;
    const title = hasInlineSource ? rawTitle.slice(0, dashIdx).trim() : rawTitle;
    const source = sourceFromTag || (hasInlineSource ? rawTitle.slice(dashIdx + 3).trim() : src.name);

    if (src.filter && !RELEVANCE.test(title)) continue;

    out.push({
      title,
      link: clean(extract(block, /<link>([\s\S]*?)<\/link>/)),
      source,
      pubDate: extract(block, /<pubDate>([\s\S]*?)<\/pubDate>/),
      image: parseImage(block),
      category: normalizeScamType(title),
    });
  }

  return out;
}

/** Fetch + parse a single source, swallowing any failure into []. */
async function fetchSource(src: Source): Promise<NewsItem[]> {
  try {
    const res = await fetch(src.url, {
      headers: { "User-Agent": "GuidrBot/1.0 (+https://guidr.app)" },
      next: { revalidate: DAY },
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), src);
  } catch (err) {
    console.error(`scam-news: ${src.name} fetch failed:`, err);
    return [];
  }
}

export async function GET() {
  const settled = await Promise.allSettled(SOURCES.map(fetchSource));
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Dedupe by normalized title, prefer the copy that carries an image.
  const byTitle = new Map<string, NewsItem>();
  for (const item of all) {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = byTitle.get(key);
    if (!existing || (!existing.image && item.image)) byTitle.set(key, item);
  }

  // Newest first; items with images bubble up within the same instant.
  const items = [...byTitle.values()]
    .sort((a, b) => {
      const ta = Date.parse(a.pubDate) || 0;
      const tb = Date.parse(b.pubDate) || 0;
      if (tb !== ta) return tb - ta;
      return (b.image ? 1 : 0) - (a.image ? 1 : 0);
    })
    .slice(0, 8);

  return NextResponse.json({ items });
}
