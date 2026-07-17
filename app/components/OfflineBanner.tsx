"use client";

/**
 * Persistent banner shown whenever the device loses its network connection,
 * so users understand why scans / saves aren't working instead of hitting a
 * silent failure. Hidden while online.
 */

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[150] bg-amber-500 text-white text-xs font-semibold text-center px-4 pb-2 pt-safe-top"
    >
      You&apos;re offline. Some features won&apos;t work until you reconnect.
    </div>
  );
}
