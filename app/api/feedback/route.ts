import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, verifyIdToken } from "../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * User feedback ingest.
 *
 * Verifies the caller's Firebase ID token, looks up their profile for
 * name/email, then forwards a row to the Google Sheets Apps Script Web App.
 * The Apps Script URL and shared secret stay server-side so they can't be
 * scraped from the client bundle and abused.
 *
 * Body: {
 *   category: "bug" | "feature" | "general",
 *   rating: 1..5,
 *   message: string,
 *   replyOptIn: boolean   // when true, attach the user's email so we can reply
 * }
 * Required env vars:
 *   - GOOGLE_FEEDBACK_WEBHOOK_URL  (Apps Script Web App /exec URL)
 *   - GOOGLE_FEEDBACK_SECRET       (must match GUIDR_SHARED_SECRET in Apps Script)
 */
export async function POST(req: NextRequest) {
  const uid = await verifyIdToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webhookUrl = process.env.GOOGLE_FEEDBACK_WEBHOOK_URL;
  const secret = process.env.GOOGLE_FEEDBACK_SECRET;
  if (!webhookUrl || !secret) {
    return NextResponse.json(
      { error: "Feedback endpoint not configured." },
      { status: 500 }
    );
  }

  let category = "general";
  let rating = 0;
  let message = "";
  let replyOptIn = false;
  try {
    const body = await req.json();
    const allowed = new Set(["bug", "feature", "general"]);
    const c = String(body?.category || "general");
    category = allowed.has(c) ? c : "general";
    const r = Number(body?.rating);
    rating = Number.isFinite(r) && r >= 1 && r <= 5 ? Math.round(r) : 0;
    message = String(body?.message || "").trim();
    replyOptIn = body?.replyOptIn === true;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { error: "Message too long (4000 char max)." },
      { status: 400 }
    );
  }

  // Look up email ONLY if the user opted in to be contacted. Data
  // minimization: if they didn't ask for a reply, we don't store identifying
  // info beyond the UID needed for spam/follow-up triage.
  let email = "";
  if (replyOptIn) {
    try {
      const db = getAdminFirestore();
      if (db) {
        const snap = await db.collection("users").doc(uid).get();
        email = String(snap.data()?.email || "");
      }
    } catch (err) {
      console.error("[Guidr Feedback] profile lookup failed:", err);
    }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        uid,
        email,
        category,
        rating,
        message,
      }),
      // Apps Script can be slow; give it generous time but not forever.
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      console.error("[Guidr Feedback] webhook rejected:", data);
      return NextResponse.json(
        { error: "Couldn't save feedback. Please try again." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Guidr Feedback] webhook fetch failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach feedback service." },
      { status: 502 }
    );
  }
}
