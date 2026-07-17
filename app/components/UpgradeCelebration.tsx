"use client";

/**
 * Post-checkout celebration + instant Pro fulfillment.
 *
 * Mounted globally (ClientProviders) so it works wherever Stripe's success_url
 * lands the user. When the URL carries `?upgraded=true&session_id=...` it:
 *   1. calls /api/stripe/confirm to grant Pro immediately (the webhook is the
 *      backstop / lifecycle source of truth — see api/stripe/confirm),
 *   2. shows a "Premium Unlocked" modal,
 *   3. strips the query params so a refresh can't re-trigger it.
 *
 * Pro access itself updates live everywhere via subscribeUserProfile once
 * isSubscribed flips — this component just owns the celebratory moment.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";

type Phase = "confirming" | "done" | "pending";

const PRO_FEATURES = [
  "Unlimited scans",
  "Unlimited guardians",
  "SMS scam alerts",
  "Priority NSRC report processing",
  "Full forensic reports & analytics",
];

export default function UpgradeCelebration() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>("confirming");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (searchParams.get("upgraded") !== "true") return;
    started.current = true;

    const sessionId = searchParams.get("session_id");
    setShow(true);

    // Drop the params right away so a reload doesn't replay the celebration.
    // The `started` guard keeps this single run going despite the URL change.
    router.replace(pathname);

    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/stripe/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json().catch(() => ({}));
        setPhase(res.ok && data.ok ? "done" : "pending");
      } catch {
        setPhase("pending");
      }
    })();
  }, [searchParams, router, pathname]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-white rounded-3xl p-7 shadow-2xl text-center guidr-animate-in">
        {phase === "confirming" ? (
          <>
            <div className="w-12 h-12 mx-auto mb-5 border-[3px] border-guidr-primary border-t-transparent rounded-full animate-spin" />
            <h3 className="text-lg font-bold text-guidr-text mb-1">Confirming your payment…</h3>
            <p className="text-sm text-guidr-muted">This only takes a second.</p>
          </>
        ) : phase === "done" ? (
          <>
            <div className="text-5xl mb-3" aria-hidden>🎉</div>
            <div className="flex items-center justify-center mb-3">
              <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full tracking-wider uppercase shadow-md">
                ⭐ Guidr Pro
              </span>
            </div>
            <h3 className="text-xl font-bold text-guidr-text mb-2">Premium Unlocked!</h3>
            <p className="text-sm text-guidr-muted mb-5 leading-relaxed">
              Thank you for upgrading. Your Pro features are active right now.
            </p>

            <div className="bg-gray-50 rounded-2xl p-4 mb-6 flex flex-col gap-2.5 text-left">
              {PRO_FEATURES.map((feat) => (
                <div key={feat} className="flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#0d7377" stroke="none" className="shrink-0">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  <span className="text-sm text-guidr-text">{feat}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShow(false)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-white font-semibold text-sm hover:from-amber-500 hover:to-amber-600 active:scale-[0.98] transition-all shadow-md"
            >
              Start exploring
            </button>
          </>
        ) : (
          <>
            <div className="text-5xl mb-3" aria-hidden>✅</div>
            <h3 className="text-xl font-bold text-guidr-text mb-2">Payment received</h3>
            <p className="text-sm text-guidr-muted mb-6 leading-relaxed">
              Thanks for upgrading! Your Pro features are being activated and will
              appear in a moment. No further action needed.
            </p>
            <button
              onClick={() => setShow(false)}
              className="w-full py-3.5 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark active:scale-[0.98] transition-all shadow-md"
            >
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
