import {
  Assessment,
  Finding,
  JobInput,
  LinkAssessment,
  PageData,
  TextRuleContext,
  UrlRuleContext,
} from "../types/types";
import {
  extractDomainParts,
  extractUrlsFromText,
  validateAndNormalizeUrl,
} from "../utils/url";
import { ALL_URL_RULES } from "../rules/urlRules";
import { evaluateTextRules } from "../rules/textRules";
import { evaluatePositiveSignals } from "../rules/positiveSignals";
import { containsIndicScript, normalizeText } from "./normalize";
import { computeAssessment } from "./scoring";
import { evaluatePhoneNumbers } from "../rules/phoneValidation";
import { applyAiIntelligence } from "./aiFusion";
import { evaluateCriteria } from "../criteria/evaluate";
import { CriteriaContext } from "../criteria/types";

/**
 * Analyzes a single job URL and its text/page data.
 */
function analyzeBaseJob(
  url: string,
  rawText: string,
  pageData?: PageData,
  isTrustedPlatform = false,
  parsedUrl?: URL,
  domainParts?: ReturnType<typeof extractDomainParts>,
): Assessment {
  // Use pre-parsed values if provided to avoid redundant parsing
  let finalParsedUrl = parsedUrl;
  let finalDomainParts = domainParts;

  if (!finalParsedUrl || !finalDomainParts) {
    const normResult = validateAndNormalizeUrl(url);
    if (!normResult.valid || !normResult.normalizedUrl) {
      throw new Error(normResult.error || "Invalid URL provided.");
    }
    finalParsedUrl = new URL(normResult.normalizedUrl);
    finalDomainParts = extractDomainParts(finalParsedUrl.hostname);
  }

  const domainAgeDays = pageData?.domainAgeDays ?? null;
  const safeBrowsingFlagged = pageData?.safeBrowsingFlagged ?? null;
  const redirectChain = pageData?.redirectChain ?? [];
  const finalUrl = pageData?.finalUrl;

  const urlCtx: UrlRuleContext = {
    rawUrl: url,
    parsedUrl: finalParsedUrl,
    hostname: finalDomainParts.hostname,
    rootDomain: finalDomainParts.rootDomain,
    subdomain: finalDomainParts.subdomain,
    domainAgeDays,
    safeBrowsingFlagged,
    redirectChain,
    finalUrl,
  };

  const findings: Finding[] = [];

  // 1. Evaluate URL rules
  for (const rule of ALL_URL_RULES) {
    const finding = rule(urlCtx);
    if (finding) {
      findings.push(finding);
    }
  }

  // 2. Evaluate text risk rules and positive signals
  const hasText = rawText.length > 0;
  const normalized = normalizeText(rawText);

  if (hasText) {
    const textCtx: TextRuleContext = {
      rawText,
      normalizedText: normalized,
      websiteDomain: finalDomainParts.hostname,
    };

    const textFindings = evaluateTextRules(textCtx);
    findings.push(...textFindings);

    const trustFindings = evaluatePositiveSignals(textCtx);
    findings.push(...trustFindings);

    // Phone number validation
    const phoneFindings = evaluatePhoneNumbers({
      rawText,
      normalizedText: normalized,
      companyLocation: undefined, // Will be enriched with AI data later
      isTrustedPlatform
    });
    findings.push(...phoneFindings);

    // The messaging-app-contact pattern group (+25) already covers "contact us
    // on WhatsApp". Drop the phone rule's weaker +20 finding for the same line
    // so a single WhatsApp mention cannot be counted twice.
    if (findings.some((f) => f.id === "messaging-app-contact")) {
      const weakerIdx = findings.findIndex((f) => f.id === "phone-with-messaging-app");
      if (weakerIdx !== -1) {
        findings.splice(weakerIdx, 1);
      }
    }
  }

  const hasDomainAge = domainAgeDays !== null;
  // Proxy-fetched pages (jina/google-cache/duckduckgo) also count as having page content
  const pageFetched =
    pageData !== undefined &&
    (pageData.fetchSource != null || (pageData.status >= 200 && pageData.status < 400));

  // Compute assessment
  const assessment = computeAssessment({
    findings,
    hasDescriptionOrPageText: hasText,
    hasDomainAge,
    pageFetched,
    hostname: finalDomainParts.hostname,
  });

  // Edge case: If text contains Indic script, note that text rules are English-first and adjust confidence
  if (hasText && containsIndicScript(rawText)) {
    if (assessment.confidence === "High") {
      assessment.confidence = "Medium";
    }
    assessment.nextSteps.push(
      "Note: The listing contains Hindi or regional Indic text. Current automated text analysis rules are calibrated for English; verify terms manually.",
    );
  }

  return assessment;
}

export function analyzeJob(input: JobInput): Assessment {
  const normResult = validateAndNormalizeUrl(input.url);
  if (!normResult.valid || !normResult.normalizedUrl) {
    throw new Error(normResult.error || "Invalid URL provided.");
  }

  // Parse URL once for reuse
  const parsedUrl = new URL(normResult.normalizedUrl);
  const mainDomainParts = extractDomainParts(parsedUrl.hostname);

  // 1. Determine main text: pasted description takes priority over fetched page text
  const rawText =
    input.description && input.description.trim().length > 0
      ? input.description.trim()
      : input.fetched?.text && input.fetched.text.trim().length > 0
        ? input.fetched.text.trim()
        : "";

  // 2. Perform base assessment on the primary URL (pass pre-parsed values)
  const mainAssessment = analyzeBaseJob(input.url, rawText, input.fetched, input.isTrustedPlatform, parsedUrl, mainDomainParts);

  // 3. Extract and analyze external links found inside the candidate's submitted job description
  const userDescriptionText = input.description ? input.description.trim() : "";

  const descriptionLinks = extractUrlsFromText(userDescriptionText, 5).filter(
    (link) => {
      if (link === normResult.normalizedUrl) return false;
      const linkParts = extractDomainParts(link);
      // Only inspect genuinely external links pointing to a different rootDomain
      return Boolean(linkParts.rootDomain && linkParts.rootDomain !== mainDomainParts.rootDomain);
    },
  );

  const linkAssessments: LinkAssessment[] = [];

  if (descriptionLinks.length > 0) {
    // Map of fetched data from backend if available
    const fetchedLinksMap = new Map<string, PageData | undefined>();
    if (input.extractedLinks) {
      for (const ext of input.extractedLinks) {
        fetchedLinksMap.set(ext.url, ext.data);
      }
    }

    for (const linkUrl of descriptionLinks) {
      try {
        const linkPageData = fetchedLinksMap.get(linkUrl);
        const linkText = linkPageData?.text || "";
        // Embedded links are typically external and not trusted platforms
        const subAssessment = analyzeBaseJob(linkUrl, linkText, linkPageData, false);

        let fetchNotice: string | null = null;
        if (linkPageData?.text && linkPageData.text.length > 50) {
          const wordCount = linkPageData.text.trim().split(/\s+/).filter(Boolean).length;
          if (linkPageData.fetchSource === "jina") {
            fetchNotice = `✅ Content retrieved via reader proxy (${wordCount} words scanned).`;
          } else if (linkPageData.fetchSource === "google-cache") {
            fetchNotice = `✅ Content retrieved from web cache (${wordCount} words scanned).`;
          } else if (linkPageData.fetchSource === "search-index") {
            fetchNotice = `✅ Domain profile retrieved via search index (${wordCount} words analyzed).`;
          } else {
            fetchNotice = `✅ Page content analyzed (${wordCount} words scanned).`;
          }
        } else if (!linkPageData || (linkPageData.status !== 0 ? linkPageData.status >= 400 : true)) {
          fetchNotice = "External link analyzed based on URL structure and domain records.";
        }

        linkAssessments.push({
          url: linkUrl,
          assessment: subAssessment,
          fetchNotice,
        });

        // Surface risk signals from description links into main assessment
        // BUT: Don't add link findings to main assessment findings
        // The link's risk is shown separately in linkAssessments
        // Adding it here creates a hard flag that forces the main job to High Risk
        const linkParts = extractDomainParts(linkUrl);
        if (subAssessment.level === "High") {
          // Don't add finding to main assessment - just show the link assessment separately
          // This prevents a risky link from forcing the entire job posting to High Risk
        } else if (subAssessment.level === "Medium") {
          // Same for medium risk links
        }
      } catch {
        // If link URL parsing fails, ignore safely
      }
    }

    // Recompute score & risk level if sub-links added high/medium risk findings
    // BUT: Don't force main assessment to High just because of a risky link
    // The link's risk is separate from the job posting itself
    // Only warn the user about the specific risky link
    if (linkAssessments.some((l) => l.assessment.level === "High")) {
      // Don't change mainAssessment.level or mainAssessment.score
      // Just add a warning in nextSteps
      mainAssessment.nextSteps.unshift(
        "⚠️ Warning: A link in the job description was identified as High Risk. Do not make payments or submit sensitive data to external forms.",
      );
    }
  }

  if (linkAssessments.length > 0) {
    mainAssessment.linkAssessments = linkAssessments;
  }

  // If the AI investigation was requested but did not complete, still attach the
  // result so the UI can say so, and make the reduced scope explicit — otherwise
  // a degraded scan is indistinguishable from a full one.
  if (input.aiIntel && input.aiIntel.status !== "completed") {
    mainAssessment.aiIntel = input.aiIntel;
    mainAssessment.nextSteps.unshift(
      input.aiIntel.status === "skipped"
        ? "The AI web investigation was skipped for this scan, so this verdict is based on the automated rules only. Treat the score as a lower bound on the actual risk."
        : "The AI web investigation could not be completed, so this verdict is based on the automated rules only. Treat the score as a lower bound on the actual risk.",
    );
  }

  // 4. Incorporate Google AI Web Search Grounding Intelligence if available.
  // All AI-derived scoring policy lives in aiFusion.ts.
  if (input.aiIntel && input.aiIntel.status === "completed") {
    applyAiIntelligence(mainAssessment, input.aiIntel);
  }

  // 5. Run the 100-criteria checklist over everything gathered above. This is
  // explanatory only — it does not feed back into `score` or `level`, so the
  // benchmark's zero-false-negative guarantee is unaffected.
  const criteriaContext: CriteriaContext = {
    findings: mainAssessment.findings,
    pageData: input.fetched,
    ai: input.aiIntel,
    hostname: mainDomainParts.hostname,
    rootDomain: mainDomainParts.rootDomain,
    hasDescription: Boolean(
      input.description && input.description.trim().length > 0,
    ),
    hasDomainAge: input.fetched?.domainAgeDays != null,
    pageFetched: Boolean(input.fetched),
    rawText,
  };
  mainAssessment.criteria = evaluateCriteria(criteriaContext);

  return mainAssessment;
}

/**
 * Extracts company/employer name heuristics from raw job description text
 */
export function extractCompanyName(text: string): string | undefined {
  if (!text) return undefined;

  // 1. Explicit Label: "Company: ...", "Employer: ...", "Hiring Company: ..."
  const matchLabel = text.match(
    /(?:Company(?:\s+Name)?|Employer|Organization|Hiring\s+Company)\s*[:\-–]\s*([A-Za-z0-9&.,' ]{2,60})/i
  );
  if (matchLabel?.[1]) {
    const val = matchLabel[1].trim().replace(/[,.]$/, "").trim();
    if (val.length >= 2) return val;
  }

  // 1b. LinkedIn Header: "Company logo for, [Company Name]"
  const logoMatch = text.match(/Company\s+logo\s+for,?\s*([A-Za-z0-9&.,' -]{2,60}?)(?:\.|\r?\n|$)/i);
  if (logoMatch?.[1]) {
    const cleaned = logoMatch[1].trim().replace(/[,.]$/, "").trim();
    if (cleaned.length >= 2 && !/^(?:job|application|profile|our|the)\b/i.test(cleaned)) {
      return cleaned;
    }
  }

  // 1c. Job Board Header with separator: "[Company Name] • [Location/Work Mode]"
  const bulletMatch = text.match(/^([A-Za-z0-9&.,' -]{2,60}?)\s*[•·]\s*[A-Za-z\s,]+?(?:India|Tamil|Karnataka|Maharashtra|Delhi|On-site|Remote|Hybrid|\()/im);
  if (bulletMatch?.[1]) {
    const cleaned = bulletMatch[1].trim().replace(/[,.]$/, "").trim();
    if (cleaned.length >= 2 && !/^(?:save|apply|easy apply|about|job|urgent)\b/i.test(cleaned)) {
      return cleaned;
    }
  }

  // 2. High-Confidence Pattern: Look for an explicit corporate entity line with legal suffix
  // e.g., "Tridin Software Private Limited", "TCS Ltd", "Wipro Limited", "Infosys Technologies Ltd"
  const corporateSuffixRegex =
    /^[ \t]*([A-Z][A-Za-z0-9&.,' ]{2,50}\s+(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|Ltd\.?|LLP|Limited|Inc\.?|Corp\.?|Corporation))[ \t]*$/im;
  const matchCorp = text.match(corporateSuffixRegex);
  if (matchCorp?.[1]) {
    const candidate = matchCorp[1].trim().replace(/[,.]$/, "").trim();
    if (candidate.length >= 3) return candidate;
  }

  // 3. Early Header Inspection: First 3 non-empty lines often contain Job Title, Company Name, Location
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith("•") &&
        !l.startsWith("-") &&
        !l.startsWith("http")
    );

  // If line 2 or 3 has a name that isn't a salary, job title, or location:
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    if (!line) continue;
    if (
      /^[A-Z][A-Za-z0-9&.,' ]{2,50}\s+(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|Ltd\.?|LLP|Limited|Technologies|Solutions|Software|Services|Infotech|Labs)$/i.test(
        line
      ) &&
      !/(?:developer|engineer|manager|associate|analyst|intern|skills|responsibilities|experience|qualification|salary|year|month|apply|full-time|part-time|hybrid|remote|about|join)/i.test(
        line
      )
    ) {
      return line.replace(/[,.]$/, "").trim();
    }
  }

  // 4. "About [Company]" / "Join [Company]"
  const matchAbout = text.match(
    /(?:About|Join)\s+([A-Z][A-Za-z0-9&.,' ]{2,40}?)(?:\r?\n|:|\.|!|,|\s+is\s+hiring)/
  );
  if (matchAbout?.[1]) {
    const candidate = matchAbout[1].trim();
    const genericAbouts = [
      "Us", "Our", "The", "Job", "This", "A", "We", "You",
      "The Opportunity", "Opportunity", "The Role", "Role", "The Job", "The Position", "Position",
      "Our Company", "Company", "Our Team", "The Team"
    ];
    if (
      !genericAbouts.some((g) => candidate.toLowerCase() === g.toLowerCase()) &&
      candidate.length >= 2
    ) {
      return candidate;
    }
  }

  // 5. "[Company] is hiring" / "[Company] is looking"
  const matchHiring = text.match(
    /([A-Z][A-Za-z0-9&.' ]{2,50}?)\s+is\s+(?:hiring|looking|recruiting|seeking)/
  );
  if (matchHiring?.[1]) {
    const candidate = matchHiring[1].trim();
    if (
      candidate.length >= 3 &&
      !/(?:team|company|organisation|organization|recruiter)/i.test(candidate)
    ) {
      return candidate;
    }
  }

  // 6. Prepositional phrases: "opportunity at [Company]", "career with [Company]"
  // Strictly filter out technical tools, libraries, and skills (like Git, GitHub, Python, etc.)
  const matchAt = text.match(
    /(?:opportunity|career|position|role|job)\s+(?:at|with)\s+([A-Z][A-Za-z0-9&.' ]{2,50}?)(?:\s*[,.\-!]|\s+(?:is|are|we|located|based)|\r?\n)/i
  );
  if (matchAt?.[1]) {
    const candidate = matchAt[1].trim().replace(/[,.]$/, "").trim();
    const blacklist = [
      "Us",
      "Our",
      "The",
      "This",
      "A",
      "Git",
      "GitHub",
      "Git and GitHub",
      "Python",
      "Java",
      "React",
      "Angular",
    ];
    if (!blacklist.includes(candidate) && candidate.length >= 3) {
      return candidate;
    }
  }

  return undefined;
}
