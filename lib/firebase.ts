import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Explicit opt-in flag — never auto-detect off NODE_ENV alone, since that
// would make `npm run dev` silently talk to prod, which is worse than
// either always-prod or always-emulator: it's invisible.
const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Auto-detect long-polling. On networks/proxies that block Firestore's
// streaming WebChannel, the default transport silently retries for tens of
// seconds before falling back — which shows up as a painfully slow first
// read/write (sign-in, profile load) while the Google popup path stays fast.
// Auto-detect probes the working transport up front and keeps streaming
// wherever it's available. initializeFirestore throws if settings were
// already applied (e.g. an HMR re-eval), so fall back to the existing handle.
let db: Firestore;
try {
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
} catch {
  db = getFirestore(app);
}

// Connect to the local emulator immediately after db is created and before
// any read/write happens elsewhere in the app. Guarded with a module-level
// flag because connectFirestoreEmulator throws if called twice (e.g. on
// Next.js HMR re-eval) or after Firestore has already opened a connection.
let _firestoreEmulatorConnected = false;
if (USE_EMULATOR && !_firestoreEmulatorConnected) {
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    _firestoreEmulatorConnected = true;
  } catch {
    // Already connected (HMR re-eval) — safe to ignore.
  }
}

// getAuth() validates the API key the instant it runs and throws
// `auth/invalid-api-key` if it's missing. During a static build/prerender
// (e.g. Next's /_not-found page) the NEXT_PUBLIC_* vars can be absent, which
// would crash the whole build. Auth is only ever touched at runtime in the
// browser (inside effects/handlers), so we initialize it lazily on first
// access via a proxy — keeping module evaluation and prerender safe.
let _auth: Auth | undefined;
const auth = new Proxy({} as Auth, {
  get(_target, prop) {
    if (!_auth) {
      _auth = getAuth(app);
      // Connect the emulator right here, at the moment auth is actually
      // created — not at module load, since _auth doesn't exist yet then.
      // This runs exactly once, the first time anything touches `auth`.
      if (USE_EMULATOR) {
        try {
          connectAuthEmulator(_auth, "http://localhost:9099");
        } catch {
          // Already connected (HMR re-eval) — safe to ignore.
        }
      }
    }
    const value = _auth[prop as keyof Auth];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(_auth) : value;
  },
  set(_target, prop, value) {
    _auth ??= getAuth(app);
    (_auth as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  },
});

export { app, db, auth };