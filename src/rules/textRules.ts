import { Finding, TextRuleContext } from "../types/types";
import { PATTERN_GROUPS } from "./patterns";
import { extractDomainParts } from "../utils/url";

// Cache common free email domains to avoid recreating array on every call
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.in",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "rediffmail.com"
]);

/**
 * Truncates and safely escapes evidence snippets.
 */
function extractSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - 15);
  const end = Math.min(text.length, matchIndex + matchLength + 15);
  const snippet = text.slice(start, end).trim();
  return snippet.length > 80 ? `${snippet.slice(0, 77)}...` : snippet;
}

/**
 * Evaluates text risk rules against normalized and raw job description text.
 */
export function evaluateTextRules(ctx: TextRuleContext): Finding[] {
  const findings: Finding[] = [];
  const { normalizedText, rawText, websiteDomain } = ctx;

  if (!normalizedText) {
    return findings;
  }

  // CRITICAL: Detect anti-fraud warnings (company warning about fake jobs/fees)
  // If present, this is a TRUST signal, not a risk signal
  const antifraudWarnings = /(?:recruitment\s*fraud|fraudulent\s*recruitment|fake\s*(?:job|offer|recruitment)|be\s*cautious|beware\s*of|do\s*not\s*(?:share|pay|give)|will\s*never\s*charge|never\s*(?:charge|request|ask)\s*(?:fee|payment|money)|no\s*(?:registration|hiring|application|processing|joining)\s*fee)/i;
  const hasAntifraudWarning = antifraudWarnings.test(normalizedText);

  // 1. Evaluate standard regex pattern groups
  for (const group of PATTERN_GROUPS) {
    // Skip sender-domain-mismatch here, evaluated separately below
    if (group.id === "sender-domain-mismatch") {
      continue;
    }

    // Check for writing-style in rawText to preserve casing and emoji signals
    const targetText = group.id === "writing-style" ? rawText : normalizedText;

    let matchedEvidence: string | undefined;

    for (const pattern of group.patterns) {
      const match = targetText.match(pattern);
      if (match && match.index !== undefined) {
        matchedEvidence = extractSnippet(targetText, match.index, match[0].length);
        break; // Group rule: each pattern group counts once!
      }
    }

    if (matchedEvidence !== undefined) {
      // CRITICAL: If this is upfront-payment rule AND we have anti-fraud warning,
      // convert to trust finding instead
      if (group.id === "upfront-payment" && hasAntifraudWarning) {
        findings.push({
          id: "anti-fraud-warning-legitimate",
          kind: "trust",
          severity: "low",
          points: -25, // Trust signal: company warns about fees scams
          reason: "Company explicitly warns against recruitment fraud and guarantees no fees — positive legitimacy signal.",
          evidence: matchedEvidence
        });
        continue; // Skip the risk finding
      }

      findings.push({
        id: group.id,
        kind: "risk",
        severity: group.severity,
        points: group.weight,
        reason: group.reason,
        evidence: matchedEvidence
      });
    }
  }

  // 2. Evaluate sender-domain-mismatch (+20)
  // Extracts any email addresses from the text
  const emailRegex = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let emailMatch: RegExpExecArray | null;

  while ((emailMatch = emailRegex.exec(rawText)) !== null) {
    const emailDomain = emailMatch[2]?.toLowerCase();
    if (!emailDomain) continue;

    // Skip free email domains here (handled by free-email rule)
    if (FREE_EMAIL_DOMAINS.has(emailDomain)) continue;

    if (websiteDomain) {
      const siteParts = extractDomainParts(websiteDomain);
      const emailParts = extractDomainParts(emailDomain);

      if (
        siteParts.rootDomain &&
        emailParts.rootDomain &&
        siteParts.rootDomain !== emailParts.rootDomain
      ) {
        findings.push({
          id: "sender-domain-mismatch",
          kind: "risk",
          severity: "low",
          points: 20,
          reason: `Recruiter email domain ('${emailParts.rootDomain}') differs from official website domain ('${siteParts.rootDomain}').`,
          evidence: `${emailMatch[0]} vs ${siteParts.rootDomain}`
        });
        break;
      }
    }
  }

  return findings;
}
