/**
 * ScanRunner — Durable Object that executes a scan investigation in the
 * background, independent of the client's HTTP connection.
 *
 * WHY: on Cloudflare, post-response work in a route (`after()`/waitUntil) is
 * capped at ~30s — far below the scan budget — and the SSE route dies with the
 * client connection. A Durable Object's lifetime is tied to neither: the
 * /api/scan/run route hands the job to this object and returns immediately,
 * and the investigation keeps writing progress to the `scans/{scanId}`
 * Firestore doc that the client watches (and can re-attach to on return).
 *
 * Durability model:
 *  - The job runs as in-memory background work inside the object (the runtime
 *    keeps a Durable Object alive while spawned work is pending).
 *  - A watchdog alarm is set past the scan budget. If the object is evicted
 *    or crashes mid-run, the alarm fires, marks the still-"running" doc with a
 *    graceful timeout error, and releases the queue slot — so the client never
 *    spins forever on an orphaned doc. On normal completion the alarm is
 *    cleared.
 *
 * One object instance per scanId (idFromName), so a duplicate dispatch cannot
 * run the same scan twice concurrently.
 */

import { runScanAgent, type ScanInput } from "../app/api/lib/scan-runner";
import type { Firestore } from "../app/api/lib/firestore-rest";
import { getAdminFirestore } from "../app/api/lib/firebase-admin";
import { heartbeatScan, releaseScan, QUEUE_CONFIG } from "../app/api/lib/scan-queue";
import { consumeScanQuota } from "../app/api/lib/scan-quota";
import { notifyGuardiansOfVerdict } from "../app/api/lib/guardian-alert";
import { withTimeout, TimeoutError } from "../app/api/lib/ai-utils";

// Hard ceiling for the investigation. Sits ABOVE the runner's own
// OVERALL_DEADLINE_MS (95s) so, in the normal case, the runner emits its own
// graceful "timeout" first and this is only a backstop.
const DURABLE_BUDGET_MS = 105_000;
// Watchdog fires this long after the budget — only reachable if run() never
// got to its finally block (eviction/crash).
const WATCHDOG_SLACK_MS = 20_000;

interface ScanJob {
  scanId: string;
  uid: string;
  ticketId?: string;
  input: ScanInput;
}

/** Watchdog metadata persisted in DO storage (small — never the input). */
interface JobMeta {
  scanId: string;
  uid: string;
  ticketId?: string;
  startedAt: number;
}

// Minimal structural view of DurableObjectState — the project doesn't ship
// Cloudflare ambient types, and this file is typechecked by Next's tsc.
interface DOStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
interface DOState {
  storage: DOStorage;
  waitUntil?(promise: Promise<unknown>): void;
}

/**
 * Mirror the scan-runner event stream into the `scans/{scanId}` doc. Writes
 * are serialized through a promise chain so order is preserved and `flush()`
 * can await the final state. (Same contract the client listener expects.)
 */
function makeFirestoreEmitter(db: Firestore, scanId: string) {
  const ref = db.doc(`scans/${scanId}`);
  const steps: { tool: string; displayName: string; status: string; args?: any; result?: any }[] = [];
  let statusMessage = "Reading the message...";
  let stage = "starting";
  let pending: Promise<unknown> = Promise.resolve();

  const queue = (extra: Record<string, unknown>) => {
    const payload = { statusMessage, stage, toolSteps: steps, updatedAt: Date.now(), ...extra };
    pending = pending
      .then(() => ref.set(payload, { merge: true }))
      .catch((e) => console.error("[scan-do] write failed:", (e as Error)?.message));
  };

  const emit = (event: string, data: any) => {
    switch (event) {
      case "status":
        statusMessage = data.message;
        stage = data.stage || stage;
        queue({});
        break;
      case "tool_start":
        steps.push({ tool: data.tool, displayName: data.display_name, status: "running", args: data.args });
        queue({});
        break;
      case "tool_complete": {
        const s = [...steps].reverse().find((x) => x.tool === data.tool && x.status === "running");
        if (s) {
          s.status = "done";
          s.result = data.result;
        }
        queue({});
        break;
      }
      case "verdict":
        queue({ analysis: data.analysis });
        break;
      case "done":
        queue({ status: "done" });
        break;
      case "error":
        queue({ status: "error", errorKind: data.kind, errorMessage: data.message });
        break;
    }
  };

  return { emit, flush: () => pending };
}

export class ScanRunner {
  private state: DOState;

  constructor(state: DOState, _env: unknown) {
    this.state = state;
  }

  /** POST /start with a ScanJob body. Returns 202 immediately. */
  async fetch(request: Request): Promise<Response> {
    let job: ScanJob;
    try {
      job = (await request.json()) as ScanJob;
      if (!job?.scanId || !job?.input) throw new Error("missing scanId/input");
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400 });
    }

    const meta: JobMeta = {
      scanId: job.scanId,
      uid: job.uid,
      ticketId: job.ticketId,
      startedAt: Date.now(),
    };
    await this.state.storage.put("job", meta);
    await this.state.storage.setAlarm(Date.now() + DURABLE_BUDGET_MS + WATCHDOG_SLACK_MS);

    const work = this.run(job);
    // waitUntil is belt-and-braces; pending work already keeps a DO alive.
    this.state.waitUntil?.(work);

    return new Response(JSON.stringify({ started: true }), { status: 202 });
  }

  private async run(job: ScanJob): Promise<void> {
    const db = getAdminFirestore();
    if (!db) {
      // Can't persist progress — nothing useful to do beyond freeing the slot.
      console.error("[scan-do] no admin Firestore; aborting scan", job.scanId);
      await releaseScan(job.ticketId);
      await this.cleanup();
      return;
    }

    const { emit, flush } = makeFirestoreEmitter(db, job.scanId);
    const heartbeat = job.ticketId
      ? setInterval(() => { void heartbeatScan(job.ticketId); }, QUEUE_CONFIG.heartbeatMs)
      : null;

    try {
      const result = await withTimeout(runScanAgent(job.input, emit), DURABLE_BUDGET_MS, "durable-scan");
      await flush(); // ensure the terminal verdict/error write lands
      if (result.ok && job.uid && job.uid !== "dev-anonymous") {
        await consumeScanQuota(job.uid).catch(() => {});
      }
      if (result.ok && result.analysis) {
        // Alert guardians from the server so it fires even when the ward's
        // app is backgrounded/closed (the whole point of a durable scan).
        await notifyGuardiansOfVerdict(job.uid, result.analysis);
      }
    } catch (err) {
      const timedOut = err instanceof TimeoutError;
      console.error("[scan-do] scan crashed:", err);
      await db
        .doc(`scans/${job.scanId}`)
        .set(
          {
            status: "error",
            errorKind: timedOut ? "timeout" : "failed",
            errorMessage: timedOut
              ? "The investigation took too long to complete. Your scan may need a simpler message or another try."
              : "Something went wrong during the analysis. Please try again.",
            updatedAt: Date.now(),
          },
          { merge: true }
        )
        .catch(() => {});
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await releaseScan(job.ticketId);
      await this.cleanup();
    }
  }

  /** Watchdog: only reachable if run() never completed (eviction/crash). */
  async alarm(): Promise<void> {
    const meta = await this.state.storage.get<JobMeta>("job");
    if (!meta) return;
    console.error("[scan-do] watchdog fired for orphaned scan", meta.scanId);

    const db = getAdminFirestore();
    if (db) {
      try {
        const snap = await db.doc(`scans/${meta.scanId}`).get();
        const status = snap.exists ? snap.data()?.status : undefined;
        if (status !== "done" && status !== "error") {
          await db.doc(`scans/${meta.scanId}`).set(
            {
              status: "error",
              errorKind: "timeout",
              errorMessage:
                "The investigation took too long to complete. Your scan may need a simpler message or another try.",
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        }
      } catch (err) {
        console.error("[scan-do] watchdog doc update failed:", err);
      }
    }

    await releaseScan(meta.ticketId);
    await this.state.storage.deleteAll();
  }

  private async cleanup(): Promise<void> {
    await this.state.storage.deleteAlarm().catch(() => {});
    await this.state.storage.deleteAll().catch(() => {});
  }
}
