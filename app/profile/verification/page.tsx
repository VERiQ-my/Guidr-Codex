"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect, useRef } from "react";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import { useUser } from "@/app/context/UserContext";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { updateUserProfile, awardXP } from "@/lib/firestore";

/* ── Inline icons (codebase convention — no icon font) ── */
function Icon({ type, size = 20, className }: { type: string; size?: number; className?: string }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (type) {
    case "back": return <svg {...p}><path d="M15 6l-6 6 6 6" /></svg>;
    case "id-badge": return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="12" cy="10" r="2.5" /><path d="M8 16a4 4 0 0 1 8 0" /></svg>;
    case "shield": return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case "shield-check": return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "lock": return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    case "lock-open": return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>;
    case "award": return <svg {...p}><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>;
    case "users": return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "trending-up": return <svg {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
    case "refresh": return <svg {...p}><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
    case "chevron-right": return <svg {...p}><polyline points="9 18 15 12 9 6" /></svg>;
    case "check": return <svg {...p}><polyline points="20 6 9 17 4 12" /></svg>;
    case "camera": return <svg {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>;
    case "card": return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>;
    case "user": return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function VerificationPage() {
  const { user } = useUser();
  const router = useRouter();

  const [isVerified, setIsVerified] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);

  // Capture flow (overlay). Mirrors the original e-KYC steps.
  const [showCapture, setShowCapture] = useState(false);
  const [step, setStep] = useState<"mykad" | "selfie" | "uploading" | "success">("mykad");
  const [mykadImage, setMykadImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const mykadInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  // Live verification status.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setIsVerified(!!snap.data().isIdentityVerified);
    });
    return () => unsub();
  }, [user]);

  // Pull the confirmation date from the stored e-KYC record.
  useEffect(() => {
    if (!user || !isVerified) return;
    getDoc(doc(db, "users", user.uid, "ekycData", "verification"))
      .then((snap) => {
        if (snap.exists()) setVerifiedAt(snap.data().verifiedAt || null);
      })
      .catch((err) => logger.error("Error loading verification record:", err));
  }, [user, isVerified]);

  function openCapture() {
    setStep("mykad");
    setMykadImage(null);
    setSelfieImage(null);
    setShowCapture(true);
  }

  function closeCapture() {
    setShowCapture(false);
    setStep("mykad");
    setMykadImage(null);
    setSelfieImage(null);
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

  async function handleMykadUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImage(file, 600, 400);
    setMykadImage(dataUrl);
    setStep("selfie");
  }

  async function handleSelfieUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImage(file, 400, 400);
    setSelfieImage(dataUrl);
  }

  async function handleConfirmVerification() {
    if (!user || !mykadImage || !selfieImage) return;
    setStep("uploading");
    try {
      const { doc: firestoreDoc, setDoc } = await import("firebase/firestore");
      await setDoc(firestoreDoc(db, "users", user.uid, "ekycData", "verification"), {
        mykadImage,
        selfieImage,
        verifiedAt: new Date().toISOString(),
        status: "verified",
      });
      await updateUserProfile(user.uid, { isIdentityVerified: true });
      await awardXP(user.uid, 50);
      setStep("success");
    } catch (err) {
      logger.error("Error saving verification:", err);
      setStep("selfie");
    }
  }

  const confirmedDate = formatDate(verifiedAt);

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-5">
        <div className="flex flex-col gap-5 w-full lg:max-w-2xl lg:mx-auto">

          {/* ── Page header with back button ── */}
          <div className="flex items-center gap-3 guidr-animate-in guidr-stagger-1">
            <button
              onClick={() => router.back()}
              aria-label="Back to profile"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all shrink-0 text-guidr-primary"
            >
              <Icon type="back" size={18} />
            </button>
            <h2 className="text-2xl font-bold text-guidr-text">Identity Verification</h2>
          </div>

          {isVerified ? (
            /* ─────────────── VERIFIED ─────────────── */
            <>
              {/* Hero */}
              <section className="guidr-animate-in guidr-stagger-2">
                <div className="bg-green-50 border border-green-200 border-t-[3px] border-t-green-500 rounded-2xl p-5">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                      <Icon type="shield-check" size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-guidr-text">You&apos;re verified</p>
                      <p className="text-xs text-green-700/90 mt-0.5">
                        {confirmedDate ? `Confirmed ${confirmedDate} · ` : ""}MyKad on file
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 rounded-full shrink-0">
                      <Icon type="shield-check" size={13} className="text-white" />
                      <span className="text-[10px] font-bold tracking-wider uppercase text-white">Verified</span>
                    </span>
                  </div>
                </div>
              </section>

              {/* Document history */}
              <section className="guidr-animate-in guidr-stagger-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-guidr-muted mb-3 ml-1">Document history</p>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
                    <div className="w-9 h-9 rounded-xl bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                      <Icon type="id-badge" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-guidr-text">MyKad on file</p>
                      <p className="text-xs text-guidr-muted mt-0.5">
                        {confirmedDate ? `Submitted ${confirmedDate} · ` : ""}reviewed by licensed KYC partner
                      </p>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-green-700 bg-green-100 px-2 py-0.5 rounded">Active</span>
                  </div>
                  <button
                    onClick={openCapture}
                    className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-guidr-muted flex items-center justify-center shrink-0">
                      <Icon type="refresh" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-guidr-text">Re-verify with updated MyKad</p>
                      <p className="text-xs text-guidr-muted mt-0.5">Use this if your IC has been renewed</p>
                    </div>
                    <Icon type="chevron-right" size={18} className="text-slate-300" />
                  </button>
                </div>
              </section>
            </>
          ) : (
            /* ─────────────── UNVERIFIED ─────────────── */
            <>
              {/* Hero */}
              <section className="guidr-animate-in guidr-stagger-2">
                <div className="bg-amber-50 border border-amber-200 border-t-[3px] border-t-amber-400 rounded-2xl p-5">
                  <div className="flex gap-3.5 items-start">
                    <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                      <Icon type="id-badge" size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Not yet verified</span>
                      <p className="text-[17px] font-bold text-guidr-text mt-1 mb-1 leading-tight">Unlock Verified Reporter</p>
                      <p className="text-xs text-amber-900/80 mb-3.5 leading-relaxed">Takes about 3 minutes. Have your MyKad ready.</p>
                      {/* Ghost badge */}
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-400/[0.08] border-[1.5px] border-amber-400/30 rounded-full mb-4">
                        <Icon type="shield" size={13} className="text-amber-800/40" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800/40">Verified Reporter</span>
                        <Icon type="lock" size={12} className="text-amber-800/40" />
                      </div>
                      <button
                        onClick={openCapture}
                        className="w-full bg-guidr-primary text-white text-[13px] font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
                      >
                        <Icon type="lock-open" size={16} />
                        Start verification
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Benefits */}
              <section className="guidr-animate-in guidr-stagger-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-guidr-muted mb-3 ml-1">Why it matters</p>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  {[
                    { icon: "award", title: "Verified Reporter badge", desc: "Displayed on your profile to show the community your reports come from a real, confirmed person" },
                    { icon: "users", title: "Guardian eligibility", desc: "Only verified users can be added as a guardian, the people your family and friends trust most to protect them" },
                    { icon: "trending-up", title: "Higher report weighting", desc: "Your scam flags are prioritised in our threat matching, helping protect other Malaysians faster" },
                  ].map((b, i, arr) => (
                    <div key={b.title} className={`flex gap-3.5 items-start px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-100" : ""}`}>
                      <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <Icon type={b.icon} size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-guidr-text mb-0.5">{b.title}</p>
                        <p className="text-xs text-guidr-muted leading-relaxed">{b.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Stepper */}
              <section className="guidr-animate-in guidr-stagger-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-guidr-muted mb-3 ml-1">How it works</p>
                <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
                  <div className="relative">
                    <div className="absolute left-[15px] top-8 w-0.5 border-l-2 border-dashed border-gray-200" style={{ height: "calc(100% - 64px)" }} aria-hidden="true" />
                    {[
                      { n: "1", time: "~30 sec", title: "MyKad photo", desc: "Front of your IC, clear and unblurred. No glare.", current: true },
                      { n: "2", time: "~30 sec", title: "Selfie verification", desc: "A live selfie matched against your MyKad photo", current: false },
                      { n: "3", time: "~1 min", title: "Review & confirm", desc: "Check your details and submit for verification", current: false },
                    ].map((s, i, arr) => (
                      <div key={s.n} className={`flex gap-3.5 items-start ${i < arr.length - 1 ? "mb-5" : ""}`}>
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 relative z-[1] ${
                            s.current ? "bg-amber-400 text-white" : "bg-slate-100 text-guidr-muted border-2 border-slate-200"
                          }`}
                        >
                          {s.n}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-semibold ${s.current ? "text-guidr-text" : "text-guidr-muted"}`}>{s.title}</p>
                            <span className="text-[9px] font-bold text-guidr-muted bg-slate-100 px-2 py-0.5 rounded-full">{s.time}</span>
                          </div>
                          <p className={`text-xs mt-0.5 leading-relaxed ${s.current ? "text-guidr-muted" : "text-gray-400"}`}>{s.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ── Privacy card (both states) ── */}
          <section className="guidr-animate-in guidr-stagger-4">
            <div className="bg-slate-900 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3.5">
                <Icon type="lock" size={16} className="text-amber-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Privacy guarantee</p>
              </div>
              <div className="flex flex-col gap-2.5">
                {[
                  "Your MyKad image is encrypted during upload and storage",
                  "Reviewed only by our licensed e-KYC partner, with no Guidr staff access",
                  "Used solely for one-time verification, not for any other purpose",
                  "You can request deletion of your document at any time",
                ].map((t) => (
                  <div key={t} className="flex items-start gap-2.5">
                    <Icon type="check" size={14} className="text-green-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-white/80 leading-relaxed">{t}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => router.push("/settings")}
                className="text-xs font-semibold text-amber-400 mt-3 hover:text-amber-300 transition-colors"
              >
                Read our privacy policy →
              </button>
            </div>
          </section>

        </div>
      </main>

      <BottomNav />

      {/* ── Capture flow overlay (MyKad → selfie → upload) ── */}
      {showCapture && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeCapture} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-6 pb-8 shadow-xl guidr-animate-in max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />

            {/* Hidden file inputs */}
            <input ref={mykadInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleMykadUpload} />
            <input ref={selfieInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleSelfieUpload} />

            {step === "mykad" ? (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-4 w-full">
                  <div className="flex gap-1">
                    <div className="w-8 h-1 bg-amber-500 rounded-full" />
                    <div className="w-8 h-1 bg-gray-200 rounded-full" />
                    <div className="w-8 h-1 bg-gray-200 rounded-full" />
                  </div>
                  <span className="text-[10px] font-bold text-guidr-muted ml-auto">Step 1 of 3</span>
                </div>

                <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                  <Icon type="card" size={28} />
                </div>
                <h3 className="text-lg font-bold text-guidr-text mb-2">Scan Your MyKad</h3>
                <p className="text-sm text-guidr-muted text-center mb-5">Take a clear photo of the front of your MyKad. Clear and unblurred, no glare.</p>

                {mykadImage ? (
                  <div className="w-full mb-4">
                    <img src={mykadImage} alt="MyKad" className="w-full rounded-xl border-2 border-green-300 shadow-md" />
                    <p className="text-xs text-green-600 font-bold text-center mt-2">✓ Document captured</p>
                  </div>
                ) : (
                  <button
                    onClick={() => mykadInputRef.current?.click()}
                    className="w-full aspect-[1.6] rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 flex flex-col items-center justify-center gap-3 hover:bg-amber-50 transition-colors mb-4 text-amber-600"
                  >
                    <Icon type="camera" size={40} />
                    <span className="text-sm font-semibold text-amber-700">Tap to scan / upload</span>
                    <span className="text-[10px] text-guidr-muted">Camera or file upload</span>
                  </button>
                )}

                <div className="flex gap-3 w-full">
                  <button
                    onClick={closeCapture}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm"
                  >Cancel</button>
                  <button
                    onClick={() => mykadImage ? setStep("selfie") : mykadInputRef.current?.click()}
                    className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 active:scale-[0.98] transition-all"
                  >{mykadImage ? "Next" : "Scan"}</button>
                </div>
              </div>
            ) : step === "selfie" ? (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-4 w-full">
                  <div className="flex gap-1">
                    <div className="w-8 h-1 bg-amber-500 rounded-full" />
                    <div className="w-8 h-1 bg-amber-500 rounded-full" />
                    <div className="w-8 h-1 bg-gray-200 rounded-full" />
                  </div>
                  <span className="text-[10px] font-bold text-guidr-muted ml-auto">Step 2 of 3</span>
                </div>

                <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                  <Icon type="user" size={28} />
                </div>
                <h3 className="text-lg font-bold text-guidr-text mb-2">Take a Selfie</h3>
                <p className="text-sm text-guidr-muted text-center mb-5">A live selfie matched against your MyKad photo.</p>

                {selfieImage ? (
                  <div className="w-40 h-40 mx-auto mb-4">
                    <img src={selfieImage} alt="Selfie" className="w-full h-full object-cover rounded-full border-2 border-green-300 shadow-md" />
                    <p className="text-xs text-green-600 font-bold text-center mt-2">✓ Selfie captured</p>
                  </div>
                ) : (
                  <button
                    onClick={() => selfieInputRef.current?.click()}
                    className="w-40 h-40 rounded-full border-2 border-dashed border-amber-300 bg-amber-50/50 flex flex-col items-center justify-center gap-2 hover:bg-amber-50 transition-colors mx-auto mb-4 text-amber-600"
                  >
                    <Icon type="camera" size={36} />
                    <span className="text-[10px] font-semibold text-amber-700">Take selfie</span>
                  </button>
                )}

                <div className="flex gap-3 w-full mt-2">
                  <button
                    onClick={() => { setStep("mykad"); setSelfieImage(null); }}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm"
                  >Back</button>
                  <button
                    onClick={() => selfieImage ? handleConfirmVerification() : selfieInputRef.current?.click()}
                    disabled={!selfieImage}
                    className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >{selfieImage ? "Submit Verification" : "Take Selfie"}</button>
                </div>
              </div>
            ) : step === "uploading" ? (
              <div className="flex flex-col items-center py-8">
                <div className="w-16 h-16 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-5" />
                <h3 className="text-lg font-bold text-guidr-text mb-2">Verifying...</h3>
                <p className="text-sm text-guidr-muted text-center">Saving your documents and verifying identity. This may take a moment.</p>
              </div>
            ) : step === "success" ? (
              <div className="flex flex-col items-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-50 text-green-500 flex items-center justify-center mb-4">
                  <Icon type="shield-check" size={32} />
                </div>
                <h3 className="text-lg font-bold text-guidr-text mb-2">Verification Complete!</h3>
                <p className="text-sm text-guidr-muted text-center mb-2">
                  Your identity has been verified. You now have the <strong className="text-green-600">Verified Reporter</strong> badge.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-green-50 text-green-600 border border-green-200/50 mb-5">
                  <Icon type="shield-check" size={14} />
                  Verified Reporter
                </span>
                <p className="text-xs text-guidr-primary font-bold mb-5">+50 XP earned! 🎉</p>
                <button
                  onClick={closeCapture}
                  className="w-full py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
                >
                  Done
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
