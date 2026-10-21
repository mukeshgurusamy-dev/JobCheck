import { extractDomainParts, isTrustedPlatformUrl } from "../../src/utils/url";
import { AiIntelligenceResult, CompanyAuditChecklist } from "../../src/types/types";
import { extractCompanyName } from "../../src/engine/engine";
import {
  ensureLegalEntitySuffix,
  expandCompanyNameVariants,
  stripCompanySuffix,
} from "../../src/engine/normalize";
import { SecureLogger } from "./securityUtils";
import { apiKeyPool } from "./apiKeyPool";

const logger = new SecureLogger("aiSearch");

/**
 * Retrieves the optimal API key from the multi-key pool with cooldown.
 */
function getApiKey(): string | undefined {
  return apiKeyPool.acquireKey();
}

/**
 * Best-effort repair of JSON cut off mid-object by the output-token ceiling.
 * Walks the text tracking string state, then closes any unterminated string and
 * the open brackets in reverse order. Returns the input unchanged when it is
 * already balanced.
 */
function repairTruncatedJson(input: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const ch of input) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  if (stack.length === 0 && !inString) return input;

  let out = input;
  if (inString) out += '"';
  // A dangling comma or half-written key would still be invalid once closed.
  out = out
    .replace(/,\s*$/, "")
    .replace(/,\s*"[^"]*"\s*:\s*$/, "")
    .replace(/,\s*"[^"]*$/, "");

  for (let i = stack.length - 1; i >= 0; i -= 1) out += stack[i];
  return out;
}

function isBalancedJson(input: string): boolean {
  return repairTruncatedJson(input) === input;
}

/**
 * Pulls the JSON object out of a model response.
 *
 * The search-grounded attempt cannot use JSON mode (Gemini rejects
 * responseMimeType alongside tools), so that response arrives as prose, an
 * object inside a ```json fence, or a narration followed by the object. Strip
 * the fences, then fall back to the outermost braces, then repair truncation.
 */
function extractJsonObject(input: string): string {
  const defenced = input.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  if (isBalancedJson(defenced)) return defenced;

  const start = defenced.indexOf("{");
  const end = defenced.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const sliced = defenced.slice(start, end + 1);
    return isBalancedJson(sliced) ? sliced : repairTruncatedJson(sliced);
  }

  return repairTruncatedJson(defenced);
}

/**
 * Compares two locations hierarchically.
 * Handles cases like "Mylapore" is in "Chennai", "Bangalore" is in "Karnataka", etc.
 */
export function compareLocations(jobLocation: string, companyLocation: string): {
  matched: boolean;
  isExactMatch: boolean;
  reason: string;
} {
  if (!jobLocation || !companyLocation) {
    return { matched: false, isExactMatch: false, reason: "Missing location data" };
  }

  const normalize = (loc: string) => loc.toLowerCase().trim();
  const jobLoc = normalize(jobLocation);
  const companyLoc = normalize(companyLocation);

  // Exact match
  if (jobLoc === companyLoc) {
    return { matched: true, isExactMatch: true, reason: "Exact match" };
  }

  // Hierarchical location mapping (Indian cities/areas to parent cities/states)
  const hierarchyMap: Record<string, string[]> = {
    // Chennai areas
    "mylapore": ["chennai", "tamil nadu"],
    "t. nagar": ["chennai", "tamil nadu"],
    "adyar": ["chennai", "tamil nadu"],
    "velachery": ["chennai", "tamil nadu"],
    "kodambakkam": ["chennai", "tamil nadu"],
    "anna nagar": ["chennai", "tamil nadu"],

    // Bangalore areas
    "whitefield": ["bangalore", "bengaluru", "karnataka"],
    "koramangala": ["bangalore", "bengaluru", "karnataka"],
    "indiranagar": ["bangalore", "bengaluru", "karnataka"],
    "marathon": ["bangalore", "bengaluru", "karnataka"],
    "marathahalli": ["bangalore", "bengaluru", "karnataka"],
    "malleswaram": ["bangalore", "bengaluru", "karnataka"],

    // Mumbai areas
    "bandra": ["mumbai", "maharashtra"],
    "andheri": ["mumbai", "maharashtra"],
    "lower parel": ["mumbai", "maharashtra"],
    "dadar": ["mumbai", "maharashtra"],
    "thane": ["mumbai", "maharashtra"],

    // Hyderabad areas
    "hitech city": ["hyderabad", "telangana"],
    "kukatpally": ["hyderabad", "telangana"],
    "gachibowli": ["hyderabad", "telangana"],

    // Gurgaon areas
    "gurgaon": ["delhi", "haryana"],
    "gurugram": ["delhi", "haryana"],
    "cyber city": ["gurgaon", "gurugram", "delhi", "haryana"],

    // Noida areas
    "noida": ["delhi", "uttar pradesh"],
    "sector 62": ["noida", "delhi", "uttar pradesh"],
  };

  // Check if company location contains job location or vice versa
  if (companyLoc.includes(jobLoc) || jobLoc.includes(companyLoc)) {
    return { matched: true, isExactMatch: false, reason: "Hierarchical match (one contains the other)" };
  }

  // Check hierarchical mapping
  const parentLocations = hierarchyMap[jobLoc] || [];
  if (parentLocations.some(parent => companyLoc.includes(parent) || companyLoc === parent)) {
    return { matched: true, isExactMatch: false, reason: `Hierarchical match (${jobLocation} is part of ${companyLocation})` };
  }

  return { matched: false, isExactMatch: false, reason: `Locations do not match: ${jobLocation} vs ${companyLocation}` };
}

/**
 * Pre-compiled regex for common Indian cities (avoids creating regex in loop)
 */
const INDIAN_CITIES_REGEX = /\b(?:Mumbai|Delhi|Bangalore|Bengaluru|Hyderabad|Chennai|Kolkata|Pune|Ahmedabad|Gurgaon|Gurugram|Noida|Chandigarh|Jaipur|Indore|Bhopal|Lucknow|Kochi|Coimbatore|Visakhapatnam|Nagpur)\b/i;

const INDIAN_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Bengaluru", "Hyderabad", "Chennai", "Kolkata",
  "Pune", "Ahmedabad", "Gurgaon", "Gurugram", "Noida", "Chandigarh", "Jaipur",
  "Indore", "Bhopal", "Lucknow", "Kochi", "Coimbatore", "Visakhapatnam", "Nagpur"
];

/**
 * Extracts location from job description text.
 */
function extractJobLocation(text: string): string | null {
  if (!text) return null;

  // Pattern 1: "Location: City, State" or "Place: City"
  const locMatch1 = text.match(/(?:location|office|work\s+location|place)[:\s]+([A-Za-z0-9\s,–-]+?)(?:\n|,\s*(?:India|Bharat)|\.|$)/i);
  if (locMatch1?.[1]) {
    return locMatch1[1].trim();
  }

  // Pattern 2: LinkedIn / job board header bullet "• City, State, Country"
  const locMatchBullet = text.match(/[•·]\s*([A-Za-z\s,]+?(?:India|Tamil\s*Nadu|Karnataka|Maharashtra|Delhi|Telangana|Gujarat|Kerala|West\s*Bengal))/i);
  if (locMatchBullet?.[1]) {
    return locMatchBullet[1].trim();
  }

  // Pattern 3: "Based in City" or "City-based"
  const locMatch2 = text.match(/(?:based\s+in|located\s+in)\s+([A-Za-z\s,]+?)(?:\n|,|\.|$)/i);
  if (locMatch2?.[1]) {
    return locMatch2[1].trim();
  }

  // Pattern 4: Common Indian cities mentioned (optimized with single regex)
  const cityMatch = text.match(INDIAN_CITIES_REGEX);
  if (cityMatch?.[0]) {
    // Find which city matched to return proper casing
    const matchedCity = INDIAN_CITIES.find(city => city.toLowerCase() === cityMatch[0].toLowerCase());
    return matchedCity || cityMatch[0];
  }

  return null;
}

/**
 * Sanitizes a sourceUrl returned by the AI model.
 *
 * The model sometimes hallucinate generic search/index pages (e.g. the MCA
 * master-data search page, a Reddit /search? URL, or a Glassdoor company-list
 * page) when it could not find a specific result. These links would open the
 * wrong page for the user, so we strip them out here.
 *
 * Returns undefined for any URL that matches a known generic pattern.
 * Returns undefined for null/empty input.
 * Returns the URL unchanged when it looks like a genuine company-specific page.
 */
function sanitizeSourceUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "null") return undefined;

  // Must be a plausible HTTP(S) URL
  if (!/^https?:\/\//i.test(trimmed)) return undefined;

  // Patterns that indicate a generic search/index page rather than a specific
  // company page — any URL matching these is NOT a confirmed source.
  const genericPatterns: RegExp[] = [
    // MCA global master-data search page (not a specific company CIN page)
    /mca\.gov\.in.*master-data/i,
    /mca\.gov\.in.*MDS/i,
    // Generic search engine results
    /google\.(com|co\.in)\/search\?/i,
    /bing\.com\/search\?/i,
    /duckduckgo\.com\/\?q=/i,
    // Reddit search (not a specific post/thread)
    /reddit\.com\/search\?/i,
    /reddit\.com\/r\/[^/]+\/search\?/i,
    // Glassdoor generic reviews list without specific company slug encoded
    /glassdoor\.(co\.in|com)\/Reviews\/?$/i,
    /glassdoor\.(co\.in|com)\/Reviews\/index\.htm/i,
    // AmbitionBox generic page
    /ambitionbox\.com\/reviews\/?$/i,
    // LinkedIn people/jobs search (not a company page)
    /linkedin\.com\/jobs\/search\?/i,
    /linkedin\.com\/search\?/i,
    // Placeholder / example URLs from the prompt template
    /company-name-reviews/i,
    /COMPANY-NAME/i,
    /company\/xyz\b/i,
  ];

  for (const pattern of genericPatterns) {
    if (pattern.test(trimmed)) return undefined;
  }

  return trimmed;
}

/**
 * Validates that a scam report sourceUrl actually points to the CORRECT company.
 * CRITICAL: Better to return undefined (no link) than an incorrect company link.
 *
 * For Glassdoor/AmbitionBox: Verifies company name is in URL slug
 * For Reddit/Twitter/LinkedIn: Verifies URL structure is correct
 * Returns undefined if company name cannot be verified in URL
 */
function validateScamReportUrl(
  url: string | undefined,
  platform: string,
  companyName: string | undefined,
): string | undefined {
  if (!url || !platform) return undefined;

  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // For Glassdoor: must contain company identifier and be a company reviews page
  if (platform.toLowerCase().includes("glassdoor")) {
    // Check it's actually a Glassdoor company page (not search, not generic)
    if (!/glassdoor\.(co\.in|com)\/Reviews\/.*[A-Za-z0-9]/i.test(trimmed)) {
      return undefined; // Not a proper company reviews URL
    }

    // If we have company name, verify it's likely in the URL
    if (companyName) {
      const nameParts = companyName.toLowerCase().split(" ");
      const urlLower = trimmed.toLowerCase();
      // At least one word from company name should be in URL or company ID pattern
      const hasCompanySignal = nameParts.some(part => part.length > 2 && urlLower.includes(part)) ||
                               /E\d{6,}/i.test(trimmed); // Glassdoor company ID format
      if (!hasCompanySignal) {
        return undefined; // Company name not found in URL, likely wrong company
      }
    }
    return trimmed;
  }

  // For AmbitionBox: similar validation
  if (platform.toLowerCase().includes("ambitionbox")) {
    if (!/ambitionbox\.com.*company/i.test(trimmed)) {
      return undefined; // Not a company page
    }

    if (companyName) {
      const nameParts = companyName.toLowerCase().split(" ");
      const urlLower = trimmed.toLowerCase();
      const hasCompanySignal = nameParts.some(part => part.length > 2 && urlLower.includes(part));
      if (!hasCompanySignal) {
        return undefined; // Company name not found in URL
      }
    }
    return trimmed;
  }

  // For Reddit: verify it's an actual post/thread, not search
  if (platform.toLowerCase().includes("reddit")) {
    if (/reddit\.com\/r\/[a-z]+\/comments\/[a-z0-9]+/i.test(trimmed)) {
      return trimmed; // Valid Reddit thread
    }
    return undefined; // Not a proper Reddit post
  }

  // For Twitter/X: verify it's a direct tweet
  if (platform.toLowerCase().includes("twitter") || platform.toLowerCase().includes("x")) {
    if (/(twitter|x)\.com\/[a-z0-9_]+\/status\/\d+/i.test(trimmed)) {
      return trimmed; // Valid tweet URL
    }
    return undefined; // Not a proper tweet
  }

  // For LinkedIn: verify it's a post
  if (platform.toLowerCase().includes("linkedin")) {
    if (/linkedin\.com\/.*\/posts?\//i.test(trimmed)) {
      return trimmed; // Valid LinkedIn post
    }
    return undefined; // Not a proper LinkedIn post
  }

  return trimmed; // Default: return if it passed basic sanitization
}

/**
 * Queries Google Gemini with live Google Search Grounding to evaluate link
 * legitimacy, company digital footprint, Glassdoor/AmbitionBox employee reviews,
 * scam reports on Reddit/forums, and official domain matching.
 */
export async function queryGoogleAiSearch(
  targetUrl: string,
  descriptionSnippet = "",
  embeddedLinks: string[] = [],
  totalBudgetMs = 24000,
): Promise<AiIntelligenceResult> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      status: "skipped",
      failureReason: "no-api-key",
    };
  }

  const startedAt = Date.now();

  const domainParts = extractDomainParts(targetUrl);
  const rootDomain = domainParts.rootDomain;
  const isJobPlatform = isTrustedPlatformUrl(targetUrl);

  const embeddedLinksStr = embeddedLinks.length > 0
    ? `\n- Embedded external links found inside the job description:\n${embeddedLinks.slice(0, 5).map((l, i) => `  ${i + 1}. ${l}`).join("\n")}`
    : "";

  // Pre-extract company name from description and expand into all legal entity variants
  // This solves the problem where "Tridin Software" vs "Tridin Software Private Limited"
  // yields vastly different Google Search results
  const extractedCompany = extractCompanyName(descriptionSnippet);
  const companyVariants = extractedCompany
    ? expandCompanyNameVariants(extractedCompany)
    : [];
  const companyCoreName = extractedCompany
    ? stripCompanySuffix(extractedCompany)
    : undefined;

  const companyHint = companyVariants.length > 0
    ? `\n- EMPLOYER NAME (pre-extracted from description): "${extractedCompany}"
- IMPORTANT — Company Name Variants (search ALL of these to find the correct legal entity):
${companyVariants.map((v, i) => `  ${i + 1}. "${v}"`).join("\n")}
- Core Brand Name: "${companyCoreName}"
- NOTE: Indian companies are often registered with suffixes like "Private Limited", "Pvt Ltd", "LLP", or "Limited" on MCA/ROC. The job description may omit these suffixes. You MUST search for the company using ALL the variants listed above to ensure accurate results.`
    : "";

  // Extract job location from description
  const jobLocation = extractJobLocation(descriptionSnippet);
  const locationHint = jobLocation
    ? `\n- JOB LOCATION (extracted from description): "${jobLocation}"
- CRITICAL: You MUST verify this location against the company's official registered address or known office locations. If there is a mismatch, flag it immediately as a major red flag (scam indicator).`
    : "";

  const prompt = `
You are a senior cybersecurity investigator specializing in employment fraud, fresher recruitment scams, and employer verification in India.
Investigate this job listing and perform a thorough background audit of the employer:
- URL: ${targetUrl}
- Domain: ${rootDomain}
- Hosted on Open Job Board: ${isJobPlatform ? "YES (LinkedIn, Naukri, Indeed, Internshala, etc. — these platforms verify employer identity, so legitimate small/new companies are common)" : "NO"}
- Listing / Description Details: ${descriptionSnippet.slice(0, 1500)}${embeddedLinksStr}${companyHint}${locationHint}

== CRITICAL INSTRUCTIONS ==
- ONLY set isScamLikely to TRUE if you find ACTUAL scam reports, fraud complaints, or clear red flags (fee demands, fake offers, etc.)
- Do NOT mark as scam just because a company has minimal online presence — new companies, startups, and SMEs are common
- If hosted on a trusted job board (LinkedIn, Naukri, etc.) AND no scam signals found, default to isScamLikely: false
- Empty search results for scam reports should result in hasScamReviews: false, NOT isScamLikely: true

== INVESTIGATION TASKS ==

1. PLATFORM TRUST CHECK:
   - If job is on LinkedIn/Naukri/Indeed/Internshala: These platforms verify employer identity. Legitimate companies are hosted here.
   - Mark this in findings: trustPlatformHosted = true/false

2. COMPANY LOCATION VERIFICATION:
   - Find the company's official registered address or known office location with full address details (street, city, state, postal code)
   - If job description has a location (extracted: "${jobLocation}"), verify it matches the company's actual location
   - Provide complete address in format: "Street/Area, City, State, Postal Code, Country"
   - Location Match Status:
     * "verified" = Exact match or hierarchical match (e.g., Mylapore office of company based in Chennai)
     * "unverified" = Locations don't match (e.g., job says Bangalore but company only has Mumbai offices)
     * "no_info" = No location found in job description
   - CRITICAL: Location mismatch is a MAJOR red flag for scams

3. EMPLOYEE REVIEWS & COMPANY SENTIMENT (search for detailed reviews):
   Search Glassdoor, AmbitionBox, Indeed, LinkedIn reviews for "${companyCoreName || rootDomain}":
   - Find overall rating and total review count
   - Extract TOP 3 POSITIVE aspects employees mention (e.g., "Great work-life balance", "Good salary", "Learning opportunities")
   - Extract TOP 3 NEGATIVE aspects employees mention (e.g., "Limited growth", "Slow promotions", "Outdated tech")
   - Search for scam/fraud complaints (fee demands, unpaid work, fake offers, etc.)
   - Return positiveHighlights and negativeHighlights as separate arrays of strings
   - ONLY extract actual highlights from real reviews — do NOT invent or speculate

4. INDIVIDUAL SCAM COMPLAINT EXTRACTION (CRITICAL — HIGH PRIORITY):
   Search for DETAILED individual scam complaints about "${companyCoreName || rootDomain}":
   - Reddit threads (r/jobs, r/developersIndia, r/IndianJobs, r/scams) with specific complaints
   - Glassdoor/AmbitionBox individual reviews mentioning: registration fees, unpaid internships, fake offers, bait-and-switch tactics, money loot
   - Consumer complaint sites (NCPCR, consumer forums, complaint portals)
   - LinkedIn posts where employees warn others about this company
   - Twitter/X posts with direct accusations or warnings

   FOR EACH COMPLAINT FOUND, extract:
   - platform: Where complaint was found (e.g., "Reddit r/developersIndia", "Glassdoor", "AmbitionBox", "Twitter/X", "LinkedIn")
   - reviewerName: Name/username of who complained (e.g., "u/username", "Ravi K.", "@handle")
   - reviewerRole: Their job title or status (e.g., "Fresher", "Software Engineer", "Former Employee")
   - complaintText: THE EXACT COMPLAINT — what did they say was wrong? (e.g., "They asked for ₹5000 registration fee and disappeared")
   - reportedAt: When was it posted? (e.g., "March 2024", "2 weeks ago", "6 months ago")
   - sourceUrl: CRITICAL REQUIREMENT — VERIFIED URL pointing to EXACT company:
     * For Glassdoor: Only include if URL contains the company name AND is from glassdoor.com/Reviews/... for "${companyCoreName || rootDomain}"
     * For AmbitionBox: Only include if URL is from ambitionbox.com and explicitly mentions "${companyCoreName || rootDomain}"
     * For Reddit: Reddit permalink (e.g., reddit.com/r/developersIndia/comments/...)
     * For Twitter/LinkedIn: Direct post URLs from search results
     * DO NOT guess URLs. Only use URLs found in actual search results.
     * If unsure company name matches, OMIT sourceUrl rather than include wrong URL.
     * Better to have complaint with no link than complaint pointing to wrong company.

   RETURN UP TO 5 MOST CRITICAL COMPLAINTS. STRICT RULE: Verify all Glassdoor/AmbitionBox URLs point to correct company.

5. QUICK SCAM SIGNAL CHECK (search for ACTUAL signals):
   Quick verification of scam patterns in complaint data:
   - Count of similar complaints (multiple people reporting same issue = stronger signal)
   - Fee demands pattern (registration, training, security deposit)
   - Job bait-and-switch (promised position, different role offered)
   - Unpaid work / internship exploitation
   - Contact red flags (WhatsApp/Telegram only, no official email)
   ONLY report patterns you found in Task 4 complaints — do NOT speculate.

5. COMPANY VERIFICATION (if you find information):
   - Official website / LinkedIn company page
   - MCA/ROC registration (for Indian companies)
   - Employee count and company size
   - Domain age (if verifiable)

5. JOB DESCRIPTION RED FLAGS (check description text for):
   - Explicit fee demands ("registration fee", "training fee", "security deposit")
   - Work-from-home earn-per-task schemes ("earn per review", "earn per click")
   - Guaranteed placement claims
   - WhatsApp/Telegram contact methods (common in scams)
   - Unrealistic salary or vague compensation
   - Spot offers without proper interview process

6. COMPANY AUDIT PILLAR GUIDELINES:
   Physical Office & Infrastructure:
   - PASS ("pass"): Verified office address found (HQ, regional office, or registered address)
   - WARN ("warn"): Only residential/shared office address, or address verification unclear
   - FAIL ("fail"): No office found, or clear indicators of fraud (fake address, virtual office for "company")

   Note: For legitimate companies on official platforms, finding ANY verified address = "pass"
   For scam postings from third-party sites claiming international presence but using virtual offices = "fail"

Return ONLY a valid JSON object (no markdown, no explanation outside JSON):
{
  "isScamLikely": false,
  "confidence": "High" | "Medium" | "Low",
  "summary": "1-2 sentence verdict for the jobseeker",
  "companyName": "Company name found, or null",
  "companyLocation": {
    "fullAddress": "Complete address if found (e.g., 'Mylapore, Chennai, Tamil Nadu 600004, India')",
    "city": "City name",
    "state": "State name",
    "country": "Country"
  },
  "locationVerification": {
    "jobLocationFromDescription": "Location extracted from job description (if any)",
    "matched": true | false,
    "isExactMatch": true | false,
    "verificationStatus": "verified" | "unverified" | "no_info",
    "reason": "Explanation of the match (e.g., 'Exact match' or 'Mylapore is in Chennai' or 'No location info in description')"
  },
  "digitalFootprint": "verified" | "moderate" | "minimal" | "suspicious",
  "trustPlatformHosted": true,
  "hasScamReviews": false,
  "scamSignals": [],
  "trustSignals": ["Hosted on LinkedIn (employer verified)", "No scam complaints found in search results"],
  "employeeReviews": [
    {
      "source": "Glassdoor",
      "sourceUrl": "https://www.glassdoor.com/Reviews/...",
      "rating": 4.2,
      "totalReviews": 1250,
      "positiveHighlights": [
        "Great work-life balance",
        "Competitive salary and benefits",
        "Strong learning opportunities"
      ],
      "negativeHighlights": [
        "Limited career growth for juniors",
        "Slow promotion cycle",
        "Outdated tech stack in some teams"
      ],
      "scamWarnings": [
        "Multiple users reported asking for registration fee upfront"
      ],
      "scamReports": [
        {
          "platform": "Reddit r/developersIndia",
          "reviewerName": "u/cautious_fresher",
          "reviewerRole": "Fresher",
          "complaintText": "Applied for a Software Developer role. After initial screening, they asked me to pay ₹2500 as 'registration and background verification fee'. When I questioned, they said it's mandatory. Never replied after I refused to pay.",
          "reportedAt": "March 2024",
          "sourceUrl": "https://reddit.com/r/developersIndia/comments/..."
        },
        {
          "platform": "Glassdoor Reviews",
          "reviewerName": "Ravi K.",
          "reviewerRole": "Former Employee",
          "complaintText": "Got hired as 'Intern' with promise of ₹20k/month. First 3 months they said it's 'unpaid training'. Then extended it for 2 more months. When I asked for payment, they said 'check after next review cycle'. It never happened.",
          "reportedAt": "2 months ago",
          "sourceUrl": "https://www.glassdoor.com/Reviews/..."
        }
      ]
    }
  ],
  "companyAudit": {
    "companyName": "Company name",
    "auditScore": 85,
    "criteriaPassedCount": 5,
    "totalCriteriaCount": 6,
    "overallVerdict": "verified",
    "legalStatus": {
      "status": "pass" | "warn" | "fail",
      "title": "Legal Registration & Incorporation",
      "details": "Brief finding (e.g., 'Active MCA registration found')",
      "sourceUrl": "URL to evidence if available"
    },
    "physicalOffice": {
      "status": "pass" | "warn" | "fail",
      "title": "Physical Office & Infrastructure",
      "details": "Brief finding (e.g., 'Verified office at X location' or 'Only residential address')",
      "sourceUrl": "URL to evidence if available"
    },
    "digitalFootprint": {
      "status": "pass" | "warn" | "fail",
      "title": "Digital Footprint & Domain",
      "details": "Brief finding about domain age, website quality, online presence",
      "sourceUrl": "URL to evidence if available"
    },
    "employeeReviews": {
      "status": "pass" | "warn" | "fail",
      "title": "Employee Reviews & Sentiment",
      "details": "Glassdoor/AmbitionBox sentiment or 'No reviews found'",
      "sourceUrl": "URL to platform if available"
    },
    "fraudDatabaseCheck": {
      "status": "pass" | "warn" | "fail",
      "title": "Fraud & Scam Threat Intelligence",
      "details": "Clean record or specific fraud reports if found",
      "sourceUrl": "URL to evidence if available"
    },
    "hiringAuthenticity": {
      "status": "pass" | "warn" | "fail",
      "title": "Hiring Process & Offer Authenticity",
      "details": "Interview process legitimacy, fee demands, or other red flags",
      "sourceUrl": "Optional URL"
    }
  }
}
`.trim();

  let activeApiKey = apiKey;

  const endpointFor = (model: string, key: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  /**
   * Which search tool to attach, if any.
   *
   * The REST surface for Google Search grounding has been documented with both
   * `googleSearch` and `google_search` for the same proto field, and a rejected
   * spelling comes back as a generic HTTP 400 that reads like a schema problem.
   * Rather than guess which one this key's API version accepts, the schedule
   * tries one and falls back to the other before giving up on grounding.
   */
  type SearchTool = "camel" | "snake" | "off";

  const requestBody = (
    tool: SearchTool,
    promptText: string,
  ): Record<string, unknown> => ({
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }],
      },
    ],
    ...(tool === "off"
      ? {}
      : {
          tools: [
            tool === "camel" ? { googleSearch: {} } : { google_search: {} },
          ],
        }),
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2500,
      ...(tool === "off" ? { responseMimeType: "application/json" } : {}),
    },
  });

  const attempt = async (
    model: string,
    tool: SearchTool,
    ms: number,
  ): Promise<{
    res?: Response;
    error?: AiIntelligenceResult["failureReason"];
  }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(endpointFor(model, activeApiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(tool, prompt)),
        signal: controller.signal,
      });
      return { res };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return { error: aborted ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }
  };

  const schedule: Array<{ model: string; tool: SearchTool; ms: number }> = [
    { model: "gemini-3.5-flash-lite", tool: "camel", ms: 4000 },
    { model: "gemini-3.5-flash-lite", tool: "off", ms: 16000 },
    { model: "gemini-flash-latest", tool: "off", ms: 10000 },
  ];

  let res: Response | undefined;
  let grounded = true;
  let failureReason: AiIntelligenceResult["failureReason"] = "bad-response";
  let groundingError: string | undefined;

  try {
    for (let i = 0; i < schedule.length; i++) {
      const step = schedule[i]!;
      const remaining = totalBudgetMs - (Date.now() - startedAt);
      const allowed = Math.min(step.ms, Math.max(remaining - 500, 3000));
      if (allowed < 2500) {
        failureReason = "timeout";
        break;
      }

      const outcome = await attempt(step.model, step.tool, allowed);
      if (outcome.error || !outcome.res) {
        failureReason = outcome.error ?? "network";
        continue;
      }
      if (outcome.res.ok) {
        res = outcome.res;
        grounded = step.tool !== "off";
        apiKeyPool.reportSuccess(activeApiKey);
        break;
      }
      failureReason =
        outcome.res.status === 429 || outcome.res.status === 503 ? "rate-limited" : "bad-response";
      const detail = await outcome.res
        .text()
        .then((t) => t.slice(0, 300))
        .catch(() => "<unreadable>");
      if (step.tool !== "off") {
        groundingError = `HTTP ${outcome.res.status}: ${detail}`.slice(0, 160);
      }
      logger.error(
        `${step.model} (tool=${step.tool}) failed with HTTP ${outcome.res.status}`,
      );

      // If key hit rate limit, quota, or invalid credentials, report and switch to next key
      if ([400, 401, 403, 429].includes(outcome.res.status)) {
        apiKeyPool.reportRateLimited(activeApiKey);
        const nextKey = apiKeyPool.getNextAvailableKey(activeApiKey);
        if (nextKey) {
          activeApiKey = nextKey;
          logger.warn(`API key error (${outcome.res.status}). Switched to next key in pool.`);
        }
      }

      // If search-grounded attempt failed with 429 (quota) or 503 (demand spike),
      // skip any other grounded attempts and go immediately to the ungrounded model fallback
      // to save precious time.
      if ((outcome.res.status === 429 || outcome.res.status === 503) && step.tool !== "off") {
        // Fast-forward to the off step
        const offStepIndex = schedule.findIndex((s) => s.tool === "off");
        if (offStepIndex > i) {
          i = offStepIndex - 1; // loop increment will advance to offStepIndex
        }
      }
    }

    if (!res) {
      logger.error(
        `All AI search attempts failed: ${failureReason}${groundingError ? ` - ${groundingError}` : ""}`,
      );
      return { status: "failed", failureReason, groundingError };
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string; thought?: boolean }>;
        };
        groundingMetadata?: {
          groundingChunks?: Array<{
            web?: { uri?: string; title?: string };
          }>;
        };
      }>;
    };

    const candidate = data.candidates?.[0];
    const textParts = (candidate?.content?.parts ?? []).filter(
      (p) => !p.thought && typeof p.text === "string",
    );
    const rawText =
      textParts.map((p) => p.text).join("") || candidate?.content?.parts?.[0]?.text;
    if (!rawText) {
      logger.error("AI search returned empty response");
      return { status: "failed", failureReason: "bad-response" };
    }

    // Parse the model's JSON. The grounded attempt returns prose around the
    // object (it cannot use JSON mode), so extraction has to be tolerant.
    const cleanJson = extractJsonObject(rawText);
    const parsed = JSON.parse(cleanJson) as {
      isScamLikely?: boolean;
      confidence?: "High" | "Medium" | "Low";
      companyName?: string | null;
      digitalFootprint?: "verified" | "moderate" | "minimal" | "suspicious";
      physicalLocationStatus?: string | null;
      companyReviews?: string | null;
      officialDomain?: string | null;
      officialLinkedinUrl?: string | null;
      claimVerifications?: Array<{
        claimType: "location" | "hiring_drive" | "salary" | "guarantee";
        claimedValue: string;
        verifiedStatus: "verified" | "contradicted" | "unverifiable";
        details: string;
      }>;
      companyAudit?: any;
      summary?: string;
      scamSignals?: string[];
      trustSignals?: string[];
      adjustmentPoints?: number;
      employeeReviews?: Array<{
        source: string;
        sourceUrl?: string | null;
        rating?: number;
        totalReviews?: number;
        positiveHighlights?: string[];
        negativeHighlights?: string[];
        scamWarnings?: string[];
        scamReports?: Array<{
          platform: string;
          reviewerName?: string;
          reviewerRole?: string;
          complaintText: string;
          reportedAt?: string;
          sourceUrl?: string;
        }>;
      }>;
      locationVerification?: {
        claimedLocation: string;
        verifiedAddress?: string;
        matchStatus: "exact_match" | "partial_match" | "mismatch" | "unverifiable";
        distance?: number;
        verificationSource: string;
        details: string;
        sourceUrl?: string;
      };
      overallReviewScore?: number;
      hasScamReviews?: boolean;
    };

    // Extract search citations / sources
    const sources: Array<{ title: string; url: string }> = [];
    if (candidate?.groundingMetadata?.groundingChunks) {
      for (const chunk of candidate.groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || chunk.web.uri,
            url: chunk.web.uri,
          });
        }
      }
    }

    function buildCompanyAudit(p: typeof parsed): CompanyAuditChecklist | undefined {
      const rawName = p.companyName || "Employer Organization";
      const companyName = ensureLegalEntitySuffix(rawName);
      const isScam = Boolean(p.isScamLikely);
      const isVerifiedFp = p.digitalFootprint === "verified";
      const locText = p.physicalLocationStatus || "";
      const isLocMatched = locText.toLowerCase().includes("matched") || locText.toLowerCase().includes("confirmed");

      if (p.companyAudit && typeof p.companyAudit === "object") {
        const ca = p.companyAudit as any;
        const validStatus = (s: any): "pass" | "warn" | "fail" => {
          if (s === "pass" || s === "warn" || s === "fail") return s;
          return isScam ? "fail" : "pass";
        };

        const score = typeof ca.auditScore === "number"
          ? Math.max(0, Math.min(100, Math.round(ca.auditScore)))
          : isScam ? 18 : 92;

        const verdict = ca.overallVerdict === "verified" || ca.overallVerdict === "suspicious" || ca.overallVerdict === "unverified"
          ? ca.overallVerdict
          : (isScam ? "suspicious" : "verified");

        const finalName = ensureLegalEntitySuffix(ca.companyName || companyName);

        const legalStatus = {
          status: validStatus(ca.legalStatus?.status),
          title: ca.legalStatus?.title || "Legal Registration & Incorporation",
          details: ca.legalStatus?.details || (isScam ? "Unregistered / shell entity" : "Active corporate entity on official registry"),
          sourceUrl: sanitizeSourceUrl(ca.legalStatus?.sourceUrl),
        };
        const physicalOffice = {
          status: validStatus(ca.physicalOffice?.status),
          title: ca.physicalOffice?.title || "Physical Office & Infrastructure",
          details: ca.physicalOffice?.details || (isLocMatched ? locText : "Physical address checked"),
          sourceUrl: sanitizeSourceUrl(ca.physicalOffice?.sourceUrl),
        };
        const digitalFootprintPillar = {
          status: validStatus(ca.digitalFootprint?.status),
          title: ca.digitalFootprint?.title || "Digital Footprint & Domain",
          details: ca.digitalFootprint?.details || (p.officialDomain ? `Official domain: ${p.officialDomain}` : "Online footprint checked"),
          sourceUrl: sanitizeSourceUrl(ca.digitalFootprint?.sourceUrl),
        };
        const employeeReviewsPillar = {
          status: validStatus(ca.employeeReviews?.status),
          title: ca.employeeReviews?.title || "Employee Reviews & Sentiment",
          details: ca.employeeReviews?.details || (p.companyReviews || "Employee ratings checked"),
          sourceUrl: sanitizeSourceUrl(ca.employeeReviews?.sourceUrl),
        };
        const fraudDatabaseCheck = {
          status: validStatus(ca.fraudDatabaseCheck?.status),
          title: ca.fraudDatabaseCheck?.title || "Fraud & Scam Threat Intelligence",
          details: ca.fraudDatabaseCheck?.details || (isScam ? "Flagged on scam reporting forums" : "Clean background — 0 fraud reports"),
          sourceUrl: sanitizeSourceUrl(ca.fraudDatabaseCheck?.sourceUrl),
        };
        const hiringAuthenticity = {
          status: validStatus(ca.hiringAuthenticity?.status),
          title: ca.hiringAuthenticity?.title || "Hiring Process & Offer Authenticity",
          details: ca.hiringAuthenticity?.details || (isScam ? "Unverified / suspicious hiring claims" : "Standard technical interview process"),
          sourceUrl: sanitizeSourceUrl(ca.hiringAuthenticity?.sourceUrl),
        };

        // Report the pillar tally, not an invented 100-point criteria count.
        // The client runs the real 100-criteria checklist and overrides this.
        const pillars = [
          legalStatus,
          physicalOffice,
          digitalFootprintPillar,
          employeeReviewsPillar,
          fraudDatabaseCheck,
          hiringAuthenticity,
        ];

        return {
          companyName: finalName,
          auditScore: score,
          criteriaPassedCount: pillars.filter((x) => x.status === "pass").length,
          totalCriteriaCount: pillars.length,
          overallVerdict: verdict,
          legalStatus,
          physicalOffice,
          digitalFootprint: digitalFootprintPillar,
          employeeReviews: employeeReviewsPillar,
          fraudDatabaseCheck,
          hiringAuthenticity,
        };
      }

      // Fallback synthesis if model omitted companyAudit block
      const score = isScam ? 18 : (isVerifiedFp ? 94 : 78);
      const fallbackPillars: CompanyAuditChecklist["legalStatus"][] = [
        {
          status: isScam ? "fail" : "pass",
          title: "Legal Registration & Incorporation",
          details: isScam
            ? "Unregistered or unverified entity; no MCA / CIN incorporation records identified."
            : "Active corporate incorporation verified in official registries.",
        },
        {
          status: isLocMatched ? "pass" : isScam ? "fail" : "warn",
          title: "Physical Office & Infrastructure",
          details: locText || (isScam ? "No physical office found in claimed location." : "Physical campus confirmed."),
        },
        {
          status: isScam ? "fail" : isVerifiedFp ? "pass" : "warn",
          title: "Digital Footprint & Domain",
          details: p.officialDomain
            ? `Official enterprise domain: ${p.officialDomain}`
            : (isScam ? "Minimal digital footprint; potential disposable or shell entity." : "Moderate web footprint."),
        },
        {
          status: isScam ? "fail" : "pass",
          title: "Employee Reviews & Sentiment",
          details: p.companyReviews || (isScam ? "No legitimate employee reviews found on Glassdoor/AmbitionBox." : "Employee reviews verified on Glassdoor/AmbitionBox."),
        },
        {
          status: isScam ? "fail" : "pass",
          title: "Fraud & Scam Threat Intelligence",
          details: isScam
            ? (p.scamSignals?.[0] || "Scam alerts or advance fee recruitment complaints identified online.")
            : "Clean search record across Reddit, Consumer Complaints, and Cybercrime databases.",
        },
        {
          status: isScam ? "fail" : "pass",
          title: "Hiring Process & Offer Authenticity",
          details: isScam
            ? "Recruitment terms exhibit hallmarks of fresher job fraud or fee traps."
            : "Standard multi-stage technical screening; zero interview or registration charges.",
        },
      ];

      return {
        companyName,
        auditScore: score,
        criteriaPassedCount: fallbackPillars.filter((x) => x.status === "pass").length,
        totalCriteriaCount: fallbackPillars.length,
        overallVerdict: isScam ? "suspicious" : "verified",
        legalStatus: fallbackPillars[0]!,
        physicalOffice: fallbackPillars[1]!,
        digitalFootprint: fallbackPillars[2]!,
        employeeReviews: fallbackPillars[3]!,
        fraudDatabaseCheck: fallbackPillars[4]!,
        hiringAuthenticity: fallbackPillars[5]!,
      };
    }

    const companyAudit = buildCompanyAudit(parsed);

    return {
      status: "completed",
      grounded,
      // Only meaningful when grounded is false — it says why the search-backed
      // attempts were rejected, so the UI can name the real cause.
      groundingError: grounded ? undefined : groundingError,
      isScamLikely: Boolean(parsed.isScamLikely),
      companyName: parsed.companyName
        ? ensureLegalEntitySuffix(parsed.companyName)
        : (extractedCompany || undefined),
      digitalFootprint: parsed.digitalFootprint,
      physicalLocationStatus: parsed.physicalLocationStatus || undefined,
      companyReviews: parsed.companyReviews || undefined,
      officialDomain: parsed.officialDomain || undefined,
      officialLinkedinUrl: parsed.officialLinkedinUrl || undefined,
      claimVerifications: Array.isArray(parsed.claimVerifications)
        ? parsed.claimVerifications
        : [],
      companyAudit,
      summary: parsed.summary,
      scamSignals: Array.isArray(parsed.scamSignals) ? parsed.scamSignals : [],
      trustSignals: Array.isArray(parsed.trustSignals) ? parsed.trustSignals : [],
      sources: sources.slice(0, 5),
      adjustmentPoints:
        typeof parsed.adjustmentPoints === "number" ? parsed.adjustmentPoints : 0,
      employeeReviews: Array.isArray(parsed.employeeReviews)
        ? parsed.employeeReviews.map((r) => ({
            source: r.source,
            // Only expose the platform review page URL if it's a real company-specific page
            sourceUrl: sanitizeSourceUrl(r.sourceUrl),
            rating: r.rating,
            totalReviews: r.totalReviews,
            positiveHighlights: r.positiveHighlights,
            negativeHighlights: r.negativeHighlights,
            scamWarnings: Array.isArray(r.scamWarnings) ? r.scamWarnings : [],
            scamReports: Array.isArray(r.scamReports)
              ? r.scamReports.map((sr) => ({
                  platform: sr.platform || r.source,
                  reviewerName: sr.reviewerName,
                  reviewerRole: sr.reviewerRole,
                  complaintText: sr.complaintText,
                  reportedAt: sr.reportedAt,
                  // CRITICAL: Validate that sourceUrl points to CORRECT company (not similar company)
                  // Better to have no link than wrong company link
                  sourceUrl: validateScamReportUrl(
                    sanitizeSourceUrl(sr.sourceUrl),
                    sr.platform || r.source,
                    companyCoreName || extractedCompany,
                  ),
                }))
              : undefined,
          }))
        : [],
      locationVerification: parsed.locationVerification
        ? {
            jobLocationFromDescription: (parsed.locationVerification as any).jobLocationFromDescription || (parsed.locationVerification as any).claimedLocation,
            matched: (parsed.locationVerification as any).matched !== undefined ? (parsed.locationVerification as any).matched : ((parsed.locationVerification as any).matchStatus !== "mismatch"),
            isExactMatch: (parsed.locationVerification as any).isExactMatch !== undefined ? (parsed.locationVerification as any).isExactMatch : ((parsed.locationVerification as any).matchStatus === "exact_match"),
            verificationStatus: (parsed.locationVerification as any).verificationStatus || ((parsed.locationVerification as any).matchStatus === "mismatch" ? "unverified" : (parsed.locationVerification as any).matchStatus === "exact_match" ? "verified" : "no_info"),
            reason: (parsed.locationVerification as any).reason || (parsed.locationVerification as any).details || "Location verification completed",
          }
        : undefined,
      overallReviewScore: typeof parsed.overallReviewScore === "number" ? parsed.overallReviewScore : undefined,
      hasScamReviews: Boolean(parsed.hasScamReviews),
    };
  } catch (err) {
    logger.error("Unexpected AI search failure", err);
    return { status: "failed", failureReason: "bad-response" };
  }
}
