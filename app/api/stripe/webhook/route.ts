/**
 * Stripe webhook — the ONLY place Guidr Pro is granted or revoked.
 *
 * The checkout success redirect (?upgraded=true) is not trusted; a user could
 * hit that URL without paying. Instead, Stripe calls this endpoint with a
 * signed event on real payment activity, and we flip `isSubscribed` on the
 * user's profile accordingly.
 *
 * SETUP:
 *   1. Stripe Dashboard → Developers → Webhooks → add endpoint
 *      `https://<your-domain>/api/stripe/webhook`
 *   2. Subscribe to: checkout.session.completed,
 *      customer.subscription.updated, customer.subscription.deleted
 *   3. Copy the signing secret into STRIPE_WEBHOOK_SECRET (Vercel env).
 *   Local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
 *
 * Writes use the Firebase-project Admin SDK (getAdminFirestore), the same
 * credentials Guardian Alerts already use.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminFirestore } from "../../lib/firebase-admin";
import { entitlementsPath } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/** A subscription is "live" (Pro) for these Stripe statuses. */
function isLiveStatus(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * Apply a Pro state change to the user's server-owned entitlements doc
 * (users/{uid}/entitlements/plan — clients cannot write it; see F-1).
 * Best-effort + logged.
 */
async function setProState(
  uid: string,
  isSubscribed: boolean,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) {
    console.error("[stripe-webhook] Admin Firestore unavailable; cannot update", uid);
    return;
  }
  await db.doc(entitlementsPath(uid)).set({ isSubscribed, ...extra }, { merge: true });
  console.log(`[stripe-webhook] uid=${uid} isSubscribed=${isSubscribed}`);
}

/** Resolve the Guidr uid from a Stripe object's metadata. */
function uidFrom(obj: { metadata?: Stripe.Metadata | null; client_reference_id?: string | null }): string | null {
  return obj.metadata?.uid || obj.client_reference_id || null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  // Signature verification requires the exact raw body.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    // Async + WebCrypto so verification works on Workers (no Node crypto).
    event = await getStripe().webhooks.constructEventAsync(
      rawBody,
      sig,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err: any) {
    console.error("[stripe-webhook] signature verification failed:", err?.message);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = uidFrom(session);
        if (uid && session.payment_status !== "unpaid") {
          await setProState(uid, true, {
            stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
            stripeSubscriptionId:
              typeof session.subscription === "string" ? session.subscription : undefined,
            subscriptionStatus: "active",
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = uidFrom(sub);
        if (uid) {
          await setProState(uid, isLiveStatus(sub.status), {
            stripeSubscriptionId: sub.id,
            subscriptionStatus: sub.status,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = uidFrom(sub);
        if (uid) {
          await setProState(uid, false, { subscriptionStatus: "canceled" });
        }
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err: any) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err?.message || err);
    // 500 tells Stripe to retry — appropriate for a transient Firestore failure.
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
