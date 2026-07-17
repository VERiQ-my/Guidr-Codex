/* global importScripts, firebase */
/**
 * Guidr service worker: web push (Firebase Cloud Messaging) + offline shell.
 *
 * PUSH: handles notifications when the app is in the background or closed.
 * The Firebase config is passed in as query params at registration time
 * (see lib/messaging.ts) because service workers can't read process.env.
 *
 * OFFLINE: a deliberately small caching layer —
 *   - immutable hashed assets (/_next/static, /icons) are cache-first;
 *   - page navigations are network-first, falling back to /offline.html;
 *   - nothing else (API calls, auth, Firestore) is ever cached.
 * The push handlers below must stay independent of this layer: Guardian
 * Alerts are the product's core and must survive any caching bug.
 */

// Bump to invalidate old caches on deploy of this file.
const STATIC_CACHE = "guidr-static-v4";
// Canonical URL: Cloudflare's asset handling 307-redirects "/offline.html"
// to "/offline", and a redirected response can't be replayed for a
// navigation (Chrome rejects it) — so cache and serve the final URL.
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll([OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/badge-96.png"])
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("guidr-") && k !== STATIC_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Immutable build assets: serve from cache, fill the cache from the network.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  // Page navigations: always prefer the network (the app is live data), but
  // show the branded offline page instead of the browser error when it fails.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
  // Everything else (APIs, Firestore, analytics) goes straight to the network.
});

importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

// Pull the (public) Firebase config from this worker's own URL query string.
const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
};

/**
 * Per-type presentation presets. Senders set data.type (see lib/push.ts);
 * unknown or missing types (e.g. pushes from older admin builds) fall back
 * to "default". Everything here degrades gracefully: iOS ignores images,
 * actions and vibration and just shows icon + title + body.
 */
const PUSH_PRESETS = {
  // A ward hit a real scam — the loudest thing Guidr ever sends.
  "guardian-alert": {
    tag: "guidr-guardian-alert",
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    image: "/icons/push-alert.png",
    actions: [
      { action: "open", title: "See what happened" },
      { action: "dismiss", title: "Dismiss" },
    ],
  },
  // A ward saw something suspicious but not confirmed dangerous.
  "guardian-notice": {
    tag: "guidr-guardian-notice",
    renotify: true,
    vibrate: [150, 75, 150],
    image: "/icons/push-notice.png",
    actions: [
      { action: "open", title: "Take a look" },
      { action: "dismiss", title: "Dismiss" },
    ],
  },
  // Somebody accepted a guardian invite. Good news, so it's warm and quiet:
  // one soft buzz, no alert imagery, no interaction required.
  "guardian-linked": {
    tag: "guidr-guardian-linked",
    vibrate: [100],
    actions: [{ action: "open", title: "See your guardians" }],
  },
  // Weekly Guardian check-in; calm by design.
  "guardian-digest": {
    tag: "guidr-guardian-digest",
    vibrate: [100],
    image: "/icons/push-digest.png",
    actions: [{ action: "open", title: "See the week" }],
  },
  // Daily habit nudge; deliberately the quietest preset. Its shared tag means
  // today's reminder replaces yesterday's unread one instead of piling up.
  daily: {
    tag: "guidr-daily",
    vibrate: [100],
  },
  // Admin scam warnings / announcements; may carry its own data.image.
  broadcast: {
    tag: "guidr-broadcast",
    renotify: true,
    vibrate: [150, 75, 150],
    actions: [
      { action: "open", title: "Read more" },
      { action: "dismiss", title: "Dismiss" },
    ],
  },
  default: {
    tag: "guidr-alert",
    vibrate: [150, 75, 150],
  },
};

if (firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Show a notification for data/background messages.
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const preset = PUSH_PRESETS[data.type] || PUSH_PRESETS.default;
    const title = payload.notification?.title || data.title || "Guidr Alert";
    const options = {
      body: payload.notification?.body || data.body || "",
      icon: "/icons/icon-192.png",
      // Monochrome white-on-transparent glyph: Android masks the badge to its
      // alpha channel, so a full-colour icon here renders as a grey blob.
      badge: "/icons/badge-96.png",
      tag: data.tag || preset.tag,
      renotify: !!preset.renotify,
      requireInteraction: !!preset.requireInteraction,
      vibrate: preset.vibrate,
      timestamp: Date.now(),
      data: { url: payload.fcmOptions?.link || data.url || "/" },
    };
    // Hero banner (Chrome on Android/desktop). A sender-supplied image wins
    // over the preset's, so broadcasts can ship scam screenshots.
    const image = data.image || preset.image;
    if (image) options.image = image;
    if (preset.actions && Notification.maxActions > 0) {
      options.actions = preset.actions.slice(0, Notification.maxActions);
    }
    self.registration.showNotification(title, options);
  });
}

// Focus or open the app when a notification (or its action button) is clicked.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
