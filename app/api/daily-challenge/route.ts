import { NextResponse } from "next/server";
import { getAdminFirestore } from "../lib/firebase-admin";
import { getOpenAI, OPENAI_MODEL } from "../lib/openai-client";
import { challengeForDay, type Challenge } from "@/lib/learn-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    message: { type: "string", minLength: 1 },
    isScam: { type: "boolean" },
    explanation: { type: "string", minLength: 1 },
  },
  required: ["message", "isScam", "explanation"],
} as const;

function malaysiaDay(): { key: string; date: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  const key = `${values.year}-${values.month}-${values.day}`;
  return { key, date: new Date(`${key}T00:00:00+08:00`) };
}

function asChallenge(value: unknown): Challenge | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Challenge>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.message !== "string" ||
    !candidate.message.trim() ||
    typeof candidate.isScam !== "boolean" ||
    typeof candidate.explanation !== "string" ||
    !candidate.explanation.trim()
  ) {
    return null;
  }
  return {
    id: candidate.id,
    message: candidate.message,
    isScam: candidate.isScam,
    explanation: candidate.explanation,
  };
}

async function generateChallenge(key: string): Promise<Challenge> {
  const openai = getOpenAI();
  if (!openai) throw new Error("OPENAI_API_KEY is not configured");

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "developer",
        content:
          "Create a short daily scam-awareness quiz for Malaysian adults. Keep it realistic, safe, and self-contained. The message must be an SMS or chat message in Malaysian context, in natural English, Malay, or a natural mix. Make it clearly either a scam or a legitimate message. Do not use a real person's private information, active links, or a real OTP.",
      },
      {
        role: "user",
        content: `Generate the shared Guidr daily challenge for ${key}. Give a one-sentence explanation that identifies the practical cue that makes the message scam or legitimate.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "daily_challenge", strict: true, schema },
    },
  });

  const raw = completion.choices[0]?.message.content;
  if (!raw) throw new Error("OpenAI returned no daily challenge content");
  const challenge = asChallenge({ ...(JSON.parse(raw) as Omit<Challenge, "id">), id: `daily-${key}` });
  if (!challenge) throw new Error("OpenAI returned an invalid daily challenge");
  return challenge;
}

/**
 * One document per Malaysia calendar day means every user receives the same
 * generated challenge. The initial Firestore create is a transactional claim,
 * so only its winner may call OpenAI for that day.
 */
export async function GET() {
  const { key, date } = malaysiaDay();
  const fallback = challengeForDay(date);
  const db = getAdminFirestore();
  if (!db) return NextResponse.json(fallback);

  const ref = db.collection("dailyChallenges").doc(key);
  let stored: Challenge | null = null;
  let ownsGeneration = false;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        stored = asChallenge(snap.data());
        return;
      }
      tx.create(ref, { status: "generating" });
      ownsGeneration = true;
    });

    if (stored) return NextResponse.json(stored);
    if (!ownsGeneration) return NextResponse.json(fallback);

    const challenge = await generateChallenge(key);
    await ref.set({ ...challenge, status: "ready" });
    return NextResponse.json(challenge);
  } catch (error) {
    console.error("[daily-challenge] OpenAI failed, using static fallback:", error);
    // Save the fallback for this day whenever the claim succeeded. This keeps
    // all later visitors on the same question and prevents repeat API calls.
    if (ownsGeneration) {
      try {
        await ref.set({ ...fallback, status: "fallback" });
      } catch {
        /* Returning the static challenge remains safe if Firestore is down. */
      }
    }
    return NextResponse.json(fallback);
  }
}
