/**
 * POST /api/article   body: { id: string }
 *
 * Returns { summary, body: string[] } for a Learn article — AI-written by
 * OpenAI, with the article's original static text as a guaranteed fallback.
 *
 * The article LIST (ids, category, title, minutes, xp) stays fixed in
 * lib/learn-content.ts so markArticleRead keys and per-category progress are
 * unaffected — only the prose is generated here.
 *
 * CACHING: in-memory per server instance (see note in daily-challenge/route.ts).
 * Upgrade to a Firestore doc keyed by article id if you want it shared/persistent.
 */

import { NextResponse } from "next/server";
import { getOpenAI, OPENAI_MODEL } from "@/app/api/lib/openai-client";
import { ARTICLES } from "@/lib/learn-content";

export const runtime = "nodejs";

type ArticleContent = { summary: string; body: string[] };

const cache = new Map<string, ArticleContent>();

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "One-line hook, under ~120 chars." },
    body: {
      type: "array",
      description: "Exactly 3 short paragraphs.",
      items: { type: "string" },
    },
  },
  required: ["summary", "body"],
} as const;

export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const article = ARTICLES.find((a) => a.id === id);

  if (!article) {
    return NextResponse.json({ error: "unknown article id" }, { status: 400 });
  }

  if (cache.has(article.id)) {
    return NextResponse.json(cache.get(article.id));
  }

  const fallback: ArticleContent = { summary: article.summary, body: article.body };

  const openai = getOpenAI();
  if (!openai) {
    return NextResponse.json(fallback);
  }

  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You write concise, practical scam-awareness articles for everyday Malaysians " +
            "(think a worried parent or fresh grad). Plain language, no jargon, locally " +
            "relevant (Maybank, Pos Malaysia, NSRC 997, LHDN, etc. where fitting). Give " +
            "concrete, safe advice. Never invent phone numbers or URLs.",
        },
        {
          role: "user",
          content:
            `Write the article body.\n` +
            `Title: ${article.title}\n` +
            `Scam category: ${article.category}\n` +
            `Return a one-line summary and exactly 3 short paragraphs.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "article", strict: true, schema },
      },
    });

    const raw = resp.choices[0]?.message?.content;
    if (!raw) throw new Error("empty completion");

    const parsed = JSON.parse(raw) as ArticleContent;
    if (
      typeof parsed.summary !== "string" ||
      !parsed.summary.trim() ||
      !Array.isArray(parsed.body) ||
      parsed.body.length !== 3 ||
      parsed.body.some((paragraph) => typeof paragraph !== "string" || !paragraph.trim())
    ) {
      throw new Error("malformed body");
    }

    cache.set(article.id, parsed);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[article] OpenAI failed, using static fallback:", err);
    return NextResponse.json(fallback);
  }
}
