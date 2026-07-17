import { logger } from "./logger";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  increment,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  limit,
  getCountFromServer,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { normalizeScamType } from "./scam-categories";
import { entitlementsPath, type Entitlements } from "./plan";

/**
 * Call the server-side `/api/stats/bump` endpoint. Replaces the direct
 * Firestore writes that used to live in `bumpGlobalStat` and
 * `incrementScamType`. Best-effort: callers already wrap counter bumps in
 * try/catch and we never want a flaky counter to break the user-facing flow.
 */
async function callStatsBump(body: object): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  await fetch("/api/stats/bump", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Shared error callback for onSnapshot listeners.
 *
 * On sign-in there's a brief window where the Firebase Auth token hasn't
 * propagated to Firestore's servers yet — any listener attaching in that
 * window gets rejected with `permission-denied`. The Firestore SDK retries
 * automatically and the next snapshot succeeds, but without an onError
 * handler the rejection logs as "Uncaught Error in snapshot listener".
 *
 * This helper swallows that specific transient case but surfaces anything
 * else as a real error so we still catch genuine bugs.
 */
function handleListenerError(label: string) {
  return (err: { code?: string; message?: string }) => {
    if (err.code === "permission-denied") return;
    logger.error(`[Guidr] ${label} listener error:`, err);
  };
}

/* ══════════════════════════════════════════
   CASES
   ══════════════════════════════════════════ */

export interface CaseData {
  id?: string;
  userId: string;
  verdict: "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  scamType: string;
  summary: string;
  originalMessage: string;
  manipulationTactics: string[];
  evidenceChain: any[];
  recommendedActions: string[];
  reportMarkdown?: string;
  reportId?: string;
  reportedToNSRC: boolean;
  reportedToPDRM: boolean;
  reportedToMCMC: boolean;
  channel?: string;
  // Lifecycle status. Optional for backward-compat: older cases have no field,
  // so callers should resolve it through deriveCaseStatus() rather than reading
  // this directly.
  status?: CaseStatus;
  createdAt: any;
}

export type CaseStatus = "pending" | "reported" | "resolved";

/**
 * Resolve a case's lifecycle status, falling back to a derivation for older
 * cases that predate the stored `status` field:
 *   - reported  → sent to any agency (NSRC / PDRM / MCMC)
 *   - resolved  → verdict was safe, so there's nothing left to action
 *   - pending   → a scam/suspicious case not yet reported
 */
export function deriveCaseStatus(c: {
  status?: CaseStatus;
  verdict?: string;
  reportedToNSRC?: boolean;
  reportedToPDRM?: boolean;
  reportedToMCMC?: boolean;
}): CaseStatus {
  if (c.status) return c.status;
  if (c.reportedToNSRC || c.reportedToPDRM || c.reportedToMCMC) return "reported";
  if (c.verdict === "LIKELY_SAFE") return "resolved";
  return "pending";
}

/** Persist an explicit lifecycle status (e.g. user taps "Mark as resolved"). */
export async function setCaseStatus(caseId: string, status: CaseStatus) {
  await updateDoc(doc(db, "cases", caseId), {
    status,
    // Stamp the transition so the case timeline can show real dates.
    ...(status === "resolved" ? { resolvedAt: serverTimestamp() } : {}),
  });
}

/**
 * Mark a case as reported to an authority after the fact (from the Cases
 * page). Sets the agency flag + lifecycle status and stamps reportedAt for
 * the timeline. Mirrors what the scan-report consent flow records at save
 * time, including the global NSRC counter.
 */
export async function markCaseReported(caseId: string, agency: "NSRC" | "PDRM" | "MCMC") {
  await updateDoc(doc(db, "cases", caseId), {
    [`reportedTo${agency}`]: true,
    status: "reported",
    reportedAt: serverTimestamp(),
  });
  if (agency === "NSRC") {
    try {
      await bumpGlobalStat("reportedNSRC", 1);
    } catch (err) {
      logger.error("Failed to bump reportedNSRC:", err);
    }
  }
}

export async function saveCase(data: Omit<CaseData, "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "cases"), {
    ...data,
    // Store the canonical category, not the raw model string, so cases are
    // consistent at rest (the leaderboard already canonicalizes separately).
    scamType: normalizeScamType(data.scamType),
    createdAt: serverTimestamp(),
  });

  // Maintain global aggregate counters (best-effort; never block the save).
  try {
    await bumpGlobalStat("totalCases", 1);
    if (data.reportedToNSRC) await bumpGlobalStat("reportedNSRC", 1);
  } catch (err) {
    logger.error("Failed to update global case counters:", err);
  }

  return ref.id;
}

export async function getUserCases(userId: string): Promise<CaseData[]> {
  const q = query(
    collection(db, "cases"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CaseData));
}

export async function updateCase(caseId: string, data: Partial<CaseData>) {
  await updateDoc(doc(db, "cases", caseId), data);
}

/* ══════════════════════════════════════════
   USER PROFILE & STATS
   ══════════════════════════════════════════ */

export interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  email: string | null;
  photoURL?: string | null;
  xp: number;
  casesScanned: number;
  scamsReported: number;
  quizzesPassed: number;
  isIdentityVerified: boolean;
  // NOTE: Pro status (isSubscribed), the daily scan quota, and the Stripe
  // linkage do NOT live here. They are server-owned and stored at
  // users/{uid}/entitlements/plan — see Entitlements in lib/plan.ts and
  // subscribeEntitlements() below. Keeping them off the client-writable
  // profile is what makes them tamper-proof (security fix F-1).
  language: string;
  theme: string; // "light" | "dark" | "system"
  // General app preferences (Settings page).
  defaultScanChannel?: string;  // pre-selects the channel when starting a scan
  notifyScanComplete?: boolean; // notify when an investigation finishes
  autoSaveScans?: boolean;      // keep a history of investigations (default on)
  // Guardian alert channel preference. Push is governed by the browser
  // notification permission; email is an explicit opt-out (default on).
  alertEmailEnabled?: boolean;
  // FCM registration tokens for web push — one per browser/device the user
  // has enabled Guardian Alerts on. Used server-side to deliver pushes.
  fcmTokens?: string[];
  // Verified phone (E.164, e.g. +60123456789). Set via Firebase Phone Auth
  // OTP linking; used server-side to match trusted contacts → Guidr accounts.
  phone?: string;
  phoneVerified?: boolean;
  // Learn & Earn progress.
  articlesRead?: string[];      // article ids the user has completed
  streakDays?: number;          // consecutive days with learning activity
  lastActiveDate?: string;      // YYYY-MM-DD of the last learning visit
  lastChallengeDate?: string;   // YYYY-MM-DD the daily challenge XP was claimed
  // Privacy & Security.
  passwordUpdatedAt?: Timestamp; // last time the password was changed in-app
  mfaEnabled?: boolean;          // SMS two-factor enrolled (mirrors Firebase MFA)
  appLockEnabled?: boolean;      // require biometric/PIN to open the app
  appLockBiometric?: boolean;    // prefer biometric (WebAuthn) over PIN when locking
}

/* ══════════════════════════════════════════
   ENTITLEMENTS (server-owned)
   Pro status + daily scan quota live at users/{uid}/entitlements/plan,
   written only by the Admin SDK (Stripe webhook/confirm, scan-quota).
   Clients may only read/subscribe. See lib/plan.ts.
   ══════════════════════════════════════════ */

/** Live subscription to the user's own entitlements (Pro flag, scan quota). */
export function subscribeEntitlements(
  uid: string,
  callback: (ent: Entitlements | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, entitlementsPath(uid)),
    (snap) => callback(snap.exists() ? (snap.data() as Entitlements) : null),
    handleListenerError("entitlements")
  );
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() } as UserProfile;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>) {
  await updateDoc(doc(db, "users", uid), data);
}

/* ══════════════════════════════════════════
   BACKGROUND SCANS (durable, server-written)
   A scan started via /api/scan/run keeps running server-side even if the
   client leaves. The server (Admin SDK) writes progress + the final verdict
   to scans/{scanId}; the client only reads its own scan to render/re-attach.
   ══════════════════════════════════════════ */

export interface ScanDoc {
  userId: string;
  status: "running" | "done" | "error";
  stage?: string;
  statusMessage?: string;
  toolSteps?: { tool: string; displayName: string; status: "running" | "done"; args?: any; result?: any }[];
  analysis?: any;
  errorKind?: string;
  errorMessage?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Live subscription to a single background scan the user owns. */
export function subscribeScan(
  scanId: string,
  callback: (scan: ScanDoc | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "scans", scanId),
    (snap) => callback(snap.exists() ? (snap.data() as ScanDoc) : null),
    handleListenerError("scan")
  );
}

/* ══════════════════════════════════════════
   PUSH NOTIFICATION TOKENS (Guardian Alerts)
   ══════════════════════════════════════════ */

/** Store an FCM web-push token on the user's profile (deduped). */
export async function registerPushToken(uid: string, token: string) {
  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
}

/** Remove an FCM token (e.g. on sign-out or when it becomes invalid). */
export async function unregisterPushToken(uid: string, token: string) {
  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(token) });
}

export async function awardXP(uid: string, amount: number) {
  await updateDoc(doc(db, "users", uid), { xp: increment(amount) });
}

export async function incrementStat(uid: string, field: "casesScanned" | "scamsReported" | "quizzesPassed") {
  await updateDoc(doc(db, "users", uid), { [field]: increment(1) });
}

/* ══════════════════════════════════════════
   LEARN & EARN
   ══════════════════════════════════════════ */

/** Local YYYY-MM-DD for the given date (defaults to now). */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Real-time subscription to a user's own profile doc (xp, stats, learn progress). */
export function subscribeUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => callback(snap.exists() ? ({ uid, ...snap.data() } as UserProfile) : null),
    handleListenerError("user profile")
  );
}

/**
 * Mark an article complete and award its XP. Idempotent on the read set
 * (arrayUnion), but XP is only granted when the article wasn't already read —
 * callers must pass `alreadyRead` so we don't double-award.
 */
export async function markArticleRead(uid: string, articleId: string, xp: number, alreadyRead: boolean) {
  await updateDoc(doc(db, "users", uid), {
    articlesRead: arrayUnion(articleId),
    ...(alreadyRead ? {} : { xp: increment(xp) }),
  });
}

/**
 * Bump the daily learning streak. Same-day visits are a no-op; a visit the day
 * after the last one extends the streak, any longer gap resets it to 1.
 */
export async function touchLearningStreak(
  uid: string,
  lastActiveDate: string | undefined,
  streakDays: number | undefined
) {
  const today = dayKey();
  if (lastActiveDate === today) return;
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const next = lastActiveDate === yesterday ? (streakDays || 0) + 1 : 1;
  await updateDoc(doc(db, "users", uid), { streakDays: next, lastActiveDate: today });
}

/** Claim the daily-challenge reward once per day (XP + a quiz-passed credit). */
export async function completeDailyChallenge(uid: string, xp: number) {
  await updateDoc(doc(db, "users", uid), {
    xp: increment(xp),
    quizzesPassed: increment(1),
    lastChallengeDate: dayKey(),
  });
}

/* ══════════════════════════════════════════
   TRUSTED CONTACTS
   ══════════════════════════════════════════ */

// Free tier can save up to this many trusted contacts; more requires Guidr Pro.
export const TRUSTED_CONTACT_FREE_LIMIT = 5;

export interface TrustedContact {
  id?: string;
  name: string;
  phone: string;
  status: "verified" | "pending";
  // Optional relationship label shown on the guardian card, e.g. "Mother",
  // "Friend". Free text picked from quick-chips in the Add-contact flow.
  relationship?: string;
  // When the contact was added — drives the "added X ago" line on the card.
  // Set server-side in addTrustedContact; absent on contacts saved before this.
  createdAt?: Timestamp;
  // Guardian linking state (set server-side once a request is made):
  //  - linkStatus "invited"  → not on Guidr yet; a share-link invite is waiting
  //                            to be opened (see inviteUrl)
  //  - linkStatus "pending"  → invite sent to their Guidr account, awaiting acceptance
  //  - linkStatus "active"   → they accepted; they receive Guardian Alerts about you
  //  - linkStatus "declined" → they declined
  //  - linkStatus "none"     → legacy: pre-invite-link contacts that dead-ended
  linkStatus?: "none" | "invited" | "pending" | "active" | "declined";
  guardianUid?: string | null;
  // Share-link invite for a contact who has no Guidr account. The ward can
  // re-send this at any time; it stays valid until claimed.
  inviteUrl?: string;
}

export async function getTrustedContacts(uid: string): Promise<TrustedContact[]> {
  const q = query(collection(db, "users", uid, "trusted_contacts"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TrustedContact));
}

/** Returns the new contact's id, so the caller can attach a guardian invite. */
export async function addTrustedContact(
  uid: string,
  contact: Omit<TrustedContact, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "trusted_contacts"), {
    ...contact,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Attach a share-link invite to a contact who isn't on Guidr yet, so the ward
 * can re-send it later from their guardian list. The link itself is minted
 * server-side (/api/guardians/request).
 */
export async function saveContactInvite(uid: string, contactId: string, inviteUrl: string) {
  await updateDoc(doc(db, "users", uid, "trusted_contacts", contactId), {
    linkStatus: "invited",
    inviteUrl,
  });
}

export async function removeTrustedContact(uid: string, contactId: string) {
  await deleteDoc(doc(db, "users", uid, "trusted_contacts", contactId));
}

export function subscribeTrustedContacts(uid: string, callback: (contacts: TrustedContact[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "trusted_contacts"));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TrustedContact)));
    },
    handleListenerError("trusted_contacts")
  );
}

/* ══════════════════════════════════════════
   SIGN-IN SESSIONS (active devices)
   One doc per device the user signs in on, keyed by a client-generated
   session id kept in localStorage. We refresh `lastSeenAt` on the same
   heartbeat as presence so the sign-in history shows live "active now".
   ══════════════════════════════════════════ */

export interface DeviceSession {
  id?: string;
  device: string;      // human label, e.g. "iPhone 15 Pro" / "Chrome on Windows"
  browser?: string;
  os?: string;
  location?: string;   // approx "Kuala Lumpur, MY" (from server geo headers)
  userAgent?: string;
  createdAt?: Timestamp;
  lastSeenAt?: Timestamp;
}

/**
 * Create or refresh the current device's session doc. Called once on load with
 * the full payload, then cheaply re-touched (lastSeenAt only) on each heartbeat.
 */
export async function upsertSession(
  uid: string,
  sessionId: string,
  data: Omit<DeviceSession, "id" | "createdAt" | "lastSeenAt">
) {
  const ref = doc(db, "users", uid, "sessions", sessionId);
  const snap = await getDoc(ref);
  await setDoc(
    ref,
    {
      ...data,
      lastSeenAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );
}

/** Cheap heartbeat: bump lastSeenAt for the current device only. */
export async function touchSession(uid: string, sessionId: string) {
  await setDoc(
    doc(db, "users", uid, "sessions", sessionId),
    { lastSeenAt: serverTimestamp() },
    { merge: true }
  );
}

/** Remove a single session (e.g. user signs a device out individually). */
export async function deleteSession(uid: string, sessionId: string) {
  await deleteDoc(doc(db, "users", uid, "sessions", sessionId));
}

/** Live list of the user's sessions, newest activity first. */
export function subscribeSessions(uid: string, callback: (sessions: DeviceSession[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "sessions"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeviceSession));
      list.sort((a, b) => (b.lastSeenAt?.toMillis() ?? 0) - (a.lastSeenAt?.toMillis() ?? 0));
      callback(list);
    },
    handleListenerError("sessions")
  );
}

/* ══════════════════════════════════════════
   GUARDIAN LINKS
   A "guardian" is someone who receives Guardian Alerts ABOUT a ward (the
   protected user) when that ward hits a HIGH-confidence scam. Links are
   created/mutated server-side (Admin SDK) for integrity; clients only read.
   ══════════════════════════════════════════ */

export interface GuardianLink {
  id?: string;
  wardUid: string;       // the protected user (who scanned the scam)
  wardName: string;
  // Who gets notified. Empty string while the link is "invited": the person
  // has no Guidr account yet, so there is no uid to point at. Claiming the
  // invite fills this in.
  guardianUid: string;
  guardianPhone: string;
  guardianName: string;
  status: "invited" | "pending" | "active" | "declined";
  createdAt?: Timestamp;
  // Present only on "invited" links: the secret in the share URL. Whoever
  // opens the link and signs in becomes the guardian, so treat it as a
  // capability and never expose it on a link the caller doesn't own.
  inviteToken?: string;
}

/** Live list of incoming guardian requests where I am the guardian. */
export function subscribeIncomingGuardianRequests(
  guardianUid: string,
  callback: (links: GuardianLink[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "guardian_links"),
    where("guardianUid", "==", guardianUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GuardianLink)));
    },
    handleListenerError("guardian_links")
  );
}

/* ══════════════════════════════════════════
   GUARDIAN EVENTS
   One doc per risky verdict a ward hit, written SERVER-side by the scan
   pipeline (app/api/lib/guardian-alert.ts) under the guardian's own user doc.
   The guardian reads their feed here and may only flip the `read` flag.
   ══════════════════════════════════════════ */

export interface GuardianEvent {
  id?: string;
  wardUid: string;
  wardName: string;
  verdict: "SCAM" | "SUSPICIOUS";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  scamType: string;
  at: number; // epoch ms (server-written)
  read: boolean;
}

/** Live feed of my most recent guardian events, newest first. */
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
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GuardianEvent)));
    },
    handleListenerError("guardian_events")
  );
}

/** Mark one of my guardian events as read (rules allow only this field). */
export async function markGuardianEventRead(guardianUid: string, eventId: string) {
  await updateDoc(doc(db, "users", guardianUid, "guardian_events", eventId), { read: true });
}

/* ══════════════════════════════════════════
   SCAM TRENDING DATA (global)
   ══════════════════════════════════════════ */

export async function incrementScamType(rawScamType: string) {
  // Writes go through /api/stats/bump (server-side Admin SDK) so the doc ID
  // is constrained to the canonical taxonomy. A client posting arbitrary
  // strings can't materialize a `scams/microsoft_is_a_scam` document because
  // the server normalizes through scam-categories.ts before writing.
  await callStatsBump({ kind: "scam", scamType: rawScamType });
}

/* ══════════════════════════════════════════
   GLOBAL STATS (aggregate counter doc)
   ══════════════════════════════════════════ */

export type GlobalStatField = "totalCases" | "reportedNSRC" | "totalUsers";

export interface GlobalStats {
  totalCases: number;
  reportedNSRC: number;
  totalUsers: number;
}

const globalStatsRef = () => doc(db, "stats", "global");

/**
 * Increment a global counter. Routed through /api/stats/bump so the field
 * name is allowlisted server-side and the amount is fixed at +1 (the `by`
 * argument is kept for call-site compatibility but ignored — the server
 * controls the increment so a tampered client can't add arbitrary amounts).
 */
export async function bumpGlobalStat(field: GlobalStatField, _by = 1) {
  await callStatsBump({ kind: "global", field });
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const snap = await getDoc(globalStatsRef());
  const d = snap.exists() ? snap.data() : {};
  return {
    totalCases: d.totalCases || 0,
    reportedNSRC: d.reportedNSRC || 0,
    totalUsers: d.totalUsers || 0,
  };
}

/** Real-time subscription to the global stats counters. */
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

/* ══════════════════════════════════════════
   PRESENCE (active-user counts)
   ══════════════════════════════════════════ */

// A user counts as "active now" if their last heartbeat is within this window.
export const PRESENCE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

// Heartbeat: stamp the user's last-seen time in a dedicated, countable
// `presence` collection (kept separate from the private user profile).
export async function updatePresence(uid: string) {
  await setDoc(
    doc(db, "presence", uid),
    { uid, lastSeen: serverTimestamp() },
    { merge: true }
  );
}

// Count users active within the presence window.
export async function getActiveUserCount(): Promise<number> {
  const cutoff = Timestamp.fromMillis(Date.now() - PRESENCE_WINDOW_MS);
  const snap = await getCountFromServer(
    query(collection(db, "presence"), where("lastSeen", ">", cutoff))
  );
  return snap.data().count;
}

/* ══════════════════════════════════════════
   PUBLIC SCAM ALERTS (shareable)
   ══════════════════════════════════════════ */

// A shareable, publicly-readable alert created when a user warns their
// contacts. Non-app recipients can open it via link; full details + scanning
// are gated behind sign-up on the public page.
export interface AlertData {
  id?: string;
  ownerUid: string;
  warnedByName: string;       // who is warning them
  verdict: "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  scamType: string;
  summary: string;
  // Gated (preview hides these on the public page until sign-up)
  manipulationTactics: string[];
  evidenceChain: { finding: string; source: string; severity: string }[];
  recommendedActions: string[];
  warnedContactCount: number;
  createdAt: any;
}

export async function createAlert(
  data: Omit<AlertData, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "alerts"), {
    ...data,
    // Canonical category, consistent with cases (the public alert page and any
    // aggregation read this field).
    scamType: normalizeScamType(data.scamType),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getAlert(id: string): Promise<AlertData | null> {
  const snap = await getDoc(doc(db, "alerts", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as AlertData;
}
