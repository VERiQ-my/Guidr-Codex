import { NextResponse } from "next/server";
import { normalizeScamType } from "@/lib/scam-categories";

export const revalidate = 86_400; // 24h in seconds
const DAY = 86_400;

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  image: string;
  category: string;
}

interface Source {
  url: string;
  name: string;
  filter: boolean;
}

const SOURCES: Source[] = [
  {
    url:
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent('scam OR fraud "scam" when:7d') +
      "&hl=en-US&gl=US&ceid=US:en",
    name: "Google News",
    filter: false,
  },
  { url: "https://www.malwarebytes.com/blog/feed/index.xml", name: "Malwarebytes", filter: true },
  { url: "https://www.bleepingcomputer.com/feed/", name: "BleepingComputer", filter: true },
  { url: "https://feeds.feedburner.com/TheHackersNews", name: "The Hacker News", filter: true },
];

const RELEVANCE = /scam|fraud|phish|fake|impersonat|romance|sextortion|extort|fraudster|spoof|smish|vishing|deepfake|419|catfish/i;

function extract(xml: string, re: RegExp): string {
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

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

function usableImage(url: string): boolean {
  if (!url || url.startsWith("data:")) return false;
  if (/\.svg(\?|$)/i.test(url)) return false;
  if (/(spacer|pixel|1x1|blank|tracking)/i.test(url)) return false;
  return /^https?:\/\//i.test(url);
}

function parseImage(block: string): string {
  const media = block.match(/<media:(?:content|thumbnail)[^>]*\burl="([^"]+)"/i);
  if (media && usableImage(media[1])) return media[1];
  const encUrlFirst = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image/i);
  if (encUrlFirst && usableImage(encUrlFirst[1])) return encUrlFirst[1];
  const encTypeFirst = block.match(/<enclosure[^>]*type="image[^"]*"[^>]*\burl="([^"]+)"/i);
  if (encTypeFirst && usableImage(encTypeFirst[1])) return encTypeFirst[1];
  for (const m of block.matchAll(/<img[^>]*\bsrc="([^"]+)"/gi)) {
    if (usableImage(m[1])) return m[1];
  }
  return "";
}

function parseFeed(xml: string, src: Source): NewsItem[] {
  const blocks = xml.split(/<item>/).slice(1);
  const out: NewsItem[] = [];

  for (const block of blocks) {
    const rawTitle = clean(extract(block, /<title>([\s\S]*?)<\/title>/));
    if (!rawTitle) continue;

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

  const byTitle = new Map<string, NewsItem>();
  for (const item of all) {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = byTitle.get(key);
    if (!existing || (!existing.image && item.image)) byTitle.set(key, item);
  }

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
