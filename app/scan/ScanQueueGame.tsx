"use client";

import { useMemo, useRef, useState } from "react";
import { useUser } from "@/app/context/UserContext";
import { awardXP, incrementStat } from "@/lib/firestore";

/**
 * "Spot the Scam" — the gamified waiting screen shown while a scan is queued
 * behind the global concurrency gate. Instead of a dead spinner, the user
 * triages sample messages and learns the red flags Guidr looks for. Correct
 * answers earn a little XP (capped, so the wait can't be farmed) and tie into
 * the existing profile gamification (`xp`, `quizzesPassed`).
 *
 * It is purely a time-filler: it never blocks or speeds up admission. The
 * parent auto-dismisses it the moment a slot frees.
 */

interface ScanQueueGameProps {
  /** FIFO position in the queue (1 = next up). null while it's being computed. */
  position: number | null;
  /** Show the "you're #N in line" banner. False once the scan has started. */
  showQueueBanner?: boolean;
}

interface Question {
  text: string;
  channel: string;
  isScam: boolean;
  explain: string;
}

// On-brand bank: Malaysian job-scam triage, mixing EN + BM like real messages.
const QUESTIONS: Question[] = [
  {
    text: "Congratulations! You've been shortlisted for a Data Entry role, RM4,500/month, work from home. Pay RM250 registration fee to secure your slot. Reply within 2 hours.",
    channel: "WhatsApp",
    isScam: true,
    explain: "Upfront 'registration fee' + unrealistic pay for simple work + artificial urgency. Real employers never charge you to get hired.",
  },
  {
    text: "Hi Sarah, this is Amir from Maybank HR. Following your application for the Management Trainee role, we'd like to invite you to an interview on 12 June, 10am, at Menara Maybank. Please confirm.",
    channel: "Email (@maybank.com)",
    isScam: false,
    explain: "Official company email domain, named sender, specific role you applied for, no money or ID requests. Strong legitimacy signals.",
  },
  {
    text: "Tahniah! Anda terpilih sebagai ejen part-time. Hanya like video di YouTube dan dapat RM50 setiap satu. Klik link untuk daftar: bit.ly/kerja-mudah2024",
    channel: "Telegram",
    isScam: true,
    explain: "'Task scam' pattern: easy money for liking videos, shortened link, no real company. Classic Malaysian job-scam bait.",
  },
  {
    text: "Your interview is confirmed for Thursday 2pm via Google Meet. Meeting link and your candidate ID (TM-4471) are in the calendar invite we just sent to your email.",
    channel: "Email",
    isScam: false,
    explain: "Specific interview details, a candidate ID, and a calendar invite to your own email. Concrete, verifiable, no fees.",
  },
  {
    text: "We are hiring! Salary RM8,000-RM15,000, no experience needed, no interview. Just send a copy of your IC and bank account number to start today.",
    channel: "Facebook DM",
    isScam: true,
    explain: "Requests IC + bank details before any offer, absurd pay with 'no experience/no interview'. Identity-theft and mule-account red flags.",
  },
  {
    text: "Hi, thanks for applying to the marketing internship at Grab. Our recruiter Wei Ling will call you tomorrow between 3-4pm from a +603 number to discuss next steps.",
    channel: "Email (@grab.com)",
    isScam: false,
    explain: "Corporate domain, named recruiter, a local landline range, references the role you applied for. No payment or data requests.",
  },
  {
    text: "URGENT: Your account will be suspended. Verify your TalentBridge recruiter profile now and pay the RM99 verification deposit (refundable) via this link.",
    channel: "SMS",
    isScam: true,
    explain: "Fake urgency + 'refundable deposit' (never refunded) + pay-to-verify. Deposits are a hallmark of recruitment scams.",
  },
  {
    text: "Reminder: please bring your IC and a copy of your resume to the office for your scheduled interview. Parking is available at Level B2. See you Monday!",
    channel: "Email",
    isScam: false,
    explain: "Bringing your IC *to an in-person interview* is normal; nothing is requested digitally and no money is involved.",
  },
];

const MAX_XP_AWARDS = 5; // cap so the queue can't be farmed for XP

export default function ScanQueueGame({ position, showQueueBanner = true }: ScanQueueGameProps) {
  const { user } = useUser();
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<null | { correct: boolean }>(null);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const xpAwarded = useRef(0);
  const passedBumped = useRef(false);

  // Shuffle once per mount so repeat visits aren't identical.
  const deck = useMemo(() => {
    const d = [...QUESTIONS];
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }, []);

  const q = deck[index % deck.length];

  function answer(guessScam: boolean) {
    if (answered) return;
    const correct = guessScam === q.isScam;
    setAnswered({ correct });

    if (correct) {
      setStreak((s) => s + 1);
      setCorrectCount((c) => c + 1);
      // Capped XP + a one-time quizzesPassed bump per waiting session.
      if (user && xpAwarded.current < MAX_XP_AWARDS) {
        xpAwarded.current += 1;
        awardXP(user.uid, 2).catch(() => {});
        if (!passedBumped.current && xpAwarded.current >= 3) {
          passedBumped.current = true;
          incrementStat(user.uid, "quizzesPassed").catch(() => {});
        }
      }
    } else {
      setStreak(0);
    }
  }

  function next() {
    setAnswered(null);
    setIndex((i) => i + 1);
  }

  const positionLabel =
    position === null
      ? "Finding your place in line…"
      : position <= 1
        ? "You're next, starting any moment"
        : `You're #${position} in line`;

  return (
    <div className="flex flex-col gap-3 guidr-animate-in">
      {/* ── Queue status banner (hidden once the scan starts) ── */}
      {showQueueBanner && (
        <div className="flex items-center gap-3 bg-guidr-primary-light/60 rounded-2xl px-4 py-3.5 border border-guidr-primary/15">
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full border-2 border-guidr-primary/30 border-t-guidr-primary animate-spin" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-guidr-primary">{positionLabel}</p>
            <p className="text-[11px] text-guidr-muted">
              High demand right now, so your scan will start automatically. Warm up below 👇
            </p>
          </div>
        </div>
      )}

      {/* ── "Stay sharp" divider ── */}
      <div className="flex items-center gap-2.5 my-0.5">
        <div className="flex-1 h-px bg-gray-200" />
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#d97706" stroke="none">
            <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
          </svg>
          <span className="text-[10px] font-semibold text-amber-700">Stay sharp while you wait</span>
        </div>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* ── Game card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-guidr-text">Spot the Scam</p>
            <p className="text-[11px] text-guidr-muted mt-0.5">Is this message real or a scam?</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {streak >= 2 && (
              <span className="flex items-center gap-1 text-xs font-bold text-orange-500">🔥 {streak}</span>
            )}
            <div className="bg-guidr-primary-light border border-guidr-primary/20 rounded-lg px-3 py-1 text-center">
              <p className="text-[8px] font-semibold tracking-wider text-guidr-muted">SCORE</p>
              <p className="text-base font-bold text-guidr-primary leading-none mt-0.5">{correctCount}</p>
            </div>
          </div>
        </div>

        {/* Message card */}
        <div className="bg-guidr-bg/60 rounded-xl border border-gray-100 p-3">
          <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-gray-200/70">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 5L2 7" />
            </svg>
            <span className="text-[10px] text-guidr-muted">Received via {q.channel}</span>
          </div>
          <p className="text-xs text-guidr-text leading-relaxed whitespace-pre-wrap">{q.text}</p>
        </div>

        {/* Answer buttons / feedback */}
        {!answered ? (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => answer(true)}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-red-50 text-guidr-red font-semibold text-xs border-[1.5px] border-red-200 hover:bg-red-100 active:scale-[0.98] transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              Scam
            </button>
            <button
              type="button"
              onClick={() => answer(false)}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-green-50 text-green-700 font-semibold text-xs border-[1.5px] border-green-200 hover:bg-green-100 active:scale-[0.98] transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Looks legit
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 guidr-animate-in">
            <div
              className={`rounded-xl px-3.5 py-3 border ${
                answered.correct
                  ? "bg-green-50 border-green-200"
                  : "bg-guidr-red-light border-red-200"
              }`}
            >
              <p className={`text-xs font-bold mb-1 ${answered.correct ? "text-green-700" : "text-guidr-red"}`}>
                {answered.correct ? "Correct!" : "Not quite."} This message is {q.isScam ? "a scam" : "likely legit"}.
              </p>
              <p className="text-[11px] text-guidr-text/80 leading-relaxed">{q.explain}</p>
            </div>
            <button
              type="button"
              onClick={next}
              className="w-full py-3 rounded-xl bg-guidr-primary text-white font-semibold text-xs hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
            >
              Next message →
            </button>
          </div>
        )}

        {/* Background note */}
        <div className="flex items-center gap-2 bg-guidr-bg/60 rounded-lg px-3 py-2 border border-gray-100">
          <span className="w-1.5 h-1.5 rounded-full bg-guidr-primary animate-pulse shrink-0" />
          <span className="text-[10px] text-guidr-muted">
            {showQueueBanner
              ? "Your scan starts the instant a slot opens"
              : "Your scan continues running in the background"}
          </span>
        </div>
      </div>
    </div>
  );
}
