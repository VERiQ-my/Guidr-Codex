import type { Analysis, ScanEvent } from "@/lib/scan-types";
type ScanState = { events: ScanEvent[]; analysis?: Analysis; error?: string };
const scans = new Map<string, ScanState>();
export const createScan = () => { const id = crypto.randomUUID(); scans.set(id, { events: [] }); return id; };
export const appendScanEvent = (id: string, event: ScanEvent) => { const state = scans.get(id); if (!state) return; state.events.push(event); if (event.analysis) state.analysis = event.analysis; if (event.type === "error") state.error = event.message; };
export const getScan = (id: string) => scans.get(id);
