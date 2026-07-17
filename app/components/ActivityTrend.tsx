"use client";

import { useMemo, useState } from "react";

interface TrendCase {
  verdict: string;
  date: Date | null;
}

export type TrendRange = "Week" | "Month" | "Year";

interface Bucket {
  label: string;
  full: string;
  count: number;
}

const DAY_MS = 86_400_000;
const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildBuckets(cases: TrendCase[], range: TrendRange, now: number): Bucket[] {
  const risky = cases.filter((c) => c.verdict !== "LIKELY_SAFE" && c.date);

  if (range === "Year") {
    const buckets: Bucket[] = [];
    const ref = new Date(now);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      const count = risky.filter(
        (c) => c.date!.getFullYear() === d.getFullYear() && c.date!.getMonth() === d.getMonth()
      ).length;
      buckets.push({
        label: i === 11 || d.getMonth() % 3 === 0 ? MONTH_SHORT[d.getMonth()] : "",
        full: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`,
        count,
      });
    }
    return buckets;
  }

  const days = range === "Week" ? 7 : 30;
  const per = range === "Week" ? 1 : 5;
  const n = days / per;
  const buckets: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = now - i * per * DAY_MS;
    const start = end - per * DAY_MS;
    const count = risky.filter((c) => {
      const t = c.date!.getTime();
      return t > start && t <= end;
    }).length;
    const startD = new Date(start + DAY_MS);
    const endD = new Date(end);
    if (range === "Week") {
      buckets.push({
        label: DAY_LETTER[endD.getDay()],
        full: endD.toLocaleDateString("en-MY", { day: "numeric", month: "short" }),
        count,
      });
    } else {
      const fmt = (d: Date) => d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
      buckets.push({
        label: i === n - 1 || i === 0 || i === Math.floor(n / 2) ? fmt(startD) : "",
        full: `${fmt(startD)} â€“ ${fmt(endD)}`,
        count,
      });
    }
  }
  return buckets;
}

export default function ActivityTrend({
  cases,
  range,
  now,
}: {
  cases: TrendCase[];
  range: TrendRange;
  now: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => buildBuckets(cases, range, now), [cases, range, now]);

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const peakIdx = buckets.findIndex((b) => b.count === max);

  const W = 320;
  const H = 96;
  const AXIS_H = 16;
  const plotH = H - AXIS_H;
  const gap = 2;
  const barW = W / buckets.length - gap;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-bold text-guidr-text">Risky encounters</h3>
        <span className="text-xs text-guidr-muted">
          {total === 0 ? "none this period" : `${total} this period`}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-sm text-guidr-muted py-4">
          Nothing risky in this period. Keep scanning anything suspicious.
        </p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto block"
            role="img"
            aria-label={`Risky encounters per ${range === "Year" ? "month" : range === "Week" ? "day" : "period"}: ${buckets
              .map((b) => `${b.full}: ${b.count}`)
              .join(", ")}`}
          >
            <line x1={0} y1={plotH} x2={W} y2={plotH} stroke="#e5e7eb" strokeWidth={1} />

            {buckets.map((b, i) => {
              const h = b.count === 0 ? 2 : Math.max((b.count / max) * (plotH - 14), 4);
              const x = i * (barW + gap) + gap / 2;
              const y = plotH - h;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h + 4}
                    rx={3}
                    fill={b.count === 0 ? "#e5e7eb" : "#0d7377"}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                    clipPath={`inset(0 0 4px 0)`}
                  />
                  {i === peakIdx && b.count > 0 && (
                    <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1f2933">
                      {b.count}
                    </text>
                  )}
                  {b.label && (
                    <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={8.5} fill="#7b8794">
                      {b.label}
                    </text>
                  )}
                  <rect
                    x={i * (barW + gap)}
                    y={0}
                    width={barW + gap}
                    height={H}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onTouchStart={() => setHover(hover === i ? null : i)}
                  />
                </g>
              );
            })}
          </svg>

          {hover !== null && (
            <div
              className="absolute -top-1 pointer-events-none bg-guidr-text text-white text-[11px] font-medium px-2 py-1 rounded-lg shadow-lg whitespace-nowrap"
              style={{
                left: `${((hover + 0.5) / buckets.length) * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              {buckets[hover].full}: {buckets[hover].count}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
