"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  isAppLockArmed,
  hasBiometric,
  verifyPin,
  verifyBiometric,
} from "@/lib/app-lock";

/**
 * App-wide lock screen. When the local app-lock is armed, Guidr locks itself
 * whenever it returns to the foreground after being backgrounded (and on first
 * load), then requires the device PIN or biometric to continue.
 *
 * Fail-open by construction: it only ever covers the app when `isAppLockArmed()`
 * is true, so any storage/crypto issue simply means no lock.
 */
export default function AppLock() {
  const pathname = usePathname();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  // Don't gate the pre-auth/shareable surfaces — locking the login or a shared
  // alert link would be confusing and serves no purpose.
  const isPublic =
    pathname === "/login" || pathname === "/onboarding" || pathname.startsWith("/alert");

  // Lock on first mount if armed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isPublic && isAppLockArmed()) setLocked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-lock when the app comes back to the foreground.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && !isPublic && isAppLockArmed()) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isPublic]);

  const unlock = useCallback(() => {
    setPin("");
    setError(false);
    setLocked(false);
  }, []);

  async function submitPin() {
    if (await verifyPin(pin)) {
      unlock();
    } else {
      setError(true);
      setPin("");
    }
  }

  const tryBiometric = useCallback(async () => {
    setBioBusy(true);
    try {
      if (await verifyBiometric()) unlock();
    } finally {
      setBioBusy(false);
    }
  }, [unlock]);

  // Offer biometric immediately when the lock appears, if registered.
  useEffect(() => {
    if (locked && hasBiometric()) {
      // tryBiometric only flips `locked` on success — a deliberate, user-gated
      // transition, not a cascading render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void tryBiometric();
    }
  }, [locked, tryBiometric]);

  if (!locked || isPublic) return null;

  const biometricAvailable = hasBiometric();

  return (
    <div className="fixed inset-0 z-[300] bg-[#0f172a] text-white flex flex-col items-center justify-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 className="text-xl font-bold mb-1">Guidr is locked</h2>
      <p className="text-sm text-white/60 mb-8 text-center">
        Enter your PIN{biometricAvailable ? " or use biometrics" : ""} to continue.
      </p>

      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => {
          setError(false);
          setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && pin.length >= 4) submitPin();
        }}
        placeholder="••••"
        className={`w-44 text-center text-2xl tracking-[0.5em] py-3 rounded-xl bg-white/10 border ${
          error ? "border-red-400" : "border-white/20"
        } focus:outline-none focus:border-white/60 placeholder:text-white/30`}
      />
      {error && <p className="text-sm text-red-300 mt-3">Incorrect PIN. Try again.</p>}

      <button
        onClick={submitPin}
        disabled={pin.length < 4}
        className="w-44 mt-6 py-3 rounded-xl bg-white text-[#0f172a] font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
      >
        Unlock
      </button>

      {biometricAvailable && (
        <button
          onClick={tryBiometric}
          disabled={bioBusy}
          className="mt-4 flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 11a2 2 0 0 0-2 2c0 1 .5 3 .5 5" />
            <path d="M14.5 13c0 3 .5 4.5 1 6" />
            <path d="M5.5 11a6.5 6.5 0 0 1 11-2" />
            <path d="M3.5 9a9 9 0 0 1 14 1" />
          </svg>
          {bioBusy ? "Waiting…" : "Use biometrics"}
        </button>
      )}
    </div>
  );
}
