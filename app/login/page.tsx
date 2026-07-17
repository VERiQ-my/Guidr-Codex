"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { bumpGlobalStat } from "@/lib/firestore";

/* ── Password validation rules ── */
const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /\d/.test(p) },
  { label: "One special character (!@#$%^&*)", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
];

function isPasswordValid(password: string) {
  return PASSWORD_RULES.every((r) => r.test(password));
}

/* Auth calls can hang silently on a flaky network or a blocked Firebase
 * endpoint, leaving the button stuck on "Please wait…" with no error. Race
 * every auth request against a timeout so the form always resolves to either
 * success or a clear, actionable error — never an endless spinner. */
const AUTH_TIMEOUT_MS = 20000;
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("auth/timeout")), ms)
    ),
  ]);
}

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showVerifyScreen, setShowVerifyScreen] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showResetScreen, setShowResetScreen] = useState(false);
  const [resetResendSuccess, setResetResendSuccess] = useState(false);
  const router = useRouter();

  // Where to land after a successful sign-in. Normally home, but a Guardian
  // invite sends people here mid-flow and they must come back to the invite,
  // not be dumped on the home page to find their own way.
  const [nextPath, setNextPath] = useState<string | null>(null);

  // The onboarding "Create a free account" CTA flags signup intent so we open
  // straight on the Sign Up form. Read it after mount (no SSR/hydration risk)
  // and clear it so a later manual visit defaults back to Sign In.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("guidr_auth_intent") === "signup") {
        // One-time read of a client-only value on mount; a lazy useState
        // initializer can't be used (no sessionStorage during SSR).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLogin(false);
        sessionStorage.removeItem("guidr_auth_intent");
      }
    } catch {
      /* storage disabled — default Sign In view is fine */
    }

    // `?next=` is read from window.location rather than useSearchParams so the
    // page doesn't need a Suspense boundary. Mirrored into sessionStorage
    // because sign-up detours through email verification, which loses the URL.
    // Only in-app paths are honoured ("/x" but never "//evil.com"), so the
    // param can't be turned into an open redirect.
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("next");
      const candidate = fromUrl || sessionStorage.getItem("guidr_auth_next");
      if (candidate && /^\/(?!\/)/.test(candidate)) {
        setNextPath(candidate);
        sessionStorage.setItem("guidr_auth_next", candidate);
      }
    } catch {
      /* storage disabled — falling back to home is fine */
    }
  }, []);

  /** Land the freshly authenticated user wherever they were headed. */
  const goAfterAuth = () => {
    const dest = nextPath || "/";
    try {
      sessionStorage.removeItem("guidr_auth_next");
    } catch {
      /* nothing to clean up */
    }
    // replace (not push) so the back button can't return to /login.
    router.replace(dest);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const userCredential = await withTimeout(
          signInWithEmailAndPassword(auth, email, password),
          AUTH_TIMEOUT_MS
        );

        // Block login if email not verified
        if (!userCredential.user.emailVerified) {
          setShowVerifyScreen(true);
          setLoading(false);
          return;
        }

        goAfterAuth();
        return;
      } else {
        // Validate password before sign-up
        if (!isPasswordValid(password)) {
          setError("Password does not meet all requirements.");
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // The profile write, global counter, and verification email don't
        // depend on each other — run them concurrently instead of three
        // sequential round-trips so sign-up resolves in roughly the time of
        // the slowest single call. bumpGlobalStat keeps its own catch so a
        // counter hiccup can't fail the whole sign-up.
        await Promise.all([
          // Save user profile to Firestore
          setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            fullName: fullName,
            username: username,
            email: user.email,
            xp: 0,
            casesScanned: 0,
            scamsReported: 0,
            quizzesPassed: 0,
            isIdentityVerified: false,
            // Pro status is server-owned (users/{uid}/entitlements/plan) and
            // may not appear in a client write — rules reject it.
            language: "en",
            theme: "light",
            createdAt: new Date().toISOString(),
          }),
          // Send email verification
          sendEmailVerification(user),
          // Global counter: one more registered user
          bumpGlobalStat("totalUsers", 1).catch(() => {}),
        ]);

        setShowVerifyScreen(true);
      }
    } catch (err: any) {
      logger.error(err);
      if (err.message === "auth/timeout") {
        setError("This is taking longer than expected. Check your connection and try again.");
      } else if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered. Please sign in instead.");
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        setError("Invalid email or password.");
      } else if (err.code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a moment and try again.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again.");
      } else {
        setError(err.message || "Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        setResendSuccess(true);
        setTimeout(() => setResendSuccess(false), 5000);
      }
    } catch {
      setError("Could not resend verification. Wait a few minutes and try again.");
    } finally {
      setResendLoading(false);
    }
  };

  const openResetScreen = () => {
    setError(null);
    setResetSent(false);
    setResetResendSuccess(false);
    setShowResetScreen(true);
  };

  const closeResetScreen = () => {
    setShowResetScreen(false);
    setResetSent(false);
    setResetResendSuccess(false);
    setError(null);
  };

  const handleForgotPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    // Track whether this is the initial send or a resend so the UI can flash
    // a "sent again" confirmation instead of just re-rendering the same view.
    const wasAlreadySent = resetSent;

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      if (wasAlreadySent) {
        setResetResendSuccess(true);
        setTimeout(() => setResetResendSuccess(false), 5000);
      }
    } catch (err: any) {
      // Account enumeration defense: for "user-not-found" we deliberately show
      // the same success state as a real send. Only surface errors that don't
      // reveal account existence (bad email format, rate limit).
      if (err.code === "auth/invalid-email") {
        setError("That email address looks invalid.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Wait a few minutes and try again.");
      } else {
        setResetSent(true);
        if (wasAlreadySent) {
          setResetResendSuccess(true);
          setTimeout(() => setResetResendSuccess(false), 5000);
        }
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Check if user exists in Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // Create new user profile with full schema
        await setDoc(userDocRef, {
          uid: user.uid,
          fullName: user.displayName || "User",
          username: user.email?.split("@")[0] || "user",
          email: user.email,
          xp: 0,
          casesScanned: 0,
          scamsReported: 0,
          quizzesPassed: 0,
          isIdentityVerified: false,
          // Pro status is server-owned; rules reject it in client writes.
          language: "en",
          theme: "light",
          createdAt: new Date().toISOString(),
        });

        // Global counter: one more registered user
        await bumpGlobalStat("totalUsers", 1).catch(() => {});
      }

      goAfterAuth();
    } catch (err: any) {
      logger.error(err);
      setError(err.message || "Google Sign-In failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Reset Password Screen ── */
  if (showResetScreen) {
    return (
      <div className="guidr-container no-sidebar items-center justify-center px-6">
        <div className="w-full bg-white rounded-3xl p-8 shadow-sm border border-gray-100 guidr-animate-in flex flex-col items-center">
          {!resetSent ? (
            <>
              {/* Lock icon — "secure account recovery" cue */}
              <div className="w-16 h-16 rounded-full bg-guidr-primary-light flex items-center justify-center mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-guidr-text mb-2 text-center">Reset your password</h2>
              <p className="text-sm text-guidr-muted text-center mb-6 leading-relaxed">
                Enter the email address associated with your account and we&apos;ll send you a link to choose a new password.
              </p>

              {error && (
                <div className="w-full mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="w-full flex flex-col gap-3">
                <div>
                  <label className="block text-sm font-medium text-guidr-text mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-guidr-primary/50"
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-3 mt-2 bg-guidr-primary text-white font-semibold rounded-xl hover:bg-guidr-primary-dark transition-colors disabled:opacity-50"
                >
                  {resetLoading ? "Sending..." : "Send reset link"}
                </button>

                <button
                  type="button"
                  onClick={closeResetScreen}
                  className="w-full py-3 text-guidr-muted font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  Back to Sign In
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Mail/check icon — "we sent it" confirmation */}
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-guidr-text mb-2 text-center">Check your inbox</h2>
              <p className="text-sm text-guidr-muted text-center mb-2 leading-relaxed">
                If an account exists for <strong className="text-guidr-text">{email}</strong>, we&apos;ve sent a password reset link.
              </p>
              <p className="text-xs text-guidr-muted text-center mb-6 leading-relaxed">
                The link expires in 1 hour. Don&apos;t forget to check your spam folder.
              </p>

              {resetResendSuccess && (
                <div className="w-full mb-4 p-3 bg-green-50 border border-green-100 text-green-600 text-sm rounded-xl text-center">
                  Reset link sent again!
                </div>
              )}

              {error && (
                <div className="w-full mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl text-center">
                  {error}
                </div>
              )}

              <button
                onClick={() => handleForgotPassword()}
                disabled={resetLoading}
                className="w-full py-3 mb-3 bg-guidr-primary text-white font-semibold rounded-xl hover:bg-guidr-primary-dark transition-colors disabled:opacity-50"
              >
                {resetLoading ? "Sending..." : "Resend reset link"}
              </button>

              <button
                onClick={closeResetScreen}
                className="w-full py-3 text-guidr-muted font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Back to Sign In
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── Verify Email Screen ── */
  if (showVerifyScreen) {
    return (
      <div className="guidr-container no-sidebar items-center justify-center px-6">
        <div className="w-full bg-white rounded-3xl p-8 shadow-sm border border-gray-100 guidr-animate-in flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-guidr-primary-light flex items-center justify-center mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-guidr-text mb-2 text-center">Verify your email</h2>
          <p className="text-sm text-guidr-muted text-center mb-6 leading-relaxed">
            We&apos;ve sent a verification link to <strong className="text-guidr-text">{email}</strong>.
            Please check your inbox and click the link to activate your account.
          </p>

          {resendSuccess && (
            <div className="w-full mb-4 p-3 bg-green-50 border border-green-100 text-green-600 text-sm rounded-xl text-center">
              Verification email resent successfully!
            </div>
          )}

          {error && (
            <div className="w-full mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleResendVerification}
            disabled={resendLoading}
            className="w-full py-3 mb-3 bg-guidr-primary text-white font-semibold rounded-xl hover:bg-guidr-primary-dark transition-colors disabled:opacity-50"
          >
            {resendLoading ? "Sending..." : "Resend verification email"}
          </button>

          <button
            onClick={() => {
              setShowVerifyScreen(false);
              setIsLogin(true);
              setError(null);
            }}
            className="w-full py-3 text-guidr-muted font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  /* ── Main Auth Form ── */
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

        <h1 className="text-2xl font-bold text-center text-guidr-text mb-2">
          {isLogin ? "Welcome back" : "Create an account"}
        </h1>
        <p className="text-sm text-center text-guidr-muted mb-8">
          {isLogin ? "Sign in to continue to Guidr" : "Join Guidr to investigate and report scams"}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-guidr-text mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-guidr-primary/50"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-guidr-text mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-guidr-primary/50"
                  placeholder="johndoe123"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-guidr-text mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-guidr-primary/50"
              placeholder="you@example.com"
              suppressHydrationWarning
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-guidr-text mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-guidr-primary/50"
                placeholder="••••••••"
                suppressHydrationWarning
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
                  // Eye-off
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  // Eye
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {isLogin && (
              <button
                type="button"
                onClick={openResetScreen}
                className="mt-2 text-sm text-guidr-primary font-medium hover:underline self-start"
              >
                Forgot password?
              </button>
            )}
          </div>

          {/* Password rules (sign-up only) */}
          {!isLogin && password.length > 0 && (
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
            disabled={loading || (!isLogin && !isPasswordValid(password))}
            className="w-full py-3 mt-2 bg-guidr-primary text-white font-semibold rounded-xl hover:bg-guidr-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            suppressHydrationWarning
          >
            {loading ? "Please wait..." : isLogin ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-200"></div>
          <span className="text-sm text-guidr-muted">or continue with</span>
          <div className="flex-1 h-px bg-gray-200"></div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 bg-white border border-gray-200 text-guidr-text font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          suppressHydrationWarning
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l2.85-2.22.83-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.18-4.53z" fill="#EA4335" />
          </svg>
          Google
        </button>

        <p className="mt-8 text-center text-sm text-guidr-muted">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(null); }}
            className="text-guidr-primary font-semibold hover:underline"
            suppressHydrationWarning
          >
            {isLogin ? "Sign Up" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}
