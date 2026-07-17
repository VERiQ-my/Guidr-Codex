/**
 * Global scan concurrency gate + FIFO queue, backed by Firestore.
 *
 * WHY: each scan (`/api/analyze-stream`) fans out into many sequential Vertex
 * AI calls. With many simultaneous users this blows past the Vertex per-minute
 * quota (429s). This module caps the number of *concurrently running* scans
 * across all serverless instances and queues the rest FIFO, so the backend
 * stays inside quota while users wait their turn (with a gamified UI).
 *
 * STATE (server-only writes; clients read their own ticket via security rules):
 *  - scan_control/slots          { active, max, updatedAt }   — global counter
 *  - scan_tickets/{ticketId}      { uid, status, createdAt, heartbeatAt, slotToken? }
 *    status ∈ waiting | active | done | expired
 *
 * PORTABILITY: all logic sits behind `QueueBackend`. A later Cloudflare Workers
 * migration can add a `RestFirestoreBackend` (Firestore REST + Web-Crypto JWT)
 * without touching the routes, client, game, or rules.
 *
 * CREDENTIALS: reuses the existing Firebase-project Admin SDK from
 * `firebase-admin.ts` (`getAdminFirestore()`) — the same `guidr-d8709` service
 * account already used for Guardian Alerts, which already has Firestore access.
 * No extra IAM grant is needed; just keep `FIREBASE_ADMIN_CREDENTIALS_JSON` set.
 *
 * FAIL-OPEN: if those admin credentials are missing or Firestore is unreachable,
 * every call degrades to "admitted" so scans keep working ungated, rather than
 * hard-fail. Set QUEUE_FALLBACK_OPEN=false to fail *closed* (return busy).
 */

import { randomUUID } from "crypto";
import type { Firestore } from "./firestore-rest";
import { getAdminFirestore } from "./firebase-admin";

// ── Tunables (env-overridable) ──
const MAX_CONCURRENT = Number(process.env.SCAN_MAX_CONCURRENT) || 12;
const TICKET_TTL_MS = Number(process.env.SCAN_TICKET_TTL_MS) || 30_000;
const HEARTBEAT_MS = Number(process.env.SCAN_HEARTBEAT_MS) || 10_000;
const QUEUE_FALLBACK_OPEN = process.env.QUEUE_FALLBACK_OPEN !== "false"; // default: open

const SLOTS_PATH = "scan_control/slots";
const TICKETS = "scan_tickets";

/** Sentinel returned in fail-open mode (Firestore unreachable). */
export const OPEN_SLOT_TOKEN = "__queue_open__";

export const QUEUE_CONFIG = {
  maxConcurrent: MAX_CONCURRENT,
  ticketTtlMs: TICKET_TTL_MS,
  heartbeatMs: HEARTBEAT_MS,
  fallbackOpen: QUEUE_FALLBACK_OPEN,
};

export type AdmitResult =
  | { admitted: true; slotToken: string }
  | { admitted: false; position: number; expired?: boolean };

export interface QueueBackend {
  enqueue(uid: string, priority?: boolean): Promise<{ ticketId: string }>;
  tryAdmit(ticketId: string, uid: string): Promise<AdmitResult>;
  heartbeat(ticketId: string): Promise<void>;
  release(ticketId: string): Promise<void>;
  verifyActive(ticketId: string, slotToken: string): Promise<boolean>;
}

// =============================================================================
// Admin SDK backend (current Next.js/Vercel runtime)
// =============================================================================

class AdminFirestoreBackend implements QueueBackend {
  private db: Firestore;
  constructor(db: Firestore) {
    this.db = db;
  }

  private slotsRef() {
    return this.db.doc(SLOTS_PATH);
  }
  private ticketRef(id: string) {
    return this.db.collection(TICKETS).doc(id);
  }

  async enqueue(uid: string, priority = false): Promise<{ ticketId: string }> {
    // Best-effort sweep so a fresh arrival sees an accurate queue length.
    await this.sweepStale().catch(() => {});
    const now = Date.now();
    const ref = this.db.collection(TICKETS).doc();
    // `priority` (Guidr Pro) lets a ticket jump ahead of free waiters at admit
    // time — see tryAdmit's ordering. Stored on the ticket so the decision is
    // consistent across serverless instances.
    await ref.set({ uid, status: "waiting", createdAt: now, heartbeatAt: now, priority });
    return { ticketId: ref.id };
  }

  async tryAdmit(ticketId: string, uid: string): Promise<AdmitResult> {
    await this.sweepStale().catch(() => {});
    const now = Date.now();

    return this.db.runTransaction(async (tx) => {
      const ticketRef = this.ticketRef(ticketId);

      // ── all reads first (Firestore txn rule) ──
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) return { admitted: false, position: 0, expired: true };

      const ticket = ticketSnap.data()!;
      if (ticket.uid !== uid) return { admitted: false, position: 0, expired: true };

      if (ticket.status === "active") {
        // Idempotent: already holding a slot — refresh heartbeat and return it.
        tx.update(ticketRef, { heartbeatAt: now });
        return { admitted: true, slotToken: ticket.slotToken };
      }
      if (ticket.status !== "waiting") {
        return { admitted: false, position: 0, expired: true };
      }

      const slotsSnap = await tx.get(this.slotsRef());
      const active = slotsSnap.exists ? slotsSnap.data()!.active || 0 : 0;

      // Equality-only filter ⇒ uses the automatic single-field index (no
      // composite index needed). Sorted in-memory; the waiting set is small
      // because stale tickets are swept.
      const waitingSnap = await tx.get(
        this.db.collection(TICKETS).where("status", "==", "waiting").limit(200)
      );
      // Order: Guidr Pro tickets first, then FIFO by arrival within each tier.
      // This is what gives Pro users a priority lane during high demand.
      const waitingIds = waitingSnap.docs
        .map((d) => ({
          id: d.id,
          createdAt: d.data().createdAt || 0,
          priority: d.data().priority ? 1 : 0,
        }))
        .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
        .map((w) => w.id);

      const idx = waitingIds.indexOf(ticketId); // 0-based position in priority order
      const free = Math.max(0, MAX_CONCURRENT - active);

      // ── writes ──
      // Admit only if a slot is free AND this ticket is within the oldest
      // `free` waiting tickets, so a newcomer can't jump ahead of older waiters.
      if (free > 0 && idx > -1 && idx < free) {
        const slotToken = randomUUID();
        tx.update(ticketRef, { status: "active", slotToken, heartbeatAt: now });
        tx.set(
          this.slotsRef(),
          { active: active + 1, max: MAX_CONCURRENT, updatedAt: now },
          { merge: true }
        );
        return { admitted: true, slotToken };
      }

      // Still waiting — keep the ticket alive while it polls.
      tx.update(ticketRef, { heartbeatAt: now });
      return { admitted: false, position: idx > -1 ? idx + 1 : waitingIds.length + 1 };
    });
  }

  async heartbeat(ticketId: string): Promise<void> {
    await this.ticketRef(ticketId)
      .update({ heartbeatAt: Date.now() })
      .catch(() => {});
  }

  async release(ticketId: string): Promise<void> {
    const now = Date.now();
    await this.db.runTransaction(async (tx) => {
      const ref = this.ticketRef(ticketId);
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const status = snap.data()!.status;

      let active = 0;
      const wasActive = status === "active";
      if (wasActive) {
        const slotsSnap = await tx.get(this.slotsRef());
        active = slotsSnap.exists ? slotsSnap.data()!.active || 0 : 0;
      }

      tx.update(ref, { status: "done", heartbeatAt: now });
      if (wasActive) {
        tx.set(
          this.slotsRef(),
          { active: Math.max(0, active - 1), updatedAt: now },
          { merge: true }
        );
      }
    });
  }

  async verifyActive(ticketId: string, slotToken: string): Promise<boolean> {
    const snap = await this.ticketRef(ticketId).get();
    if (!snap.exists) return false;
    const d = snap.data()!;
    return d.status === "active" && d.slotToken === slotToken;
  }

  /**
   * Reclaim slots leaked by crashed/closed clients: any active or waiting
   * ticket whose heartbeat is older than TICKET_TTL_MS is expired (and, if it
   * was active, the global `active` counter is decremented). Best-effort.
   */
  private async sweepStale(): Promise<void> {
    const cutoff = Date.now() - TICKET_TTL_MS;
    // Single-field range filter ⇒ automatic index.
    const staleSnap = await this.db
      .collection(TICKETS)
      .where("heartbeatAt", "<", cutoff)
      .limit(50)
      .get();

    for (const doc of staleSnap.docs) {
      const status = doc.data().status;
      if (status !== "active" && status !== "waiting") {
        // Delete finished (done/expired) tickets instead of skipping them:
        // they'd otherwise accumulate as the oldest heartbeats and permanently
        // fill this 50-doc window, so genuinely stale active tickets beyond it
        // would never be swept and their leaked slots never reclaimed.
        await doc.ref.delete().catch(() => {});
        continue;
      }
      await this.db
        .runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (!fresh.exists) return;
          const st = fresh.data()!.status;
          if (st !== "active" && st !== "waiting") return;

          let active = 0;
          const wasActive = st === "active";
          if (wasActive) {
            const slotsSnap = await tx.get(this.slotsRef());
            active = slotsSnap.exists ? slotsSnap.data()!.active || 0 : 0;
          }

          tx.update(doc.ref, { status: "expired" });
          if (wasActive) {
            tx.set(
              this.slotsRef(),
              { active: Math.max(0, active - 1), updatedAt: Date.now() },
              { merge: true }
            );
          }
        })
        .catch(() => {});
    }
  }
}

// =============================================================================
// Public API (fail-open wrappers used by the routes)
// =============================================================================

let backend: QueueBackend | null = null;
/** The Firestore-backed queue, or null if admin credentials aren't configured. */
function getBackend(): QueueBackend | null {
  if (backend) return backend;
  const db = getAdminFirestore();
  if (!db) return null;
  backend = new AdminFirestoreBackend(db);
  return backend;
}

export async function enqueueScan(
  uid: string,
  priority = false
): Promise<{ ticketId: string; open?: boolean }> {
  const b = getBackend();
  if (!b) {
    if (QUEUE_FALLBACK_OPEN) return { ticketId: OPEN_SLOT_TOKEN, open: true };
    throw new Error("scan-queue: admin credentials not configured");
  }
  try {
    return await b.enqueue(uid, priority);
  } catch (err) {
    console.error("[scan-queue] enqueue failed:", (err as Error)?.message || err);
    if (QUEUE_FALLBACK_OPEN) return { ticketId: OPEN_SLOT_TOKEN, open: true };
    throw err;
  }
}

export async function admitScan(ticketId: string, uid: string): Promise<AdmitResult> {
  if (ticketId === OPEN_SLOT_TOKEN) return { admitted: true, slotToken: OPEN_SLOT_TOKEN };
  const b = getBackend();
  if (!b) {
    if (QUEUE_FALLBACK_OPEN) return { admitted: true, slotToken: OPEN_SLOT_TOKEN };
    throw new Error("scan-queue: admin credentials not configured");
  }
  try {
    return await b.tryAdmit(ticketId, uid);
  } catch (err) {
    console.error("[scan-queue] admit failed:", (err as Error)?.message || err);
    if (QUEUE_FALLBACK_OPEN) return { admitted: true, slotToken: OPEN_SLOT_TOKEN };
    throw err;
  }
}

/** Verify a scan request holds a valid active slot. Fail-open per config. */
export async function verifySlot(
  ticketId: string | undefined,
  slotToken: string | undefined
): Promise<boolean> {
  if (slotToken === OPEN_SLOT_TOKEN || ticketId === OPEN_SLOT_TOKEN) return QUEUE_FALLBACK_OPEN;
  if (!ticketId || !slotToken) return false;
  const b = getBackend();
  if (!b) return QUEUE_FALLBACK_OPEN;
  try {
    return await b.verifyActive(ticketId, slotToken);
  } catch (err) {
    console.error("[scan-queue] verify failed:", (err as Error)?.message || err);
    return QUEUE_FALLBACK_OPEN;
  }
}

export async function heartbeatScan(ticketId: string | undefined): Promise<void> {
  if (!ticketId || ticketId === OPEN_SLOT_TOKEN) return;
  const b = getBackend();
  if (!b) return;
  try {
    await b.heartbeat(ticketId);
  } catch {
    /* best-effort */
  }
}

export async function releaseScan(ticketId: string | undefined): Promise<void> {
  if (!ticketId || ticketId === OPEN_SLOT_TOKEN) return;
  const b = getBackend();
  if (!b) return;
  try {
    await b.release(ticketId);
  } catch (err) {
    console.error("[scan-queue] release failed:", (err as Error)?.message || err);
  }
}
