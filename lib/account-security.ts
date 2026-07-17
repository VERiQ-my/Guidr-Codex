"use client";

/**
 * Client helpers for the Privacy & Security page: device/session identity,
 * password changes, auth-provider detection, security-health derivation, and
 * authenticated calls to the /api/account/* server routes (export, delete,
 * revoke sessions).
 */

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendEmailVerification,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  type RecaptchaVerifier,
  type MultiFactorInfo,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "./firebase";
import type { UserProfile } from "./firestore";

/* ── Authenticated fetch (shared shape with lib/guardians.ts) ── */

async function authedFetch(url: string, body?: unknown) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

/* ── Device identity ── */

const SESSION_KEY = "guidr_session_id";

/** Stable per-device id, generated once and kept in localStorage. */
export function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
        `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Storage disabled — fall back to an ephemeral per-load id.
    return `s_${Date.now().toString(36)}`;
  }
}

export interface ParsedDevice {
  device: string;
  os: string;
  browser: string;
}

/**
 * Best-effort, dependency-free user-agent parse — enough to label a device in
 * the sign-in history ("Chrome on Windows", "iPhone", "Pixel"). Not exhaustive.
 */
export function parseDevice(ua: string): ParsedDevice {
  const s = ua || "";

  let os = "Unknown device";
  if (/iPhone/.test(s)) os = "iPhone";
  else if (/iPad/.test(s)) os = "iPad";
  else if (/Android/.test(s)) {
    const m = s.match(/Android[^;]*;\s([^;)]+)/);
    os = m ? m[1].trim() : "Android";
  } else if (/Windows NT/.test(s)) os = "Windows";
  else if (/Mac OS X/.test(s)) os = "Mac";
  else if (/Linux/.test(s)) os = "Linux";
  else if (/CrOS/.test(s)) os = "Chromebook";

  let browser = "Browser";
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/Chrome\//.test(s)) browser = "Chrome";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Safari\//.test(s)) browser = "Safari";

  // iPhone/iPad already read as the device; otherwise pair browser + OS.
  const device = /iPhone|iPad/.test(s) ? os : `${browser} on ${os}`;
  return { device, os, browser };
}

/* ── Auth providers ── */

export type ProviderKind = "password" | "google" | "phone" | "other";

/** Which sign-in methods are linked to the current account. */
export function getLinkedProviders(user: FirebaseUser | null = auth.currentUser): ProviderKind[] {
  if (!user) return [];
  return user.providerData.map((p) => {
    switch (p.providerId) {
      case "password":
        return "password";
      case "google.com":
        return "google";
      case "phone":
        return "phone";
      default:
        return "other";
    }
  });
}

export function hasPasswordProvider(user: FirebaseUser | null = auth.currentUser): boolean {
  return getLinkedProviders(user).includes("password");
}

/** Number of enrolled second factors (SMS MFA) on the current account. */
export function enrolledFactorCount(user: FirebaseUser | null = auth.currentUser): number {
  if (!user) return 0;
  // multiFactor() is only meaningful with Identity Platform; guard defensively.
  return (user as unknown as { multiFactor?: { enrolledFactors?: unknown[] } }).multiFactor
    ?.enrolledFactors?.length ?? 0;
}

/* ── Change password ── */

/**
 * Re-authenticate with the current password, then set a new one. Throws a
 * friendly Error on the common Firebase failure codes.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("Not signed in");
  if (!hasPasswordProvider(user)) {
    throw new Error("This account signs in with Google, so it has no password to change.");
  }
  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");

  try {
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPassword);
  } catch (e) {
    const code = (e as { code?: string })?.code || "";
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      throw new Error("Current password is incorrect.");
    }
    if (code === "auth/weak-password") throw new Error("Choose a stronger password.");
    if (code === "auth/too-many-requests") {
      throw new Error("Too many attempts. Please wait a moment and try again.");
    }
    if (code === "auth/requires-recent-login") {
      throw new Error("For security, please sign out and back in, then try again.");
    }
    throw e instanceof Error ? e : new Error("Couldn't change your password.");
  }
}

/* ── Two-factor (SMS MFA via Firebase Identity Platform) ── */

/**
 * Turn the assorted Firebase MFA error codes into messages a non-technical
 * user can act on. The most important one is `operation-not-allowed`, which
 * means SMS MFA isn't enabled on the Firebase project (an admin must turn on
 * Identity Platform multi-factor in the console).
 */
function mapMfaError(e: unknown): Error {
  const code = (e as { code?: string })?.code || "";
  switch (code) {
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      return new Error("Two-factor isn't enabled on this app yet. Please try again later.");
    case "auth/unverified-email":
      return new Error("Verify your email address before enabling two-factor.");
    case "auth/requires-recent-login":
      return new Error("For security, please sign out and back in, then try again.");
    case "auth/invalid-verification-code":
      return new Error("That code wasn't right. Check the SMS and try again.");
    case "auth/code-expired":
      return new Error("That code expired. Request a new one.");
    case "auth/invalid-phone-number":
      return new Error("Enter a valid phone number in international format.");
    case "auth/too-many-requests":
      return new Error("Too many attempts. Please wait a moment and try again.");
    default:
      return e instanceof Error ? e : new Error("Couldn't set up two-factor. Please try again.");
  }
}

export function getEnrolledFactors(user: FirebaseUser | null = auth.currentUser): MultiFactorInfo[] {
  if (!user) return [];
  try {
    return multiFactor(user).enrolledFactors;
  } catch {
    return [];
  }
}

/** Send a verification email (MFA enrollment requires a verified address). */
export async function sendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await sendEmailVerification(user);
}

/**
 * Step 1 of SMS-MFA enrollment: send an OTP to `phoneE164`. Returns the
 * verificationId needed to complete enrollment. `recaptcha` is an
 * already-rendered (invisible) RecaptchaVerifier owned by the caller.
 */
export async function startMfaEnrollment(phoneE164: string, recaptcha: RecaptchaVerifier): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  try {
    const session = await multiFactor(user).getSession();
    const provider = new PhoneAuthProvider(auth);
    return await provider.verifyPhoneNumber({ phoneNumber: phoneE164, session }, recaptcha);
  } catch (e) {
    throw mapMfaError(e);
  }
}

/** Step 2: confirm the SMS code and enroll the phone as a second factor. */
export async function finishMfaEnrollment(
  verificationId: string,
  code: string,
  displayName = "Phone"
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  try {
    const cred = PhoneAuthProvider.credential(verificationId, code);
    const assertion = PhoneMultiFactorGenerator.assertion(cred);
    await multiFactor(user).enroll(assertion, displayName);
  } catch (e) {
    throw mapMfaError(e);
  }
}

/** Remove all enrolled second factors (disable two-factor). */
export async function disableMfa(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  try {
    const factors = multiFactor(user).enrolledFactors;
    for (const f of factors) {
      await multiFactor(user).unenroll(f);
    }
  } catch (e) {
    throw mapMfaError(e);
  }
}

/* ── Server actions ── */

export interface AccountExport {
  exportedAt: string;
  [key: string]: unknown;
}

/**
 * Pull every piece of the signed-in user's data. The caller renders this
 * as a plain-language PDF (see lib/data-export-pdf.ts) — never raw JSON.
 */
export function exportMyData(): Promise<AccountExport> {
  return authedFetch("/api/account/export");
}

/** Revoke every session except the current device, then return. */
export function revokeOtherSessions(): Promise<{ ok: true; revoked: number }> {
  return authedFetch("/api/account/sessions/revoke", { sessionId: getSessionId() });
}

/** Permanently delete the account and all associated data. */
export function deleteMyAccount(): Promise<{ ok: true }> {
  return authedFetch("/api/account/delete");
}

/* ── Security health ── */

export interface HealthCheck {
  key: string;
  label: string;
  ok: boolean;
  /** When false, ok===false should read as a warning (amber) not a gap. */
  warn?: boolean;
}

export interface SecurityHealth {
  enabled: number;
  total: number;
  level: "strong" | "fair" | "weak";
  headline: string;
  checks: HealthCheck[];
}

/**
 * Derive the security-health summary shown in the hero from real account
 * state. Five protections: sign-in secured, email verified, app lock,
 * two-factor, and a recovery (guardian) contact.
 */
export function deriveSecurityHealth(opts: {
  profile: Pick<UserProfile, "appLockEnabled" | "mfaEnabled"> | null;
  emailVerified: boolean;
  hasPassword: boolean;
  factorCount: number;
  sessionCount: number;
  trustedContactCount: number;
}): SecurityHealth {
  // Prefer Firebase's live enrolled-factor count; fall back to the profile
  // mirror if the SDK can't report it (e.g. Identity Platform not available).
  const twoFactor = opts.factorCount > 0 || !!opts.profile?.mfaEnabled;
  const checks: HealthCheck[] = [
    {
      key: "signin",
      label: opts.hasPassword ? "Password set" : "Google sign-in",
      ok: true,
    },
    { key: "email", label: opts.emailVerified ? "Email verified" : "Email unverified", ok: opts.emailVerified, warn: true },
    { key: "applock", label: opts.profile?.appLockEnabled ? "App lock on" : "App lock off", ok: !!opts.profile?.appLockEnabled, warn: true },
    { key: "2fa", label: twoFactor ? "Two-factor on" : "2FA disabled", ok: twoFactor, warn: true },
    {
      key: "recovery",
      label: opts.trustedContactCount > 0 ? "Recovery contact set" : "No recovery contact",
      ok: opts.trustedContactCount > 0,
      warn: true,
    },
  ];

  const enabled = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const level: SecurityHealth["level"] = enabled >= 4 ? "strong" : enabled >= 3 ? "fair" : "weak";
  const headline =
    level === "strong" ? "Strong protection" : level === "fair" ? "Fair protection" : "Needs attention";

  return { enabled, total, level, headline, checks };
}
