"use client";

import { useMemo, useState } from "react";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import { useUser } from "@/app/context/UserContext";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

/* Support contact — kept in one place so it's easy to update. */
const SUPPORT_EMAIL = "support@veriq.my";
/* Malaysia's National Scam Response Centre hotline. */
const NSRC_HOTLINE = "997";

type FbCategory = "bug" | "feature" | "general";

/* ── FAQ content ──
 * Answers are intentionally sanitized — they explain what Guidr does for the
 * user without revealing the underlying detection architecture. */
type Faq = { q: string; badge: string; badgeClass: string; a: string };

const FAQS: Faq[] = [
  {
    q: "How does Guidr spot a scam?",
    badge: "How it works",
    badgeClass: "text-green-700 bg-green-100",
    a: "Guidr analyses each message in real time, looking for the tactics scammers actually use: fake urgency, manipulation language, suspicious links, and patterns we've seen used to target Malaysians. You get a verdict in seconds, with the specific red flags highlighted.",
  },
  {
    q: "Is my data safe?",
    badge: "Privacy",
    badgeClass: "text-blue-800 bg-blue-100",
    a: "Yes. Messages you scan are processed securely to give you a verdict, and they're never sold or shared with advertisers. We keep only what's needed to run your account and your case history, which you can review under My Cases. Feedback you send stays anonymous unless you ask us to reply.",
  },
  {
    q: "How do Guardian alerts work?",
    badge: "Guardians",
    badgeClass: "text-teal-700 bg-teal-100",
    a: "Guardians are the trusted people you add in Settings. When a scam puts you at risk, Guidr can alert them so someone you trust knows to check in. You can be a Guardian for the people you care about too. You choose who's on your list and can change it anytime.",
  },
  {
    q: "What is NSRC 997?",
    badge: "Emergency",
    badgeClass: "text-red-700 bg-red-100",
    a: "NSRC is Malaysia's National Scam Response Centre. If you've just transferred money to a scammer, call 997 immediately. They work with the banks to try to freeze the transfer before the funds are moved. The sooner you call, the better the chance of stopping it.",
  },
  {
    q: "What does Verified Reporter mean?",
    badge: "Account",
    badgeClass: "text-amber-800 bg-amber-100",
    a: "Verified Reporter is a badge you earn by completing identity verification (e-KYC) in your profile. It signals that a real, verified person is behind a report, so your submissions to NSRC carry a higher trust score. Verifying is optional, and your documents are used only to confirm your identity.",
  },
  {
    q: "Is Guidr free?",
    badge: "Pricing",
    badgeClass: "text-purple-800 bg-purple-100",
    a: "Scanning messages, reporting scams, and core protection are free. Some advanced Guardian features may be offered as a paid upgrade in future, but you'll always be told clearly before anything ever costs money.",
  },
];

/* ── Inline icon set (feather-style strokes, matching the rest of the app) ── */
function Icon({ type, size = 20 }: { type: string; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "back":
      return <svg {...p}><polyline points="15 18 9 12 15 6" /></svg>;
    case "phone":
      return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
    case "search":
      return <svg {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
    case "chat":
      return <svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>;
    case "feedback":
      return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "bug":
      return <svg {...p}><path d="m8 2 1.88 1.88" /><path d="M14.12 3.88 16 2" /><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" /><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z" /><path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" /><path d="M6 13H2" /><path d="M3 21c0-2.1 1.7-3.9 3.8-4" /><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" /><path d="M22 13h-4" /><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" /></svg>;
    case "bulb":
      return <svg {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg>;
    case "mail":
      return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>;
    case "chevron-down":
      return <svg {...p}><polyline points="6 9 12 15 18 9" /></svg>;
    case "chevron-right":
      return <svg {...p}><polyline points="9 18 15 12 9 6" /></svg>;
    default:
      return <svg {...p}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

export default function HelpPage() {
  const { user } = useUser();
  const router = useRouter();

  const firstName = user?.fullName?.trim().split(/\s+/)[0] || "there";

  const [search, setSearch] = useState("");
  const [openFaq, setOpenFaq] = useState<number>(0);

  // ── Feedback bottom-sheet state (moved here from the profile menu) ──
  const [showFeedback, setShowFeedback] = useState(false);
  const [fbCategory, setFbCategory] = useState<FbCategory>("general");
  const [fbRating, setFbRating] = useState(0);
  const [fbMessage, setFbMessage] = useState("");
  const [fbReplyOptIn, setFbReplyOptIn] = useState(false);
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const [fbSuccess, setFbSuccess] = useState(false);

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return FAQS.map((f, i) => ({ faq: f, index: i }));
    return FAQS.map((f, i) => ({ faq: f, index: i })).filter(
      ({ faq }) =>
        faq.q.toLowerCase().includes(q) ||
        faq.badge.toLowerCase().includes(q) ||
        faq.a.toLowerCase().includes(q)
    );
  }, [search]);

  function openFeedback(category: FbCategory) {
    setFbCategory(category);
    setFbError(null);
    setFbSuccess(false);
    setShowFeedback(true);
  }

  function closeFeedback() {
    setShowFeedback(false);
    setFbError(null);
    setFbSuccess(false);
  }

  async function handleSubmitFeedback() {
    if (!user) return;
    const msg = fbMessage.trim();
    if (!msg) {
      setFbError("Please write a message.");
      return;
    }
    setFbSubmitting(true);
    setFbError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category: fbCategory,
          rating: fbRating,
          message: msg,
          replyOptIn: fbReplyOptIn,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't send feedback.");
      setFbSuccess(true);
      setFbMessage("");
      setFbRating(0);
      setFbReplyOptIn(false);
    } catch (err) {
      setFbError(err instanceof Error ? err.message : "Couldn't send feedback.");
    } finally {
      setFbSubmitting(false);
    }
  }

  const quickActions: { key: FbCategory; label: string; icon: string; iconClass: string }[] = [
    { key: "general", label: "Feedback", icon: "feedback", iconClass: "bg-blue-100 text-blue-800" },
    { key: "bug", label: "Report bug", icon: "bug", iconClass: "bg-amber-100 text-amber-800" },
    { key: "feature", label: "Suggest", icon: "bulb", iconClass: "bg-green-100 text-green-700" },
  ];

  const fbTitle = fbCategory === "bug" ? "Report a bug" : fbCategory === "feature" ? "Suggest a feature" : "Send feedback";

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
            <h2 className="text-2xl font-bold text-guidr-text">Help &amp; Support</h2>
          </div>

          {/* ── Emergency: just lost money ── */}
          <a
            href={`tel:${NSRC_HOTLINE}`}
            aria-label={`Call NSRC ${NSRC_HOTLINE} emergency hotline`}
            className="guidr-animate-in guidr-stagger-2 w-full bg-guidr-red rounded-2xl p-4 flex items-center gap-3.5 text-white active:scale-[0.99] transition-transform"
          >
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Icon type="phone" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Just lost money to a scam?</p>
              <p className="text-xs text-white/85 mt-0.5 leading-snug">
                Call NSRC {NSRC_HOTLINE} and they&apos;ll alert your bank to freeze the transfer
              </p>
            </div>
            <Icon type="chevron-right" size={20} />
          </a>

          {/* ── Search ── */}
          <div className="relative guidr-animate-in guidr-stagger-2">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Icon type="search" size={18} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search FAQs or describe your issue…"
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm text-guidr-text placeholder:text-guidr-muted/60 focus:outline-none focus:border-guidr-primary focus:ring-1 focus:ring-guidr-primary/20"
            />
          </div>

          {/* ── Greeting ── */}
          <div className="guidr-animate-in guidr-stagger-3 rounded-2xl bg-blue-50 border border-blue-100 p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0">
              <Icon type="chat" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900">Hi {firstName}, what&apos;s up?</p>
              <p className="text-xs text-blue-800/85 mt-0.5 leading-relaxed">
                Browse below, search, or message us directly. We&apos;re here.
              </p>
            </div>
          </div>

          {/* ── Quick actions ── */}
          <section className="guidr-animate-in guidr-stagger-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-guidr-muted mb-3 ml-1">Quick actions</p>
            <div className="grid grid-cols-3 gap-2.5">
              {quickActions.map((a) => (
                <button
                  key={a.key}
                  onClick={() => openFeedback(a.key)}
                  className="bg-white border border-gray-100 rounded-2xl py-3.5 px-2 flex flex-col items-center gap-2 hover:bg-gray-50 active:scale-[0.97] transition-all"
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${a.iconClass}`}>
                    <Icon type={a.icon} size={20} />
                  </span>
                  <span className="text-[11px] font-semibold text-guidr-text text-center">{a.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Popular questions (FAQ accordion) ── */}
          <section className="guidr-animate-in guidr-stagger-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-guidr-muted mb-3 ml-1">
              {search.trim() ? "Search results" : "Popular questions"}
            </p>
            {filteredFaqs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <p className="text-sm text-guidr-text font-medium">No matching answers</p>
                <p className="text-xs text-guidr-muted mt-1 mb-4">
                  Can&apos;t find what you need? Message the team and we&apos;ll help.
                </p>
                <button
                  onClick={() => openFeedback("general")}
                  className="text-sm font-semibold text-guidr-primary"
                >
                  Message us →
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                {filteredFaqs.map(({ faq, index }) => {
                  const isOpen = openFaq === index;
                  return (
                    <div key={index}>
                      <button
                        onClick={() => setOpenFaq(isOpen ? -1 : index)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-guidr-text">{faq.q}</p>
                          <span className={`inline-block mt-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${faq.badgeClass}`}>
                            {faq.badge}
                          </span>
                        </div>
                        <span className={`text-gray-300 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                          <Icon type="chevron-down" size={18} />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 -mt-1 bg-gray-50/60">
                          <p className="text-xs text-guidr-muted leading-relaxed pt-2">{faq.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Still stuck? Talk to the team ── */}
          <section className="guidr-animate-in guidr-stagger-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-guidr-muted mb-3 ml-1">Still stuck?</p>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex">
                  {[
                    { initials: "FH", bg: "#0d7377" },
                    { initials: "MF", bg: "#3b82f6" },
                    { initials: "AR", bg: "#f5b731" },
                  ].map((m, i) => (
                    <div
                      key={m.initials}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white border-2 border-white"
                      style={{ background: m.bg, marginLeft: i === 0 ? 0 : -8 }}
                    >
                      {m.initials}
                    </div>
                  ))}
                </div>
                <div className="flex-1 min-w-0 ml-1">
                  <p className="text-[13px] font-semibold text-guidr-text">Talk to the Guidr team</p>
                  <p className="text-[11px] text-guidr-muted mt-0.5">We usually reply within 24 hours</p>
                </div>
              </div>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="w-full bg-guidr-primary text-white text-[13px] font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
              >
                <Icon type="mail" size={16} />
                {SUPPORT_EMAIL}
              </a>
            </div>
          </section>

          {/* ── System status (static) ── */}
          <section className="guidr-animate-in guidr-stagger-5">
            <div className="bg-white rounded-2xl border border-gray-100 px-3.5 py-3">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="relative w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
                  <span className="absolute inset-0 rounded-full bg-green-500" />
                </span>
                <p className="text-[13px] font-medium text-guidr-text flex-1">All systems operational</p>
                <span className="text-[10px] font-semibold text-guidr-muted">99.8%</span>
              </div>
              <div className="flex gap-[3px] items-center">
                <span className="text-[10px] text-guidr-muted mr-1">7d</span>
                {["bg-green-500", "bg-green-500", "bg-green-500", "bg-green-500", "bg-amber-400", "bg-green-500", "bg-green-500"].map(
                  (c, i) => (
                    <div key={i} className={`flex-1 h-1.5 rounded-sm ${c}`} />
                  )
                )}
              </div>
            </div>
          </section>

        </div>
      </main>
      <BottomNav />

      {/* ── Feedback bottom sheet ── */}
      {showFeedback && (
        <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeFeedback} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl lg:rounded-2xl p-6 pb-8 shadow-xl guidr-animate-in max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5 lg:hidden" />

            {fbSuccess ? (
              <div className="flex flex-col items-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="#22c55e" stroke="none">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-guidr-text mb-2">Thanks for the feedback!</h3>
                <p className="text-sm text-guidr-muted text-center mb-5">
                  We read every message and use it to make Guidr better.
                </p>
                <button
                  onClick={closeFeedback}
                  className="w-full py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-guidr-text mb-1">{fbTitle}</h3>
                <p className="text-xs text-guidr-muted mb-5">
                  Found a bug or have an idea? We read every message.
                </p>

                {/* Category */}
                <label className="text-xs font-bold text-guidr-muted uppercase tracking-wider mb-2 block">
                  Category
                </label>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {(
                    [
                      { value: "bug", label: "Bug" },
                      { value: "feature", label: "Feature" },
                      { value: "general", label: "General" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFbCategory(opt.value)}
                      className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        fbCategory === opt.value
                          ? "bg-guidr-primary text-white"
                          : "bg-gray-50 text-guidr-muted hover:bg-gray-100 border border-gray-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Rating */}
                <label className="text-xs font-bold text-guidr-muted uppercase tracking-wider mb-2 block">
                  Rating <span className="text-guidr-muted/60 font-normal normal-case lowercase">(optional)</span>
                </label>
                <div className="flex items-center gap-1.5 mb-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFbRating(fbRating === n ? 0 : n)}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      className="p-1 active:scale-90 transition-transform"
                    >
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill={n <= fbRating ? "#f5b731" : "none"}
                        stroke={n <= fbRating ? "#f5b731" : "#cbd5e1"}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  ))}
                </div>

                {/* Message */}
                <label className="text-xs font-bold text-guidr-muted uppercase tracking-wider mb-2 block">
                  Message
                </label>
                <textarea
                  value={fbMessage}
                  onChange={(e) => {
                    setFbMessage(e.target.value);
                    if (fbError) setFbError(null);
                  }}
                  placeholder="Tell us what's on your mind…"
                  rows={5}
                  maxLength={4000}
                  className={`w-full px-4 py-3 rounded-xl border bg-gray-50 text-sm text-guidr-text placeholder:text-guidr-muted/50 focus:outline-none focus:ring-1 resize-none ${
                    fbError
                      ? "border-guidr-red focus:border-guidr-red focus:ring-guidr-red/20"
                      : "border-gray-200 focus:border-guidr-primary focus:ring-guidr-primary/20"
                  }`}
                />
                <p className="text-[10px] text-guidr-muted mt-1 mb-3">{fbMessage.length} / 4000</p>

                {/* Privacy: feedback is anonymous unless the user opts in. */}
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-200 mb-3 cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={fbReplyOptIn}
                    onChange={(e) => setFbReplyOptIn(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-guidr-primary cursor-pointer shrink-0"
                  />
                  <span className="text-xs text-guidr-text leading-relaxed">
                    Reply to me at my account email if needed.
                    <span className="block text-[10px] text-guidr-muted mt-0.5">
                      Otherwise we won&apos;t store your email, only your account ID for spam protection.
                    </span>
                  </span>
                </label>

                {fbError && <p className="text-xs text-guidr-red mb-3">{fbError}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={closeFeedback}
                    disabled={fbSubmitting}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-guidr-muted font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={fbSubmitting || !fbMessage.trim()}
                    className="flex-1 py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {fbSubmitting ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
