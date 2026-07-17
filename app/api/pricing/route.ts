import { NextResponse } from "next/server";
import { getAdminFirestore } from "../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public Pro pricing for display. Source of truth is Firestore `config/pricing`
 * (set from the Guidr Admin dashboard); falls back to the historical default so
 * the upgrade UI always renders a price. Non-sensitive — no auth required.
 */
const DEFAULTS = { amount: 0.01, currency: "MYR", interval: "month" };

function symbolFor(currency: string): string {
  return currency.toUpperCase() === "MYR" ? "RM" : currency.toUpperCase();
}

export async function GET() {
  let pricing = { ...DEFAULTS };
  try {
    const db = getAdminFirestore();
    if (db) {
      const snap = await db.collection("config").doc("pricing").get();
      if (snap.exists) {
        const d = snap.data() || {};
        pricing = {
          amount: typeof d.amount === "number" ? d.amount : DEFAULTS.amount,
          currency:
            typeof d.currency === "string" && d.currency.trim()
              ? d.currency.toUpperCase()
              : DEFAULTS.currency,
          interval:
            typeof d.interval === "string" && d.interval.trim()
              ? d.interval
              : DEFAULTS.interval,
        };
      }
    }
  } catch {
    /* fall back to defaults */
  }

  const label = `${symbolFor(pricing.currency)} ${pricing.amount.toFixed(2)}`;
  return NextResponse.json({ ...pricing, label, period: pricing.interval });
}
