import { Finding, TextRuleContext } from "../types/types";
import { extractDomainParts } from "../utils/url";

/**
 * Evaluates positive trust signals from job description text.
 * Trust findings reduce the risk score (total trust reduction capped at 30).
 */
export function evaluatePositiveSignals(ctx: TextRuleContext): Finding[] {
  const findings: Finding[] = [];
  const { normalizedText, rawText, websiteDomain } = ctx;

  if (!normalizedText) {
    return findings;
  }

  // 1. Structured job description (-10)
  // Checks for: Responsibilities + Requirements/Qualifications + About the company
  const hasResponsibilities =
    /responsibilities|key\s*duties|what\s*you'll\s*do|job\s*role|key\s*deliverables/i.test(normalizedText);

  const hasRequirements =
    /requirements|qualifications|eligibility|skills\s*(?:required|needed)|who\s*you\s*are/i.test(normalizedText);

  const hasAboutCompany =
    /about\s*(?:us|the\s*company|our\s*team)|who\s*we\s*are|company\s*(?:overview|profile)/i.test(normalizedText);

  if (hasResponsibilities && hasRequirements && hasAboutCompany) {
    findings.push({
      id: "structured-description",
      kind: "trust",
      severity: "low",
      points: -10,
      reason: "Job description contains standard professional structure (Responsibilities, Requirements, and About Company sections).",
      evidence: "Responsibilities, Qualifications & Company Overview present"
    });
  }

  // 2. Recruiter email domain matches website domain (-10)
  if (websiteDomain) {
    const siteParts = extractDomainParts(websiteDomain);
    const emailRegex = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    let match: RegExpExecArray | null;

    while ((match = emailRegex.exec(rawText)) !== null) {
      const emailDomain = match[2]?.toLowerCase();
      if (!emailDomain) continue;

      const emailParts = extractDomainParts(emailDomain);
      if (
        siteParts.rootDomain &&
        emailParts.rootDomain &&
        siteParts.rootDomain === emailParts.rootDomain
      ) {
        findings.push({
          id: "email-domain-match",
          kind: "trust",
          severity: "low",
          points: -10,
          reason: `Recruiter contact email ('${match[0]}') domain matches official company website ('${siteParts.rootDomain}').`,
          evidence: match[0]
        });
        break;
      }
    }
  }

  // 3. Realistic ranged salary with no earning-per-day language (-5)
  // Covers: "3 - 5 LPA", "4 LPA - 6 LPA", "₹3,00,000 - ₹5,00,000", "25,000 - 35,000 per month"
  const hasRangedSalary =
    /(?:₹|rs\.?|inr)?\s*\d+(?:\.\d+)?\s*(?:lpa|lakhs?|lac)?\s*(?:-|to)\s*(?:₹|rs\.?|inr)?\s*\d+(?:\.\d+)?\s*(?:lpa|lakhs?|lac|per\s*annum|p\.a\.)/i.test(
      normalizedText
    ) ||
    /(?:₹|rs\.?|inr)?\s*[1-5]\d,\d{3}\s*(?:-|to)\s*(?:₹|rs\.?|inr)?\s*[2-9]\d,\d{3}\s*(?:per\s*month|\/-\s*pm)/i.test(
      normalizedText
    );

  const hasPerDayLanguage = /per\s*day|daily|per\s*hour|hourly/i.test(normalizedText);

  if (hasRangedSalary && !hasPerDayLanguage) {
    findings.push({
      id: "realistic-ranged-salary",
      kind: "trust",
      severity: "low",
      points: -5,
      reason: "Specifies a realistic, ranged annual or monthly compensation structure with no daily/hourly gimmick phrasing.",
      evidence: "Standard ranged salary"
    });
  }

  // 4. Official employer careers portal signals (-15)
  // Detected on established company portals: Equal opportunity statement, corporate hiring policies, campus recruitment
  const hasCorporateHiringTerms =
    /equal\s*opportunity\s*(?:employer|employment)|affirmative\s*action|code\s*of\s*(?:conduct|ethics)|corporate\s*governance|campus\s*(?:recruitment|commune|connect)|explore\s*(?:active\s*)?careers|fraud\s*(?:alert|warning)[:\s]+(?:tcs|we\s*do\s*not\s*charge)/i.test(
      normalizedText
    );

  if (hasCorporateHiringTerms) {
    findings.push({
      id: "official-portal-verified",
      kind: "trust",
      severity: "medium",
      points: -15,
      reason: "Official careers portal content verified: Contains corporate hiring guidelines, equal opportunity policy, or explicit anti-fraud disclaimer.",
      evidence: "Corporate hiring policies & compliance statements detected"
    });
  }

  return findings;
}

