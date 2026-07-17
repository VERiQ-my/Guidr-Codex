import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyIdToken, getAdminFirestore } from "../../lib/firebase-admin";
import { entitlementsPath } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/portal — open the Stripe Billing Portal for the caller.
 *
 * This is how a Pro user manages or cancels their subscription (we never
 * mutate subscriptions ourselves — cancellations flow back through the
 * webhook, which is the only writer of isSubscribed). The customer id comes
 * from the server-owned entitlements doc the webhook wrote at purchase time,
 * so a user can only ever open their own portal.
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await verifyIdToken(req.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const ent = (await db.doc(entitlementsPath(uid)).get()).data() || {};
    const customerId = ent.stripeCustomerId;
    if (typeof customerId !== "string" || !customerId) {
      return NextResponse.json(
        { error: "No subscription found for this account." },
        { status: 404 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
      // Workers have no Node HTTP stack — use Stripe's fetch-based client.
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[STRIPE PORTAL ERROR]", error);
    return NextResponse.json(
      { error: "Couldn't open the subscription manager. Please try again." },
      { status: 500 }
    );
  }
}
