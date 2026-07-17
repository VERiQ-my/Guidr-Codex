import type { ScamCategory } from "@/lib/scam-categories";

export const VALID_VERDICTS = ["SCAM", "SUSPICIOUS", "LIKELY_SAFE"] as const;
export type Verdict = typeof VALID_VERDICTS[number];
export type ScanInput = { message: string; sourceChannel: string; senderContact?: string; image?: string; imageMimeType?: string; attachmentName?: string };
export type Analysis = { verdict: Verdict; confidence: number; scam_type: ScamCategory; summary: string; manipulation_tactics: string[]; evidence_chain: string[]; recommended_actions: string[] };
export type ScanEvent = { type: "status" | "tool_start" | "tool_complete" | "verdict" | "error"; message?: string; tool?: string; analysis?: Analysis };
