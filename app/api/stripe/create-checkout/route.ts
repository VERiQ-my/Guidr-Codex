import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyIdToken, getAdminFirestore } from "../../lib/firebase-admin";

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

// Historical defaults — used if config/pricing is unset or unreadable, so
// checkout never breaks on a missing/garbled price doc.
const PRICE_DEFAULTS = { currency: "myr", unitAmount: 1, interval: "month" as const };
const VALID_INTERVALS = new Set(["day", "week", "month", "year"]);

/**
 * Pro price is admin-editable from the Guidr Admin dashboard, stored at
 * Firestore `config/pricing` as { amount (major units), currency, interval,
 * unitAmount (minor units) }. Read it here so price changes go live on the
 * next checkout without a redeploy. Falls back to PRICE_DEFAULTS on any issue.
 */
async function getProPricing() {
  try {
    const db = getAdminFirestore();
    if (!db) return PRICE_DEFAULTS;
    const snap = await db.collection("config").doc("pricing").get();
    if (!snap.exists) return PRICE_DEFAULTS;
    const d = snap.data() || {};
    // Prefer explicit minor units; otherwise derive from major-unit amount.
    const unitAmount =
      typeof d.unitAmount === "number"
        ? Math.round(d.unitAmount)
        : typeof d.amount === "number"
          ? Math.round(d.amount * 100)
          : PRICE_DEFAULTS.unitAmount;
    const currency =
      typeof d.currency === "string" && d.currency.trim()
        ? d.currency.toLowerCase()
        : PRICE_DEFAULTS.currency;
    const interval =
      typeof d.interval === "string" && VALID_INTERVALS.has(d.interval)
        ? d.interval
        : PRICE_DEFAULTS.interval;
    if (!Number.isFinite(unitAmount) || unitAmount < 0) return PRICE_DEFAULTS;
    return { currency, unitAmount, interval };
  } catch (e) {
    console.warn("[Guidr] Failed to read config/pricing; using defaults:", e);
    return PRICE_DEFAULTS;
  }
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();

    // Identify the buyer so the webhook can grant Pro to the right account.
    // We tag both the session (client_reference_id + metadata) and the
    // subscription (subscription_data.metadata) so every downstream event —
    // including future cancellations — carries the uid.
    const uid = await verifyIdToken(req.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json(
        { error: "Please sign in before upgrading." },
        { status: 401 }
      );
    }

    // Price is set in the admin dashboard (Firestore config/pricing).
    const pricing = await getProPricing();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      client_reference_id: uid,
      metadata: { uid },
      subscription_data: { metadata: { uid } },
      line_items: [
        {
          price_data: {
            currency: pricing.currency,
            product_data: {
              name: "Guidr Pro",
              description: "Unlimited scans, unlimited trusted contacts, priority processing, full reports, and SMS alerts.",
            },
            unit_amount: pricing.unitAmount,
            recurring: { interval: pricing.interval as Stripe.PriceCreateParams.Recurring.Interval },
          },
          quantity: 1,
        },
      ],
      // Land in the core scan flow with the session id so the client can
      // confirm the payment (instant Pro grant) and celebrate the unlock.
      // {CHECKOUT_SESSION_ID} is substituted by Stripe on redirect.
      // NEXT_PUBLIC_APP_URL is unset in the Workers deploy, so fall back to
      // the origin the buyer is actually on rather than localhost.
      success_url: `${appUrl}/scan?upgraded=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    const errorId = crypto.randomUUID();
    console.error(`[STRIPE CHECKOUT ERROR errorId=${errorId}]`, error);

    if (error.message?.includes("STRIPE_SECRET_KEY")) {
      return NextResponse.json(
        { error: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local.", errorId },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create checkout session", errorId },
      { status: 500 }
    );
  }
}
