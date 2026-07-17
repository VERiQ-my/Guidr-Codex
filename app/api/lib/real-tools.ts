/**
 * Real-time tool implementations for Guidr scam detection.
 * 
 * Strategy (Vertex AI Migration):
 * 1. Google Safe Browsing API (Still uses API Key)
 * 2. Vertex AI (gemini-1.5-flash) for web intelligence (uses GCP Trial Credits)
 * 3. Pattern-based heuristics (zero cost)
 */

import { ai, SEARCH_MODEL_ID } from "./ai-client";
import { callWithRetry, withTimeout } from "./ai-utils";

// ── In-memory web-intelligence cache ──
// Dedupes identical lookups within a request and across warm invocations.
// (Serverless instances are ephemeral, so this is a best-effort speedup.)
const WEB_CACHE = new Map<string, { value: string; expires: number }>();
const WEB_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const WEB_CACHE_MAX = 200;

function cacheGet(key: string): string | null {
  const hit = WEB_CACHE.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) WEB_CACHE.delete(key);
  return null;
}

function cacheSet(key: string, value: string) {
  if (WEB_CACHE.size >= WEB_CACHE_MAX) {
    const oldest = WEB_CACHE.keys().next().value;
    if (oldest) WEB_CACHE.delete(oldest);
  }
  WEB_CACHE.set(key, { value, expires: Date.now() + WEB_CACHE_TTL_MS });
}

// We still need the API key for Safe Browsing. If it's invalid, the fetch will just return no threat.
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

// The hardcoded DEMO_SCAMS database below is ONLY for scripted demos. It must
// never short-circuit real analysis for real users, so it's gated behind an
// explicit env flag (off by default).
const DEMO_MODE = process.env.GUIDR_DEMO_MODE === "true" || process.env.GUIDR_DEMO_MODE === "1";

// =============================================================================
// DEMO DATABASE — kept as fast-path cache for known demo entities
// =============================================================================

const DEMO_SCAMS: Record<string, any> = {
  "talentbridge asia": {
    type: "company",
    company_data: {
      registered_in_ssm: false, registration_number: null, official_website: null,
      verdict: "NOT_FOUND",
      note: "No company named 'TalentBridge Asia' is registered in SSM Malaysia. Similar names appear in 12 prior scam reports.",
      source: "SSM Malaysia Business Registry"
    },
    scam_reports: {
      reports_found: 23,
      sources: ["r/malaysia (Reddit)", "Lowyat.NET forum", "Semakmule database", "MyCERT advisory"],
      sample_reports: [
        "Reddit user @kelvinwong reported losing RM850 to 'TalentBridge Asia' fake job, Mar 2026",
        "Lowyat thread: 'TalentBridge Asia Data Entry Scam' — 47 victims confirmed",
        "MyCERT MA-024.012026 advisory issued February 2026"
      ],
      verdict: "FLAGGED IN PUBLIC REPORTS"
    }
  },
  "talentbridgeasia-careers.xyz": {
    type: "url",
    url_data: {
      domain_age_days: 4,
      hosting_pattern: "Cloudflare proxy + .xyz TLD — known phishing kit hosting pattern (StrowKit v3)",
      reputation_score: "HIGH RISK", reports_count: 18, verdict: "SUSPICIOUS",
      note: "Domain registered only 4 days ago. .xyz TLD has 73% scam rate per 2025 ICANN study.",
      source: "URLhaus + PhishTank + WHOIS cross-reference"
    }
  },
  "hr07@talentbridgeasia-careers.xyz": {
    type: "recruiter",
    recruiter_data: {
      red_flags: [
        "Generic numbered email pattern (hr07) common in bulk scam operations",
        "Email domain registered 4 days ago",
        "No matching LinkedIn profile for any 'TalentBridge Asia HR' staff",
        "Domain not associated with any verified business entity"
      ],
      pattern_match: "MATCHES SCAM PATTERN (high confidence)",
      similar_scams_reported: 14,
      source: "Internal recruiter scam pattern database + LinkedIn cross-reference"
    }
  },
  "+1 332-555-0199": {
    type: "recruiter",
    recruiter_data: {
      red_flags: [
        "US-based phone number (+1 area code 332 = New York) for claimed Malaysian role",
        "Number recycled across 8 different 'recruiter' personas in scam reports",
        "Linked to VoIP service commonly used for scam operations"
      ],
      pattern_match: "MATCHES SCAM PATTERN (very high confidence)",
      similar_scams_reported: 19,
      source: "Twilio reverse-lookup + Semakmule + internal database"
    },
    scam_reports_phone: {
      reports_found: 19,
      sources: ["Semakmule database", "Truecaller flagged contacts", "r/scams"],
      sample_reports: [
        "Listed in Semakmule with 19 fraud reports since Dec 2025",
        "Truecaller community-flagged as 'Scam Recruiter'"
      ],
      verdict: "FLAGGED IN PUBLIC REPORTS"
    }
  },
  "514088123456": {
    type: "bank_account",
    scam_reports_account: {
      reports_found: 16,
      sources: ["Semakmule database", "PDRM NSRC reports"],
      sample_reports: [
        "Listed in Semakmule scam account database since January 2026",
        "Linked to 16 NSRC reports totaling RM 47,300 in confirmed losses",
        "Account holder name does NOT match 'TalentBridge Asia'"
      ],
      verdict: "CONFIRMED SCAM ACCOUNT"
    }
  },
  "globalconnect recruiters": {
    type: "company",
    company_data: {
      registered_in_ssm: false, verdict: "NOT_FOUND",
      note: "No matching registered company. 'GlobalConnect' is a generic-sounding name used in 31 distinct scam operations.",
      source: "SSM Malaysia Business Registry"
    }
  },
  "maju karier sdn bhd": {
    type: "company",
    company_data: {
      registered_in_ssm: false, verdict: "NOT_FOUND",
      note: "Tiada syarikat berdaftar dengan nama 'Maju Karier Sdn Bhd' di SSM Malaysia. Nama ini muncul dalam 7 laporan penipuan kerja terdahulu.",
      source: "Daftar Perniagaan SSM Malaysia"
    }
  }
};

function findDemoEntry(query: string, expectedType: string): any | null {
  if (!DEMO_MODE) return null; // real analysis only, unless demo mode is on
  const lower = query.toLowerCase().trim();
  for (const [key, entry] of Object.entries(DEMO_SCAMS)) {
    if (entry.type === expectedType && lower.includes(key)) return entry;
  }
  return null;
}

// =============================================================================
// REAL API: Google Safe Browsing
// =============================================================================

async function checkSafeBrowsing(url: string): Promise<{ is_threat: boolean; threat_type?: string }> {
  try {
    if (!GEMINI_KEY || !GEMINI_KEY.startsWith("AIza")) return { is_threat: false }; // Skip if invalid API key
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "guidr-app", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }]
          }
        })
      }
    );
    const data = await res.json();
    if (data.matches && data.matches.length > 0) {
      return { is_threat: true, threat_type: data.matches[0].threatType };
    }
    return { is_threat: false };
  } catch (e) {
    console.error("[Safe Browsing Error]", e);
    return { is_threat: false };
  }
}

// =============================================================================
// REAL API: Vertex AI for Web Intelligence
// =============================================================================

async function searchWebWithGemini(query: string): Promise<string> {
  const cacheKey = query.toLowerCase().trim();
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  try {
    const result = await callWithRetry(
      () => withTimeout(ai.models.generateContent({
      model: SEARCH_MODEL_ID,
      contents: `You are an expert scam research assistant. Search the live web for real, factual information about: "${query}"

      Cross-check the most relevant sources: Reddit (r/malaysia, r/scams), Lowyat.NET & Malaysian forums, Semakmule/CCID scam databases, official registries, and news/government advisories.

      Focus on:
      - Is this entity (company/URL/phone) associated with any known scams or fraud?
      - Are there victim reports or public warnings?
      - Is there any official registration or legitimacy evidence?

      Return ONLY factual findings. If you have no information, say "NO_DATA_FOUND".
      Be concise — max 120 words. Cite specific sources (e.g. "A Reddit post on r/malaysia...") when found.`,
      config: {
        tools: [{ googleSearch: {} }],
        // Grounded summarization doesn't need extended reasoning — skip the
        // "thinking" phase to cut latency substantially.
        thinkingConfig: { thinkingBudget: 0 },
      }
    }), 14_000, "web-search"),
      // No retry: a slow search should fail fast to "no data" rather than
      // doubling latency. The overall verdict still accounts for what's found.
      { label: "web-search", retries: 0 }
    );

    const text = (result.text && result.text.trim()) ? result.text : "NO_DATA_FOUND";
    cacheSet(cacheKey, text);
    return text;
  } catch (e) {
    console.error("[Vertex Search Error]", e);
    return "NO_DATA_FOUND";
  }
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

export async function executeTool(name: string, args: any): Promise<any> {
  console.log(`[TOOL CALL] ${name}`, JSON.stringify(args));

  if (name === "check_url_safety") {
    const url = args.url;
    const urlLower = url.toLowerCase();

    const demo = findDemoEntry(urlLower, "url");
    if (demo?.url_data) return { url, ...demo.url_data };

    const sbResult = await checkSafeBrowsing(url);

    const suspiciousPatterns = [
      /\.xyz/, /\.top/, /\.tk/, /\.ml/, /\.ga/, /\.cf/,
      /bit\.ly/, /tinyurl/, /t\.co/,
      /-promo/, /-claim/, /-careers/, /-jobs\d/,
      /storage\.googleapis/
    ];
    const hasPatternMatch = suspiciousPatterns.some(p => p.test(urlLower));

    const webInfo = await searchWebWithGemini(`Is this URL a scam or phishing site? ${url}`);
    const geminiSaysRisky = webInfo !== "NO_DATA_FOUND" &&
      /scam|phish|fraud|malicious|suspicious|fake|dangerous/i.test(webInfo);

    const isSuspicious = sbResult.is_threat || hasPatternMatch || geminiSaysRisky;

    return {
      url,
      google_safe_browsing: sbResult.is_threat
        ? `FLAGGED: ${sbResult.threat_type}`
        : "NOT FLAGGED by Google Safe Browsing",
      pattern_analysis: hasPatternMatch ? "Suspicious URL patterns detected" : "No suspicious patterns",
      web_intelligence: webInfo !== "NO_DATA_FOUND" ? webInfo : "No public reports found for this URL",
      reputation_score: isSuspicious ? "HIGH RISK" : "LOW RISK",
      verdict: sbResult.is_threat ? "DANGEROUS" : (isSuspicious ? "SUSPICIOUS" : "CLEAN"),
      source: "Google Safe Browsing + Vertex AI Web Intelligence"
    };
  }

  if (name === "verify_company_existence") {
    const company = args.company_name;
    const companyLower = company.toLowerCase();

    const demo = findDemoEntry(companyLower, "company");
    if (demo?.company_data) return { company_searched: company, ...demo.company_data };

    const webInfo = await searchWebWithGemini(
      `Is "${company}" a real registered company in Malaysia? Check SSM registration, official website, and any scam reports.`
    );

    const isLegit = webInfo !== "NO_DATA_FOUND" &&
      /registered|legitimate|official|established|verified/i.test(webInfo) &&
      !/not registered|unregistered|no record|scam|fraud|fake/i.test(webInfo);

    return {
      company_searched: company,
      registered_in_ssm: isLegit,
      verdict: isLegit ? "VERIFIED" : "NOT_FOUND",
      web_intelligence: webInfo !== "NO_DATA_FOUND" ? webInfo : "No information found about this company",
      source: "Vertex AI Web Intelligence (live)"
    };
  }

  if (name === "check_recruiter_pattern") {
    const contact = args.contact;
    const contactLower = contact.toLowerCase();

    const demo = findDemoEntry(contactLower, "recruiter");
    if (demo?.recruiter_data) {
      return { contact, claimed_company: args.claimed_company || "not specified", ...demo.recruiter_data };
    }

    const redFlags: string[] = [];
    if (/@gmail\.com|@yahoo|@outlook|@hotmail/i.test(contact)) redFlags.push("Personal email used for business communication");
    if (/wa\.me|whatsapp/i.test(contact)) redFlags.push("Initial contact via WhatsApp instead of official channels");
    if (/\+1|\+44|\+91/.test(contact) && args.claimed_company) redFlags.push("Foreign phone number for claimed Malaysian role");
    if (/hr\d+|recruit\d+|careers\d+/i.test(contact)) redFlags.push("Generic numbered email pattern common in scam operations");

    const webInfo = await searchWebWithGemini(
      `Has this contact been reported as a scammer or associated with fraud? Contact: "${contact}", Claimed company: "${args.claimed_company || 'unknown'}"`
    );
    
    if (webInfo !== "NO_DATA_FOUND" && /scam|fraud|fake|reported/i.test(webInfo)) {
      redFlags.push(`Web intelligence: ${webInfo.substring(0, 150)}...`);
    }

    return {
      contact,
      claimed_company: args.claimed_company || "not specified",
      red_flags: redFlags,
      pattern_match: redFlags.length > 0 ? "MATCHES SCAM PATTERN" : "NO RED FLAGS",
      source: "Pattern Analysis + Vertex AI Web Intelligence"
    };
  }

  if (name === "search_scam_reports") {
    const entity = args.entity;
    const entityLower = entity.toLowerCase();

    if (DEMO_MODE) {
      for (const [key, demoEntry] of Object.entries(DEMO_SCAMS)) {
        if (entityLower.includes(key)) {
          if (args.entity_type === "company" && demoEntry.scam_reports) return { entity_searched: entity, entity_type: args.entity_type, ...demoEntry.scam_reports };
          if (args.entity_type === "phone" && demoEntry.scam_reports_phone) return { entity_searched: entity, entity_type: args.entity_type, ...demoEntry.scam_reports_phone };
        }
      }
    }

    const webInfo = await searchWebWithGemini(
      `Search for scam reports or public warnings about this ${args.entity_type}: "${entity}". Check Reddit r/malaysia, Lowyat.NET, Semakmule.`
    );

    const hasReports = webInfo !== "NO_DATA_FOUND" && /report|complaint|scam|fraud|victim|warning/i.test(webInfo);

    return {
      entity_searched: entity,
      entity_type: args.entity_type,
      reports_found: hasReports ? "Yes" : 0,
      web_intelligence: webInfo !== "NO_DATA_FOUND" ? webInfo : "No public scam reports found.",
      verdict: hasReports ? "FLAGGED IN PUBLIC REPORTS" : "NO REPORTS FOUND",
      source: "Vertex AI Web Intelligence"
    };
  }

  return { error: "Unknown tool" };
}

export function getToolDisplayName(toolName: string, args: any): string {
  switch (toolName) {
    case "check_url_safety": return `Checking URL safety: ${args.url}`;
    case "verify_company_existence": return `Verifying "${args.company_name}"...`;
    case "check_recruiter_pattern": return `Analyzing contact: ${args.contact}`;
    case "search_scam_reports": return `Searching scam reports for ${args.entity_type}: ${args.entity}`;
    default: return toolName;
  }
}
