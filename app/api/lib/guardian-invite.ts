/**
 * Guardian share-link invites.
 *
 * The original guardian flow could only link two people who were BOTH already
 * Guidr users with a phone saved on their profile. Everyone else hit a dead
 * end ("this number isn't a Guidr user yet"), which quietly killed the single
 * feature most likely to bring people back.
 *
 * A share-link invite fixes that: the ward gets a URL they can send through
 * WhatsApp, SMS, or anything else they already use. Whoever opens it and signs
 * in claims the link and becomes the guardian.
 *
 * The token is therefore a capability — holding it is what grants the role, so
 * it must only ever be handed to the ward who created it (never returned by a
 * public read of the invite).
 */

/** URL-safe, unguessable invite token (128 bits, base32-ish alphabet). */
export function newInviteToken(): string {
  // No ambiguous characters (0/O, 1/I/l) — invite links get read aloud and
  // retyped by hand more often than you'd think.
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(26);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Absolute URL for an invite token. */
export function inviteUrl(token: string, origin?: string | null): string {
  const base = (origin || "https://guidr.my").replace(/\/+$/, "");
  return `${base}/guardian/invite/${token}`;
}
