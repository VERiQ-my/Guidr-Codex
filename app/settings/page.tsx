"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect, Suspense } from "react";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import GuardianSettings from "@/app/components/GuardianSettings";
import { useUser } from "@/app/context/UserContext";
import {
  subscribeTrustedContacts,
  addTrustedContact,
  removeTrustedContact,
  saveContactInvite,
  updateUserProfile,
  subscribeEntitlements,
  type TrustedContact,
} from "@/lib/firestore";
import { isPro } from "@/lib/plan";
import { enablePush, pushPermission } from "@/lib/messaging";
import { requestGuardian, shareInvite } from "@/lib/guardians";
import { useToast } from "@/app/context/ToastContext";
import PhoneField, { isValidPhoneNumber, type E164Number } from "@/app/components/PhoneField";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { PRO_PRICE_LABEL, PRO_PRICE_PERIOD } from "@/lib/plan";

/* ── Constants ── */
const FREE_CONTACT_LIMIT = 5;

/* Quick-pick relationships for the Add-contact flow (free text underneath). */
const RELATIONSHIPS = ["Mother", "Father", "Spouse", "Sibling", "Child", "Friend"];

/* Deterministic avatar colours so each guardian keeps a stable accent. */
const AVATAR_COLORS = ["#f5b731", "#3b82f6", "#0d7377", "#8b5cf6", "#ef4444", "#10b981"];

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Short relative time, e.g. "added 14 days ago". Null when no timestamp yet. */
function timeAgo(ts?: Timestamp): string | null {
  if (!ts?.toDate) return null;
  const diff = Date.now() - ts.toDate().getTime();
  if (diff < 0) return "just now";
  const day = 86400000;
  const days = Math.floor(diff / day);
  if (days < 1) {
    const h = Math.floor(diff / 3600000);
    return h < 1 ? "just now" : `${h}h ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

/** Map the guardian-link state to a display badge. */
function guardianBadge(c: TrustedContact): { label: string; cls: string } {
  switch (c.linkStatus) {
    case "active":
      return { label: "Active", cls: "text-green-700 bg-green-100" };
    case "declined":
      return { label: "Declined", cls: "text-guidr-muted bg-gray-100" };
    case "invited":
      return { label: "Send invite", cls: "text-amber-700 bg-amber-100" };
    case "none":
      return { label: "Not on Guidr", cls: "text-guidr-muted bg-gray-100" };
    default:
      return { label: "Invited", cls: "text-amber-700 bg-amber-100" };
  }
}

/** Secondary line under the guardian's name. */
function guardianSubtitle(c: TrustedContact): string {
  const rel = c.relationship?.trim();
  const ago = timeAgo(c.createdAt);
  const join = (...parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).join(" · ");
  switch (c.linkStatus) {
    case "active":
      return join(rel, ago && `added ${ago}`) || "Guardian";
    case "invited":
      return join(rel, "tap to send them the invite");
    case "none":
      return join(rel, "not a Guidr user yet");
    case "declined":
      return join(rel, "declined the invite");
    default:
      return join(rel, "awaiting acceptance");
  }
}

/* ── Alert channel pill ── */
function ChannelPill({
  on,
  pro,
  onClick,
  children,
}: {
  on: boolean;
  pro?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border-[1.5px] transition-colors ${
        on
          ? "bg-guidr-primary text-white border-guidr-primary"
          : "bg-white text-guidr-muted border-gray-200 hover:border-guidr-primary/30"
      } ${pro ? "opacity-80" : ""}`}
    >
      {children}
      {pro && (
        <span className="absolute -top-2 -right-1.5 text-[8px] font-bold bg-amber-400 text-amber-900 px-1.5 py-px rounded-full">
          PRO
        </span>
      )}
    </button>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { user } = useUser();
  const { showToast } = useToast();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState<E164Number | undefined>(undefined);
  const [newRelationship, setNewRelationship] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [alertEmailEnabled, setAlertEmailEnabled] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  // Live Pro price (admin-editable via config/pricing); fall back to the
  // compile-time constants until the fetch resolves.
  const [priceLabel, setPriceLabel] = useState(PRO_PRICE_LABEL);
  const [pricePeriod, setPricePeriod] = useState(PRO_PRICE_PERIOD);
  const [addingContact, setAddingContact] = useState(false);
  const [contactNotice, setContactNotice] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [pushState, setPushState] = useState<NotificationPermission | "unsupported">("default");
  const [pushBusy, setPushBusy] = useState(false);
  // iOS Safari can only do web push from an app installed to the Home Screen,
  // so we steer those users to "Add to Home Screen" instead of a generic error.
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Reflect the current browser notification permission. Done in an effect
  // (not at init) to avoid an SSR/client hydration mismatch, since the
  // Notification API only exists in the browser.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPushState(pushPermission());

    // Detect iPhone/iPad running outside an installed PWA — web push is
    // unavailable there until the user adds Guidr to their Home Screen.
    const ua = navigator.userAgent || "";
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
     
    setIosNeedsInstall(isIos && !isStandalone);
  }, []);

  // Load the live Pro price for display (non-sensitive, public endpoint).
  useEffect(() => {
    let active = true;
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d?.label) setPriceLabel(d.label);
        if (d?.period) setPricePeriod(d.period);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function flashSaved() {
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  }

  async function handleEnablePush() {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      const res = await enablePush(user.uid);
      setPushState(pushPermission());
      if (res.ok) {
        flashSaved();
      } else if (res.reason === "denied") {
        // No toast — the inline unblock steps (driven by pushState) guide the user.
      } else if (res.reason === "unsupported") {
        showToast("This browser doesn't support push notifications.", "error");
      } else if (res.reason === "no-vapid") {
        showToast("Push isn't fully configured yet. Please try again later.", "error");
      } else {
        showToast("Couldn't enable alerts. Please try again.", "error");
      }
    } finally {
      setPushBusy(false);
    }
  }

  // Push pill click: enable when off, explain when already on (can't revoke
  // a browser permission from JS).
  function handlePushPill() {
    if (pushState === "granted") {
      showToast("Push alerts are on for this device. Manage them in your browser settings.", "success");
    } else {
      handleEnablePush();
    }
  }

  async function toggleEmail() {
    const next = !alertEmailEnabled;
    setAlertEmailEnabled(next);
    if (!user) return;
    try {
      await updateUserProfile(user.uid, { alertEmailEnabled: next });
      flashSaved();
    } catch (err) {
      logger.error("Error saving email preference:", err);
      setAlertEmailEnabled(!next);
      showToast("Couldn't save that. Please try again.", "error");
    }
  }

  // Handle successful Stripe upgrade redirect.
  // Pro is granted server-side by the Stripe webhook (verified payment), NOT
  // here — so we just watch the server-owned entitlements doc until the
  // webhook flips isSubscribed, rather than trusting the redirect itself.
  useEffect(() => {
    if (searchParams.get("upgraded") !== "true" || !user) return;
    if (isSubscribed) {
      flashSaved();
      router.replace("/settings");
      return;
    }
    const ref = doc(db, "users", user.uid, "entitlements", "plan");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists() && snap.data().isSubscribed === true) {
        setIsSubscribed(true);
        flashSaved();
        unsub();
        router.replace("/settings");
      }
    });
    // Give up watching after ~20s; the webhook normally lands in 1–3s.
    const stop = setTimeout(() => unsub(), 20_000);
    return () => {
      unsub();
      clearTimeout(stop);
    };
  }, [searchParams, user, isSubscribed, router]);

  // Deep-link from elsewhere in the app (e.g. the daily-limit screen) opens the
  // upgrade modal directly via /settings?upgrade=1.
  useEffect(() => {
    if (searchParams.get("upgrade") === "1" && !isSubscribed) {
      setShowUpgradeModal(true);
    }
  }, [searchParams, isSubscribed]);

  // Load trusted contacts from Firestore
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeTrustedContacts(user.uid, (c) => {
      setContacts(c);
      setContactsLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Load relevant user preferences from Firestore
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        setAlertEmailEnabled(snap.data().alertEmailEnabled !== false);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Pro status lives on the server-owned entitlements doc, not the profile.
  useEffect(() => {
    if (!user) return;
    return subscribeEntitlements(user.uid, (ent) => {
      setIsSubscribed(isPro(ent));
      setSubStatus(ent?.subscriptionStatus || null);
    });
  }, [user]);

  const isAtFreeLimit = !isSubscribed && contacts.length >= FREE_CONTACT_LIMIT;
  const slotsLeft = Math.max(FREE_CONTACT_LIMIT - contacts.length, 0);

  function handleAddClick() {
    if (isAtFreeLimit) {
      setShowUpgradeModal(true);
    } else {
      setShowAddModal(true);
    }
  }

  /**
   * Lightweight name sanity check. Rejects empty/too-short input and
   * single-character repeats like "OOOOO" or "aaaa". Doesn't try to enforce
   * a charset — Malay, Chinese, and other scripts should all pass.
   */
  function validateName(raw: string): string | null {
    const name = raw.trim();
    if (name.length < 2) return "Name must be at least 2 characters.";
    if (/^(.)\1+$/.test(name)) return "Enter a real name.";
    return null;
  }

  /**
   * Push an invite link out through whatever the ward already uses (share
   * sheet, else clipboard) and tell them plainly what happened. A silent
   * share sheet leaves people unsure whether anything was sent.
   */
  async function sendInvite(url: string, name: string) {
    const how = await shareInvite(url, name);
    if (how === "shared") {
      setContactNotice(`Invite sent. ${name} becomes your guardian as soon as they open it.`);
    } else if (how === "copied") {
      setContactNotice(`Invite link copied. Paste it to ${name} in WhatsApp or SMS.`);
    } else {
      setContactNotice(`${name} was saved. Tap "Send invite" on their card to share the link.`);
    }
    setTimeout(() => setContactNotice(null), 6000);
  }

  async function handleAddContact() {
    if (!user) return;

    const name = newName.trim();

    // Validate up front — don't write garbage to Firestore. The PhoneField
    // value is already E.164 (or undefined); we still call isValidPhoneNumber
    // because the user may have selected a country but typed an incomplete
    // number.
    const nameErr = validateName(name);
    const phoneValid = newPhone && isValidPhoneNumber(newPhone);
    const phoneErr = phoneValid
      ? null
      : "Enter a valid phone number for the selected country.";
    const e164 = phoneValid ? (newPhone as string) : null;

    setNameError(nameErr);
    setPhoneError(phoneErr);
    if (nameErr || phoneErr || !e164) return;

    const relationship = newRelationship.trim() || undefined;

    setAddingContact(true);
    try {
      // Save the normalized E.164 form so storage is consistent and the
      // contact can always be matched to a Guidr account later.
      const contactId = await addTrustedContact(user.uid, {
        name,
        phone: e164,
        status: "pending",
        relationship,
      });

      try {
        const res = await requestGuardian(e164, name);
        if (res.linkStatus === "pending") {
          setContactNotice(`Guardian request sent to ${name}. They'll be alerted once they accept.`);
        } else if (res.linkStatus === "active") {
          setContactNotice(`${name} is already your guardian.`);
        } else if (res.linkStatus === "invited" && res.inviteUrl) {
          // Not on Guidr yet, so there's nobody to push. Hand the ward an
          // invite link and open the share sheet right now, while they still
          // have the person in mind. A link they have to come back for later
          // is a link that never gets sent.
          await saveContactInvite(user.uid, contactId, res.inviteUrl);
          await sendInvite(res.inviteUrl, name);
        } else {
          setContactNotice(`${name} was saved as a contact.`);
        }
      } catch (err) {
        logger.error("Guardian request failed:", err);
        setContactNotice(`${name} was saved as a contact.`);
      }

      setNewName("");
      setNewPhone(undefined);
      setNewRelationship("");
      setNameError(null);
      setPhoneError(null);
      setShowAddModal(false);
      setTimeout(() => setContactNotice(null), 6000);
    } catch (err) {
      logger.error("Error adding contact:", err);
      showToast("Couldn't save the contact. Check your connection and try again.", "error");
    } finally {
      setAddingContact(false);
    }
  }

  async function handleRemoveContact(id: string) {
    if (!user) return;
    try {
      await removeTrustedContact(user.uid, id);
      showToast("Guardian removed", "success");
    } catch (err) {
      logger.error("Error removing contact:", err);
      showToast("Couldn't remove the guardian. Please try again.", "error");
    }
  }

  // Re-send a guardian invite for a contact that hasn't accepted yet. For a
  // contact who is already on Guidr this re-pushes the request; for one who
  // isn't, it re-opens the share sheet with their (unchanged) invite link.
  async function handleResend(c: TrustedContact) {
    if (!user) return;
    try {
      // Share the link we already minted rather than round-tripping the server
      // for one we know hasn't changed.
      if (c.linkStatus === "invited" && c.inviteUrl) {
        await sendInvite(c.inviteUrl, c.name);
        return;
      }

      const res = await requestGuardian(c.phone, c.name);
      if (res.linkStatus === "active") {
        setContactNotice(`${c.name} is already your guardian.`);
      } else if (res.linkStatus === "pending") {
        setContactNotice(`Invite re-sent to ${c.name}.`);
      } else if (res.linkStatus === "invited" && res.inviteUrl) {
        // Covers contacts added before invite links existed (linkStatus
        // "none"), which had no way to be invited at all until now.
        if (c.id) await saveContactInvite(user.uid, c.id, res.inviteUrl);
        await sendInvite(res.inviteUrl, c.name);
        return;
      } else {
        setContactNotice(`${c.name} was saved as a contact.`);
      }
      setTimeout(() => setContactNotice(null), 6000);
    } catch (err) {
      logger.error("Resend failed:", err);
      showToast("Couldn't re-send the invite. Please try again.", "error");
    }
  }

  async function handleUpgradeCheckout() {
    setIsCheckoutLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast("Could not start checkout. Please try again.", "error");
      }
    } catch {
      showToast("Could not connect to payment server.", "error");
    } finally {
      setIsCheckoutLoading(false);
    }
  }

  // Open the Stripe Billing Portal (manage / cancel the Pro subscription).
  // Cancellations flow back through the webhook, which revokes isSubscribed.
  async function handleManageSubscription() {
    setIsPortalLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error || "Couldn't open the subscription manager.", "error");
      }
    } catch {
      showToast("Could not connect to payment server.", "error");
    } finally {
      setIsPortalLoading(false);
    }
  }

  /* ── Derived hero values ── */
  const protectedCount = contacts.length;
  const firstNames = contacts.map((c) => c.name.split(" ")[0]).filter(Boolean);
  const pushOn = pushState === "granted";
  const channelsText = (() => {
    const parts: string[] = [];
    if (pushOn) parts.push("Push");
    if (alertEmailEnabled) parts.push("email");
    if (parts.length === 0) return "Alerts off";
    return `${parts.join(" + ")} on`;
  })();
  const heroSubtitle =
    protectedCount === 0
      ? "Add people you trust so they can look out for you"
      : firstNames.length === 1
      ? `${firstNames[0]} is watching out for you`
      : firstNames.length === 2
      ? `${firstNames[0]} & ${firstNames[1]} are watching out for you`
      : `${firstNames[0]}, ${firstNames[1]} & ${firstNames.length - 2} more are watching out for you`;

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-5">
        <div className="flex flex-col gap-5 w-full lg:max-w-2xl lg:mx-auto">

        {/* ── Page Header with Back Button ── */}
        <div className="guidr-animate-in guidr-stagger-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              aria-label="Back to profile"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 className="text-2xl font-bold text-guidr-text">Guardian Protections</h2>
          </div>
        </div>

        {/* ── Saved Toast ── */}
        {showSavedToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-[guidr-fade-in_0.2s_ease-out]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Saved!
          </div>
        )}

        {/* ── Contact-link notice (guardian request outcome) ── */}
        {contactNotice && (
          <div className="p-3.5 rounded-xl border border-guidr-primary/30 bg-guidr-primary-light/20 text-sm text-guidr-text guidr-animate-in">
            {contactNotice}
          </div>
        )}

        {/* ── HERO: Protected by N people ── */}
        <section className="guidr-animate-in guidr-stagger-1">
          <div className="relative overflow-hidden bg-guidr-primary rounded-[20px] p-5 text-white">
            <div className="absolute -right-11 -top-11 w-[170px] h-[170px] rounded-full bg-white/[0.05] pointer-events-none" />
            <div className="absolute -right-16 -bottom-9 w-[190px] h-[190px] rounded-full bg-white/[0.035] pointer-events-none" />
            <div className="relative">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/60 mb-4">Guardian Protection</p>
              <div className="flex items-center gap-3.5 mb-4">
                {protectedCount > 0 && (
                  <div className="flex shrink-0">
                    {contacts.slice(0, 3).map((c, i) => (
                      <div
                        key={c.id}
                        className="w-[42px] h-[42px] rounded-full text-white flex items-center justify-center text-[13px] font-bold border-[2.5px] border-white/45"
                        style={{ background: "rgba(255,255,255,0.18)", marginLeft: i === 0 ? 0 : -12 }}
                      >
                        {initials(c.name)}
                      </div>
                    ))}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-lg font-bold text-white leading-tight">
                    {protectedCount === 0
                      ? "No guardians yet"
                      : `Protected by ${protectedCount} ${protectedCount === 1 ? "person" : "people"}`}
                  </p>
                  <p className="text-xs text-white/75 mt-1">{heroSubtitle}</p>
                </div>
              </div>
              <div className="h-px bg-white/[0.12] mb-3.5" />
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
                  </svg>
                  <span className="text-[11px] text-white/70">{protectedCount > 0 ? "Active" : "Setup"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span className="text-[11px] text-white/70">
                    {isSubscribed ? `${protectedCount} guardians` : `${protectedCount} of ${FREE_CONTACT_LIMIT} slots`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className="text-[11px] text-white/70">{channelsText}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── MY GUARDIANS ── */}
        <section className="guidr-animate-in guidr-stagger-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">My guardians</p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {contactsLoading && contacts.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-guidr-muted">Loading…</div>
            ) : (
              contacts.map((c) => {
                const badge = guardianBadge(c);
                return (
                  <div key={c.id} className="flex items-center gap-3 px-3.5 py-3 border-b border-gray-100">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ background: avatarColor(c.name) }}
                    >
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-guidr-text truncate">{c.name}</p>
                        <span className={`text-[9px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-guidr-muted mt-0.5 truncate">{guardianSubtitle(c)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {c.linkStatus === "active" ? (
                        <a
                          href={`tel:${c.phone}`}
                          aria-label={`Call ${c.name}`}
                          className="w-10 h-10 flex items-center justify-center rounded-[10px] bg-guidr-primary-light text-guidr-primary hover:bg-guidr-primary-light/70 transition-colors"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </a>
                      ) : (
                        <button
                          onClick={() => handleResend(c)}
                          className="text-[11px] font-bold text-guidr-primary hover:underline px-2 py-2"
                        >
                          {/* Someone not on Guidr has never actually been sent
                              anything, so "Resend" would be a lie. */}
                          {c.linkStatus === "invited" || c.linkStatus === "none"
                            ? "Send invite"
                            : "Resend"}
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveContact(c.id!)}
                        aria-label={`Remove ${c.name}`}
                        className="w-10 h-10 flex items-center justify-center rounded-[10px] text-guidr-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Add a guardian */}
            <button
              onClick={handleAddClick}
              className="flex items-center justify-center gap-2.5 w-full px-4 py-3.5 text-guidr-primary hover:bg-gray-50 transition-colors"
            >
              <span className="w-7 h-7 rounded-full border-[1.5px] border-dashed border-guidr-primary flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span className="text-[13px] font-semibold">
                Add a guardian
                <span className="font-normal text-guidr-muted text-xs">
                  {" · "}
                  {isSubscribed ? "unlimited" : `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left`}
                </span>
              </span>
            </button>
          </div>
        </section>

        {/* ── I'M A GUARDIAN FOR (phone + requests + wards) ── */}
        <GuardianSettings />

        {/* ── ALERT PREFERENCES ── */}
        <section className="guidr-animate-in guidr-stagger-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">Alert preferences</p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-guidr-text mb-3">When I encounter a scam, notify my guardians by:</p>
              <div className="flex gap-2 flex-wrap">
                <ChannelPill on={pushOn} onClick={handlePushPill}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Push
                </ChannelPill>
                <ChannelPill on={false} pro onClick={() => setShowUpgradeModal(true)}>
                  SMS
                </ChannelPill>
                <ChannelPill on={alertEmailEnabled} onClick={toggleEmail}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
                  </svg>
                  Email
                </ChannelPill>
              </div>

              {/* Push status helper — only when not granted */}
              {pushState !== "granted" && (
                <div className="mt-3">
                  {iosNeedsInstall ? (
                    <p className="text-[11px] text-guidr-muted leading-relaxed">
                      On iPhone &amp; iPad, push only works from the installed app. In Safari, tap{" "}
                      <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open Guidr from
                      that icon and turn on Push here.
                    </p>
                  ) : pushState === "denied" ? (
                    <div className="text-[11px] text-guidr-muted leading-relaxed">
                      <p className="mb-1">Notifications are blocked for this site. To turn them on:</p>
                      <ol className="list-decimal list-inside space-y-0.5">
                        <li>Tap the lock or settings icon left of the web address.</li>
                        <li>Set <strong>Notifications</strong> to <strong>Allow</strong>.</li>
                        <li>Reload, then tap <strong>Push</strong> above.</li>
                      </ol>
                    </div>
                  ) : pushState === "unsupported" ? (
                    <p className="text-[11px] text-guidr-muted">This browser doesn&apos;t support push notifications.</p>
                  ) : (
                    <button
                      onClick={handleEnablePush}
                      disabled={pushBusy}
                      className="text-[11px] font-semibold text-guidr-primary hover:underline disabled:opacity-60"
                    >
                      {pushBusy ? "Enabling…" : "Tap Push to turn on device alerts"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="p-4">
              <p className="text-xs font-semibold text-guidr-text mb-3">When a ward encounters a scam, notify me by:</p>
              <div className="flex gap-2 flex-wrap">
                <ChannelPill on={pushOn} onClick={handlePushPill}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Push
                </ChannelPill>
                <ChannelPill on={false} pro onClick={() => setShowUpgradeModal(true)}>
                  SMS
                </ChannelPill>
              </div>
            </div>
          </div>
        </section>

        {/* ── EDUCATION CARD ── */}
        <section className="guidr-animate-in guidr-stagger-5">
          <div className="bg-guidr-primary-light border border-guidr-primary/20 rounded-2xl p-4">
            <div className="flex items-center gap-2.5 mb-3.5">
              <div className="w-9 h-9 rounded-[10px] bg-guidr-primary text-white flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <p className="text-[13px] font-bold text-guidr-primary-dark">When your ward gets a scam alert</p>
            </div>
            <div className="flex flex-col gap-2.5">
              {[
                "Call them calmly within 10 minutes, even if it turns out to be nothing.",
                "Ask what happened. Don't accuse or dismiss what they tell you.",
                "If money has moved, call NSRC 997 together right away.",
              ].map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="w-[22px] h-[22px] rounded-full bg-guidr-primary text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-px">
                    {i + 1}
                  </span>
                  <p className="text-xs text-guidr-primary-dark leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/learn")}
              className="text-xs font-bold text-guidr-primary hover:underline mt-3.5"
            >
              Read the full guardian guide →
            </button>
          </div>
        </section>

        {/* ── MEMBERSHIP ── */}
        <section className="guidr-animate-in guidr-stagger-6">
          {isSubscribed ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider uppercase">
                    ⭐ Guidr Pro
                  </span>
                  <p className="text-xs text-guidr-muted mt-2">
                    {subStatus === "past_due"
                      ? "Your last payment didn't go through. Update your card to keep Pro."
                      : "Unlimited scans, unlimited guardians, full reports."}
                  </p>
                </div>
                <button
                  onClick={handleManageSubscription}
                  disabled={isPortalLoading}
                  className={`shrink-0 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-60 ${
                    subStatus === "past_due"
                      ? "bg-guidr-red text-white hover:opacity-90"
                      : "bg-white border border-gray-200 text-guidr-text hover:bg-gray-50"
                  }`}
                >
                  {isPortalLoading ? "Opening…" : subStatus === "past_due" ? "Update card" : "Manage subscription"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="w-full bg-white rounded-2xl border border-amber-200 p-4 flex items-center gap-3 text-left hover:bg-amber-50/50 transition-colors active:scale-[0.99]"
            >
              <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider uppercase shrink-0">
                ⭐ Pro
              </span>
              <span className="text-xs text-guidr-muted flex-1">
                Unlimited scans &amp; guardians, full reports for {priceLabel}/{pricePeriod}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </section>

        </div>

      </main>
      <BottomNav />

      {/* ── Add Guardian Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowAddModal(false); setNameError(null); setPhoneError(null); }} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-6 pb-8 shadow-xl guidr-animate-in">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-bold text-guidr-text mb-4">Add a guardian</h3>

            <div className="flex flex-col gap-3 mb-5">
              <div>
                <label className="text-xs font-bold text-guidr-muted uppercase tracking-wider mb-1 block">Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="e.g. Ahmad Ibrahim"
                  aria-invalid={!!nameError}
                  className={`w-full px-4 py-3 rounded-xl border bg-gray-50 text-sm text-guidr-text placeholder:text-guidr-muted/50 focus:outline-none focus:ring-1 ${
                    nameError
                      ? "border-guidr-red focus:border-guidr-red focus:ring-guidr-red/20"
                      : "border-gray-200 focus:border-guidr-primary focus:ring-guidr-primary/20"
                  }`}
                />
                {nameError && (
                  <p className="text-[11px] text-guidr-red mt-1">{nameError}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-guidr-muted uppercase tracking-wider mb-1 block">Phone Number</label>
                <PhoneField
                  value={newPhone}
                  onChange={(v) => {
                    setNewPhone(v);
                    if (phoneError) setPhoneError(null);
                  }}
                  defaultCountry="MY"
                  placeholder="12-345 6789"
                  error={!!phoneError}
                />
                {phoneError && (
                  <p className="text-[11px] text-guidr-red mt-1">{phoneError}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-guidr-muted uppercase tracking-wider mb-1 block">
                  Relationship <span className="font-normal normal-case tracking-normal text-guidr-muted/70">(optional)</span>
                </label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {RELATIONSHIPS.map((rel) => (
                    <button
                      key={rel}
                      type="button"
                      onClick={() => setNewRelationship((cur) => (cur === rel ? "" : rel))}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        newRelationship === rel
                          ? "bg-guidr-primary text-white border-guidr-primary"
                          : "bg-white text-guidr-muted border-gray-200 hover:border-guidr-primary/30"
                      }`}
                    >
                      {rel}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={newRelationship}
                  onChange={(e) => setNewRelationship(e.target.value)}
                  placeholder="Or type your own"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-guidr-text placeholder:text-guidr-muted/50 focus:outline-none focus:ring-1 focus:border-guidr-primary focus:ring-guidr-primary/20"
                />
              </div>
            </div>

            {/* Free slots remaining indicator */}
            {!isSubscribed && (
              <p className="text-xs text-guidr-muted text-center mb-4">
                {slotsLeft - 1 >= 0
                  ? `${slotsLeft - 1} free slot${slotsLeft - 1 !== 1 ? "s" : ""} remaining after this`
                  : "This is your last free slot"
                }
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowAddModal(false); setNameError(null); setPhoneError(null); }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddContact}
                disabled={!newName.trim() || !newPhone || addingContact}
                className="flex-1 py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {addingContact ? "Adding…" : "Add guardian"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade to Pro Modal ── */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowUpgradeModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-6 pb-8 shadow-xl guidr-animate-in">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />

            {/* Pro badge */}
            <div className="flex items-center justify-center mb-4">
              <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full tracking-wider uppercase shadow-md">
                ⭐ Guidr Pro
              </span>
            </div>

            <h3 className="text-lg font-bold text-guidr-text text-center mb-2">
              Unlock more protection
            </h3>
            <p className="text-sm text-guidr-muted text-center mb-6 leading-relaxed">
              Free accounts can protect up to <strong className="text-guidr-text">{FREE_CONTACT_LIMIT} guardians</strong> with
              push &amp; email alerts. Upgrade to Guidr Pro for unlimited guardians and SMS alerts.
            </p>

            {/* Features */}
            <div className="bg-gray-50 rounded-xl p-4 mb-5 flex flex-col gap-3">
              {[
                "Unlimited guardians",
                "SMS scam alerts",
                "Priority NSRC report processing",
                "Advanced threat analytics",
              ].map((feat) => (
                <div key={feat} className="flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#0d7377" stroke="none" className="shrink-0">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  <span className="text-sm text-guidr-text">{feat}</span>
                </div>
              ))}
            </div>

            {/* Pricing */}
            <div className="text-center mb-5">
              <span className="text-3xl font-bold text-guidr-text">{priceLabel}</span>
              <span className="text-sm text-guidr-muted">/{pricePeriod}</span>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleUpgradeCheckout}
                disabled={isCheckoutLoading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-white font-semibold text-sm hover:from-amber-500 hover:to-amber-600 active:scale-[0.98] transition-all shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isCheckoutLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                    Upgrade with Stripe
                  </>
                )}
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-3 text-sm text-guidr-muted hover:text-guidr-text transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
