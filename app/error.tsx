"use client";

/**
 * Root route error boundary. Catches uncaught render/runtime errors in any page
 * and shows a friendly recovery screen instead of a blank/broken view — so a
 * crash is never silent or dead-ends the user.
 */

import { logger } from "@/lib/logger";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error for diagnostics (and any future monitoring hook).
    logger.error("[Guidr] Unhandled error:", error);
  }, [error]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center text-center px-6 bg-guidr-bg">
      <div className="bg-red-50 p-3 rounded-2xl mb-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h1 className="text-lg font-bold text-guidr-text mb-1">Something went wrong</h1>
      <p className="text-sm text-guidr-muted max-w-xs mb-6 leading-relaxed">
        Guidr hit an unexpected error. Your data is safe. Try again, and if it
        keeps happening, reload the app.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2.5 rounded-xl bg-guidr-primary text-white text-sm font-semibold hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => (window.location.href = "/")}
          className="px-5 py-2.5 rounded-xl border border-gray-200 text-guidr-muted text-sm font-semibold hover:bg-gray-50 transition-colors"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
