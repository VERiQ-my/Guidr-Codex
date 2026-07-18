export type RiskLabel = "low" | "medium" | "high";
export type InternalVerdict = "safe" | "suspicious" | "scam" | "needs_review";

export type ExtractedScan = {
  is_scam: boolean;
  confidence: number;
  category: string;
  reasoning: string;
  evidence_chain: string[];
  manipulation_tactics: string[];
  extracted_text: string;
};

export type MallamAnalysis = {
  languages: string[];
  normalized_text: string;
  local_scam_signals: string[];
  entities: {
    phones: string[];
    bank_accounts: string[];
    urls: string[];
    organizations: string[];
  };
};

export type DatabricksAnalysis = {
  risk_score: number;
  risk_label: RiskLabel;
  reasoning: string;
};

export type ScamPattern = {
  id: string;
  category: string;
  language: string;
  dialect: string;
  example_text: string;
  red_flags: string[];
  source_url: string;
  source_type: string;
  verified_at: string;
  score?: number;
};

export type ReconciledScan = {
  verdict: InternalVerdict;
  confidence: number;
  openai: ExtractedScan | null;
  databricks: DatabricksAnalysis | null;
  mallam: MallamAnalysis | null;
  patterns: ScamPattern[];
  partial: boolean;
};
