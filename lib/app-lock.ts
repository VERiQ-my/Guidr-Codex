"use client";

/**
 * Local app-lock: a PIN (and optional device biometric) that gates opening
 * Guidr after it's been backgrounded. This is a *local* gate, not an auth
 * boundary — secrets live in localStorage on the device and biometric checks
 * are verified client-side. Its job is to stop someone who grabs an unlocked
 * phone from reading the owner's scans, not to replace Firebase auth.
 *
 * Design principle: fail OPEN. If anything here throws or the platform lacks a
 * capability, the app stays usable rather than locking the owner out.
 */

const ENABLED_KEY = "guidr_applock";
const SALT_KEY = "guidr_applock_salt";
const PIN_KEY = "guidr_applock_pin";
const BIO_KEY = "guidr_applock_biometric_id";

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const a = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const a = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(a);
  return a;
}

/* ── Enabled flag ── */

export function isAppLockEnabled(): boolean {
  return ls()?.getItem(ENABLED_KEY) === "1";
}

/** True only when lock is enabled AND a usable secret exists to unlock with. */
export function isAppLockArmed(): boolean {
  return isAppLockEnabled() && (hasPin() || hasBiometric());
}

/* ── PIN ── */

export function hasPin(): boolean {
  return !!ls()?.getItem(PIN_KEY);
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toB64(digest);
}

/** Store a PIN (hashed with a per-device salt) and arm the lock. */
export async function setPin(pin: string): Promise<void> {
  const store = ls();
  if (!store) throw new Error("Storage unavailable on this device.");
  let salt = store.getItem(SALT_KEY);
  if (!salt) {
    salt = toB64(randomBytes(16).buffer);
    store.setItem(SALT_KEY, salt);
  }
  store.setItem(PIN_KEY, await hashPin(pin, salt));
  store.setItem(ENABLED_KEY, "1");
}

export async function verifyPin(pin: string): Promise<boolean> {
  const store = ls();
  const salt = store?.getItem(SALT_KEY);
  const stored = store?.getItem(PIN_KEY);
  if (!salt || !stored) return false;
  try {
    return (await hashPin(pin, salt)) === stored;
  } catch {
    return false;
  }
}

/* ── Biometric (WebAuthn platform authenticator) ── */

export function hasBiometric(): boolean {
  return !!ls()?.getItem(BIO_KEY);
}

export function biometricSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

/**
 * Register this device's biometric (Face ID / fingerprint) as an unlock
 * method. Returns false if unsupported or the user cancels.
 */
export async function registerBiometric(): Promise<boolean> {
  if (!biometricSupported()) return false;
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: "Guidr" },
        user: { id: randomBytes(16), name: "guidr-app-lock", displayName: "Guidr" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    ls()?.setItem(BIO_KEY, toB64(cred.rawId));
    ls()?.setItem(ENABLED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Prompt for the device biometric and resolve true on a successful local
 * verification. As a local gate we accept a successful assertion ceremony
 * (the platform already enforced user verification) without a server check.
 */
export async function verifyBiometric(): Promise<boolean> {
  const id = ls()?.getItem(BIO_KEY);
  if (!id || !biometricSupported()) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: "public-key", id: fromB64(id) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

/* ── Teardown ── */

export function clearAppLock(): void {
  const store = ls();
  if (!store) return;
  store.removeItem(ENABLED_KEY);
  store.removeItem(PIN_KEY);
  store.removeItem(BIO_KEY);
  store.removeItem(SALT_KEY);
}
