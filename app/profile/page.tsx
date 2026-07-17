"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect, useRef } from "react";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import { useUser } from "@/app/context/UserContext";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { updateUserProfile, deriveCaseStatus, subscribeTrustedContacts } from "@/lib/firestore";
import { getSecurityLevel } from "@/lib/security-level";

/* ── Menu row icons ── */
function MenuIcon({ type }: { type: string }) {
  const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "cases": return <svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
    case "level": return <svg {...p}><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>;
    case "identity": return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case "bell": return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
    case "lock": return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    case "help": return <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case "info": return <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

export default function ProfilePage() {
  const { user } = useUser();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Real-time profile data from Firestore
  const [profileData, setProfileData] = useState({
    xp: 0,
    casesScanned: 0,
    scamsReported: 0,
    quizzesPassed: 0,
    isIdentityVerified: false,
  });
  const [profileLoading, setProfileLoading] = useState(true);

  // Case-derived headline stats (Cases / Reported / Resolved).
  const [caseStats, setCaseStats] = useState({ total: 0, reported: 0, resolved: 0 });

  // Guardian protection is Guidr's core feature — surface live status up top.
  const [guardianCount, setGuardianCount] = useState<number | null>(null);

  const [showAboutModal, setShowAboutModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProfileData({
          xp: data.xp || 0,
          casesScanned: data.casesScanned || 0,
          scamsReported: data.scamsReported || 0,
          quizzesPassed: data.quizzesPassed || 0,
          isIdentityVerified: data.isIdentityVerified || false,
        });
      }
      setProfileLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Headline stats come from the user's actual cases so they read Cases /
  // Reported / Resolved (consistent with the My Cases page).
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "cases"), where("userId", "==", user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        let reported = 0;
        let resolved = 0;
        snap.forEach((d) => {
          const status = deriveCaseStatus(d.data() as Parameters<typeof deriveCaseStatus>[0]);
          if (status === "reported") reported++;
          else if (status === "resolved") resolved++;
        });
        setCaseStats({ total: snap.size, reported, resolved });
      },
      (err) => logger.error("Error loading case stats:", err)
    );
    return () => unsub();
  }, [user]);

  // Live trusted-contact count for the Guardian card.
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeTrustedContacts(user.uid, (c) => setGuardianCount(c.length));
    return () => unsub();
  }, [user]);

  const level = getSecurityLevel(profileData.xp);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      logger.error("Error signing out:", error);
    }
  };

  async function handleProfilePictureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    try {
      // Compress and convert to base64 — stored in Firestore only
      // (Firebase Auth photoURL has a character limit too small for base64)
      const dataUrl = await compressImage(file, 200, 200);

      // Save to Firestore only
      await updateUserProfile(user.uid, { photoURL: dataUrl } as any);

      // Force re-render to pick up the new photo from Firestore
      window.location.reload();
    } catch (err) {
      logger.error("Error uploading profile picture:", err);
    } finally {
      setUploadingPhoto(false);
    }
  }

  /** Compress image to target dimensions and return as base64 data URL */
  function compressImage(file: File, maxW: number, maxH: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > h) { h = Math.round(h * maxW / w); w = maxW; }
          else { w = Math.round(w * maxH / h); h = maxH; }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = reject;
        img.src = ev.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const stats = [
    { label: "Cases", value: caseStats.total },
    { label: "Reported", value: caseStats.reported },
    { label: "Resolved", value: caseStats.resolved },
  ];

  const menu = [
    { icon: "cases", label: "My Cases", onClick: () => router.push("/cases") },
    { icon: "level", label: "Security Level", onClick: () => router.push("/profile/security-level"), trailing: `Lv ${level.levelNum}` },
    {
      icon: "identity",
      label: "Identity Verification",
      onClick: () => router.push("/profile/verification"),
      trailing: profileData.isIdentityVerified ? "Verified" : undefined,
      trailingGood: profileData.isIdentityVerified,
    },
    { icon: "settings", label: "Settings", onClick: () => router.push("/preferences") },
    { icon: "lock", label: "Privacy & Security", onClick: () => router.push("/settings/privacy") },
    { icon: "help", label: "Help & Support", onClick: () => router.push("/help") },
    { icon: "info", label: "About Guidr", onClick: () => setShowAboutModal(true) },
  ];

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-5">
        <div className="flex flex-col gap-5 w-full lg:max-w-2xl lg:mx-auto">

        {/* ── Avatar + Identity ── */}
        <div className="flex flex-col items-center guidr-animate-in guidr-stagger-1">
          <div className="relative mb-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-full bg-guidr-primary flex items-center justify-center shadow-sm border-2 border-white group overflow-hidden"
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.fullName} className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-white">
                  {user?.fullName?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "U"}
                </span>
              )}
              {/* Camera overlay */}
              <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploadingPhoto ? (
                  <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                  </svg>
                )}
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePictureUpload} />
            {/* Level badge on avatar */}
            <div className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br ${level.color} flex items-center justify-center text-sm shadow-md border-2 border-white`}>
              {level.icon}
            </div>
          </div>

          <h2 className="text-xl font-bold text-guidr-text">{user?.fullName || "User"}</h2>
          <p className="text-sm text-guidr-muted mt-0.5">{user?.email}</p>

          {/* e-KYC badge */}
          {profileData.isIdentityVerified ? (
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-green-50 text-green-600 border border-green-200/50 uppercase">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
              Verified Reporter
            </span>
          ) : (
            <button
              onClick={() => router.push("/profile/verification")}
              className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200/50 uppercase hover:bg-amber-100 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" /></svg>
              Verify identity
            </button>
          )}
        </div>

        {/* ── Stats (Cases / Reported / Resolved) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 grid grid-cols-3 divide-x divide-gray-100 guidr-animate-in guidr-stagger-2">
          {stats.map((s) => (
            <button key={s.label} onClick={() => router.push("/cases")} className="py-4 flex flex-col items-center hover:bg-gray-50/60 transition-colors first:rounded-l-2xl last:rounded-r-2xl">
              <span className="text-2xl font-bold text-guidr-text">{profileLoading ? "—" : s.value}</span>
              <span className="text-xs text-guidr-muted mt-0.5">{s.label}</span>
            </button>
          ))}
        </div>

        {/* ── Guardian Protection (hero — Guidr's core feature) ── */}
        <button
          onClick={() => router.push("/settings")}
          className="relative overflow-hidden text-left bg-guidr-primary rounded-2xl p-4 shadow-sm guidr-animate-in guidr-stagger-2 active:scale-[0.99] transition-transform"
        >
          <div className="absolute -right-6 -top-8 w-32 h-32 bg-white/10 rounded-full pointer-events-none" />
          <div className="relative flex items-center gap-3">
            <div className="shrink-0 w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white">Guardian Protection</p>
              <p className="text-xs text-white/80 mt-0.5">
                {guardianCount === null
                  ? "Warn the people you care about"
                  : guardianCount === 0
                  ? "Add trusted contacts to start protecting them"
                  : `${guardianCount} trusted ${guardianCount === 1 ? "contact" : "contacts"} · scam alerts on`}
              </p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </button>

        {/* ── Menu ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden guidr-animate-in guidr-stagger-3">
          {menu.map((item, i) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors ${i > 0 ? "border-t border-gray-100" : ""}`}
            >
              <span className="text-guidr-primary"><MenuIcon type={item.icon} /></span>
              <span className="flex-1 font-medium text-guidr-text">{item.label}</span>
              {item.trailing && (
                <span className={`text-xs font-semibold ${item.trailingGood ? "text-green-600" : "text-guidr-muted"}`}>{item.trailing}</span>
              )}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>

        {/* ── Sign Out ── */}
        <button
          onClick={handleSignOut}
          className="w-full py-3.5 bg-white text-red-600 font-semibold rounded-2xl border border-gray-100 shadow-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2 guidr-animate-in guidr-stagger-4"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign Out
        </button>

        </div>

      </main>
      <BottomNav />

      {/* ── About Guidr Modal ── */}
      {showAboutModal && (
        <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAboutModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl lg:rounded-2xl shadow-xl guidr-animate-in max-h-[88vh] flex flex-col overflow-hidden">

            {/* Sticky header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-200 shrink-0">
              <h3 className="text-base font-bold text-guidr-text flex-1">About Guidr</h3>
              <button
                aria-label="Close"
                onClick={() => setShowAboutModal(false)}
                className="w-9 h-9 -mr-1 flex items-center justify-center rounded-xl text-guidr-text hover:bg-gray-100 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto no-scrollbar px-4 pt-5 pb-8">

              {/* HERO */}
              <section className="mb-[18px]">
                <div className="relative overflow-hidden bg-guidr-primary rounded-[20px] px-5 pt-[30px] pb-6 text-center text-white">
                  <div className="absolute -right-14 -top-14 w-52 h-52 rounded-full bg-white/[0.045]" />
                  <div className="absolute -left-11 -bottom-11 w-[170px] h-[170px] rounded-full bg-white/[0.03]" />
                  <div className="absolute top-3.5 right-3.5 px-2.5 py-1 bg-white/10 rounded-full">
                    <span className="text-[10px] font-semibold text-white/85">v1.0.4</span>
                  </div>
                  <div className="relative">
                    <div className="w-[62px] h-[62px] rounded-[18px] bg-white/15 flex items-center justify-center mx-auto mb-3.5">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
                      </svg>
                    </div>
                    <p className="text-[26px] font-bold text-white mb-1 -tracking-[0.01em]">Guidr</p>
                    <p className="text-[13px] text-white/70 mb-5">Security Made Simple</p>
                    <div className="inline-flex items-center gap-[7px] px-4 py-1.5 bg-white/[0.12] rounded-full">
                      <span className="text-sm">🇲🇾</span>
                      <span className="text-[11px] font-semibold text-white/90">Proudly Malaysian</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* STORY IN NUMBERS */}
              <section className="mb-[22px]">
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="grid grid-cols-3">
                    <div className="px-2.5 py-4 text-center">
                      <p className="text-[17px] font-bold text-guidr-text mb-[5px] -tracking-[0.01em]">RM1.57B</p>
                      <p className="text-[10px] text-guidr-muted leading-normal">Scam losses in Malaysia, 2024</p>
                    </div>
                    <div className="px-2.5 py-4 text-center border-x border-gray-100">
                      <p className="text-[17px] font-bold text-guidr-primary mb-[5px]">2026</p>
                      <p className="text-[10px] text-guidr-muted leading-normal">Year we started fighting back</p>
                    </div>
                    <div className="px-2.5 py-4 text-center">
                      <p className="text-[17px] font-bold text-guidr-text mb-[5px]">0</p>
                      <p className="text-[10px] text-guidr-muted leading-normal">Times your data was sold</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* MISSION */}
              <section className="mb-[22px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">Our mission</p>
                <div className="bg-white rounded-2xl border border-gray-100 px-4 py-[18px]">
                  <p className="text-[13px] text-gray-700 mb-3 leading-[1.75]">Malaysians lost over <strong className="text-guidr-text">RM1.57 billion</strong> to online fraud in 2024. Most victims weren&apos;t careless. They were targeted by tactics built to exploit trust.</p>
                  <p className="text-[13px] text-gray-700 mb-3 leading-[1.75]">Guidr exists to give every Malaysian a second opinion before they click, reply, or transfer. Not for experts, but for your mum, your fresh grad cousin, your uncle who got that Bank Negara SMS.</p>
                  <p className="text-[13px] text-guidr-primary font-bold leading-relaxed pt-1 border-t border-gray-100">We&apos;re not stopping until 997 is the number you call to report a scam you already avoided.</p>
                </div>
              </section>

              {/* WHO BUILT THIS — VERiQ */}
              <section className="mb-[22px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">Who built this</p>
                <a
                  href="https://veriq.my"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-[13px] px-4 py-4 bg-white rounded-2xl border border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-guidr-primary text-white flex items-center justify-center text-[13px] font-bold shrink-0">VQ</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-guidr-text">VERiQ</p>
                    <p className="text-[11px] text-guidr-muted mt-0.5">The team behind Guidr · veriq.my</p>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </a>
              </section>

              {/* PARTNERS & CREDITS */}
              <section className="mb-[22px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">Partners &amp; credits</p>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-[13px] border-b border-gray-100">
                    <div className="w-9 h-9 rounded-[10px] bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-guidr-text">NSRC 997</p>
                      <p className="text-[11px] text-guidr-muted mt-0.5">National Scam Response Centre · 24-hour hotline</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-[13px] border-b border-gray-100">
                    <div className="w-9 h-9 rounded-[10px] bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="9" y1="22" x2="9" y2="2" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-guidr-text">SSM Malaysia</p>
                      <p className="text-[11px] text-guidr-muted mt-0.5">Suruhanjaya Syarikat Malaysia</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-[13px]">
                    <div className="w-9 h-9 rounded-[10px] bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22" /><line x1="6" y1="18" x2="6" y2="11" /><line x1="10" y1="18" x2="10" y2="11" /><line x1="14" y1="18" x2="14" y2="11" /><line x1="18" y1="18" x2="18" y2="11" /><polygon points="12 2 20 7 4 7" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-guidr-text">Bank Negara Malaysia</p>
                      <p className="text-[11px] text-guidr-muted mt-0.5">Central Bank of Malaysia</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* LEGAL */}
              <section className="mb-[22px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-guidr-muted mb-3 ml-1">Legal</p>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  {["Terms of Service", "Privacy Policy", "Open Source Licenses"].map((label, i, arr) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between px-4 py-[13px] ${i < arr.length - 1 ? "border-b border-gray-100" : ""}`}
                    >
                      <span className="text-[13px] font-medium text-guidr-text">{label}</span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  ))}
                </div>
              </section>

              {/* MAKER'S MARK */}
              <div className="text-center pt-1">
                <p className="text-[11px] text-gray-400 mb-1">Version 1.0.4 · Build 2026.06.08</p>
                <p className="text-[11px] text-gray-400">Made with care in Kuala Lumpur, Malaysia 🇲🇾</p>
                <p className="text-[11px] text-gray-400 mt-1">© 2026 Veriq Sdn Bhd. All rights reserved.</p>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
