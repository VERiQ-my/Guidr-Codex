"use client";

import { ReactNode, Suspense, useEffect } from "react";
import { ensureServiceWorker } from "@/lib/messaging";
import { UserProvider } from "@/app/context/UserContext";
import { PrefsProvider } from "@/app/context/PrefsContext";
import { ToastProvider } from "@/app/context/ToastContext";
import LoadingScreen from "@/app/components/LoadingScreen";
import InstallPrompt from "@/app/components/InstallPrompt";
import OfflineBanner from "@/app/components/OfflineBanner";
import AppLock from "@/app/components/AppLock";
import UpgradeCelebration from "@/app/components/UpgradeCelebration";
import PushTokenRefresh from "@/app/components/PushTokenRefresh";
import ForegroundPush from "@/app/components/ForegroundPush";
import PushPrePrompt from "@/app/components/PushPrePrompt";

export default function ClientProviders({ children }: { children: ReactNode }) {
  // Register the service worker for everyone (offline shell + asset cache);
  // push enablement later reuses this same registration.
  useEffect(() => {
    ensureServiceWorker();
  }, []);

  return (
    <UserProvider>
      <PrefsProvider>
        <ToastProvider>
          <LoadingScreen />
          <OfflineBanner />
          <PushTokenRefresh />
          <ForegroundPush />
          {children}
          <AppLock />
          <PushPrePrompt />
          <InstallPrompt />
          <Suspense fallback={null}>
            <UpgradeCelebration />
          </Suspense>
        </ToastProvider>
      </PrefsProvider>
    </UserProvider>
  );
}
