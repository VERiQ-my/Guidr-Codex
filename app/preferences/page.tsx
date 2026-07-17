"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import { useUser } from "@/app/context/UserContext";
import { useToast } from "@/app/context/ToastContext";
import { updateUserProfile, subscribeEntitlements } from "@/lib/firestore";
import { isPro } from "@/lib/plan";
import { enablePush, pushPermission } from "@/lib/messaging";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

/* ── Constants ── */
type ThemePref = "light" | "dark" | "system";

// Languages we can actually switch to today vs. ones still being translated.
// Keep selectable codes aligned with lib/i18n (Locale = en | ms | zh).
const LANGUAGES: { code: string; label: string; soon?: boolean }[] = [
  { code: "en", label: "English" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "zh", label: "中文 (Chinese)", soon: true },
  { code: "ta", label: "தமிழ் (Tamil)", soon: true },
];

// Channel values match ChannelPills / ScanForm so the saved default actually
// pre-selects the right channel when a scan is started.
const CHANNELS = ["WhatsApp", "SMS", "Email", "LinkedIn", "Other"];

/* ── Small toggle switch ── */
function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
        on ? "bg-guidr-primary" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export default function PreferencesPage() {
  const { user } = useUser();
  const { showToast } = useToast();
  const router = useRouter();

  const [theme, setTheme] = useState<ThemePref>("light");
  const [selectedLang, setSelectedLang] = useState("en");
  const [defaultChannel, setDefaultChannel] = useState("WhatsApp");
  const [notifyScanComplete, setNotifyScanComplete] = useState(true);
  const [dailyReminder, setDailyReminder] = useState(true);
  const [autoSaveScans, setAutoSaveScans] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const [pushState, setPushState] = useState<NotificationPermission | "unsupported">("default");
  const [pushBusy, setPushBusy] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  // Live Pro price (admin-editable via config/pricing). Default matches the
  // previous hardcoded upsell copy until the fetch resolves.
  const [priceLabel, setPriceLabel] = useState("RM 9.90");
  const [pricePeriod, setPricePeriod] = useState("month");

  // Reflect the current browser notification permission (browser-only API,
  // read in an effect to avoid an SSR/client hydration mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPushState(pushPermission());
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

  // Load preferences from Firestore.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.theme === "light" || data.theme === "dark" || data.theme === "system") {
        setTheme(data.theme);
      }
      setSelectedLang(data.language || "en");
      if (typeof data.defaultScanChannel === "string") setDefaultChannel(data.defaultScanChannel);
      setNotifyScanComplete(data.notifyScanComplete ?? true);
      setDailyReminder(data.dailyReminder ?? true);
      setAutoSaveScans(data.autoSaveScans ?? true);
    });
    return () => unsubscribe();
  }, [user]);

  // Pro status lives on the server-owned entitlements doc, not the profile.
  useEffect(() => {
    if (!user) return;
    return subscribeEntitlements(user.uid, (ent) => setIsSubscribed(isPro(ent)));
  }, [user]);

  function flashSaved() {
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  }

  // Generic optimistic preference writer: updates local state immediately,
  // persists to Firestore, and rolls back on failure.
  async function savePref<T>(
    key: string,
    value: T,
    setLocal: (v: T) => void,
    prev: T,
  ) {
    if (!user) return;
    setLocal(value);
    try {
      await updateUserProfile(user.uid, { [key]: value } as never);
      flashSaved();
    } catch (err) {
      logger.error(`Error saving ${key}:`, err);
      setLocal(prev);
      showToast("Couldn't save that change. Please try again.", "error");
    }
  }

  async function handleEnablePush() {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      const res = await enablePush(user.uid);
      setPushState(pushPermission());
      if (res.ok) {
        flashSaved();
      } else if (res.reason === "unsupported") {
        showToast("This browser doesn't support push notifications.", "error");
      } else if (res.reason === "no-vapid") {
        showToast("Push isn't fully configured yet. Please try again later.", "error");
      } else if (res.reason !== "denied") {
        showToast("Couldn't enable alerts. Please try again.", "error");
      }
    } finally {
      setPushBusy(false);
    }
  }

  function handlePushToggle() {
    if (pushState === "granted") {
      // Browsers don't allow revoking notification permission from script —
      // steer the user to where they actually can.
      showToast("To turn alerts off, disable notifications for Guidr in your browser settings.", "info");
      return;
    }
    if (pushState === "denied") {
      showToast("Notifications are blocked. Allow them for this site in your browser settings, then try again.", "error");
      return;
    }
    handleEnablePush();
  }

  async function handleUpgradeCheckout() {
    setIsCheckoutLoading(true);
    try {
      // create-checkout requires the caller's Firebase ID token (it ties the
      // Stripe session to this uid); without it the route returns 401. Mirrors
      // the Settings page handler.
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

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-5">
        <div className="flex flex-col gap-5 w-full lg:max-w-2xl lg:mx-auto">

          {/* ── Header ── */}
          <div className="guidr-animate-in guidr-stagger-1 flex items-center gap-3">
            <button
              aria-label="Back to profile"
              onClick={() => router.back()}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 className="text-2xl font-bold text-guidr-text">Settings</h2>
          </div>

          {/* ── Saved Toast ── */}
          {showSavedToast && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-[guidr-fade-in_0.2s_ease-out]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Preferences saved!
            </div>
          )}

          {/* ── APPEARANCE ── */}
          <section className="guidr-animate-in guidr-stagger-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">Appearance</p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Theme cards */}
              <div className="p-4">
                <p className="text-xs font-semibold text-guidr-text mb-3">Theme</p>
                <div className="flex gap-2" role="radiogroup" aria-label="Theme selection">
                  {/* Light */}
                  <ThemeButton value="light" label="Light" selected={theme === "light"} onClick={() => savePref("theme", "light", setTheme, theme)}>
                    <div className="w-full h-16 rounded-md overflow-hidden p-[5px] flex gap-[3px]" style={{ background: "#f8fafc" }}>
                      <div className="w-4 rounded-[3px] shrink-0" style={{ background: "#e2e8f0" }} />
                      <div className="flex-1 flex flex-col gap-[3px]">
                        <div className="h-[9px] rounded-[3px]" style={{ background: "#0d7377" }} />
                        <div className="h-[7px] rounded-[2px]" style={{ background: "#f1f5f9" }} />
                        <div className="h-[7px] rounded-[2px] w-[70%]" style={{ background: "#f1f5f9" }} />
                        <div className="h-[7px] rounded-[2px] w-[85%]" style={{ background: "#f1f5f9" }} />
                      </div>
                    </div>
                  </ThemeButton>

                  {/* Dark */}
                  <ThemeButton value="dark" label="Dark" selected={theme === "dark"} onClick={() => savePref("theme", "dark", setTheme, theme)}>
                    <div className="w-full h-16 rounded-md overflow-hidden p-[5px] flex gap-[3px]" style={{ background: "#0f172a" }}>
                      <div className="w-4 rounded-[3px] shrink-0" style={{ background: "#1e293b" }} />
                      <div className="flex-1 flex flex-col gap-[3px]">
                        <div className="h-[9px] rounded-[3px]" style={{ background: "#0d7377" }} />
                        <div className="h-[7px] rounded-[2px]" style={{ background: "#1e293b" }} />
                        <div className="h-[7px] rounded-[2px] w-[70%]" style={{ background: "#1e293b" }} />
                        <div className="h-[7px] rounded-[2px] w-[85%]" style={{ background: "#1e293b" }} />
                      </div>
                    </div>
                  </ThemeButton>

                  {/* System */}
                  <ThemeButton value="system" label="System" selected={theme === "system"} onClick={() => savePref("theme", "system", setTheme, theme)}>
                    <div className="w-full h-16 rounded-md overflow-hidden flex">
                      <div className="flex-1 flex gap-[2px]" style={{ background: "#f8fafc", padding: "5px 3px 5px 5px" }}>
                        <div className="w-2 rounded-[2px]" style={{ background: "#e2e8f0" }} />
                        <div className="flex-1 flex flex-col gap-[2px]">
                          <div className="h-[7px] rounded-[2px]" style={{ background: "#0d7377" }} />
                          <div className="h-[5px] rounded-[2px]" style={{ background: "#f1f5f9" }} />
                          <div className="h-[5px] rounded-[2px] w-[75%]" style={{ background: "#f1f5f9" }} />
                        </div>
                      </div>
                      <div className="flex-1 flex gap-[2px]" style={{ background: "#0f172a", padding: "5px 5px 5px 3px" }}>
                        <div className="w-2 rounded-[2px]" style={{ background: "#1e293b" }} />
                        <div className="flex-1 flex flex-col gap-[2px]">
                          <div className="h-[7px] rounded-[2px]" style={{ background: "#0d7377" }} />
                          <div className="h-[5px] rounded-[2px]" style={{ background: "#1e293b" }} />
                          <div className="h-[5px] rounded-[2px] w-[75%]" style={{ background: "#1e293b" }} />
                        </div>
                      </div>
                    </div>
                  </ThemeButton>
                </div>
              </div>

              {/* Language */}
              <div className="border-t border-gray-100 p-4">
                <p className="text-xs font-semibold text-guidr-text mb-3">Language</p>
                <div className="flex flex-col gap-0.5">
                  {LANGUAGES.map((lang) =>
                    lang.soon ? (
                      <div key={lang.code} className="flex items-center justify-between px-2.5 py-2.5 rounded-[10px] opacity-55">
                        <span className="text-[13px] font-medium text-guidr-text">{lang.label}</span>
                        <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Soon</span>
                      </div>
                    ) : (
                      <button
                        key={lang.code}
                        onClick={() => savePref("language", lang.code, setSelectedLang, selectedLang)}
                        className="flex items-center justify-between px-2.5 py-2.5 rounded-[10px] hover:bg-gray-50 transition-colors text-left"
                      >
                        <span className="text-[13px] font-medium text-guidr-text">{lang.label}</span>
                        {selectedLang === lang.code ? (
                          <span className="w-5 h-5 rounded-full bg-guidr-primary flex items-center justify-center shrink-0">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                        )}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── NOTIFICATIONS ── */}
          <section className="guidr-animate-in guidr-stagger-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">Notifications</p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-guidr-text">Push notifications</p>
                  <p className="text-xs text-guidr-muted mt-0.5">
                    {pushState === "granted"
                      ? "Alerts are on for this device"
                      : pushState === "denied"
                      ? "Blocked. Allow notifications in your browser"
                      : "Allow Guidr to send alerts to this device"}
                  </p>
                </div>
                <Toggle on={pushState === "granted"} onClick={handlePushToggle} label="Toggle push notifications" />
              </div>

              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-guidr-text">Scan completed</p>
                  <p className="text-xs text-guidr-muted mt-0.5">Notify me when an investigation finishes</p>
                </div>
                <Toggle
                  on={notifyScanComplete}
                  onClick={() => savePref("notifyScanComplete", !notifyScanComplete, setNotifyScanComplete, notifyScanComplete)}
                  label="Toggle scan completed notifications"
                />
              </div>

              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-guidr-text">Daily reminder</p>
                  <p className="text-xs text-guidr-muted mt-0.5">A short evening nudge with a tip, quiz or check-in</p>
                </div>
                <Toggle
                  on={dailyReminder}
                  onClick={() => savePref("dailyReminder", !dailyReminder, setDailyReminder, dailyReminder)}
                  label="Toggle daily reminder notifications"
                />
              </div>

              {/* Bridge to the Guardian hub (existing /settings page) */}
              <button
                onClick={() => router.push("/settings")}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-[10px] bg-guidr-primary-light text-guidr-primary flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-guidr-text">Guardian alert preferences</p>
                  <p className="text-xs text-guidr-muted mt-0.5">How your guardians and wards get notified</p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </section>

          {/* ── SCAN PREFERENCES ── */}
          <section className="guidr-animate-in guidr-stagger-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">Scan preferences</p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              <div className="px-4 py-3.5 border-b border-gray-100">
                <p className="text-xs font-semibold text-guidr-text mb-1">Where do you usually receive suspicious messages?</p>
                <p className="text-[11px] text-guidr-muted mb-3">Sets the default channel when you start a scan</p>
                <div className="flex gap-2 flex-wrap">
                  {CHANNELS.map((ch) => {
                    const on = defaultChannel === ch;
                    return (
                      <button
                        key={ch}
                        onClick={() => savePref("defaultScanChannel", ch, setDefaultChannel, defaultChannel)}
                        aria-pressed={on}
                        className={`inline-flex items-center px-3.5 py-[7px] rounded-full text-xs font-semibold border-[1.5px] transition-all ${
                          on
                            ? "bg-guidr-primary text-white border-guidr-primary"
                            : "bg-white text-guidr-muted border-gray-200 hover:border-guidr-primary/40"
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-guidr-text">Auto-save scans</p>
                  <p className="text-xs text-guidr-muted mt-0.5">Keep a history of all your investigations</p>
                </div>
                <Toggle
                  on={autoSaveScans}
                  onClick={() => savePref("autoSaveScans", !autoSaveScans, setAutoSaveScans, autoSaveScans)}
                  label="Toggle auto-save scans"
                />
              </div>
            </div>
          </section>

          {/* ── PREMIUM ── */}
          {!isSubscribed ? (
            <section className="guidr-animate-in guidr-stagger-5">
              <div className="relative overflow-hidden rounded-[20px] p-5" style={{ background: "#0f172a" }}>
                <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full pointer-events-none" style={{ background: "rgba(245,183,49,.07)" }} />
                <div className="absolute -left-[30px] -bottom-10 w-36 h-36 rounded-full pointer-events-none" style={{ background: "rgba(245,183,49,.04)" }} />
                <div className="relative">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-[42px] h-[42px] rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(245,183,49,.15)", color: "#f5b731" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="m2 20 2-12 5 5 3-6 3 6 5-5 2 12H2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.06em] mb-0.5" style={{ color: "#f5b731" }}>Guidr Premium</p>
                      <p className="text-base font-bold text-white leading-tight mb-0.5">Protect more, worry less</p>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,.6)" }}>From {priceLabel}/{pricePeriod}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 mb-4">
                    {[
                      "Unlimited scans & investigations",
                      "SMS guardian alerts for your whole network",
                      "Priority support from the Guidr team",
                    ].map((feat) => (
                      <div key={feat} className="flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f5b731" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span className="text-xs" style={{ color: "rgba(255,255,255,.82)" }}>{feat}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleUpgradeCheckout}
                    disabled={isCheckoutLoading}
                    className="w-full text-[13px] font-bold py-3 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: "#f5b731", color: "#78350f" }}
                  >
                    {isCheckoutLoading ? (
                      <span className="w-4 h-4 border-2 border-[#78350f] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "View plans"
                    )}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="guidr-animate-in guidr-stagger-5">
              <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(245,183,49,.15)", color: "#f5b731" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="m2 20 2-12 5 5 3-6 3 6 5-5 2 12H2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-guidr-text">Guidr Premium active</p>
                  <p className="text-xs text-guidr-muted mt-0.5">Thanks for supporting the mission 🛡️</p>
                </div>
              </div>
            </section>
          )}

          {/* ── BUILD INFO ── */}
          <div className="guidr-animate-in guidr-stagger-6 text-center pt-1">
            <p className="text-[11px] text-gray-400">Guidr v1.0.4 · Build 2026.06.08</p>
          </div>

        </div>
      </main>
      <BottomNav />
    </div>
  );
}

/* ── Theme selection card ── */
function ThemeButton({
  value,
  label,
  selected,
  onClick,
  children,
}: {
  value: ThemePref;
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      data-theme={value}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${label} theme`}
      className={`flex-1 flex flex-col items-center gap-2 rounded-xl border-2 bg-white p-2 pb-2.5 transition-colors ${
        selected ? "border-guidr-primary" : "border-gray-200 hover:border-slate-400"
      }`}
    >
      {children}
      <span className={`text-[11px] font-semibold transition-colors ${selected ? "text-guidr-primary" : "text-guidr-muted"}`}>
        {label}
      </span>
    </button>
  );
}
