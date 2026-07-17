"use client";

/**
 * Client-side Firebase Cloud Messaging (web push) for Guidr Guardian Alerts.
 *
 * Flow:
 *   1. enablePush(uid) — ask the browser for notification permission, register
 *      our service worker, mint an FCM token, and store it on the user profile.
 *   2. onForegroundMessage(cb) — receive pushes while the app/tab is focused
 *      (background pushes are handled by public/firebase-messaging-sw.js).
 *
 * The service worker can't read process.env, so we hand it the (public)
 * Firebase config as query params on its registration URL.
 */

import { logger } from "./logger";
import { getMessaging, getToken, onMessage, isSupported, type MessagePayload } from "firebase/messaging";
import { app } from "./firebase";
import { registerPushToken } from "./firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/** Whether this browser can do web push at all. */
export async function isPushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/** Current permission state without prompting. */
export function pushPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Register the messaging service worker, passing config via query string, and
 * wait until it has an **activated** worker.
 *
 * `register()` resolves as soon as registration starts — the worker may still
 * be "installing", which makes FCM's getToken() fail with
 * "Subscription failed - no active Service Worker". We therefore wait for an
 * active+activated worker before returning.
 *
 * Guarded by a timeout so a worker that never installs (e.g. importScripts
 * blocked) surfaces a clear error instead of hanging the Enable button.
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const params = new URLSearchParams(
    Object.entries(firebaseConfig).filter(([, v]) => Boolean(v)) as [string, string][]
  );
  const swUrl = `/firebase-messaging-sw.js?${params.toString()}`;
  const registration = await navigator.serviceWorker.register(swUrl, { scope: "/" });

  // Wait for an activated worker, or fail loudly after 10s.
  await Promise.race([
    waitForActivation(registration),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Service worker did not activate within 10s")),
        10_000
      )
    ),
  ]);

  return registration;
}

/** Resolves once `registration` has a worker in the "activated" state. */
async function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active && registration.active.state === "activated") return;

  const worker = registration.installing || registration.waiting || registration.active;
  if (worker) {
    await new Promise<void>((resolve, reject) => {
      const onStateChange = () => {
        if (worker.state === "activated") {
          worker.removeEventListener("statechange", onStateChange);
          resolve();
        } else if (worker.state === "redundant") {
          // The worker failed to install (e.g. a script error in the SW).
          worker.removeEventListener("statechange", onStateChange);
          reject(new Error("Service worker became redundant (install failed)"));
        }
      };
      if (worker.state === "activated") return resolve();
      worker.addEventListener("statechange", onStateChange);
    });
  }

  // navigator.serviceWorker.ready resolves once an active worker controls scope.
  await navigator.serviceWorker.ready;
}

/**
 * Best-effort SW registration at app load, so the offline shell (fetch
 * handler in firebase-messaging-sw.js) works for everyone — not only users
 * who enabled push. Uses the SAME config-in-query-string URL as the push
 * flow: registering a different URL on this scope would replace an existing
 * push-configured worker and silently break Guardian Alerts.
 */
export function ensureServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  registerServiceWorker().catch((err) => {
    logger.warn("[messaging] background SW registration failed:", err?.message || err);
  });
}

export interface EnablePushResult {
  ok: boolean;
  reason?: "unsupported" | "denied" | "no-vapid" | "error";
  token?: string;
  /** Underlying error message when reason === "error" (for diagnostics). */
  detail?: string;
}

/**
 * Prompt for permission, get an FCM token, and persist it for `uid`.
 * Safe to call repeatedly — re-registering simply refreshes the token.
 */
export async function enablePush(uid: string): Promise<EnablePushResult> {
  if (!(await isPushSupported())) return { ok: false, reason: "unsupported" };
  if (!VAPID_KEY) {
    logger.warn("[Guidr Push] Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY");
    return { ok: false, reason: "no-vapid" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    const registration = await registerServiceWorker();
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) return { ok: false, reason: "error", detail: "No token returned" };

    await registerPushToken(uid, token);
    return { ok: true, token };
  } catch (err) {
    logger.error("[Guidr Push] enablePush failed:", err);
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Silent token refresh at app load: if the browser has ALREADY granted
 * notification permission, mint the current token and persist it. Never
 * prompts — enablePush stays the explicit opt-in path.
 *
 * Without this, a token that rotates or gets pruned from
 * users/{uid}.fcmTokens (stale-token cleanup, server-side pruning) is only
 * restored if the user manually re-enables push in Settings, and the device
 * silently stops receiving Guardian Alerts until then.
 */
export async function refreshPushToken(uid: string): Promise<void> {
  try {
    if (!(await isPushSupported())) return;
    if (!VAPID_KEY || Notification.permission !== "granted") return;
    const registration = await registerServiceWorker();
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) await registerPushToken(uid, token);
  } catch (err) {
    logger.warn(
      "[Guidr Push] token refresh failed:",
      err instanceof Error ? err.message : err
    );
  }
}

/** Subscribe to foreground messages (tab focused). Returns an unsubscribe fn. */
export async function onForegroundMessage(
  cb: (payload: MessagePayload) => void
): Promise<() => void> {
  if (!(await isPushSupported())) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, cb);
}
