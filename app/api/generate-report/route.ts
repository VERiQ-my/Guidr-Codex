import { NextRequest, NextResponse } from "next/server";
import { ai, MODEL_ID } from "@/app/api/lib/ai-client";
import { verifyRequest, checkRateLimit } from "../lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CaseData {
  originalMessage: string;
  analysis: {
    verdict: string;
    confidence: string;
    scam_type: string;
    language_detected: string;
    manipulation_tactics: string[];
    evidence_chain: Array<{
      finding: string;
      source: string;
      severity: string;
    }>;
    summary: string;
  };
  tool_calls?: any[];
  reporter?: {
    name?: string;
    contact?: string;
    email?: string;
  };
}

/**
 * Validate the request body before anything reaches Vertex AI. Every checked
 * field is either interpolated into the model prompt (billing + prompt-abuse
 * surface) or echoed verbatim into the generated report (PII surface), so
 * malformed or oversized input is rejected outright rather than sanitized.
 * Returns the offending field name, or null when the payload is acceptable.
 */
function firstValidationError(c: CaseData | null | undefined): string | null {
  const str = (v: unknown, max: number, required = false) =>
    required
      ? typeof v === "string" && v.trim().length > 0 && v.length <= max
      : v === undefined || v === null || (typeof v === "string" && v.length <= max);

  if (!c || typeof c !== "object") return "body";
  if (!str(c.originalMessage, 10_000, true)) return "originalMessage";

  const a = c.analysis;
  if (!a || typeof a !== "object") return "analysis";
  if (!str(a.verdict, 40, true)) return "analysis.verdict";
  if (!str(a.confidence, 40, true)) return "analysis.confidence";
  if (!str(a.scam_type, 100, true)) return "analysis.scam_type";
  if (!str(a.language_detected, 60)) return "analysis.language_detected";
  if (!str(a.summary, 2_000)) return "analysis.summary";

  const tactics = a.manipulation_tactics;
  if (tactics !== undefined) {
    if (!Array.isArray(tactics) || tactics.length > 20) return "analysis.manipulation_tactics";
    if (!tactics.every((t) => typeof t === "string" && t.length <= 300))
      return "analysis.manipulation_tactics";
  }

  const evidence = a.evidence_chain;
  if (evidence !== undefined) {
    if (!Array.isArray(evidence) || evidence.length > 25) return "analysis.evidence_chain";
    for (const e of evidence) {
      if (!e || typeof e !== "object") return "analysis.evidence_chain";
      if (!str(e.finding, 600, true)) return "analysis.evidence_chain.finding";
      if (!str(e.source, 300)) return "analysis.evidence_chain.source";
      if (!str(e.severity, 40)) return "analysis.evidence_chain.severity";
    }
  }

  if (c.tool_calls !== undefined && (!Array.isArray(c.tool_calls) || c.tool_calls.length > 30))
    return "tool_calls";

  const r = c.reporter;
  if (r !== undefined) {
    if (!r || typeof r !== "object") return "reporter";
    if (!str(r.name, 120)) return "reporter.name";
    if (!str(r.contact, 40)) return "reporter.contact";
    if (r.contact && !/^[\d+()\-\s.]{3,40}$/.test(r.contact)) return "reporter.contact";
    if (!str(r.email, 254)) return "reporter.email";
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return "reporter.email";
  }

  return null;
}

export async function POST(req: NextRequest) {
  // Same auth posture as the scan routes: every call must carry a Firebase ID
  // token in production; anonymous is tolerated in dev so local testing works.
  const uid = await verifyRequest(req.headers.get("authorization"));
  if (!uid && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limitKey = uid || "dev-anonymous";
  const allowed = await checkRateLimit(`generate-report:${limitKey}`, 5, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const caseData: CaseData = await req.json().catch(() => null);

    const invalidField = firstValidationError(caseData);
    if (invalidField) {
      return NextResponse.json(
        { error: "invalid_input", field: invalidField },
        { status: 400 }
      );
    }

    // Generate the NSRC-formatted report
    const reportId = `GDR-${Date.now().toString().slice(-8)}`;
    const timestamp = new Date().toLocaleString("en-MY", { 
      timeZone: "Asia/Kuala_Lumpur",
      dateStyle: "long",
      timeStyle: "short"
    });
    
    // Defensive: the scan always provides these, but a malformed payload
    // shouldn't 500 the whole report — fall back to empty collections.
    const tactics = caseData.analysis.manipulation_tactics || [];
    const evidence = caseData.analysis.evidence_chain || [];

    // Use AI to write a concise, professional incident summary. Uses the same
    // shared Vertex client as the scan flow (ADC service-account auth) — NOT
    // the @google/generative-ai API-key SDK, which this project isn't keyed for.
    const summaryPrompt = `Write a formal 3-4 sentence "Incident Summary" paragraph for this scam case, in the style of a police report. Use only facts from the evidence provided. Do not embellish.

CASE FACTS:
- Scam type: ${caseData.analysis.scam_type}
- Verdict: ${caseData.analysis.verdict} (${caseData.analysis.confidence} confidence)
- Language: ${caseData.analysis.language_detected}
- Manipulation tactics: ${tactics.join(", ")}

EVIDENCE:
${evidence.map((e, i) => `${i+1}. ${e.finding} [Source: ${e.source}]`).join("\n")}

Write ONLY the incident summary paragraph. No headings, no preamble.`;

    const summaryResult = await ai.models.generateContent({
      model: MODEL_ID,
      contents: summaryPrompt,
      config: {
        systemInstruction: `You are writing a formal scam incident report for submission to Malaysia's National Scam Response Centre (NSRC) at PDRM. Write in formal, factual language. Be concise — no marketing language, no hype. Stick to verifiable facts from the evidence provided.`,
      },
    });
    const incidentSummary = (summaryResult.text || "").trim();
    
    // Extract entities from tool calls for the suspicious parties section
    const suspiciousParties = extractSuspiciousParties(caseData);
    
    // Build the full report in Markdown
    const report = `# SCAM INCIDENT REPORT
## For Submission to National Scam Response Centre (NSRC 997)

---

**Report ID:** ${reportId}
**Generated:** ${timestamp}
**Prepared by:** Guidr AI Scam Investigation System

---

## 1. REPORTER INFORMATION

| Field | Value |
|-------|-------|
| Name | ${caseData.reporter?.name || "[To be filled by reporter]"} |
| Contact Number | ${caseData.reporter?.contact || "[To be filled by reporter]"} |
| Email | ${caseData.reporter?.email || "[To be filled by reporter]"} |
| IC Number | [To be filled by reporter] |

---

## 2. INCIDENT CLASSIFICATION

| Field | Value |
|-------|-------|
| Threat Type | ${caseData.analysis.scam_type} |
| Verdict | **${caseData.analysis.verdict}** (${caseData.analysis.confidence} confidence) |
| Language of Attack | ${caseData.analysis.language_detected} |
| Channel | ${detectChannel(caseData.originalMessage)} |

---

## 3. INCIDENT SUMMARY

${incidentSummary}

---

## 4. MANIPULATION TACTICS IDENTIFIED

${tactics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

---

## 5. SUSPICIOUS PARTIES

${suspiciousParties}

---

## 6. EVIDENCE CHAIN

${evidence.map((e, i) => `### ${i + 1}. ${e.finding}
- **Severity:** ${e.severity}
- **Source:** ${e.source}
`).join("\n")}

---

## 7. ORIGINAL MESSAGE (VERBATIM)

\`\`\`
${caseData.originalMessage}
\`\`\`

---

## 8. RECOMMENDED ACTIONS FOR AUTHORITIES

- [ ] Add suspicious bank account(s) to Semakmule database
- [ ] Add suspicious phone number(s) to telecommunications block list
- [ ] Issue advisory to MyCERT if pattern matches active campaign
- [ ] Coordinate with international fraud units if foreign numbers involved
- [ ] Cross-reference with existing NSRC case files

---

## 9. SUBMISSION CHANNELS

- **NSRC Hotline:** 997 (24/7)
- **NSRC Online Portal:** https://semakmule.rmp.gov.my
- **MCMC Complaint:** https://aduan.skmm.gov.my
- **Bank Negara Financial Fraud:** 1-300-88-5465

---

*This report was generated by Guidr, an AI-powered scam investigation tool. The findings are based on automated analysis cross-referencing public databases and pattern recognition. Reporter is advised to verify all details before official submission.*

**Report ID: ${reportId}**
`;
    
    return NextResponse.json({
      report_id: reportId,
      generated_at: timestamp,
      format: "markdown",
      content: report
    });
    
  } catch (error: any) {
    const errorId = crypto.randomUUID();
    console.error(`[GENERATE-REPORT ERROR errorId=${errorId}]`, error);
    return NextResponse.json(
      { error: "Failed to generate report", errorId },
      { status: 500 }
    );
  }
}

// Helper: detect channel from message content
function detectChannel(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("linkedin")) return "LinkedIn";
  if (lower.includes("whatsapp") || lower.includes("wa.me")) return "WhatsApp";
  if (lower.includes("telegram")) return "Telegram";
  if (lower.includes("fiverr")) return "Fiverr";
  if (/@gmail|@yahoo|@outlook|@hotmail/.test(lower)) return "Email";
  return "Direct Message (channel unspecified)";
}

// Helper: extract suspicious parties from tool calls
function extractSuspiciousParties(caseData: CaseData): string {
  if (!caseData.tool_calls || caseData.tool_calls.length === 0) {
    return "*See evidence chain for entity details.*";
  }
  
  const parties: string[] = [];
  
  for (const call of caseData.tool_calls) {
    if (call.tool === "verify_company_existence" && call.result?.verdict === "NOT_FOUND") {
      parties.push(`### Suspicious Company
- **Claimed name:** ${call.args.company_name}
- **SSM Status:** ${call.result.note}
- **Source:** ${call.result.source}`);
    }
    
    if (call.tool === "check_recruiter_pattern" && call.result?.pattern_match?.includes("MATCH")) {
      parties.push(`### Suspicious Contact
- **Contact:** ${call.args.contact}
- **Claimed company:** ${call.args.claimed_company || "Not specified"}
- **Red flags identified:**
${(call.result.red_flags || []).map((f: string) => `  - ${f}`).join("\n")}
- **Source:** ${call.result.source}`);
    }
    
    if (call.tool === "check_url_safety" && call.result?.verdict === "SUSPICIOUS") {
      parties.push(`### Suspicious URL
- **URL:** ${call.args.url}
- **Domain age:** ${call.result.domain_age_days} days
- **Hosting pattern:** ${call.result.hosting_pattern}
- **Reputation:** ${call.result.reputation_score}
- **Source:** ${call.result.source}`);
    }
    
    if (call.tool === "search_scam_reports" && call.result?.reports_found > 0) {
      parties.push(`### Prior Scam Reports — ${call.args.entity_type}: ${call.args.entity}
- **Reports found:** ${call.result.reports_found}
- **Sources:** ${(call.result.sources || []).join(", ")}
- **Notable findings:**
${(call.result.sample_reports || []).map((r: string) => `  - ${r}`).join("\n")}`);
    }
  }
  
  return parties.length > 0 ? parties.join("\n\n") : "*See evidence chain for entity details.*";
}