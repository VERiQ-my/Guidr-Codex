"use client";

/**
 * One-time notification "soft ask" shown after first sign-in.
 *
 * The browser's own permission prompt is precious: Chrome starts auto-blocking
 * it after repeated dismissals, and iOS only allows it from a user gesture in
 * an installed PWA. So we never fire it on page load — we show this branded
 * card once, and only the "Turn on notifications" button calls enablePush()
 * (which runs Notification.requestPermission() inside the tap).
 *
 * Shows only when ALL of these hold:
 *   - a user is signed in (push tokens are stored per-uid)
 *   - the browser supports web push AND permission is still "default"
 *     (on iOS Safari in-browser this is false, so the InstallPrompt banner
 *     does the "install first" step and this card appears in the installed
 *     PWA instead — install-before-push, as iOS requires)
 *   - it has never been shown on this device (any choice marks it seen;
 *     "Maybe later" leaves the opt-in toggles in Settings as the only path)
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import { useToast } from "@/app/context/ToastContext";
import { enablePush, isPushSupported, pushPermission } from "@/lib/messaging";

const SEEN_KEY = "guidr_push_prompt_seen";
// Let the home screen settle before asking — never compete with page load.
const SHOW_DELAY_MS = 1500;

export default function PushPrePrompt() {
  const { user } = useUser();
  const pathname = usePathname();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Auth/marketing surfaces make their own asks — only prompt inside the app.
  const inApp = !(
    pathname === "/login" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/alert")
  );

  useEffect(() => {
    if (!user || !inApp || open) return;

    try {
      if (localStorage.getItem(SEEN_KEY) === "1") return;
    } catch {
      // Storage disabled — without a "seen" flag this would nag every visit.
      return;
    }
    if (pushPermission() !== "default") return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if ((await isPushSupported()) && !cancelled) setOpen(true);
    }, SHOW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, inApp]);

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function dismiss() {
    markSeen();
    setOpen(false);
  }

  async function handleEnable() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const res = await enablePush(user.uid);
      if (res.ok) {
        showToast("Notifications are on. We'll alert you if something looks unsafe.", "success");
      } else if (res.reason === "denied") {
        // The browser prompt was refused — respect it silently; Settings can re-enable.
      } else {
        showToast("Couldn't turn on notifications. You can try again in Settings.", "error");
      }
    } finally {
      setBusy(false);
      markSeen();
      setOpen(false);
    }
  }

  if (!open || !user || !inApp) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 px-4 pb-safe sm:p-6">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 guidr-animate-in">
        <div className="w-14 h-14 rounded-2xl bg-guidr-primary-light border-2 border-guidr-primary/30 flex items-center justify-center mb-4 mx-auto">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-7 h-7 text-guidr-primary"
            aria-hidden="true"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-guidr-text text-center mb-1">
          Don&apos;t miss a warning
        </h2>
        <p className="text-sm text-guidr-muted leading-relaxed text-center max-w-xs mx-auto mb-5">
          Guidr will tell you the moment a scam check finishes, warn you when
          someone you protect runs into trouble, and send one short protection
          tip each evening.
        </p>

        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="w-full py-3.5 bg-guidr-primary text-white font-semibold rounded-2xl hover:bg-guidr-primary-dark active:scale-[0.99] transition disabled:opacity-60"
        >
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="w-full py-3 mt-1 text-sm font-medium text-guidr-muted hover:text-guidr-text transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
