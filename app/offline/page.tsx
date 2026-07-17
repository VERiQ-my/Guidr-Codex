import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're offline",
};

/**
 * The service worker caches this route as its navigation fallback. It must be
 * a real `/offline` response (rather than a redirect to public/offline.html),
 * because redirected responses cannot be replayed for browser navigations.
 */
export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-guidr-bg flex items-center justify-center p-6">
      <section className="w-full max-w-[360px] rounded-[20px] bg-white px-7 py-9 text-center shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-guidr-primary-light text-guidr-primary">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z" />
          </svg>
        </div>
        <h1 className="mb-2.5 text-xl font-bold text-guidr-text">You&apos;re offline</h1>
        <p className="mb-6 text-sm leading-relaxed text-guidr-muted">
          Guidr needs an internet connection to scan messages and reach your guardians. Reconnect and try again.
        </p>
        <a href="/" className="block w-full rounded-xl bg-guidr-primary px-4 py-3.5 text-[15px] font-semibold text-white">
          Try again
        </a>
        <p className="mt-[18px] text-xs leading-relaxed text-guidr-muted">
          Offline safety tip: <strong className="text-guidr-text">never rush</strong>. A real bank or agency will never pressure you to act in minutes. If in doubt, call NSRC at <strong className="text-guidr-text">997</strong>.
        </p>
      </section>
    </main>
  );
}
