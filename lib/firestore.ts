import { logger } from "./logger";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

/** Swallow the transient permission-denied that happens while the auth token
 *  propagates to Firestore on sign-in; surface anything else. */
function handleListenerError(label: string) {
  return (err: { code?: string; message?: string }) => {
    if (err.code === "permission-denied") return;
    logger.error(`[Guidr] ${label} listener error:`, err);
  };
}

/* â”€â”€ Global aggregate counters (stats/global) â”€â”€ */
export interface GlobalStats {
  totalCases: number;
  reportedNSRC: number;
  totalUsers: number;
}

const globalStatsRef = () => doc(db, "stats", "global");

export function subscribeGlobalStats(callback: (stats: GlobalStats) => void): Unsubscribe {
  return onSnapshot(
    globalStatsRef(),
    (snap) => {
      const d = snap.exists() ? snap.data() : {};
      callback({
        totalCases: d.totalCases || 0,
        reportedNSRC: d.reportedNSRC || 0,
        totalUsers: d.totalUsers || 0,
      });
    },
    handleListenerError("global_stats")
  );
}

/* â”€â”€ Guardian links (guardians only; drives WardOverview) â”€â”€ */
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
  callback: (links: GuardianLink[]) => void
): Unsubscribe {
  const q = query(collection(db, "guardian_links"), where("guardianUid", "==", guardianUid));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GuardianLink))),
    handleListenerError("guardian_links")
  );
}

/* â”€â”€ Guardian events (per guardian; server-written) â”€â”€ */
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
  max = 20
): Unsubscribe {
  const q = query(
    collection(db, "users", guardianUid, "guardian_events"),
    orderBy("at", "desc"),
    limit(max)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GuardianEvent))),
    handleListenerError("guardian_events")
  );
}
