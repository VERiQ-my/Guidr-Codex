"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/app/context/UserContext";
import {
  subscribeIncomingGuardianRequests,
  subscribeGuardianEvents,
  type GuardianLink,
  type GuardianEvent,
} from "@/lib/firestore";

interface WardRow {
  wardUid: string;
  name: string;
  scams: number;
  suspicious: number;
  lastAt: number | null;
}

function riskChip(w: WardRow): { label: string; cls: string } {
  if (w.scams > 0) return { label: "Needs a check-in", cls: "bg-red-100 text-red-700" };
  if (w.suspicious > 0) return { label: "Watchful", cls: "bg-amber-100 text-amber-700" };
  return { label: "All quiet", cls: "bg-green-100 text-green-700" };
}

export default function WardOverview({ periodMs, now }: { periodMs: number; now: number }) {
  const { user } = useUser();
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [events, setEvents] = useState<GuardianEvent[]>([]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeIncomingGuardianRequests(user.uid, setLinks);
    const u2 = subscribeGuardianEvents(user.uid, setEvents, 100);
    return () => {
      u1();
      u2();
    };
  }, [user]);

  const wards = useMemo<WardRow[]>(() => {
    const rows = new Map<string, WardRow>();
    for (const l of links) {
      if (l.status !== "active") continue;
      rows.set(l.wardUid, { wardUid: l.wardUid, name: l.wardName || "Someone you protect", scams: 0, suspicious: 0, lastAt: null });
    }
    for (const e of events) {
      if (now - e.at > periodMs) continue;
      const row = rows.get(e.wardUid);
      if (!row) continue;
      if (e.verdict === "SCAM") row.scams++;
      else row.suspicious++;
      if (!row.lastAt || e.at > row.lastAt) row.lastAt = e.at;
    }
    return [...rows.values()].sort(
      (a, b) => b.scams - a.scams || b.suspicious - a.suspicious || (b.lastAt || 0) - (a.lastAt || 0)
    );
  }, [links, events, periodMs, now]);

  if (wards.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-bold text-guidr-text">People you protect</h3>
        <Link href="/settings" className="text-xs font-bold text-guidr-primary hover:underline">
          Guardian hub â†’
        </Link>
      </div>
      <div className="flex flex-col">
        {wards.map((w, i) => {
          const chip = riskChip(w);
          const parts: string[] = [];
          if (w.scams > 0) parts.push(`${w.scams} scam${w.scams > 1 ? "s" : ""}`);
          if (w.suspicious > 0) parts.push(`${w.suspicious} suspicious`);
          return (
            <div
              key={w.wardUid}
              className={`flex items-center gap-3 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}
            >
              <div
                className={`w-10 h-10 rounded-full text-white text-sm font-bold flex items-center justify-center shrink-0 ${
                  w.scams > 0 ? "bg-guidr-red" : w.suspicious > 0 ? "bg-amber-500" : "bg-guidr-primary"
                }`}
              >
                {w.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-guidr-text truncate">{w.name}</p>
                <p className="text-xs text-guidr-muted mt-0.5">
                  {parts.length ? `${parts.join(", ")} this period` : "No risky encounters this period"}
                </p>
              </div>
              <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${chip.cls}`}>
                {chip.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
