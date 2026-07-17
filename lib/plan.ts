export const FREE_DAILY_SCANS = 3;
export type Entitlements = { isPro: boolean; scansUsedToday: number };
export const scansRemaining = (entitlements: Entitlements) => entitlements.isPro ? Infinity : Math.max(0, FREE_DAILY_SCANS - entitlements.scansUsedToday);
