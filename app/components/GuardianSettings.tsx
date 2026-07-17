"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "@/app/context/UserContext";
import {
  subscribeIncomingGuardianRequests,
  subscribeGuardianEvents,
  markGuardianEventRead,
  type GuardianLink,
  type GuardianEvent,
} from "@/lib/firestore";
import { saveMyPhone, respondToGuardianRequest } from "@/lib/guardians";
import PhoneField, { isValidPhoneNumber, type E164Number } from "@/app/components/PhoneField";
import { displayCategoryName } from "@/app/components/ScamCategoryIcon";

/** "5m ago" / "3h ago" / "2d ago" for an epoch-ms timestamp. */
function eventAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * "I'm a guardian for" — register your own phone (so others can add you as a
 * guardian), accept/decline incoming requests, and see the people you're
 * watching out for. Rendered inside the Guardian Protections hub.
 */
export default function GuardianSettings() {
  const { user } = useUser();

  // Phone state — value is E.164 (e.g. "+60123456789") or undefined when empty.
  const [phone, setPhone] = useState<E164Number | undefined>(undefined);
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Incoming guardian requests (where I am the guardian)
  const [requests, setRequests] = useState<GuardianLink[]>([]);

  // Recent alerts about my wards (server-written guardian_events feed)
  const [events, setEvents] = useState<GuardianEvent[]>([]);

  // Reflect saved phone from profile
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.data();
      if (data?.phone) {
        setSavedPhone(data.phone);
        setPhone(data.phone as E164Number);
      }
    });
    return () => unsub();
  }, [user]);

  // Subscribe to incoming guardian requests
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeIncomingGuardianRequests(user.uid, setRequests);
    return () => unsub();
  }, [user]);

  // Subscribe to my recent guardian alerts
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeGuardianEvents(user.uid, setEvents, 10);
    return () => unsub();
  }, [user]);

  async function handleSavePhone() {
    setError(null);
    if (!phone || !isValidPhoneNumber(phone)) {
      setError("Enter a valid phone number for the selected country.");
      return;
    }
    setBusy(true);
    try {
      const e164 = await saveMyPhone(phone);
      setSavedPhone(e164);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your number.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRespond(linkId: string, accept: boolean) {
    setBusy(true);
    try {
      await respondToGuardianRequest(linkId, accept);
    } catch (err) {
      logger.error("Respond failed:", err);
    } finally {
      setBusy(false);
    }
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const activeWards = requests.filter((r) => r.status === "active");
  const hasAnyone = pendingRequests.length > 0 || activeWards.length > 0;

  return (
    <section className="guidr-animate-in guidr-stagger-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">
        I&apos;m a guardian for
      </p>

      {/* ── Your guardian number ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
        <p className="text-xs font-semibold text-guidr-text mb-2.5">
          Your guardian number
        </p>
        {savedPhone && !editing ? (
          <div className="flex items-center justify-between gap-2.5 p-3 rounded-xl border border-guidr-primary/40 bg-guidr-primary-light/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#0d7377" stroke="none" className="shrink-0">
                <path d="M12 2L4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z" />
                <path d="M10 13l-2-2-1.4 1.4L10 15.8 17.4 8.4 16 7z" fill="#fff" />
              </svg>
              <span className="text-sm font-semibold text-guidr-text truncate">{savedPhone}</span>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-bold text-guidr-primary hover:underline shrink-0"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="text-xs text-guidr-muted leading-relaxed">
              Save your number so people you trust can add you as their guardian.
            </p>
            <PhoneField
              value={phone}
              onChange={setPhone}
              defaultCountry="MY"
              placeholder="12-345 6789"
              error={!!error}
            />
            <button
              onClick={handleSavePhone}
              disabled={busy}
              className="w-full p-3 rounded-xl bg-guidr-primary text-white text-sm font-semibold hover:bg-guidr-primary-dark transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save my number"}
            </button>
          </div>
        )}
        {error && <p className="text-xs text-guidr-red mt-2">{error}</p>}
      </div>

      {/* ── Pending requests (someone wants you as their guardian) ── */}
      {pendingRequests.length > 0 && (
        <div className="flex flex-col gap-2.5 mb-3">
          {pendingRequests.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 p-3.5 rounded-2xl border border-amber-200 bg-amber-50"
            >
              <div className="w-10 h-10 rounded-full bg-amber-400 text-white text-sm font-bold flex items-center justify-center shrink-0">
                {r.wardName?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-guidr-text truncate">{r.wardName}</p>
                <p className="text-[11px] text-guidr-muted">wants you as their guardian</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleRespond(r.id!, true)}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg bg-guidr-primary text-white text-xs font-bold hover:bg-guidr-primary-dark active:scale-95 transition-all disabled:opacity-60"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleRespond(r.id!, false)}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-guidr-muted text-xs font-bold hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Active wards (people you're guarding) ── */}
      {activeWards.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {activeWards.map((w, i) => (
            <div
              key={w.id}
              className={`flex items-center gap-3 p-3.5 ${i > 0 ? "border-t border-gray-100" : ""}`}
            >
              <div className="w-11 h-11 rounded-full bg-guidr-primary text-white text-sm font-bold flex items-center justify-center shrink-0">
                {w.wardName?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-guidr-text truncate">{w.wardName}</p>
                <p className="text-xs text-guidr-muted mt-0.5">You&apos;ll be alerted if they hit a scam</p>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-green-700 bg-green-100 px-1.5 py-0.5 rounded shrink-0">
                Active
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Recent alerts about my wards ── */}
      {events.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">
            Recent alerts
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {events.map((e, i) => {
              const isScam = e.verdict === "SCAM";
              return (
                <button
                  key={e.id}
                  onClick={() => {
                    if (!e.read && user && e.id) {
                      markGuardianEventRead(user.uid, e.id).catch(() => {});
                    }
                  }}
                  className={`w-full text-left flex items-center gap-3 p-3.5 transition-colors ${
                    i > 0 ? "border-t border-gray-100" : ""
                  } ${e.read ? "" : "bg-red-50/60 hover:bg-red-50"}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full text-white text-sm font-bold flex items-center justify-center shrink-0 ${
                      isScam ? "bg-guidr-red" : "bg-amber-500"
                    }`}
                  >
                    {e.wardName?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-guidr-text truncate">
                      {e.wardName}
                      {!e.read && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-guidr-red ml-1.5 align-middle" />
                      )}
                    </p>
                    <p className="text-xs text-guidr-muted mt-0.5 truncate">
                      {isScam
                        ? `encountered: ${displayCategoryName(e.scamType, e.verdict)}`
                        : "received a suspicious message"}
                    </p>
                  </div>
                  <span className="text-[10px] text-guidr-muted shrink-0">{eventAgo(e.at)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-guidr-muted mt-2 ml-1 leading-relaxed">
            A quick call or message goes a long way, because scammers often pressure people to act fast.
          </p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!hasAnyone && (
        <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-2xl p-5 text-center">
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-2.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-guidr-text mb-1">No one&apos;s added you yet</p>
          <p className="text-xs text-guidr-muted leading-relaxed">
            When someone adds you as their guardian, they&apos;ll appear here. Share your number above
            so people you trust can add you.
          </p>
        </div>
      )}
    </section>
  );
}
