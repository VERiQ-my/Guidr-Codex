/**
 * Stripe checkout confirmation — instant Pro fulfillment on return.
 *
 * The webhook (../webhook) remains the source of truth for the subscription
 * lifecycle (renewals, cancellations, payment failures). But relying on it
 * alone makes the upgrade feel broken whenever it's slow or, in local/test
 * runs, not forwarded at all (`stripe listen`). So when the user returns from
 * Checkout we verify the session server-side and grant Pro immediately.
 *
 * Security: we re-fetch the session straight from Stripe and confirm both that
 * it is actually paid AND that it belongs to the signed-in uid — the client
 * cannot grant itself Pro by forging a session id.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyIdToken, getAdminFirestore } from "../../lib/firebase-admin";
import { entitlementsPath } from "@/lib/plan";

export const runtime = "nodejs";

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-04-22.dahlia",
    // Workers have no Node HTTP stack — the default client hangs until the
    // 80s request timeout. Use Stripe's fetch-based client instead.
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyIdToken(req.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json({ ok: false, error: "Please sign in." }, { status: 401 });
    }

    const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "Missing session id." }, { status: 400 });
    }

    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    // The session must belong to THIS user. We tagged both fields at creation.
    const sessionUid = session.metadata?.uid || session.client_reference_id;
    if (sessionUid !== uid) {
      return NextResponse.json({ ok: false, error: "Session does not match user." }, { status: 403 });
    }

    // Only grant on a settled payment. Async payment methods can land here
    // "unpaid"/"processing" — those finish via the webhook instead.
    const paid =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required";
    if (!paid) {
      return NextResponse.json({ ok: false, status: "pending" });
    }

    const db = getAdminFirestore();
    if (!db) {
      // Payment is good but we can't write — the webhook will still grant it.
      return NextResponse.json({ ok: false, status: "pending" });
    }

    // Server-owned entitlements doc — the only place Pro is recorded (F-1).
    await db.doc(entitlementsPath(uid)).set(
      {
        isSubscribed: true,
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : undefined,
        stripeSubscriptionId:
          typeof session.subscription === "string" ? session.subscription : undefined,
        subscriptionStatus: "active",
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[STRIPE CONFIRM ERROR]", error?.message || error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Could not confirm payment." },
      { status: 500 }
    );
  }
}
