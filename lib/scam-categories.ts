export const SAFE_CATEGORY = "none";
export const CANONICAL_SCAM_CATEGORIES = ["investment", "job", "impersonation", "phishing", "romance", "shopping", "other", SAFE_CATEGORY] as const;
export type ScamCategory = typeof CANONICAL_SCAM_CATEGORIES[number];

const labels: Record<ScamCategory, string> = {
  investment: "Investment scam", job: "Job scam", impersonation: "Impersonation scam", phishing: "Phishing attempt", romance: "Romance scam", shopping: "Shopping scam", other: "Unclassified risk", none: "No clear scam pattern",
};
export function displayScamCategory(value?: string) { return labels[value as ScamCategory] ?? labels.other; }
