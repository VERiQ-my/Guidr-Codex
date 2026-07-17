"use client";

/**
 * In-app "Install Guidr" prompt.
 *
 * On Android/Chrome we capture the `beforeinstallprompt` event and offer a
 * one-tap Install button. iOS Safari has no such event, so we instead show the
 * manual "Share → Add to Home Screen" steps (installing is also what unlocks
 * web push / Guardian Alerts on iPhone).
 *
 * The banner hides itself when already installed (standalone display) and stays
 * dismissed for a while once the user closes it, so it never nags.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "guidr_install_dismissed_at";
// Re-offer after a week if the user dismissed but didn't install.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"none" | "android" | "ios">("none");
  const pathname = usePathname();

  // Keep onboarding and sign-in to one decision per screen: the listeners
  // below still capture beforeinstallprompt there, but the banner itself
  // waits until the user is inside the app.
  const suppressed = pathname === "/onboarding" || pathname === "/login";

  useEffect(() => {
    // Respect a recent dismissal.
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < SNOOZE_MS) return;

    // Already running as an installed app → nothing to prompt.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const ua = navigator.userAgent || "";
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // Only real Safari can Add to Home Screen — Chrome/Firefox/Edge on iOS can't.
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

    if (isIos && isSafari) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("ios");
      return;
    }

    const onPrompt = (e: Event) => {
      // Stop Chrome's default mini-infobar so we can show our own UI instead.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // If the app gets installed, drop the prompt immediately.
    const onInstalled = () => {
      setMode("none");
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setMode("none");
    setDeferred(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (mode === "none" || suppressed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pb-safe pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-start gap-3 guidr-animate-in">
        <div className="bg-guidr-primary-light/40 p-2 rounded-xl shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-guidr-text">Install Guidr</p>
          {mode === "android" ? (
            <p className="text-xs text-guidr-muted mt-0.5 leading-relaxed">
              Add Guidr to your home screen for faster access and instant Guardian Alerts.
            </p>
          ) : (
            <p className="text-xs text-guidr-muted mt-0.5 leading-relaxed">
              To install and enable alerts on iPhone: tap the{" "}
              <strong className="text-guidr-text">Share</strong> button, then{" "}
              <strong className="text-guidr-text">Add to Home Screen</strong>.
            </p>
          )}

          {mode === "android" && (
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={install}
                className="flex-1 py-2 rounded-lg bg-guidr-primary text-white text-xs font-bold hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
              >
                Install
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="py-2 px-3 rounded-lg border border-gray-200 text-guidr-muted text-xs font-semibold hover:bg-gray-50 transition-colors"
              >
                Not now
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="shrink-0 text-guidr-muted hover:text-guidr-text p-1 -mt-1 -mr-1 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
