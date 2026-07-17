"use client";

import { logger } from "@/lib/logger";
import { useEffect, useMemo, useRef, useState } from "react";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import { useUser } from "@/app/context/UserContext";
import {
  subscribeUserProfile,
  markArticleRead,
  touchLearningStreak,
  completeDailyChallenge,
  dayKey,
  type UserProfile,
} from "@/lib/firestore";
import ScamCategoryIcon, { categoryColor } from "@/app/components/ScamCategoryIcon";
import {
  ARTICLES,
  challengeForDay,
  levelFromXp,
  LEVEL_NAME,
  XP_PER_LEVEL,
  DAILY_CHALLENGE_XP,
  type Article,
  type Challenge,
} from "@/lib/learn-content";

/* ── Badge glyphs ── */
function BadgeGlyph({ type }: { type: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "shield": return <svg viewBox="0 0 24 24" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case "book": return <svg viewBox="0 0 24 24" {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>;
    case "flame": return <svg viewBox="0 0 24 24" {...p}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>;
    case "target": return <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
    default: return <svg viewBox="0 0 24 24" {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
  }
}

export default function LearnPage() {
  const { user } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [challengeChoice, setChallengeChoice] = useState<boolean | null>(null);
  const [activeCat, setActiveCat] = useState("All");
  const [showAll, setShowAll] = useState(false);
  const [openArticle, setOpenArticle] = useState<Article | null>(null);
  // Daily challenge + article prose now come from OpenAI (see the /api routes).
  // The static content seeds initial state and is the fallback, so the UI is
  // never blank and looks identical to before while AI content loads/swaps in.
  const [challenge, setChallenge] = useState<Challenge>(() => challengeForDay());
  const [articleContent, setArticleContent] = useState<Record<string, { summary: string; body: string[] }>>({});
  const [loadingArticleId, setLoadingArticleId] = useState<string | null>(null);
  const streakTouched = useRef(false);
  const challengeAnswered = useRef(false);

  // Live profile (xp, stats, learn progress).
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const unsub = subscribeUserProfile(user.uid, (p) => {
      setProfile(p);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Stamp the learning streak once per mount (no-op if already counted today).
  useEffect(() => {
    if (!user || !profile || streakTouched.current) return;
    streakTouched.current = true;
    touchLearningStreak(user.uid, profile.lastActiveDate, profile.streakDays).catch((e) =>
      logger.error("Streak update failed:", e)
    );
  }, [user, profile]);

  // Reset article pagination when the filter changes.
  useEffect(() => setShowAll(false), [activeCat]);

  // Fetch today's AI-generated daily challenge. Initial state is already the
  // static challenge, so any error just leaves that in place.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/daily-challenge")
      .then((r) => r.json())
      .then((c) => {
        if (!cancelled && !challengeAnswered.current && c && typeof c.message === "string" && typeof c.isScam === "boolean") {
          setChallenge(c as Challenge);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const xp = profile?.xp ?? 0;
  const lvl = levelFromXp(xp);
  const streak = profile?.streakDays ?? 0;
  const readSet = useMemo(() => new Set(profile?.articlesRead ?? []), [profile?.articlesRead]);

  const challengeDoneToday = profile?.lastChallengeDate === dayKey();
  const answered = challengeChoice !== null || challengeDoneToday;
  const challengeCorrect = challengeChoice === challenge.isScam;

  // Per-category reading progress (for the horizontal progress rail).
  const catProgress = useMemo(() => {
    const map = new Map<string, { total: number; read: number }>();
    for (const a of ARTICLES) {
      const e = map.get(a.category) || { total: 0, read: 0 };
      e.total++;
      if (readSet.has(a.id)) e.read++;
      map.set(a.category, e);
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.read / b.total - a.read / a.total || a.category.localeCompare(b.category));
  }, [readSet]);

  const categories = useMemo(() => catProgress.map((c) => c.category), [catProgress]);

  const filtered = activeCat === "All" ? ARTICLES : ARTICLES.filter((a) => a.category === activeCat);
  const visibleArticles = showAll ? filtered : filtered.slice(0, 4);

  // Badges derived from existing stats (no separate badge store).
  const badges = [
    { key: "shield", label: "First Scan", earned: (profile?.casesScanned ?? 0) >= 1 },
    { key: "book", label: "Bookworm", earned: readSet.size >= 5 },
    { key: "flame", label: "On Fire", earned: streak >= 3 },
    { key: "target", label: "Quiz Pro", earned: (profile?.quizzesPassed ?? 0) >= 3 },
    { key: "star", label: "Expert", earned: lvl.level >= 5 },
  ];

  function answerChallenge(choice: boolean) {
    if (answered) return;
    challengeAnswered.current = true;
    setChallengeChoice(choice);
    // Only a correct answer claims the day's XP (wrong answers stay practice).
    if (choice === challenge.isScam && user && !challengeDoneToday) {
      completeDailyChallenge(user.uid, DAILY_CHALLENGE_XP).catch((e) =>
        logger.error("Daily challenge claim failed:", e)
      );
    }
  }

  function completeArticle(a: Article) {
    if (!user) return;
    const already = readSet.has(a.id);
    markArticleRead(user.uid, a.id, a.xp, already).catch((e) =>
      logger.error("Mark read failed:", e)
    );
  }

  // Fetch AI-written body lazily when its reader opens, retaining each result
  // for this browser session so re-opening an article does not regenerate it.
  function openArticleReader(article: Article) {
    setOpenArticle(article);
    if (articleContent[article.id]) {
      setLoadingArticleId(null);
      return;
    }
    setLoadingArticleId(article.id);
    fetch("/api/article", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: article.id }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Article request failed"))))
      .then((content) => {
        if (content && Array.isArray(content.body) && content.body.length) {
          setArticleContent((current) => ({
            ...current,
            [article.id]: content as { summary: string; body: string[] },
          }));
        }
      })
      .catch((error) => logger.error("Article load failed:", error))
      .finally(() => {
        setLoadingArticleId((current) => (current === article.id ? null : current));
      });
  }

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-5">

        {/* ── Title + XP total ── */}
        <div className="flex items-center justify-between guidr-animate-in guidr-stagger-1">
          <h2 className="text-2xl font-bold text-guidr-text">Learn &amp; Earn</h2>
          <span className="text-sm font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
            {loading ? "…" : `${xp.toLocaleString()} XP total`}
          </span>
        </div>

        {/* ── Level card ── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 guidr-animate-in guidr-stagger-2">
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-14 h-14 rounded-full ring-4 ring-guidr-primary/15 bg-guidr-primary-light flex items-center justify-center">
              <span className="text-xl font-bold text-guidr-primary">{lvl.level}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-base font-bold text-guidr-text truncate">
                  {LEVEL_NAME} <span className="text-guidr-muted font-medium">Level {lvl.level}</span>
                </p>
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
                  {streak} {streak === 1 ? "day" : "days"}
                </span>
              </div>
              <div className="w-full h-2 bg-guidr-bg rounded-full overflow-hidden">
                <div className="h-full bg-guidr-primary rounded-full transition-all duration-700" style={{ width: `${lvl.pct}%` }} />
              </div>
              <p className="text-xs text-guidr-muted mt-1.5">
                {lvl.intoLevel} / {XP_PER_LEVEL} XP · {lvl.toNext} XP to Level {lvl.level + 1}
              </p>
            </div>
          </div>
        </div>

        {/* ── Daily Challenge ── */}
        <div className="bg-guidr-primary rounded-2xl p-4 guidr-animate-in guidr-stagger-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1.5" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <h3 className="text-base font-bold text-white">Daily Challenge</h3>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${challengeDoneToday ? "bg-white/20 text-white/80" : "bg-amber-400/90 text-amber-950"}`}>
              {challengeDoneToday ? "Earned ✓" : `+${DAILY_CHALLENGE_XP} XP`}
            </span>
          </div>

          <p className="text-sm text-white/80 mb-2">Is this message a scam?</p>
          <div className="bg-white/10 rounded-xl p-3 mb-3">
            <p className="text-sm text-white leading-relaxed italic">&ldquo;{challenge.message}&rdquo;</p>
          </div>

          {!answered ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => answerChallenge(true)}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/90 hover:bg-red-500 text-white font-semibold text-sm transition-colors active:scale-[0.98]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                Scam!
              </button>
              <button
                onClick={() => answerChallenge(false)}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-sm transition-colors active:scale-[0.98]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                It&apos;s legit
              </button>
            </div>
          ) : (
            <div className="rounded-xl p-3 bg-white/12">
              <p className="text-sm font-bold text-white mb-1">
                {challengeDoneToday && challengeChoice === null
                  ? `Today's answer: ${challenge.isScam ? "Scam" : "Legit"}`
                  : challengeCorrect
                  ? "✓ Correct!"
                  : `✗ Not quite. This was ${challenge.isScam ? "a scam" : "legit"}.`}
              </p>
              <p className="text-xs text-white/80 leading-relaxed">{challenge.explanation}</p>
              {challengeDoneToday && (
                <p className="text-xs text-white/60 mt-2">You&apos;ve earned today&apos;s XP. Come back tomorrow.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Badges ── */}
        <div className="guidr-animate-in guidr-stagger-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-guidr-text">Your badges</h3>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar">
            {badges.map((b) => (
              <div key={b.key} className="shrink-0 flex flex-col items-center gap-1.5 w-16">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${b.earned ? "bg-guidr-primary-light text-guidr-primary ring-2 ring-guidr-primary/30" : "bg-gray-100 text-gray-300"}`}>
                  <span className="w-6 h-6"><BadgeGlyph type={b.key} /></span>
                </div>
                <span className={`text-[11px] font-medium text-center leading-tight ${b.earned ? "text-guidr-text" : "text-gray-400"}`}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Your progress (horizontal rail) ── */}
        <div className="guidr-animate-in guidr-stagger-4">
          <h3 className="text-base font-bold text-guidr-text mb-3">Your progress</h3>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {catProgress.map(({ category, total, read }) => {
              const color = categoryColor(category);
              const pct = Math.round((read / total) * 100);
              return (
                <button
                  key={category}
                  onClick={() => setActiveCat(category)}
                  className="shrink-0 w-28 bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-left hover:border-guidr-primary/30 transition-colors"
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color.bg}`}>
                    <ScamCategoryIcon scamType={category} size={18} className={color.text} />
                  </span>
                  <p className="text-xs font-semibold text-guidr-text truncate">{category}</p>
                  <p className="text-[11px] text-guidr-muted mb-1.5">{read} / {total} articles</p>
                  <div className="w-full h-1.5 bg-guidr-bg rounded-full overflow-hidden">
                    <div className="h-full bg-guidr-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Continue reading ── */}
        <div className="guidr-animate-in guidr-stagger-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-base font-bold text-guidr-text">Continue reading</h3>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
            {["All", ...categories].map((cat) => {
              const active = activeCat === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCat(cat)}
                  className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    active ? "bg-guidr-primary text-white border-guidr-primary" : "bg-white text-guidr-muted border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Article list */}
          <div className="flex flex-col gap-3">
            {visibleArticles.map((a) => {
              const color = categoryColor(a.category);
              const isRead = readSet.has(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => openArticleReader(a)}
                  className="flex items-center gap-3 bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 text-left hover:border-guidr-primary/30 hover:shadow-md transition-all"
                >
                  <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${color.bg}`}>
                    <ScamCategoryIcon scamType={a.category} size={18} className={color.text} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-guidr-text leading-snug line-clamp-2">{a.title}</p>
                    <p className="text-xs text-guidr-muted mt-0.5">{a.minutes} min read</p>
                  </div>
                  {isRead ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-green-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      Done
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">+{a.xp} XP</span>
                  )}
                </button>
              );
            })}
          </div>

          {filtered.length > 4 && !showAll && (
            <button onClick={() => setShowAll(true)} className="self-start mt-3 text-sm font-semibold text-guidr-primary hover:text-guidr-primary-dark">
              Browse all {filtered.length} →
            </button>
          )}
        </div>

      </main>
      <BottomNav />

      {/* ── Article reader ── */}
      {openArticle && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenArticle(null)} />
          <div className="relative w-full lg:max-w-lg max-h-[85vh] bg-white rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col guidr-animate-in">
            <div className="flex items-start gap-3 p-4 border-b border-gray-100">
              <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${categoryColor(openArticle.category).bg}`}>
                <ScamCategoryIcon scamType={openArticle.category} size={18} className={categoryColor(openArticle.category).text} />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-guidr-text leading-snug">{openArticle.title}</h3>
                <p className="text-xs text-guidr-muted mt-0.5">{openArticle.category} · {openArticle.minutes} min read</p>
              </div>
              <button onClick={() => setOpenArticle(null)} className="shrink-0 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-guidr-muted">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-3">
              {(loadingArticleId === openArticle.id ? ["Loading article…"] : articleContent[openArticle.id]?.body ?? openArticle.body).map((para, i) => (
                <p key={i} className="text-sm text-guidr-text leading-relaxed">{para}</p>
              ))}
            </div>

            <div className="p-4 border-t border-gray-100">
              {readSet.has(openArticle.id) ? (
                <div className="w-full py-3 rounded-xl bg-green-50 text-green-700 font-semibold text-sm flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  Completed
                </div>
              ) : (
                <button
                  onClick={() => completeArticle(openArticle)}
                  className="w-full py-3 rounded-xl bg-guidr-primary text-white font-semibold text-sm hover:bg-guidr-primary-dark active:scale-[0.98] transition-all"
                >
                  Mark complete · +{openArticle.xp} XP
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
