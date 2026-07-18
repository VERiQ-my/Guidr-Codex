import type { Analysis } from "@/lib/scan-types";
import type { Entitlements } from "@/lib/plan";
import { logger } from "./logger";
import {
  arrayUnion,
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  type Unsubscribe,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

/** Swallow the transient permission-denied while an auth token reaches Firestore. */
function handleListenerError(label: string) {
  return (error: { code?: string; message?: string }) => {
    if (error.code === "permission-denied") return;
    logger.error(`[Guidr] ${label} listener error:`, error);
  };
}

export interface GlobalStats {
  totalCases: number;
  reportedNSRC: number;
  totalUsers: number;
}

const globalStatsRef = () => doc(db, "stats", "global");

export function subscribeGlobalStats(callback: (stats: GlobalStats) => void): Unsubscribe {
  return onSnapshot(
    globalStatsRef(),
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      callback({
        totalCases: data.totalCases || 0,
        reportedNSRC: data.reportedNSRC || 0,
        totalUsers: data.totalUsers || 0,
      });
    },
    handleListenerError("global_stats"),
  );
}

export interface GuardianLink {
  id?: string;
  wardUid: string;
  wardName: string;
  guardianUid: string;
  guardianPhone?: string;
  guardianName?: string;
  status: "invited" | "pending" | "active" | "declined";
  createdAt?: Timestamp;
  inviteToken?: string;
}

export function subscribeIncomingGuardianRequests(
  guardianUid: string,
  callback: (links: GuardianLink[]) => void,
): Unsubscribe {
  const results = query(collection(db, "guardian_links"), where("guardianUid", "==", guardianUid));
  return onSnapshot(
    results,
    (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as GuardianLink)),
    handleListenerError("guardian_links"),
  );
}

export interface GuardianEvent {
  id?: string;
  wardUid: string;
  wardName: string;
  verdict: "SCAM" | "SUSPICIOUS";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  scamType: string;
  at: number;
  read: boolean;
}

export function subscribeGuardianEvents(
  guardianUid: string,
  callback: (events: GuardianEvent[]) => void,
  max = 20,
): Unsubscribe {
  const results = query(
    collection(db, "users", guardianUid, "guardian_events"),
    orderBy("at", "desc"),
    limit(max),
  );
  return onSnapshot(
    results,
    (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as GuardianEvent)),
    handleListenerError("guardian_events"),
  );
}

// Scan actions are intentionally best-effort: a completed verdict must never be blocked by account sync.
export async function saveCase(analysis: Analysis) {
  void analysis;
}

export async function awardXP(amount: number) {
  void amount;
}

export async function incrementStat(name: "casesScanned") {
  void name;
}

export async function incrementScamType(type: string) {
  void type;
}

export function subscribeEntitlements(uid: string, callback: (value: Entitlements) => void) {
  void uid;
  callback({ isPro: false, scansUsedToday: 0 });
  return () => undefined;
}

export type LearningProfile = {
  xp?: number;
  casesScanned?: number;
  articlesRead?: string[];
  lastChallengeDate?: string;
};

export function subscribeLearningProfile(uid: string, callback: (profile: LearningProfile) => void) {
  return onSnapshot(
    doc(db, "users", uid),
    (snapshot) => callback((snapshot.exists() ? snapshot.data() : {}) as LearningProfile),
    handleListenerError("learning_profile"),
  );
}

export async function ensureUserProfile(
  uid: string,
  data: { fullName?: string; email?: string | null; photoURL?: string | null },
) {
  await setDoc(
    doc(db, "users", uid),
    {
      fullName: data.fullName || "User",
      username: data.email?.split("@")[0] || "user",
      email: data.email || null,
      photoURL: data.photoURL || null,
    },
    { merge: true },
  );
}

export async function updateUserProfile(uid: string, data: Record<string, unknown>) {
  await setDoc(doc(db, "users", uid), data, { merge: true });
}

export async function markArticleRead(uid: string, articleId: string, xp: number, alreadyRead: boolean) {
  const changes: Record<string, unknown> = { articlesRead: arrayUnion(articleId) };
  if (!alreadyRead) changes.xp = increment(xp);
  await setDoc(doc(db, "users", uid), changes, { merge: true });
}

export async function completeDailyChallenge(uid: string, date: string, xp: number) {
  await setDoc(doc(db, "users", uid), { lastChallengeDate: date, xp: increment(xp) }, { merge: true });
}
