"use client";

import { useEffect } from "react";
import { useUser } from "@/app/context/UserContext";
import { refreshPushToken } from "@/lib/messaging";

/**
 * Silently re-registers this device's FCM token whenever a signed-in user
 * loads the app with notification permission already granted (see
 * refreshPushToken in lib/messaging.ts). Renders nothing.
 */
export default function PushTokenRefresh() {
  const { user } = useUser();

  useEffect(() => {
    if (!user?.uid) return;
    refreshPushToken(user.uid);
  }, [user?.uid]);

  return null;
}
