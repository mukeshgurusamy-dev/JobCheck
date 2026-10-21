import { Assessment, ConfidenceLevel, Finding, RiskLevel } from "../types/types";
import { extractDomainParts } from "../utils/url";
import { TRUSTED_JOB_PLATFORMS } from "../rules/lists";

export interface ScoringOptions {
  findings: Finding[];
  hasDescriptionOrPageText: boolean;
  hasDomainAge: boolean;
  pageFetched: boolean;
  hostname: string;
}

export function computeAssessment(options: ScoringOptions): Assessment {
  const {
    findings,
    hasDescriptionOrPageText,
    hasDomainAge,
    pageFetched,
    hostname
  } = options;

  let riskPoints = 0;
  let trustReduction = 0;

  // Track unique group IDs so each pattern group counts only once
  const seenGroupIds = new Set<string>();
  const deduplicatedFindings: Finding[] = [];

  for (const finding of findings) {
    if (seenGroupIds.has(finding.id)) {
      continue;
    }
    seenGroupIds.add(finding.id);
    deduplicatedFindings.push(finding);

    if (finding.kind === "risk") {
      riskPoints += finding.points;
    } else if (finding.kind === "trust") {
      // Trust findings have negative points (e.g. -15)
      trustReduction += Math.abs(finding.points);
    }
  }

  // Total trust reduction is capped at 30 points
  const cappedTrust = Math.min(trustReduction, 30);
  const rawScore = riskPoints - cappedTrust;

  // Final score clamped to 0-100
  const score = Math.max(0, Math.min(100, rawScore));

  // Base Risk Level calculation (0-24 Low, 25-54 Medium, 55-100 High)
  let level: RiskLevel = "Low";
  if (score >= 55) {
    level = "High";
  } else if (score >= 25) {
    level = "Medium";
  } else {
    level = "Low";
  }

  // Hard flags: floor the level
  // Section 8 & Section 19 acceptance criteria:
  // upfront-payment, task-scam, sensitive-docs-early, safe-browsing, shortener, lookalike-suspicious-tld, remote-access-software -> at least High
  // NOTE: These can be overridden by AI verification (see aiFusion.ts)
  const highRiskHardFlags = [
    "upfront-payment",
    "task-scam",
    "sensitive-docs-early",
    "safe-browsing",
    "shortener",
    "lookalike-suspicious-tld",
    "link-in-description-high-risk",
    "remote-access-software",
    "mlm-referral",
    "paid-medical-exam",
    "cryptocurrency-payment", // NEW 2026
    "investment-scheme", // NEW 2026
    "advance-salary-loan", // NEW 2026
    "fake-government-job", // NEW 2026
    "fake-internship-conversion", // NEW 2026
    "fake-verification-portal", // NEW 2026
    "employee-scam-reviews", // AI-detected
    "location-mismatch" // AI-detected
  ];
  const hasHighHardFlag = deduplicatedFindings.some((f) =>
    highRiskHardFlags.includes(f.id)
  );

  // Only apply hard flag floor if there's no AI-verified legitimacy override
  // (aiFusion.ts removes "upfront-payment" when AI verifies legitimacy)
  const hasAiLegitimacyOverride = deduplicatedFindings.some(
    (f) => f.id === "ai-verified-legitimate"
  );

  if (hasHighHardFlag && !hasAiLegitimacyOverride) {
    level = "High";
  }

  // lookalike-brand -> at least Medium
  const hasLookalike = deduplicatedFindings.some(
    (f) => f.id === "lookalike-brand"
  );
  if (hasLookalike && level === "Low") {
    level = "Medium";
  }

  // Confidence Calculation:
  // High: both page text (or description) AND domain age are available
  // Medium: only one of them is available
  // Low: only URL structure was analyzed
  let confidence: ConfidenceLevel = "Low";
  if (hasDescriptionOrPageText && hasDomainAge) {
    confidence = "High";
  } else if (hasDescriptionOrPageText || hasDomainAge) {
    confidence = "Medium";
  } else {
    confidence = "Low";
  }

  // Default Next Steps checklist (Section 13)
  const nextSteps: string[] = [
    "Verify the opening on the company's official careers page directly.",
    "Search online for '[Company Name] job scam' or '[Company Name] fake offer' on Google and Reddit.",
    "Never pay money for registration, interview kit, training, or laptop delivery.",
    "Never share Aadhaar, PAN, bank details, or OTP before receiving a verified offer letter.",
    "Check the recruiter's identity and corporate email on LinkedIn.",
    "Report cyber fraud to the Indian National Cyber Crime Portal (cybercrime.gov.in) or call helpline 1930."
  ];

  // Specific prompt if low confidence or unfetched trusted job platform
  const domainParts = extractDomainParts(hostname);
  const isTrustedPlatform = TRUSTED_JOB_PLATFORMS.some((p) => domainParts.sld === p);

  if (isTrustedPlatform && !pageFetched && !hasDescriptionOrPageText) {
    nextSteps.unshift(
      "The platform is genuine, but individual postings can still be fake. Paste the description for a deeper check."
    );
  } else if (confidence === "Low") {
    nextSteps.unshift(
      "Confidence is Low because only URL structure was analyzed. Paste the job description text above for an in-depth scan."
    );
  }

  // Sort findings: risk findings sorted by points descending, then trust findings
  const sortedFindings = deduplicatedFindings.sort((a, b) => {
    if (a.kind === "risk" && b.kind === "trust") return -1;
    if (a.kind === "trust" && b.kind === "risk") return 1;
    return b.points - a.points;
  });

  return {
    score,
    level,
    confidence,
    findings: sortedFindings,
    nextSteps
  };
}
