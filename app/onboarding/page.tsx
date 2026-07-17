"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";

/* ──────────────────────────────────────────────────────────────────────────
   First-time onboarding flow.

   Sign-in is mandatory to use Guidr (see UserContext), so this flow never
   offers a guest path — every exit routes to /login. It shows once: any CTA
   marks `guidr_onboarded` in localStorage, after which UserContext sends
   returning logged-out visitors straight to /login instead of here.

   Layout: a self-contained responsive shell (NOT .guidr-container, whose
   unlayered background would override the per-step colours). Full-bleed on
   phones; a centred, phone-sized card on tablet/desktop.
   ────────────────────────────────────────────────────────────────────────── */

const TOTAL_STEPS = 4;

/* ── Inline icons (the app uses inline SVGs, not an icon font) ── */
function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    "shield-check": (
      <>
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    "arrow-left": <path d="M15 6l-6 6 6 6" />,
    "device-mobile": (
      <>
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 18h2" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V5" />
        <path d="M8 9l4-4 4 4" />
        <path d="M5 19h14" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    "circle-check": (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 4v4h4" />
        <path d="M12 8v4l3 2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
        <path d="M16 5.5a3 3 0 0 1 0 5.5" />
        <path d="M18 15c2 .6 3 2.2 3 5" />
      </>
    ),
    "help-circle": (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
        <path d="M12 17h.01" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

/* Responsive shell: fills the screen on phones, becomes a centred card with a
   neutral surround on ≥640px. `bg` carries the per-step background colour. */
function Shell({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh w-full flex justify-center bg-guidr-bg sm:items-center sm:p-6">
      <div
        className={`relative flex w-full flex-col overflow-hidden min-h-dvh transition-colors duration-500 ease-out sm:min-h-0 sm:h-[min(90dvh,760px)] sm:max-w-md sm:rounded-3xl sm:shadow-xl ${bg}`}
      >
        {children}
      </div>
    </div>
  );
}

function Dots({ active, light }: { active: number; light?: boolean }) {
  return (
    <div className="flex justify-center items-center gap-1.5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const on = i === active;
        const base = "h-1.5 rounded-full transition-all duration-300 ease-out";
        const cls = on
          ? light
            ? `${base} w-5 bg-white`
            : `${base} w-5 bg-guidr-primary`
          : light
            ? `${base} w-1.5 bg-white/30`
            : `${base} w-1.5 bg-gray-300`;
        return <span key={i} className={cls} />;
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const { user, loading } = useUser();

  // A signed-in user has no business here — send them to the app.
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  function markSeen() {
    try {
      localStorage.setItem("guidr_onboarded", "1");
    } catch {
      /* private mode / storage disabled — onboarding just shows again */
    }
  }

  function goToLogin(intent: "login" | "signup") {
    markSeen();
    try {
      if (intent === "signup") sessionStorage.setItem("guidr_auth_intent", "signup");
    } catch {
      /* ignore */
    }
    router.push("/login");
  }

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  /* ── Screen 1: Welcome ── */
  if (step === 0) {
    return (
      <Shell bg="bg-guidr-primary text-white">
        <div
          key={`welcome-${step}`}
          className="flex-1 overflow-y-auto no-scrollbar flex flex-col items-center justify-center text-center px-8 pt-safe-top"
        >
          <div className="guidr-animate-in w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/15 border-2 border-white/25 flex items-center justify-center mb-6">
            <Icon name="shield-check" className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
          </div>
          <h1 className="guidr-animate-in guidr-stagger-1 text-2xl sm:text-3xl font-bold mb-3">Welcome to Guidr</h1>
          <p className="guidr-animate-in guidr-stagger-2 text-sm sm:text-base text-white/80 leading-relaxed max-w-xs sm:max-w-sm mb-10">
            Your personal assistant to check if a message is real or a scam
          </p>

          <button
            onClick={next}
            className="guidr-animate-in guidr-stagger-3 w-full max-w-xs py-3.5 bg-white text-guidr-primary font-semibold rounded-2xl hover:bg-white/90 active:scale-[0.99] transition"
          >
            Get started →
          </button>
          <button
            onClick={() => goToLogin("login")}
            className="guidr-animate-in guidr-stagger-4 mt-4 text-sm text-white/80 hover:text-white transition-colors"
          >
            Already have an account? <span className="font-semibold underline">Sign in</span>
          </button>
        </div>
        <Dots active={0} light />
      </Shell>
    );
  }

  /* ── Top bar shared by steps 2–4 ── */
  const topBar = (
    <div className="flex items-center justify-between px-5 pt-safe-top pb-2">
      <button
        onClick={back}
        aria-label="Go back"
        className="p-1 -ml-1 text-guidr-muted hover:text-guidr-text transition-colors"
      >
        <Icon name="arrow-left" className="w-5 h-5" />
      </button>
      <span className="text-xs font-medium text-guidr-muted">
        Step {step + 1} of {TOTAL_STEPS}
      </span>
      {step < TOTAL_STEPS - 1 ? (
        <button
          onClick={() => goToLogin("login")}
          className="text-xs font-medium text-guidr-primary hover:underline px-1"
        >
          Skip
        </button>
      ) : (
        <span className="w-7" />
      )}
    </div>
  );

  /* ── Screen 2: How it works ── */
  if (step === 1) {
    return (
      <Shell bg="bg-white">
        {topBar}
        <div key={`how-${step}`} className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-3">
          <div className="guidr-animate-in mb-1">
            <h2 className="text-lg sm:text-xl font-bold text-guidr-text">It&apos;s as easy as 3 steps</h2>
            <p className="text-sm text-guidr-muted">No technical knowledge needed</p>
          </div>

          <Step
            className="guidr-animate-in guidr-stagger-1"
            iconBg="bg-red-50"
            iconColor="text-guidr-red"
            icon="device-mobile"
            title="1. You receive a suspicious message"
            body="Via WhatsApp, SMS, email, or any app"
          />
          <Step
            className="guidr-animate-in guidr-stagger-2"
            iconBg="bg-amber-50"
            iconColor="text-guidr-amber"
            icon="upload"
            title="2. Share it with Guidr"
            body="Paste the text, upload a screenshot, or take a photo"
          />
          <Step
            className="guidr-animate-in guidr-stagger-3"
            iconBg="bg-guidr-primary"
            iconColor="text-white"
            icon="shield-check"
            title="3. We tell you if it's safe or not"
            body="You get a clear answer with a simple explanation"
            highlight
          />
        </div>

        <div className="px-5 pt-3">
          <button
            onClick={next}
            className="w-full py-3.5 bg-guidr-primary text-white font-semibold rounded-2xl hover:bg-guidr-primary-dark active:scale-[0.99] transition"
          >
            That&apos;s simple! Next →
          </button>
        </div>
        <Dots active={1} />
      </Shell>
    );
  }

  /* ── Screen 3: Privacy & trust ── */
  if (step === 2) {
    return (
      <Shell bg="bg-guidr-primary-light">
        {topBar}
        <div key={`privacy-${step}`} className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col items-center text-center">
          <div className="guidr-animate-in w-16 h-16 rounded-full bg-guidr-primary flex items-center justify-center mb-3">
            <Icon name="lock" className="w-8 h-8 text-white" />
          </div>
          <h2 className="guidr-animate-in guidr-stagger-1 text-lg sm:text-xl font-bold text-guidr-text mb-1">Your privacy is protected</h2>
          <p className="guidr-animate-in guidr-stagger-2 text-sm text-guidr-muted leading-relaxed max-w-xs sm:max-w-sm mb-5">
            We never read, save, or share your messages with anyone
          </p>

          <div className="w-full flex flex-col gap-2 text-left">
            <Trust className="guidr-animate-in guidr-stagger-3" text={<>Your message is <b>never stored</b> on our servers</>} />
            <Trust className="guidr-animate-in guidr-stagger-4" text={<>Checked instantly, then <b>deleted automatically</b></>} />
            <Trust className="guidr-animate-in guidr-stagger-5" text={<>Recognised by <b>NSRC Malaysia</b> and law enforcement</>} />
          </div>
        </div>

        <div className="px-5 pt-3">
          <button
            onClick={next}
            className="w-full py-3.5 bg-guidr-primary text-white font-semibold rounded-2xl hover:bg-guidr-primary-dark active:scale-[0.99] transition"
          >
            I&apos;m comfortable, next →
          </button>
        </div>
        <Dots active={2} />
      </Shell>
    );
  }

  /* ── Screen 4: Create account (mandatory) ── */
  return (
    <Shell bg="bg-white">
      {topBar}
      <div key={`account-${step}`} className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-3">
        <div className="guidr-animate-in flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-guidr-primary-light border-2 border-guidr-primary/30 flex items-center justify-center mb-2">
            <Icon name="shield-check" className="w-7 h-7 text-guidr-primary" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-guidr-text">Create your free account</h2>
          <p className="text-sm text-guidr-muted leading-relaxed max-w-xs sm:max-w-sm">
            A free account keeps you and your family safe, and it only takes a minute
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Trust
            className="guidr-animate-in guidr-stagger-1"
            white
            icon="history"
            text={<>Saves your history so you can <b>look back at past checks</b></>}
          />
          <Trust
            className="guidr-animate-in guidr-stagger-2"
            white
            icon="users"
            text={<>Lets a <b>family member or guardian</b> help protect you</>}
          />
        </div>

        <button
          onClick={() => goToLogin("signup")}
          className="guidr-animate-in guidr-stagger-3 w-full py-3.5 bg-guidr-primary text-white font-semibold rounded-2xl hover:bg-guidr-primary-dark active:scale-[0.99] transition"
        >
          Create a free account →
        </button>

        <p className="guidr-animate-in guidr-stagger-4 text-sm text-center text-guidr-muted">
          Already have an account?{" "}
          <button
            onClick={() => goToLogin("login")}
            className="text-guidr-primary font-semibold hover:underline"
          >
            Sign in
          </button>
        </p>

        <div className="guidr-animate-in guidr-stagger-5 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Icon name="help-circle" className="w-4 h-4 text-guidr-amber shrink-0" />
          <p className="text-xs text-amber-800">Not sure? Ask a family member to help</p>
        </div>
      </div>
      <Dots active={3} />
    </Shell>
  );
}

/* ── Small presentational helpers ── */
function Step({
  icon,
  iconBg,
  iconColor,
  title,
  body,
  highlight,
  className = "",
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl p-3 border ${className} ${
        highlight ? "bg-guidr-primary-light border-guidr-primary/30" : "bg-gray-50 border-gray-200"
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon name={icon} className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-sm font-semibold text-guidr-text">{title}</p>
        <p className="text-xs text-guidr-muted leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function Trust({
  text,
  icon = "circle-check",
  white,
  className = "",
}: {
  text: React.ReactNode;
  icon?: string;
  white?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl p-2.5 ${className} ${
        white ? "bg-white border border-gray-200" : "bg-white/70"
      }`}
    >
      <Icon name={icon} className="w-4 h-4 text-guidr-primary shrink-0 mt-0.5" />
      <p className="text-xs sm:text-sm text-guidr-text leading-relaxed">{text}</p>
    </div>
  );
}
