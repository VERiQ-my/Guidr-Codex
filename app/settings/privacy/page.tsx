"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, RecaptchaVerifier } from "firebase/auth";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import PhoneField, { isValidPhoneNumber, type E164Number } from "@/app/components/PhoneField";
import { useUser } from "@/app/context/UserContext";
import { useToast } from "@/app/context/ToastContext";
import { auth } from "@/lib/firebase";
import {
  subscribeUserProfile,
  subscribeSessions,
  subscribeTrustedContacts,
  updateUserProfile,
  deleteSession,
  type UserProfile,
  type DeviceSession,
} from "@/lib/firestore";
import {
  getSessionId,
  hasPasswordProvider,
  enrolledFactorCount,
  changePassword,
  exportMyData,
  revokeOtherSessions,
  deleteMyAccount,
  deriveSecurityHealth,
  getEnrolledFactors,
  sendVerificationEmail,
  startMfaEnrollment,
  finishMfaEnrollment,
  disableMfa,
} from "@/lib/account-security";
import {
  isAppLockEnabled,
  setPin as saveAppLockPin,
  registerBiometric,
  clearAppLock,
  biometricSupported,
} from "@/lib/app-lock";

// SMS two-factor depends on Firebase Identity Platform (Blaze plan), which is
// deferred to the roadmap. Until that's turned on, flip this env flag to "true"
// to activate the enrollment flow — no code change needed. While off, the 2FA
// row shows a "Soon" state instead of letting users walk into a dead-end.
const MFA_FEATURE_ENABLED = process.env.NEXT_PUBLIC_MFA_ENABLED === "true";

/* ── Inline icon set (matches the app's stroke-SVG convention) ── */
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "back":
      return <svg {...common}><polyline points="15 18 9 12 15 6" /></svg>;
    case "shield-check":
      return <svg {...common}><path d="M12 2L4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z" /><polyline points="9 12 11 14 15 10" /></svg>;
    case "device":
      return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></svg>;
    case "shield-lock":
      return <svg {...common}><path d="M12 2L4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z" /><rect x="9.5" y="11" width="5" height="4" rx="1" /><path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" /></svg>;
    case "key":
      return <svg {...common}><circle cx="7.5" cy="15.5" r="3.5" /><path d="M10 13L20 3" /><path d="M16 4l3 3" /><path d="M13 6l2.5 2.5" /></svg>;
    case "history":
      return <svg {...common}><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l3 2" /></svg>;
    case "logout":
      return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
    case "fingerprint":
      return <svg {...common}><path d="M12 11a2 2 0 0 0-2 2c0 1 .5 3 .5 5" /><path d="M14.5 13c0 3 .5 4.5 1 6" /><path d="M8 14c0 3 1 4 1 6" /><path d="M5.5 11a6.5 6.5 0 0 1 11-2" /><path d="M3.5 9a9 9 0 0 1 14 1" /><path d="M17.5 15c.3 1.5.5 3 .5 4" /></svg>;
    case "download":
      return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
    case "info":
      return <svg {...common}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
    case "trash":
      return <svg {...common}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
    case "lock":
      return <svg {...common}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    case "chevron":
      return <svg {...common} stroke="#cbd5e1"><polyline points="9 18 15 12 9 6" /></svg>;
    case "check":
      return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>;
    case "x":
      return <svg {...common}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
    default:
      return null;
  }
}

/* ── Reusable settings row ── */
function Row({
  icon,
  iconBg = "#f1f5f9",
  iconColor = "#0f172a",
  title,
  titleColor,
  subtitle,
  badge,
  onClick,
  last = false,
}: {
  icon: string;
  iconBg?: string;
  iconColor?: string;
  title: string;
  titleColor?: string;
  subtitle: string;
  badge?: string;
  onClick?: () => void;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 w-full bg-transparent text-left hover:bg-gray-50 transition-colors ${
        last ? "" : "border-b border-gray-100"
      }`}
    >
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ background: iconBg, color: iconColor }}
      >
        <Icon name={icon} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium m-0" style={{ color: titleColor || "#1a1a2e" }}>
            {title}
          </p>
          {badge && (
            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-guidr-muted mt-0.5 m-0">{subtitle}</p>
      </div>
      <span className="shrink-0">
        <Icon name="chevron" />
      </span>
    </button>
  );
}

/* ── Modal shell (bottom sheet on mobile, centered on desktop) ── */
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-2xl lg:rounded-2xl p-6 pb-8 shadow-xl guidr-animate-in max-h-[85vh] overflow-y-auto no-scrollbar">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5 lg:hidden" />
        {children}
      </div>
    </div>
  );
}

function relativeTime(ms: number | undefined, now: number): string {
  if (!ms) return "";
  const diff = now - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 2) return "Active now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function PrivacySecurityPage() {
  const { user } = useUser();
  const { showToast } = useToast();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [contactCount, setContactCount] = useState(0);

  const [modal, setModal] = useState<
    null | "password" | "history" | "collect" | "delete" | "2fa" | "applock"
  >(null);

  // App lock (local PIN / biometric). Armed state lives on this device, so the
  // toggle reflects local storage; we mirror the flag to the profile for the
  // security-health summary.
  const [appLockOn, setAppLockOn] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [useBiometric, setUseBiometric] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockBusy, setLockBusy] = useState(false);

  // Change-password form
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Delete-account form
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Two-factor (SMS MFA) flow
  const [twoFAStep, setTwoFAStep] = useState<"status" | "phone" | "code" | "soon">("phone");
  const [mfaPhone, setMfaPhone] = useState<E164Number | undefined>(undefined);
  const [mfaVerificationId, setMfaVerificationId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // Misc busy flags
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [appLockBusy, setAppLockBusy] = useState(false);

  // A render-stable "now", refreshed each minute, so relative-time labels stay
  // fresh without calling Date.now() during render (impure).
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppLockOn(isAppLockEnabled());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const sessionId = typeof window !== "undefined" ? getSessionId() : "";
  const fbUser = auth.currentUser;
  const isPasswordAccount = hasPasswordProvider(fbUser);

  useEffect(() => {
    if (!user) return;
    const unsubProfile = subscribeUserProfile(user.uid, setProfile);
    const unsubSessions = subscribeSessions(user.uid, setSessions);
    const unsubContacts = subscribeTrustedContacts(user.uid, (c) => setContactCount(c.length));
    return () => {
      unsubProfile();
      unsubSessions();
      unsubContacts();
    };
  }, [user]);

  const health = useMemo(
    () =>
      deriveSecurityHealth({
        profile,
        emailVerified: !!fbUser?.emailVerified,
        hasPassword: isPasswordAccount,
        factorCount: enrolledFactorCount(fbUser),
        sessionCount: sessions.length,
        trustedContactCount: contactCount,
      }),
    [profile, fbUser, isPasswordAccount, sessions.length, contactCount]
  );

  const currentSession = sessions.find((s) => s.id === sessionId);
  const otherSessions = sessions.filter((s) => s.id !== sessionId);

  const passwordSubtitle = useMemo(() => {
    if (!isPasswordAccount) return "Managed by your Google sign-in";
    const ts = profile?.passwordUpdatedAt?.toMillis?.();
    if (!ts) return "Keep your password fresh";
    const days = Math.round((now - ts) / 86_400_000);
    return days <= 0 ? "Updated today" : `Last updated ${days} day${days === 1 ? "" : "s"} ago`;
  }, [isPasswordAccount, profile?.passwordUpdatedAt, now]);

  /* ── Handlers ── */

  async function handleChangePassword() {
    setPwError(null);
    if (newPw !== confirmPw) {
      setPwError("New passwords don't match.");
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(curPw, newPw);
      if (user) await updateUserProfile(user.uid, { passwordUpdatedAt: new Date() as never });
      showToast("Password updated", "success");
      setModal(null);
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Couldn't change your password.");
    } finally {
      setPwBusy(false);
    }
  }

  async function handleRevoke() {
    setRevokeBusy(true);
    try {
      const res = await revokeOtherSessions();
      showToast(
        res.revoked > 0
          ? `Signed out ${res.revoked} other device${res.revoked === 1 ? "" : "s"}`
          : "No other sessions to sign out",
        "success"
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't sign out other sessions.", "error");
    } finally {
      setRevokeBusy(false);
    }
  }

  async function handleExport() {
    setExportBusy(true);
    try {
      const data = await exportMyData();
      // Rendered as a plain-language PDF (not JSON) — the audience is a
      // non-technical user reading their own PDPA data report.
      const { buildDataExportPdf, dataExportFilename } = await import("@/lib/data-export-pdf");
      const blob = await buildDataExportPdf(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dataExportFilename(data);
      a.click();
      URL.revokeObjectURL(url);
      showToast("Your data report is downloading", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't prepare your data.", "error");
    } finally {
      setExportBusy(false);
    }
  }

  async function handleToggleAppLock() {
    if (!user || appLockBusy) return;
    // Turning ON opens the PIN setup; turning OFF clears the local secret.
    if (!appLockOn) {
      setPinInput("");
      setPinConfirm("");
      setUseBiometric(false);
      setLockError(null);
      setModal("applock");
      return;
    }
    setAppLockBusy(true);
    try {
      clearAppLock();
      setAppLockOn(false);
      await updateUserProfile(user.uid, { appLockEnabled: false, appLockBiometric: false });
      showToast("App lock disabled", "success");
    } catch {
      showToast("Couldn't update app lock.", "error");
    } finally {
      setAppLockBusy(false);
    }
  }

  async function handleEnableAppLock() {
    setLockError(null);
    if (pinInput.length < 4) {
      setLockError("Choose a PIN of at least 4 digits.");
      return;
    }
    if (pinInput !== pinConfirm) {
      setLockError("PINs don't match.");
      return;
    }
    setLockBusy(true);
    try {
      await saveAppLockPin(pinInput);
      let bioOn = false;
      if (useBiometric) {
        bioOn = await registerBiometric();
        if (!bioOn) {
          showToast("Biometric setup was skipped, but your PIN still works.", "success");
        }
      }
      if (user) await updateUserProfile(user.uid, { appLockEnabled: true, appLockBiometric: bioOn });
      setAppLockOn(true);
      setModal(null);
      showToast("App lock enabled", "success");
    } catch (e) {
      setLockError(e instanceof Error ? e.message : "Couldn't enable app lock.");
    } finally {
      setLockBusy(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== "DELETE") return;
    setDeleteBusy(true);
    try {
      await deleteMyAccount();
      try {
        localStorage.removeItem("guidr_session_id");
      } catch {
        /* ignore */
      }
      await signOut(auth);
      showToast("Your account has been deleted", "success");
      router.push("/onboarding");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't delete your account.", "error");
      setDeleteBusy(false);
    }
  }

  const mfaOn = getEnrolledFactors(fbUser).length > 0 || !!profile?.mfaEnabled;

  function openTwoFactor() {
    setMfaError(null);
    setMfaCode("");
    setMfaVerificationId("");
    setMfaPhone((profile?.phone as E164Number) || undefined);
    // Already enrolled → manage/disable; feature off → "soon"; otherwise enroll.
    setTwoFAStep(mfaOn ? "status" : MFA_FEATURE_ENABLED ? "phone" : "soon");
    setModal("2fa");
  }

  function closeTwoFactor() {
    try {
      recaptchaRef.current?.clear();
    } catch {
      /* ignore */
    }
    recaptchaRef.current = null;
    setModal(null);
    setMfaBusy(false);
    setMfaError(null);
    setMfaCode("");
    setMfaVerificationId("");
  }

  async function handleSendMfaCode() {
    setMfaError(null);
    if (!fbUser?.emailVerified) {
      setMfaError("Verify your email address first (button below).");
      return;
    }
    if (!mfaPhone || !isValidPhoneNumber(mfaPhone)) {
      setMfaError("Enter a valid phone number for the selected country.");
      return;
    }
    setMfaBusy(true);
    try {
      const verifier = new RecaptchaVerifier(auth, "guidr-recaptcha", { size: "invisible" });
      recaptchaRef.current = verifier;
      await verifier.render();
      const vid = await startMfaEnrollment(mfaPhone as string, verifier);
      setMfaVerificationId(vid);
      setTwoFAStep("code");
    } catch (e) {
      setMfaError(e instanceof Error ? e.message : "Couldn't send the code.");
      try {
        recaptchaRef.current?.clear();
      } catch {
        /* ignore */
      }
      recaptchaRef.current = null;
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleVerifyMfa() {
    setMfaError(null);
    if (mfaCode.trim().length < 6) {
      setMfaError("Enter the 6-digit code from the SMS.");
      return;
    }
    setMfaBusy(true);
    try {
      await finishMfaEnrollment(mfaVerificationId, mfaCode.trim(), "SMS");
      if (user) {
        await updateUserProfile(user.uid, {
          mfaEnabled: true,
          phone: mfaPhone as string,
          phoneVerified: true,
        });
      }
      showToast("Two-factor enabled", "success");
      closeTwoFactor();
    } catch (e) {
      setMfaError(e instanceof Error ? e.message : "Couldn't verify the code.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleDisableMfa() {
    setMfaBusy(true);
    try {
      await disableMfa();
      if (user) await updateUserProfile(user.uid, { mfaEnabled: false });
      showToast("Two-factor disabled", "success");
      closeTwoFactor();
    } catch (e) {
      setMfaError(e instanceof Error ? e.message : "Couldn't disable two-factor.");
      setMfaBusy(false);
    }
  }

  async function handleSendVerifyEmail() {
    try {
      await sendVerificationEmail();
      showToast("Verification email sent. Check your inbox", "success");
    } catch {
      showToast("Couldn't send the email. Try again shortly.", "error");
    }
  }

  const dotColor = (ok: boolean, warn?: boolean) => (ok ? "#4ade80" : warn ? "#fbbf24" : "#f87171");

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-4">
        <div className="flex flex-col gap-4 w-full lg:max-w-2xl lg:mx-auto">
          {/* ── Title row ── */}
          <div className="flex items-center gap-3 guidr-animate-in guidr-stagger-1">
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all shrink-0 text-guidr-primary"
            >
              <Icon name="back" size={18} />
            </button>
            <h2 className="text-xl font-bold text-guidr-text">Privacy &amp; Security</h2>
          </div>

          {/* ── Security Health hero ── */}
          <section className="guidr-animate-in guidr-stagger-2">
            <div className="relative overflow-hidden rounded-[20px] bg-[#0f172a] text-white p-5">
              <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-white/[0.035]" />
              <div className="absolute -right-7 -top-7 w-28 h-28 rounded-full bg-white/[0.04]" />
              <div className="relative">
                <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-white/55 mb-4">
                  Security Health
                </p>
                <div className="flex items-center gap-3.5 mb-4">
                  <div
                    className="w-12 h-12 rounded-[13px] flex items-center justify-center shrink-0"
                    style={{
                      background: health.level === "strong" ? "rgba(74,222,128,0.16)" : "rgba(251,191,36,0.16)",
                      color: health.level === "strong" ? "#4ade80" : "#fbbf24",
                    }}
                  >
                    <Icon name="shield-check" size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[17px] font-semibold m-0">{health.headline}</p>
                    <p className="text-xs text-white/60 mt-0.5 m-0">
                      {health.enabled} of {health.total} protections enabled
                    </p>
                  </div>
                </div>
                <div className="h-px bg-white/10 mb-3.5" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {health.checks.map((c) => (
                    <div key={c.key} className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: dotColor(c.ok, c.warn) }}
                      />
                      <span className="text-xs text-white/[0.88]">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Current device ── */}
          <section className="guidr-animate-in guidr-stagger-2">
            <div className="bg-white rounded-[14px] border border-gray-100 px-3.5 py-2.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
                <Icon name="device" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium text-guidr-text m-0 truncate">
                    {currentSession?.device || "This device"}
                  </p>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="relative w-1.5 h-1.5">
                      <span className="animate-ping absolute inset-0 rounded-full bg-green-500" />
                      <span className="absolute inset-0 rounded-full bg-green-500" />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-green-600">
                      Active now
                    </span>
                  </span>
                </div>
                <p className="text-[11px] text-guidr-muted mt-0.5 m-0 truncate">
                  {[currentSession?.location, "this device"].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          </section>

          {/* ── Account Security ── */}
          <section className="guidr-animate-in guidr-stagger-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-guidr-muted mb-3 ml-1">
              Account Security
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <Row
                icon="shield-lock"
                iconBg={mfaOn ? "#dcfce7" : "#fef3c7"}
                iconColor={mfaOn ? "#166534" : "#92400e"}
                title="Two-factor authentication"
                badge={mfaOn ? undefined : MFA_FEATURE_ENABLED ? "Recommended" : "Soon"}
                subtitle={
                  mfaOn
                    ? "On: SMS code at sign-in"
                    : MFA_FEATURE_ENABLED
                      ? "Add a second step to sign-in"
                      : "Coming soon"
                }
                onClick={openTwoFactor}
              />
              {isPasswordAccount && (
                <Row
                  icon="key"
                  title="Change password"
                  subtitle={passwordSubtitle}
                  onClick={() => setModal("password")}
                />
              )}
              <Row
                icon="history"
                title="Sign-in history"
                subtitle={`${sessions.length} active device${sessions.length === 1 ? "" : "s"}`}
                onClick={() => setModal("history")}
              />
              <Row
                icon="logout"
                iconBg="#fee2e2"
                iconColor="#dc2626"
                title="Sign out all other sessions"
                titleColor="#dc2626"
                subtitle={revokeBusy ? "Signing out…" : "Keeps this device signed in"}
                onClick={revokeBusy ? undefined : handleRevoke}
                last
              />
            </div>
          </section>

          {/* ── App Lock ── */}
          <section className="guidr-animate-in guidr-stagger-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-guidr-muted mb-3 ml-1">
              App Lock
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 px-3.5 py-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#0f172a] text-white flex items-center justify-center shrink-0">
                  <Icon name="fingerprint" size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-guidr-text m-0">Require biometric or PIN</p>
                  <p className="text-xs text-guidr-muted mt-0.5 m-0">Lock Guidr when you switch apps</p>
                </div>
                <button
                  role="switch"
                  aria-checked={appLockOn}
                  aria-label="Toggle app lock"
                  onClick={handleToggleAppLock}
                  disabled={appLockBusy}
                  className="relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-60"
                  style={{ background: appLockOn ? "#0d7377" : "#cbd5e1" }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all"
                    style={{ left: appLockOn ? "22px" : "2px" }}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* ── Data & Privacy ── */}
          <section className="guidr-animate-in guidr-stagger-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-guidr-muted mb-3 ml-1">
              Data &amp; Privacy
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <Row
                icon="download"
                title="Download my data"
                subtitle={exportBusy ? "Preparing your PDF…" : "A PDF report of everything we store"}
                onClick={exportBusy ? undefined : handleExport}
              />
              <Row
                icon="info"
                title="What we collect"
                subtitle="Our data practices in plain English"
                onClick={() => setModal("collect")}
                last
              />
            </div>
          </section>

          {/* ── Danger Zone ── */}
          <section className="guidr-animate-in guidr-stagger-5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 mb-3 ml-1">
              Danger Zone
            </p>
            <div className="bg-white rounded-2xl border border-red-200 border-t-[3px] border-t-red-600 px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-[10px] bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <Icon name="trash" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-guidr-text m-0">Delete my account</p>
                  <p className="text-xs text-guidr-muted mt-1 mb-2.5 leading-relaxed">
                    Erases your scans, reports, and guardian links within 30 days. Your guardians will
                    be notified.
                  </p>
                  <button
                    onClick={() => setModal("delete")}
                    className="text-xs font-semibold text-red-600 bg-white border border-red-200 px-3.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Delete account
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── Footer ── */}
          <div className="flex flex-col items-center gap-2.5 pt-1 pb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/5 rounded-full text-slate-900">
              <Icon name="lock" size={12} />
              <span className="text-[11px] font-medium text-guidr-text">Encrypted in transit &amp; at rest</span>
            </div>
            <p className="text-[11px] text-guidr-muted text-center leading-relaxed m-0">
              Guidr complies with Malaysia&apos;s Personal Data Protection Act 2010
            </p>
          </div>
        </div>
      </main>
      <BottomNav />

      {/* ── Change password modal ── */}
      {modal === "password" && (
        <Modal
          onClose={() => {
            setModal(null);
            setPwError(null);
          }}
        >
          <h3 className="text-lg font-bold text-guidr-text mb-4">Change password</h3>
          <div className="flex flex-col gap-3 mb-4">
            <input
              type="password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-guidr-primary focus:ring-1 focus:ring-guidr-primary/20"
            />
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="New password (min 8 characters)"
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-guidr-primary focus:ring-1 focus:ring-guidr-primary/20"
            />
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-guidr-primary focus:ring-1 focus:ring-guidr-primary/20"
            />
          </div>
          {pwError && <p className="text-xs text-guidr-red mb-3">{pwError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setModal(null);
                setPwError(null);
              }}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleChangePassword}
              disabled={pwBusy || !curPw || !newPw || !confirmPw}
              className="flex-1 py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {pwBusy ? "Updating…" : "Update password"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Sign-in history modal ── */}
      {modal === "history" && (
        <Modal onClose={() => setModal(null)}>
          <h3 className="text-lg font-bold text-guidr-text mb-1">Sign-in history</h3>
          <p className="text-xs text-guidr-muted mb-4">Devices currently signed in to your account.</p>
          <div className="flex flex-col gap-2.5">
            {sessions.length === 0 && (
              <p className="text-sm text-guidr-muted text-center py-4">No active devices found.</p>
            )}
            {currentSession && <SessionRow s={currentSession} current now={now} />}
            {otherSessions.map((s) => (
              <SessionRow
                key={s.id}
                s={s}
                now={now}
                onRemove={async () => {
                  if (!user || !s.id) return;
                  await deleteSession(user.uid, s.id);
                  showToast("Device removed from list", "success");
                }}
              />
            ))}
          </div>
          {otherSessions.length > 0 && (
            <button
              onClick={() => {
                setModal(null);
                handleRevoke();
              }}
              className="w-full mt-4 py-3 rounded-xl border border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors"
            >
              Sign out all other sessions
            </button>
          )}
        </Modal>
      )}

      {/* ── What we collect modal ── */}
      {modal === "collect" && (
        <Modal onClose={() => setModal(null)}>
          <h3 className="text-lg font-bold text-guidr-text mb-4">What we collect</h3>
          <div className="flex flex-col gap-3.5 text-sm text-guidr-text">
            {[
              ["Account basics", "Your name, email, and the phone number you choose to add, used to sign you in and link guardians."],
              ["Scans & reports", "The messages you submit for analysis and the verdicts we generate, so you can revisit your cases."],
              ["Guardian links", "Who you've added as a trusted contact and who protects you, to deliver scam alerts."],
              ["Device sessions", "A label and approximate city for each signed-in device, so you can spot anything unfamiliar."],
            ].map(([h, b]) => (
              <div key={h} className="flex gap-3">
                <span className="text-guidr-primary mt-0.5 shrink-0">
                  <Icon name="check" size={16} />
                </span>
                <div>
                  <p className="font-semibold m-0">{h}</p>
                  <p className="text-xs text-guidr-muted mt-0.5 m-0 leading-relaxed">{b}</p>
                </div>
              </div>
            ))}
            <p className="text-xs text-guidr-muted leading-relaxed mt-1">
              We never sell your data. Everything is encrypted in transit and at rest, and you can
              download or delete it anytime from this page.
            </p>
          </div>
          <button
            onClick={() => setModal(null)}
            className="w-full mt-5 py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark transition-colors"
          >
            Got it
          </button>
        </Modal>
      )}

      {/* ── App lock setup modal ── */}
      {modal === "applock" && (
        <Modal
          onClose={() => {
            if (lockBusy) return;
            setModal(null);
          }}
        >
          <h3 className="text-lg font-bold text-guidr-text mb-2">Set up app lock</h3>
          <p className="text-sm text-guidr-muted leading-relaxed mb-4">
            Choose a PIN you&apos;ll enter to open Guidr after switching apps. This stays on this
            device only.
          </p>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="New PIN (4–8 digits)"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-center text-lg tracking-[0.4em] font-semibold focus:outline-none focus:border-guidr-primary focus:ring-1 focus:ring-guidr-primary/20"
            />
            <input
              type="password"
              inputMode="numeric"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Confirm PIN"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-center text-lg tracking-[0.4em] font-semibold focus:outline-none focus:border-guidr-primary focus:ring-1 focus:ring-guidr-primary/20"
            />
          </div>
          {biometricSupported() && (
            <label className="flex items-center gap-2.5 mt-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useBiometric}
                onChange={(e) => setUseBiometric(e.target.checked)}
                className="w-4 h-4 accent-guidr-primary"
              />
              <span className="text-sm text-guidr-text">Also unlock with biometrics on this device</span>
            </label>
          )}
          {lockError && <p className="text-xs text-guidr-red mt-3">{lockError}</p>}
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => setModal(null)}
              disabled={lockBusy}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleEnableAppLock}
              disabled={lockBusy || pinInput.length < 4 || pinConfirm.length < 4}
              className="flex-1 py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {lockBusy ? "Enabling…" : "Enable lock"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Two-factor modal ── */}
      {modal === "2fa" && (
        <Modal onClose={closeTwoFactor}>
          <h3 className="text-lg font-bold text-guidr-text mb-2">Two-factor authentication</h3>

          {/* Feature not yet enabled (Blaze/Identity Platform on the roadmap) */}
          {twoFAStep === "soon" && (
            <>
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-amber-200 bg-amber-50 mb-4">
                <span className="text-amber-600">
                  <Icon name="shield-lock" size={18} />
                </span>
                <span className="text-sm font-semibold text-guidr-text">Coming soon</span>
              </div>
              <p className="text-sm text-guidr-muted leading-relaxed mb-5">
                SMS two-factor will add a one-time code to your sign-in. We&apos;re putting the
                finishing touches on it. It&apos;ll appear here as soon as it&apos;s ready.
              </p>
              <button
                onClick={closeTwoFactor}
                className="w-full py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark transition-colors"
              >
                Got it
              </button>
            </>
          )}

          {/* Already enrolled → offer to turn it off */}
          {twoFAStep === "status" && (
            <>
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-guidr-primary bg-guidr-primary-light/20 mb-4">
                <span className="text-guidr-primary">
                  <Icon name="check" size={18} />
                </span>
                <span className="text-sm font-semibold text-guidr-text">
                  Two-factor is on for your account
                </span>
              </div>
              <p className="text-sm text-guidr-muted leading-relaxed mb-5">
                You&apos;ll be asked for an SMS code when signing in on a new device. Turning this off
                lowers your account security.
              </p>
              {mfaError && <p className="text-xs text-guidr-red mb-3">{mfaError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={closeTwoFactor}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleDisableMfa}
                  disabled={mfaBusy}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-all disabled:opacity-40"
                >
                  {mfaBusy ? "Turning off…" : "Turn off"}
                </button>
              </div>
            </>
          )}

          {/* Step 1 — phone number */}
          {twoFAStep === "phone" && (
            <>
              <p className="text-sm text-guidr-muted leading-relaxed mb-4">
                We&apos;ll text a 6-digit code to this number whenever you sign in on a new device.
              </p>
              {!fbUser?.emailVerified && (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-guidr-text mb-3 leading-relaxed">
                  Verify your email address before enabling two-factor.{" "}
                  <button onClick={handleSendVerifyEmail} className="font-semibold text-guidr-primary underline">
                    Send verification email
                  </button>
                </div>
              )}
              <label className="text-xs font-bold text-guidr-muted uppercase tracking-wide mb-1 block">
                Phone number
              </label>
              <PhoneField value={mfaPhone} onChange={setMfaPhone} defaultCountry="MY" placeholder="12-345 6789" />
              {mfaError && <p className="text-xs text-guidr-red mt-2">{mfaError}</p>}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={closeTwoFactor}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendMfaCode}
                  disabled={mfaBusy || !mfaPhone}
                  className="flex-1 py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark transition-all disabled:opacity-40"
                >
                  {mfaBusy ? "Sending…" : "Send code"}
                </button>
              </div>
            </>
          )}

          {/* Step 2 — verify code */}
          {twoFAStep === "code" && (
            <>
              <p className="text-sm text-guidr-muted leading-relaxed mb-4">
                Enter the 6-digit code we texted to {mfaPhone}.
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-center text-lg tracking-[0.4em] font-semibold focus:outline-none focus:border-guidr-primary focus:ring-1 focus:ring-guidr-primary/20"
              />
              {mfaError && <p className="text-xs text-guidr-red mt-2">{mfaError}</p>}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setTwoFAStep("phone")}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleVerifyMfa}
                  disabled={mfaBusy || mfaCode.length < 6}
                  className="flex-1 py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark transition-all disabled:opacity-40"
                >
                  {mfaBusy ? "Verifying…" : "Verify & enable"}
                </button>
              </div>
            </>
          )}

          {/* Invisible reCAPTCHA host (required by Firebase phone verification) */}
          <div id="guidr-recaptcha" />
        </Modal>
      )}

      {/* ── Delete account modal ── */}
      {modal === "delete" && (
        <Modal
          onClose={() => {
            if (deleteBusy) return;
            setModal(null);
            setDeleteConfirm("");
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <Icon name="trash" size={20} />
            </div>
            <h3 className="text-lg font-bold text-guidr-text">Delete account</h3>
          </div>
          <p className="text-sm text-guidr-muted leading-relaxed mb-2">
            This permanently erases your scans, reports, trusted contacts, and guardian links. Active
            guardians will be notified. <strong className="text-guidr-text">This cannot be undone.</strong>
          </p>
          <label className="text-xs font-bold text-guidr-muted uppercase tracking-wide mb-1 block mt-4">
            Type DELETE to confirm
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200 mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={() => {
                setModal(null);
                setDeleteConfirm("");
              }}
              disabled={deleteBusy}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteBusy || deleteConfirm.trim().toUpperCase() !== "DELETE"}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {deleteBusy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Session row (used in history modal) ── */
function SessionRow({
  s,
  current,
  now,
  onRemove,
}: {
  s: DeviceSession;
  current?: boolean;
  now: number;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2.5">
      <div className="w-9 h-9 rounded-[10px] bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
        <Icon name="device" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-guidr-text m-0 truncate">{s.device || "Unknown device"}</p>
          {current && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
              This device
            </span>
          )}
        </div>
        <p className="text-[11px] text-guidr-muted mt-0.5 m-0 truncate">
          {[s.location, relativeTime(s.lastSeenAt?.toMillis?.(), now)].filter(Boolean).join(" · ")}
        </p>
      </div>
      {!current && onRemove && (
        <button onClick={onRemove} aria-label="Remove device" className="text-guidr-muted hover:text-red-500 p-1 shrink-0">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
