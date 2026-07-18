import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// The scam scanner can run locally without Firebase. Account and cloud-sync
// features activate only after a complete public Firebase web configuration
// has been supplied.
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);

const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let db: Firestore;
try {
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
} catch {
  db = getFirestore(app);
}

let _firestoreEmulatorConnected = false;
if (USE_EMULATOR && !_firestoreEmulatorConnected) {
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    _firestoreEmulatorConnected = true;
  } catch {
    // Already connected (HMR re-eval) — safe to ignore.
  }
}

let _auth: Auth | undefined;
const auth = new Proxy({} as Auth, {
  get(_target, prop) {
    if (!_auth) {
      _auth = getAuth(app);
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
