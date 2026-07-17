"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

/* ── Password validation (mirrors sign-up) ── */
const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /\d/.test(p) },
  { label: "One special character (!@#$%^&*)", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
];

function isPasswordValid(password: string) {
  return PASSWORD_RULES.every((r) => r.test(password));
}

type Stage =
  | "loading"          // verifying the action code with Firebase
  | "reset-form"       // valid reset code, show new-password form
  | "reset-success"    // password successfully changed
  | "verify-success"   // email verification or recovery completed
  | "error";           // bad/expired/used code

function AuthActionContent() {
  const params = useSearchParams();
  const router = useRouter();

  // Firebase delivers these on every action link. `mode` tells us which action
  // is being performed; `oobCode` is the one-time "out-of-band" code that proves
  // the user got the email. Without both, the link is malformed.
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");

  const [stage, setStage] = useState<Stage>("loading");
  const [accountEmail, setAccountEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Validate the action code as soon as the page loads. For resetPassword we
  // only verify (not apply) so the user can choose their new password first.
  // For verifyEmail/recoverEmail we apply immediately — there's nothing further
  // for the user to do.
  useEffect(() => {
    if (!mode || !oobCode) {
      setErrorMessage("This link is missing required information. Request a new one.");
      setStage("error");
      return;
    }

    (async () => {
      try {
        if (mode === "resetPassword") {
          const email = await verifyPasswordResetCode(auth, oobCode);
          setAccountEmail(email);
          setStage("reset-form");
        } else if (mode === "verifyEmail") {
          await applyActionCode(auth, oobCode);
          setStage("verify-success");
        } else if (mode === "recoverEmail") {
          // Used when the user clicks "revert" in the "your email changed" notice.
          // checkActionCode reveals the email being restored; applyActionCode commits it.
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          setAccountEmail(info.data.email || "");
          setStage("verify-success");
        } else {
          setErrorMessage("This link uses an unsupported action.");
          setStage("error");
        }
      } catch (err: any) {
        if (err.code === "auth/expired-action-code") {
          setErrorMessage("This link has expired. Request a new one from the sign-in page.");
        } else if (err.code === "auth/invalid-action-code") {
          setErrorMessage("This link is invalid or has already been used. Request a new one.");
        } else if (err.code === "auth/user-disabled") {
          setErrorMessage("This account has been disabled. Contact support if you think this is a mistake.");
        } else {
          setErrorMessage(err.message || "Something went wrong. Try requesting a new link.");
        }
        setStage("error");
      }
    })();
  }, [mode, oobCode]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oobCode || !isPasswordValid(password)) return;

    setSubmitting(true);
    setErrorMessage("");
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStage("reset-success");
    } catch (err: any) {
      if (err.code === "auth/expired-action-code") {
        setErrorMessage("Your reset link expired while you were typing. Request a new one.");
        setStage("error");
      } else if (err.code === "auth/invalid-action-code") {
        setErrorMessage("This link is no longer valid. Request a new one.");
        setStage("error");
      } else if (err.code === "auth/weak-password") {
        setErrorMessage("Firebase considered this password too weak. Try a longer one.");
      } else {
        setErrorMessage(err.message || "Couldn't reset your password. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Loading ── */
  if (stage === "loading") {
    return (
      <div className="guidr-container no-sidebar items-center justify-center px-6">
        <div className="w-full bg-white rounded-3xl p-8 shadow-sm border border-gray-100 guidr-animate-in flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border-4 border-guidr-primary-light border-t-guidr-primary animate-spin mb-4" />
          <p className="text-sm text-guidr-muted">Verifying your link…</p>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (stage === "error") {
    return (
      <div className="guidr-container no-sidebar items-center justify-center px-6">
        <div className="w-full bg-white rounded-3xl p-8 shadow-sm border border-gray-100 guidr-animate-in flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-guidr-text mb-2 text-center">Link not valid</h2>
          <p className="text-sm text-guidr-muted text-center mb-6 leading-relaxed">{errorMessage}</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3 bg-guidr-primary text-white font-semibold rounded-xl hover:bg-guidr-primary-dark transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  /* ── Verify-email or recover-email success ── */
  if (stage === "verify-success") {
    return (
      <div className="guidr-container no-sidebar items-center justify-center px-6">
        <div className="w-full bg-white rounded-3xl p-8 shadow-sm border border-gray-100 guidr-animate-in flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-guidr-text mb-2 text-center">
            {mode === "verifyEmail" ? "Email verified" : "Email change reverted"}
          </h2>
          <p className="text-sm text-guidr-muted text-center mb-6 leading-relaxed">
            {mode === "verifyEmail"
              ? "Your email has been verified. You can now sign in to Guidr."
              : `Your account email has been restored${accountEmail ? ` to ${accountEmail}` : ""}.`}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3 bg-guidr-primary text-white font-semibold rounded-xl hover:bg-guidr-primary-dark transition-colors"
          >
            Continue to Sign In
          </button>
        </div>
      </div>
    );
  }

  /* ── Password reset success ── */
  if (stage === "reset-success") {
    return (
      <div className="guidr-container no-sidebar items-center justify-center px-6">
        <div className="w-full bg-white rounded-3xl p-8 shadow-sm border border-gray-100 guidr-animate-in flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-guidr-text mb-2 text-center">Password updated</h2>
          <p className="text-sm text-guidr-muted text-center mb-6 leading-relaxed">
            Your password has been changed successfully. Sign in with your new password to continue.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3 bg-guidr-primary text-white font-semibold rounded-xl hover:bg-guidr-primary-dark transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  /* ── Reset password form ── */
  return (
    <div className="guidr-container no-sidebar items-center justify-center px-6">
      <div className="w-full bg-white rounded-3xl p-8 shadow-sm border border-gray-100 guidr-animate-in">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="relative w-16 h-16 overflow-hidden">
            <Image
              src="/images/Brand Icon.png"
              alt="Guidr"
              fill
              className="object-contain scale-[1.8]"
              sizes="64px"
              priority
            />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-guidr-text mb-2">Set a new password</h1>
        <p className="text-sm text-center text-guidr-muted mb-8">
          For <strong className="text-guidr-text">{accountEmail}</strong>
        </p>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-guidr-text mb-1">New password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-guidr-primary/50"
                placeholder="••••••••"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-4 text-guidr-muted hover:text-guidr-text transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Password rules — same UX as sign-up so the experience feels consistent */}
          {password.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-1.5">
              {PASSWORD_RULES.map((rule) => {
                const passed = rule.test(password);
                return (
                  <div key={rule.label} className="flex items-center gap-2">
                    {passed ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e" stroke="none">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                    )}
                    <span className={`text-xs ${passed ? "text-green-600 font-medium" : "text-guidr-muted"}`}>
                      {rule.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !isPasswordValid(password)}
            className="w-full py-3 mt-2 bg-guidr-primary text-white font-semibold rounded-xl hover:bg-guidr-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving…" : "Save new password"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Suspense wrapper required: useSearchParams() suspends during SSR streaming,
// and Next.js needs a boundary to render the page output until query params resolve.
export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <div className="guidr-container no-sidebar items-center justify-center px-6">
          <div className="w-12 h-12 rounded-full border-4 border-guidr-primary-light border-t-guidr-primary animate-spin" />
        </div>
      }
    >
      <AuthActionContent />
    </Suspense>
  );
}
