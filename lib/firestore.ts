import type { Analysis } from "@/lib/scan-types";
import type { Entitlements } from "@/lib/plan";
import { logger } from "./logger";
import { arrayUnion, collection, doc, increment, limit, onSnapshot, orderBy, query, setDoc, Timestamp, type Unsubscribe, where } from "firebase/firestore";
import { auth, db } from "./firebase";

function handleListenerError(label: string) { return (err: { code?: string; message?: string }) => { if (err.code !== "permission-denied") logger.error(`[Guidr] ${label} listener error:`, err); }; }
export interface GlobalStats { totalCases: number; reportedNSRC: number; totalUsers: number; }
export function subscribeGlobalStats(callback: (stats: GlobalStats) => void): Unsubscribe { return onSnapshot(doc(db, "stats", "global"), (snap) => { const data = snap.exists() ? snap.data() : {}; callback({ totalCases: data.totalCases || 0, reportedNSRC: data.reportedNSRC || 0, totalUsers: data.totalUsers || 0 }); }, handleListenerError("global_stats")); }
export interface GuardianLink { id?: string; wardUid: string; wardName: string; guardianUid: string; guardianPhone?: string; guardianName?: string; status: "invited" | "pending" | "active" | "declined"; createdAt?: Timestamp; inviteToken?: string; }
export function subscribeIncomingGuardianRequests(guardianUid: string, callback: (links: GuardianLink[]) => void): Unsubscribe { return onSnapshot(query(collection(db, "guardian_links"), where("guardianUid", "==", guardianUid)), (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() } as GuardianLink))), handleListenerError("guardian_links")); }
export interface GuardianEvent { id?: string; wardUid: string; wardName: string; verdict: "SCAM" | "SUSPICIOUS"; confidence: "HIGH" | "MEDIUM" | "LOW"; scamType: string; at: number; read: boolean; }
export function subscribeGuardianEvents(guardianUid: string, callback: (events: GuardianEvent[]) => void, max = 20): Unsubscribe { return onSnapshot(query(collection(db, "users", guardianUid, "guardian_events"), orderBy("at", "desc"), limit(max)), (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() } as GuardianEvent))), handleListenerError("guardian_events")); }
export async function saveCase(_analysis: Analysis) { void _analysis; }
export async function awardXP(amount: number) { const uid = auth.currentUser?.uid; if (uid) await setDoc(doc(db, "users", uid), { xp: increment(amount) }, { merge: true }); }
export async function incrementStat(name: "casesScanned") { const uid = auth.currentUser?.uid; if (uid) await setDoc(doc(db, "users", uid), { [name]: increment(1) }, { merge: true }); }
export async function incrementScamType(_type: string) { void _type; }
export function subscribeEntitlements(_uid: string, callback: (value: Entitlements) => void) { void _uid; callback({ isPro: false, scansUsedToday: 0 }); return () => undefined; }
export type LearningProfile = { xp?: number; casesScanned?: number; articlesRead?: string[]; lastChallengeDate?: string };
export function subscribeLearningProfile(uid: string, callback: (profile: LearningProfile) => void) { return onSnapshot(doc(db, "users", uid), (snap) => callback((snap.exists() ? snap.data() : {}) as LearningProfile), handleListenerError("learning_profile")); }
export async function ensureUserProfile(uid: string, data: { fullName?: string | null; email?: string | null; photoURL?: string | null }) { await setDoc(doc(db, "users", uid), { fullName: data.fullName || "User", username: data.email?.split("@")[0] || "user", email: data.email || null, photoURL: data.photoURL || null }, { merge: true }); }
export async function updateUserProfile(uid: string, data: Record<string, unknown>) { await setDoc(doc(db, "users", uid), data, { merge: true }); }
export async function markArticleRead(uid: string, articleId: string, xp: number, alreadyRead: boolean) { const changes: Record<string, unknown> = { articlesRead: arrayUnion(articleId) }; if (!alreadyRead) changes.xp = increment(xp); await setDoc(doc(db, "users", uid), changes, { merge: true }); }
export async function completeDailyChallenge(uid: string, date: string, xp: number) { await setDoc(doc(db, "users", uid), { lastChallengeDate: date, xp: increment(xp) }, { merge: true }); }