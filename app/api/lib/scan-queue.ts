import { createHmac, timingSafeEqual } from "node:crypto";

type TicketPayload = { kind: "ticket" | "slot"; id: string; userId: string; expiresAt: number; ticketId?: string };

const TICKET_TTL_MS = 5 * 60_000;
const SLOT_TTL_MS = 2 * 60_000;

function secret() {
  return process.env.SCAN_QUEUE_SECRET || "guidr-local-scan-queue";
}

function encode(payload: TicketPayload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function decode(token: string | undefined, expectedKind: TicketPayload["kind"]) {
  if (!token) return undefined;
  const [data, signature] = token.split(".");
  if (!data || !signature) return undefined;
  const expected = createHmac("sha256", secret()).update(data).digest("base64url");
  const supplied = Buffer.from(signature);
  const actual = Buffer.from(expected);
  if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as TicketPayload;
    if (payload.kind !== expectedKind || !payload.id || !payload.userId || payload.expiresAt <= Date.now()) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

export function enqueue(userId: string) {
  return encode({ kind: "ticket", id: crypto.randomUUID(), userId, expiresAt: Date.now() + TICKET_TTL_MS });
}

export function admit(ticketId: string, userId: string) {
  const ticket = decode(ticketId, "ticket");
  if (!ticket || ticket.userId !== userId) return { expired: true, admitted: false, position: 0 };
  const slotToken = encode({ kind: "slot", id: crypto.randomUUID(), ticketId, userId, expiresAt: Date.now() + SLOT_TTL_MS });
  return { admitted: true, slotToken, position: 0 };
}

export function verifySlot(ticketId: string, slotToken: string, userId: string) {
  const ticket = decode(ticketId, "ticket");
  const slot = decode(slotToken, "slot");
  return Boolean(ticket && slot && ticket.userId === userId && slot.userId === userId && slot.ticketId === ticketId);
}

// Signed slots expire automatically; no shared in-memory release bookkeeping is needed.
export function release(slotToken?: string) {
  void slotToken;
}
