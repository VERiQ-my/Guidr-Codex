"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ScamCategoryIcon from "@/app/components/ScamCategoryIcon";

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  image?: string;
  category?: string;
}

/** How long each card stays up before auto-advancing. */
const INTERVAL = 6000;

/* ── Per-category accent: gradient (icon fallback), dot color, badge label ── */
interface CatMeta {
  grad: string;
  color: string;
  label: string;
}

const CAT_META: Record<string, CatMeta> = {
  "Phishing":             { grad: "linear-gradient(135deg,#b91c1c,#f87171)", color: "#ef4444", label: "Phishing" },
  "Impersonation":        { grad: "linear-gradient(135deg,#9333ea,#c084fc)", color: "#a855f7", label: "Impersonation" },
  "Investment Scam":      { grad: "linear-gradient(135deg,#1e40af,#3b82f6)", color: "#3b82f6", label: "Investment" },
  "Crypto Scam":          { grad: "linear-gradient(135deg,#b45309,#f59e0b)", color: "#f59e0b", label: "Crypto" },
  "Job Scam":             { grad: "linear-gradient(135deg,#0d7377,#14b8a6)", color: "#0d7377", label: "Job Scam" },
  "Loan Scam":            { grad: "linear-gradient(135deg,#047857,#10b981)", color: "#10b981", label: "Loan Scam" },
  "Romance Scam":         { grad: "linear-gradient(135deg,#be185d,#f472b6)", color: "#ec4899", label: "Romance" },
  "Lottery Scam":         { grad: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#8b5cf6", label: "Lottery" },
  "Online Shopping Scam": { grad: "linear-gradient(135deg,#4338ca,#818cf8)", color: "#6366f1", label: "Shopping" },
  "Tech Support Scam":    { grad: "linear-gradient(135deg,#334155,#64748b)", color: "#475569", label: "Tech Support" },
  "Delivery Scam":        { grad: "linear-gradient(135deg,#c2410c,#fb923c)", color: "#f97316", label: "Delivery" },
  "Charity Scam":         { grad: "linear-gradient(135deg,#0f766e,#2dd4bf)", color: "#14b8a6", label: "Charity" },
};

const GENERAL: CatMeta = { grad: "linear-gradient(135deg,#0d7377,#14b8a6)", color: "#0d7377", label: "Scam Alert" };

function metaFor(category?: string): CatMeta {
  if (!category) return GENERAL;
  return CAT_META[category] ?? GENERAL;
}

/* ── "13h ago" from an RSS pubDate string ── */
function timeAgo(pubDate: string): string {
  if (!pubDate) return "";
  const date = new Date(pubDate);
  if (isNaN(date.getTime())) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ScamNewsCarousel() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const progressRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (bust = false) => {
    try {
      const r = await fetch("/api/scam-news" + (bust ? `?t=${Date.now()}` : ""));
      const d = await r.json();
      const list: NewsItem[] = Array.isArray(d.items) ? d.items : [];
      setItems(list);
      setIdx(0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Auto-advance + drive the top progress bar. Re-runs whenever the visible
  // card or the list changes.
  useEffect(() => {
    if (items.length <= 1) return;
    const bar = progressRef.current;
    if (bar) {
      bar.style.transition = "none";
      bar.style.width = "0%";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          bar.style.transition = `width ${INTERVAL}ms linear`;
          bar.style.width = "100%";
        })
      );
    }
    const t = setTimeout(() => setIdx((i) => (i + 1) % items.length), INTERVAL);
    return () => clearTimeout(t);
  }, [idx, items]);

  const go = (dir: number) => {
    if (items.length === 0) return;
    setIdx((i) => (i + dir + items.length) % items.length);
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await load(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  /* ── Section header (shared across all states) ── */
  const header = (
    <div className="flex items-center justify-between mb-3 px-1">
      <div className="flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <h3 className="text-base font-bold text-guidr-text">Scam news worldwide</h3>
      </div>
      <button
        type="button"
        onClick={refresh}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 border border-teal-200 bg-teal-50 hover:bg-teal-100 transition-colors"
        aria-label="Refresh scam news"
      >
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
          style={{ transition: "transform 0.6s ease", transform: refreshing ? "rotate(360deg)" : "none" }}
        >
          <path d="M23 4v6h-6" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        <span className="text-[9px] font-semibold text-guidr-primary">Updated daily</span>
      </button>
    </div>
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="py-10 flex justify-center">
          <div className="w-6 h-6 border-2 border-guidr-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        {header}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-guidr-muted">
            Couldn&rsquo;t load the latest headlines right now. Check back soon.
          </p>
        </div>
      </div>
    );
  }

  const a = items[idx];
  const meta = metaFor(a.category);
  const showImage = !!a.image && !imgFailed[a.link];
  const time = timeAgo(a.pubDate);

  return (
    <div>
      {header}

      {/* CAROUSEL CARD */}
      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-2.5">
        {/* THUMBNAIL */}
        <div
          className="relative h-[120px] flex items-center justify-center overflow-hidden"
          style={{ background: meta.grad }}
        >
          {showImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.image}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed((p) => ({ ...p, [a.link]: true }))}
              />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top,rgba(0,0,0,0.45),transparent 55%)" }} />
            </>
          ) : (
            <>
              <div className="absolute opacity-[0.12] text-white" aria-hidden="true">
                <ScamCategoryIcon scamType={a.category} size={92} />
              </div>
              <div className="relative z-[1] text-white/80">
                <ScamCategoryIcon scamType={a.category} size={36} />
              </div>
              <div
                className="absolute bottom-0 left-0 right-0 h-12"
                style={{ background: "linear-gradient(to top,rgba(0,0,0,0.35),transparent)" }}
              />
            </>
          )}

          {/* Category badge + time */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between items-center px-2.5 py-1.5 z-[2]">
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-white/20 border border-white/25">
              <span className="text-white">
                <ScamCategoryIcon scamType={a.category} size={10} />
              </span>
              <span className="text-[8px] font-semibold text-white uppercase tracking-wide">{meta.label}</span>
            </span>
            {time && <span className="text-[8px] text-white/75">{time}</span>}
          </div>

          {/* Auto-progress bar */}
          <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-white/15 z-[2]">
            <div ref={progressRef} className="h-full bg-white/60 rounded-r" style={{ width: "0%" }} />
          </div>
        </div>

        {/* CARD BODY */}
        <a href={a.link} target="_blank" rel="noopener noreferrer" className="block p-3.5 pt-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
            <span className="text-[9px] font-semibold uppercase tracking-wide text-guidr-primary truncate">
              {a.source}
            </span>
          </div>
          <p className="text-[13px] font-semibold text-guidr-text leading-snug line-clamp-3 min-h-[54px]">
            {a.title}
          </p>
          <div className="flex justify-between items-center mt-2.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-guidr-primary">
              Read article
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
            {/* Dot indicators */}
            <div className="flex gap-1 items-center">
              {items.map((it, i) => (
                <button
                  key={it.link}
                  type="button"
                  aria-label={`Go to article ${i + 1}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setIdx(i);
                  }}
                  className="h-[5px] rounded-full transition-all"
                  style={{
                    width: i === idx ? 16 : 5,
                    background: i === idx ? meta.color : "#e2e8f0",
                  }}
                />
              ))}
            </div>
          </div>
        </a>
      </div>

      {/* NAV ROW */}
      <div className="flex justify-between items-center px-1">
        <button
          type="button"
          onClick={() => go(-1)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 bg-slate-100 border border-gray-100 hover:bg-slate-200 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="text-[10px] text-slate-600">Prev</span>
        </button>
        <span className="text-[10px] text-guidr-muted">
          {idx + 1} of {items.length}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 bg-guidr-primary hover:opacity-90 transition-opacity"
        >
          <span className="text-[10px] text-white">Next</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
