"use client";
import type { Analysis } from "@/lib/scan-types";
import type { Entitlements } from "@/lib/plan";

export type ScanDoc = { analysis?: Analysis; error?: string };
export function subscribeEntitlements(_uid: string, callback: (value: Entitlements) => void) { callback({ isPro: false, scansUsedToday: 0 }); return () => undefined; }
export function subscribeScan(_scanId: string, _callback: (value: ScanDoc) => void) { return () => undefined; }
export async function saveCase(_analysis: Analysis) {}
export async function awardXP(_amount: number) {}
export async function incrementStat(_name: "casesScanned") {}
export async function incrementScamType(_type: string) {}
