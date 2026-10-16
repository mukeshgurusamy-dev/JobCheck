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
