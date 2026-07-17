type Ticket = { userId: string; createdAt: number; admitted?: boolean; slotToken?: string; slotExpiresAt?: number };
const tickets = new Map<string, Ticket>();
const activeSlots = new Set<string>();
const MAX_CONCURRENT_SCANS = 3;
const TICKET_TTL_MS = 5 * 60_000;
const SLOT_TTL_MS = 2 * 60_000;
const id = () => crypto.randomUUID();

function cleanup() {
  const now = Date.now();
  for (const [ticketId, ticket] of tickets) {
    if (now - ticket.createdAt > TICKET_TTL_MS || (ticket.slotExpiresAt && now > ticket.slotExpiresAt)) {
      if (ticket.slotToken) activeSlots.delete(ticket.slotToken);
      tickets.delete(ticketId);
    }
  }
}

export function enqueue(userId: string) {
  cleanup();
  const ticketId = id();
  tickets.set(ticketId, { userId, createdAt: Date.now() });
  return ticketId;
}

export function admit(ticketId: string, userId: string) {
  cleanup();
  const ticket = tickets.get(ticketId);
  if (!ticket || ticket.userId !== userId) return { expired: true, admitted: false, position: 0 };
  if (ticket.admitted && ticket.slotToken && ticket.slotExpiresAt && ticket.slotExpiresAt > Date.now()) return { admitted: true, slotToken: ticket.slotToken, position: 0 };
  const waiting = [...tickets.entries()].filter(([, value]) => !value.admitted).map(([key]) => key);
  const position = waiting.indexOf(ticketId) + 1;
  if (position === 1 && activeSlots.size < MAX_CONCURRENT_SCANS) {
    const slotToken = id();
    ticket.admitted = true;
    ticket.slotToken = slotToken;
    ticket.slotExpiresAt = Date.now() + SLOT_TTL_MS;
    activeSlots.add(slotToken);
    return { admitted: true, slotToken, position: 0 };
  }
  return { admitted: false, position: Math.max(position, 1) };
}

export function verifySlot(ticketId: string, slotToken: string, userId: string) {
  cleanup();
  const ticket = tickets.get(ticketId);
  return Boolean(ticket?.admitted && ticket.userId === userId && ticket.slotToken === slotToken && activeSlots.has(slotToken));
}

export function release(slotToken?: string) {
  if (!slotToken) return;
  activeSlots.delete(slotToken);
  for (const [ticketId, ticket] of tickets) if (ticket.slotToken === slotToken) tickets.delete(ticketId);
}