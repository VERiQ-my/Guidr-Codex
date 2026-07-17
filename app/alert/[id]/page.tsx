"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import Image from "next/image";
import { getAlert, AlertData } from "@/lib/firestore";
import { useUser } from "@/app/context/UserContext";

// ── Verdict theming (mirrors VerdictView) ──
function verdictTheme(verdict: string) {
  switch (verdict) {
    case "SCAM":
      return { bg: "bg-red-50", border: "border-red-300/40", text: "text-red-900", badge: "bg-red-600", label: "LIKELY SCAM" };
    case "SUSPICIOUS":
      return { bg: "bg-amber-50", border: "border-amber-300/40", text: "text-amber-900", badge: "bg-amber-600", label: "SUSPICIOUS" };
    default:
      return { bg: "bg-green-50", border: "border-green-300/40", text: "text-green-900", badge: "bg-green-600", label: "LIKELY SAFE" };
  }
}

export default function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useUser();
  const [alert, setAlert] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAlert(id)
      .then((a) => {
        if (cancelled) return;
        if (!a) setNotFound(true);
        else setAlert(a);
      })
      .catch(() => !cancelled && setNotFound(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-guidr-bg">
        <div className="w-8 h-8 border-4 border-guidr-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !alert) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-guidr-bg px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7b8794" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-guidr-text">Alert not found</h1>
        <p className="text-sm text-guidr-muted max-w-xs">This alert link may have expired or is invalid.</p>
        <Link href="/login" className="mt-2 px-6 py-3 bg-guidr-primary text-white rounded-xl font-semibold hover:bg-guidr-primary-dark transition-colors">
          Go to Guidr
        </Link>
      </div>
    );
  }

  const theme = verdictTheme(alert.verdict);

  return (
    <div className="min-h-dvh bg-guidr-bg flex flex-col">
      {/* Brand header */}
      <header className="flex items-center justify-between px-5 py-3 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 relative overflow-hidden">
            <Image src="/images/Brand Icon.png" alt="Guidr" fill className="object-contain scale-[1.8]" sizes="36px" />
          </div>
          <span className="font-bold text-guidr-primary tracking-tight">GUIDR</span>
        </div>
        <Link href="/login" className="text-sm font-semibold text-guidr-primary hover:underline">
          Sign in
        </Link>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-5 py-6 flex flex-col gap-5">
        {/* Who warned you */}
        <div className="flex items-center gap-3 guidr-animate-in guidr-stagger-1">
          <div className="shrink-0 w-11 h-11 rounded-full bg-guidr-primary-light flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-guidr-muted">Scam alert from</p>
            <p className="text-base font-bold text-guidr-text">{alert.warnedByName || "A Guidr user"}</p>
          </div>
        </div>

        {/* ── FREE PREVIEW: Verdict banner ── */}
        <section className={`${theme.bg} ${theme.border} border rounded-xl p-4 flex flex-col gap-2 shadow-sm guidr-animate-in guidr-stagger-2`}>
          <div className="flex items-center gap-2.5">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" className={theme.text}>
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <h1 className={`text-2xl font-bold ${theme.text} uppercase tracking-tight`}>{theme.label}</h1>
          </div>
          <span className={`inline-flex w-fit items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase ${theme.badge} text-white px-3 py-1 rounded-sm`}>
            {alert.confidence} Confidence
          </span>
          {alert.scamType && alert.scamType !== "none" && (
            <p className={`text-sm font-semibold ${theme.text} mt-1`}>Type: {alert.scamType}</p>
          )}
        </section>

        {/* ── FREE PREVIEW: Summary ── */}
        <section className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 guidr-animate-in guidr-stagger-3">
          <h2 className="text-base font-semibold text-guidr-text mb-2">Why you were warned</h2>
          <p className="text-sm text-guidr-muted leading-relaxed">{alert.summary}</p>
        </section>

        {/* ── GATED: full details behind sign-up ── */}
        {!user ? (
          <section className="relative bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden guidr-animate-in guidr-stagger-4">
            {/* Blurred teaser of what's inside */}
            <div className="p-4 blur-[5px] select-none pointer-events-none" aria-hidden>
              <h2 className="text-base font-semibold text-guidr-text mb-3">Evidence & tactics</h2>
              <div className="flex flex-col gap-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="flex gap-2 mt-2">
                  <div className="h-6 w-20 bg-gray-200 rounded-full" />
                  <div className="h-6 w-24 bg-gray-200 rounded-full" />
                </div>
              </div>
            </div>
            {/* Lock overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/60 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-guidr-primary-light flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <p className="text-sm font-bold text-guidr-text">See the full evidence & protect yourself</p>
              <p className="text-xs text-guidr-muted -mt-1">Sign up free to view the evidence chain, manipulation tactics, and scan your own messages.</p>
              <Link
                href="/login"
                className="mt-1 w-full max-w-xs flex items-center justify-center gap-2 px-6 py-3 bg-guidr-primary text-white rounded-xl font-semibold hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
              >
                Sign up free
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* Signed-in: show the gated content */}
            {alert.evidenceChain?.length > 0 && (
              <section className="flex flex-col gap-3 guidr-animate-in guidr-stagger-4">
                <h2 className="text-base font-semibold text-guidr-text px-1">Evidence chain</h2>
                {alert.evidenceChain.map((item, i) => (
                  <div key={i} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-l-red-500">
                    <h3 className="text-sm font-semibold text-guidr-text">{item.finding}</h3>
                    <p className="text-xs text-guidr-muted mt-1">Source: {item.source}</p>
                  </div>
                ))}
              </section>
            )}
            {alert.manipulationTactics?.length > 0 && (
              <section className="flex flex-col gap-2 guidr-animate-in guidr-stagger-5">
                <h2 className="text-base font-semibold text-guidr-text px-1">Manipulation tactics</h2>
                <div className="flex flex-wrap gap-2">
                  {alert.manipulationTactics.map((t, i) => (
                    <span key={i} className="bg-guidr-bg text-guidr-text px-3 py-1.5 rounded-full text-[11px] font-bold border border-gray-200/50">{t}</span>
                  ))}
                </div>
              </section>
            )}
            <Link href="/scan" className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-guidr-primary text-white rounded-xl font-semibold hover:bg-guidr-primary-dark transition-colors">
              Scan a message of your own
            </Link>
          </>
        )}

        <p className="text-[11px] text-guidr-muted text-center mt-2">
          Powered by Guidr — Security Made Simple
        </p>
      </main>
    </div>
  );
}
