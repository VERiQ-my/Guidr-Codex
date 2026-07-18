"use client";

import { ReactNode } from "react";
import { UserProvider } from "@/app/context/UserContext";
import { PrefsProvider } from "@/app/context/PrefsContext";

/**
 * Minimal provider tree for the Home + Analytics port. The full app also mounts
 * ToastProvider, the service worker, push, app-lock, install-prompt and the
 * splash LoadingScreen here — all out of scope and omitted.
 */
export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <PrefsProvider>{children}</PrefsProvider>
    </UserProvider>
  );
}
