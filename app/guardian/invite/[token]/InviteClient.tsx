"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { logger } from "@/lib/logger";
import { useUser } from "@/app/context/UserContext";
import { claimGuardianInvite } from "@/lib/guardians";

type Phase = "loading" | "ready" | "claiming" | "done" | "claimed" | "invalid";

interface Preview {
  wardName: string;
  guardianName: string;
  status: "invited" | "claimed";
}

/**
 * The invite landing. Most people arrive here signed out, from a WhatsApp
 * message, knowing nothing about Guidr, so the order matters: say who is
 * asking, say what it costs them (an alert, only when it's real), and only
 * then ask for an account.
 */
export default function InviteClient({ token }: { token: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();

  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Who's asking?
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/guardians/invite/${token}`);
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setPhase("invalid");
          setError(data?.error || "This invite link is no longer valid.");
          return;
        }
        setPreview(data as Preview);
        setPhase(data.status === "claimed" ? "claimed" : "ready");
      } catch {
        if (!alive) return;
        setPhase("invalid");
        setError("Couldn't load this invite. Check your connection and try again.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function handleAccept() {
    // No account yet: send them to sign in and come straight back here, rather
    // than dumping them on the home page to find their own way back.
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/guardian/invite/${token}`)}`);
      return;
    }

    setPhase("claiming");
    setError(null);
    try {
      await claimGuardianInvite(token);
      setPhase("done");
    } catch (err) {
      logger.error("Claim failed:", err);
      setError(err instanceof Error ? err.message : "Couldn't accept the invite.");
      setPhase("ready");
    }
  }

  const wardName = preview?.wardName || "Someone you know";

  /* ── Shell ── */
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10 bg-guidr-primary-light/20">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-xl shadow-guidr-primary/5 p-7">
        <div className="flex justify-center mb-6">
          <Image
            src="/images/Brand Logo.png"
            alt="Guidr"
            width={400}
            height={100}
            className="h-7 w-auto"
            priority
          />
        </div>

        {phase === "loading" || authLoading ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-7 h-7 rounded-full border-2 border-guidr-primary border-t-transparent animate-spin" />
            <p className="text-sm text-guidr-muted">Loading your invite…</p>
          </div>
        ) : phase === "invalid" ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 text-guidr-muted flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-guidr-text mb-1.5">Invite not found</h1>
            <p className="text-sm text-guidr-muted leading-relaxed mb-5">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="w-full p-3.5 rounded-xl bg-guidr-primary text-white text-sm font-semibold hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
            >
              Go to Guidr
            </button>
          </div>
        ) : phase === "claimed" ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-guidr-text mb-1.5">This invite was already used</h1>
            <p className="text-sm text-guidr-muted leading-relaxed mb-5">
              Someone has already accepted it. If that wasn&apos;t you, ask {wardName} to send you a
              fresh invite.
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full p-3.5 rounded-xl bg-guidr-primary text-white text-sm font-semibold hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
            >
              Go to Guidr
            </button>
          </div>
        ) : phase === "done" ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-3.5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-guidr-text mb-1.5">
              You&apos;re {wardName}&apos;s Guardian
            </h1>
            <p className="text-sm text-guidr-muted leading-relaxed mb-6">
              If {wardName} runs into a real scam, you&apos;ll get an alert straight away. A quick
              call from you is often what stops the money leaving.
            </p>
            <button
              onClick={() => router.push("/settings")}
              className="w-full p-3.5 rounded-xl bg-guidr-primary text-white text-sm font-semibold hover:bg-guidr-primary-dark active:scale-[0.98] transition-all mb-2.5"
            >
              See who I&apos;m protecting
            </button>
            <button
              onClick={() => router.push("/scan")}
              className="w-full p-3.5 rounded-xl bg-white border border-gray-200 text-guidr-text text-sm font-semibold hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              Check a message of my own
            </button>
          </div>
        ) : (
          /* ── ready / claiming ── */
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-guidr-primary text-white text-xl font-bold flex items-center justify-center mx-auto mb-3.5">
                {wardName.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-xl font-bold text-guidr-text leading-snug mb-2">
                {wardName} wants you as their Guardian
              </h1>
              <p className="text-sm text-guidr-muted leading-relaxed">
                Guidr checks suspicious messages, links and calls for scams. {wardName} picked you
                as the person to tell if something goes wrong.
              </p>
            </div>

            <div className="rounded-2xl bg-guidr-primary-light/30 border border-guidr-primary/20 p-4 mb-6 flex flex-col gap-3">
              <Point>
                You get an alert <b>only</b> if {wardName} hits a real scam. Not for every message
                they check.
              </Point>
              <Point>
                You never see what they scan. Only that something dangerous came up.
              </Point>
              <Point>You can step down as their Guardian at any time.</Point>
            </div>

            {error && <p className="text-xs text-guidr-red text-center mb-3">{error}</p>}

            <button
              onClick={handleAccept}
              disabled={phase === "claiming"}
              className="w-full p-3.5 rounded-xl bg-guidr-primary text-white text-sm font-semibold hover:bg-guidr-primary-dark active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {phase === "claiming"
                ? "Accepting…"
                : user
                  ? `Protect ${wardName}`
                  : `Accept and protect ${wardName}`}
            </button>
            <p className="text-[11px] text-guidr-muted text-center mt-3 leading-relaxed">
              {user
                ? "Free. You can undo this at any time."
                : "Free. You'll create a Guidr account, which takes about a minute."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** A single reassurance bullet in the "what this means" card. */
function Point({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0d7377"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 mt-0.5"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <p className="text-xs text-guidr-text leading-relaxed">{children}</p>
    </div>
  );
}
