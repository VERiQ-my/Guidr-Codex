"use client";

/**
 * Client helpers for Guardian Alerts: verifying your own phone via OTP, and
 * authenticated calls to the server guardian routes.
 */

import { parsePhoneNumberFromString } from "libphonenumber-js";
import { auth, db } from "./firebase";
import { doc, updateDoc } from "firebase/firestore";

/** Attach the caller's Firebase ID token to a fetch as a Bearer header. */
async function authedFetch(url: string, body: unknown) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

/* ── Phone number (self-entered, no OTP on the free plan) ── */

/**
 * Normalize a user-entered phone to E.164 (e.g. "0175899714" → "+60175899714").
 * Defaults to Malaysia (MY) when no country code is given. Returns null if the
 * number can't be parsed/validated.
 */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), "MY");
  return parsed && parsed.isValid() ? parsed.number : null;
}

/**
 * Save the signed-in user's own phone (E.164) on their profile so others can
 * add them as a guardian. Not OTP-verified — phoneVerified stays false.
 * Returns the normalized number, or throws on an invalid input.
 */
export async function saveMyPhone(input: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const e164 = normalizePhone(input);
  if (!e164) throw new Error("Enter a valid phone number, e.g. 0175899714 or +60175899714");
  await updateDoc(doc(db, "users", user.uid), { phone: e164, phoneVerified: false });
  return e164;
}

/* ── Guardian requests ── */

export interface GuardianRequestResult {
  linkStatus?: "none" | "invited" | "pending" | "active";
  message?: string;
  guardianUid?: string;
  linkId?: string;
  /** Present when linkStatus is "invited": the URL to share with them. */
  inviteUrl?: string;
}

/** Ward asks the person at `phone` to be their guardian. Phone is normalized
 *  to E.164 (Malaysia default) before matching. If they have no Guidr account,
 *  the server returns a share-link invite instead of failing. */
export function requestGuardian(phone: string, name: string): Promise<GuardianRequestResult> {
  const e164 = normalizePhone(phone);
  if (!e164) return Promise.reject(new Error("Enter a valid phone number"));
  return authedFetch("/api/guardians/request", { phone: e164, name });
}

/** Guardian accepts/declines a pending request. */
export function respondToGuardianRequest(linkId: string, accept: boolean) {
  return authedFetch("/api/guardians/respond", { linkId, accept });
}

/** The invited person accepts a share-link invite. Signing in and opening the
 *  link IS the acceptance, so this activates the guardian link outright. */
export function claimGuardianInvite(token: string): Promise<{ status: string; wardName?: string }> {
  return authedFetch("/api/guardians/claim", { token });
}

/**
 * Hand an invite link to whatever the ward already uses. The native share
 * sheet is the happy path (it offers WhatsApp, SMS, Telegram, everything);
 * we fall back to copying, since a link on the clipboard is still sendable
 * and a failed share must never look like a failed invite.
 *
 * Returns how it was delivered so the caller can word the confirmation.
 */
export async function shareInvite(
  inviteUrl: string,
  guardianName: string
): Promise<"shared" | "copied" | "failed"> {
  const text = `Hi ${guardianName}, I'm using Guidr to check for scams. Can you be my Guardian? You'll get an alert if I ever hit a real scam, so you can check on me.`;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: "Be my Guardian on Guidr", text, url: inviteUrl });
      return "shared";
    } catch (err) {
      // The user dismissing the share sheet throws AbortError. That's a choice,
      // not a failure, so don't fall through to copying behind their back.
      if (err instanceof Error && err.name === "AbortError") return "failed";
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n\n${inviteUrl}`);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Fire a guardian alert about myself (called on a HIGH-confidence SCAM). */
export function triggerGuardianAlert(scamType: string) {
  return authedFetch("/api/notify/guardian-alert", { scamType });
}
