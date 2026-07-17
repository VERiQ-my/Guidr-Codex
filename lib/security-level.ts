/**
 * Security Level (gamification) ladder.
 *
 * Single source of truth shared by the Profile page (avatar badge + menu row)
 * and the dedicated /profile/security-level page, so the two never disagree on
 * a user's rank. XP itself is awarded elsewhere (see awardXP / incrementStat in
 * lib/firestore.ts) — this module only maps an XP total onto a rank.
 */

export interface SecurityRank {
  level: number;
  title: string;
  minXp: number;
  icon: string;
  /** Tailwind gradient stops for the avatar badge / hero accents. */
  color: string;
  /** Solid hex for the rank-journey timeline dots & labels. */
  solid: string;
}

export const SECURITY_RANKS: SecurityRank[] = [
  { level: 1, title: "Novice Observer", minXp: 0, icon: "👀", color: "from-gray-400 to-gray-500", solid: "#94a3b8" },
  { level: 2, title: "Alert Citizen", minXp: 100, icon: "🛡️", color: "from-blue-400 to-blue-500", solid: "#3b82f6" },
  { level: 3, title: "Scam Hunter", minXp: 250, icon: "🎯", color: "from-teal-400 to-teal-600", solid: "#0d7377" },
  { level: 4, title: "Community Guardian", minXp: 400, icon: "⚡", color: "from-teal-500 to-teal-700", solid: "#0d7377" },
  { level: 5, title: "Cyber Sentinel", minXp: 600, icon: "👑", color: "from-amber-400 to-amber-500", solid: "#b45309" },
];

export interface SecurityLevel extends SecurityRank {
  /** Alias of `level`, kept for existing call sites. */
  levelNum: number;
  nextLevel: SecurityRank | null;
  /** Progress within the current rank toward the next, 0–100. */
  pct: number;
  currentXp: number;
  /** XP remaining to the next rank (0 at max rank). */
  xpToNext: number;
}

export function getSecurityLevel(xp: number): SecurityLevel {
  let rank = SECURITY_RANKS[0];
  for (const r of SECURITY_RANKS) if (xp >= r.minXp) rank = r;

  const idx = SECURITY_RANKS.indexOf(rank);
  const nextLevel = SECURITY_RANKS[idx + 1] ?? null;
  const span = nextLevel ? nextLevel.minXp - rank.minXp : 1;
  const into = xp - rank.minXp;
  const pct = nextLevel ? Math.min((into / span) * 100, 100) : 100;
  const xpToNext = nextLevel ? Math.max(nextLevel.minXp - xp, 0) : 0;

  return { ...rank, levelNum: rank.level, nextLevel, pct, currentXp: xp, xpToNext };
}
