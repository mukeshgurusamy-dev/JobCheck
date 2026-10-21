/**
 * AI intelligence fusion.
 *
 * Everything the Gemini web-search investigation contributes to a score lives
 * here. `engine.ts` stays a pure function of the deterministic rules; this
 * module owns the policy for interpreting AI findings, which makes that policy
 * readable in one place instead of buried mid-way through `analyzeJob`.
 *
 * Only called when `ai.status === "completed"` — the caller handles the
 * skipped/failed cases.
 */

import { AiIntelligenceResult, Assessment } from "../types/types";

export function applyAiIntelligence(
  assessment: Assessment,
  ai: AiIntelligenceResult,
): void {
  assessment.aiIntel = ai;

  // CRITICAL: AI TRUST OVERRIDE
  // If AI says the company is legitimate (no scam signals, verified digital footprint),
  // and there are no actual scam reviews from employees, override aggressive rule-based flags.
  // This fixes false positives where legitimate companies warn about fraud.
  const aiSaysLegitimate =
    !ai.isScamLikely &&
    !ai.hasScamReviews &&
    (ai.digitalFootprint === "verified" || ai.digitalFootprint === "moderate") &&
    (!ai.scamSignals || ai.scamSignals.length === 0);

  if (aiSaysLegitimate) {
    // Remove ALL hard flags when AI verifies legitimacy
    // These are false positives triggered by aggressive rules on legitimate companies
    const falsePositiveFlagIds = [
      // Hard flags from rules
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
      "cryptocurrency-payment",
      "investment-scheme",
      "advance-salary-loan",
      "fake-government-job",
      "fake-internship-conversion",
      "fake-verification-portal",
      // Other common false positives
      "sender-domain-mismatch",
      "free-email-warning",
    ];

    assessment.findings = assessment.findings.filter(
      (f) => !falsePositiveFlagIds.includes(f.id)
    );

    // CRITICAL: When AI verifies legitimacy, we need aggressive score reduction
    // Rules are intentionally aggressive to catch scams, but AI overrides that
    // Score should drop to Medium or Low, not stay High
    // Target: legitimate companies should end up in 0-40 range after AI override
    let scoreReduction = assessment.score * 0.65; // Reduce by 65% first
    scoreReduction = Math.min(scoreReduction, 75); // Cap at 75 points max reduction
    assessment.score = Math.max(0, assessment.score - scoreReduction);

    // Update level based on new score
    if (assessment.score < 25) {
      assessment.level = "Low";
    } else if (assessment.score < 55) {
      assessment.level = "Medium";
    }
    // If score still >= 55, it stays High, but that's only if AI override wasn't strong enough

    // Add positive AI finding with stronger impact
    assessment.findings.unshift({
      id: "ai-verified-legitimate",
      kind: "trust",
      severity: "low",
      points: -30, // Increased from -20 to -30
      reason: `AI Verification: Company verified as legitimate employer with established digital footprint and no scam reports.`,
      evidence: `${ai.companyName || "Company"} — Verified: ${ai.digitalFootprint}${ai.summary ? ` — ${ai.summary}` : ""}`,
    });

    assessment.confidence = "High";
  }

  // If employer was evaluated by AI, remove the naive "Hosted on a recognized job platform" finding
  // so we don't give false confidence when the actual hiring company is suspicious or unverified!
  if (ai.isScamLikely || ai.digitalFootprint === "suspicious" || ai.digitalFootprint === "minimal") {
    assessment.findings = assessment.findings.filter((f) => f.id !== "trusted-platform");
  }

  // CRITICAL: Check for scam reviews from employees
  if (ai.hasScamReviews && ai.employeeReviews && ai.employeeReviews.length > 0) {
    const scamReviewsList = ai.employeeReviews
      .flatMap(r => r.scamWarnings || [])
      .slice(0, 3);

    if (scamReviewsList.length > 0) {
      const companyTag = ai.companyName ? ` at '${ai.companyName}'` : "";
      assessment.findings.unshift({
        id: "employee-scam-reviews",
        kind: "risk",
        severity: "high",
        points: 70, // Increase from 50 to 70 for equal AI power in both directions
        reason: `🚨 CRITICAL: Employee reviews contain scam warnings${companyTag} — ${scamReviewsList[0]}`,
        evidence: scamReviewsList.join(" | "),
      });
      assessment.level = "High";
      assessment.score = Math.min(100, Math.max(assessment.score + 70, 85)); // Increased from +50, 80 to +70, 85
      assessment.confidence = "High";
      assessment.nextSteps.unshift(
        `⛔ DANGER: Multiple employees have reported this company for job scams, fake offers, or fee fraud${companyTag}. DO NOT PROCEED with this application.`,
      );
    }
  }

  // Location verification - NEW LOGIC
  if (ai.locationVerification) {
    const lv = ai.locationVerification;

    if (lv.verificationStatus === "unverified") {
      // Location mismatch is a HIGH risk indicator
      assessment.findings.unshift({
        id: "location-mismatch",
        kind: "risk",
        severity: "high",
        points: 35,
        reason: `Location Mismatch: Job claims '${lv.jobLocationFromDescription || "unknown"}' but company verified address is '${ai.companyLocation?.fullAddress || "unknown"}'`,
        evidence: `Reason: ${lv.reason}`,
      });
      assessment.level = "High";
      assessment.score = Math.min(100, Math.max(assessment.score + 35, 70));
      assessment.nextSteps.unshift(
        `⚠️ Warning: The job's claimed location does not match the company's verified address. This is a common tactic used by scammers.`,
      );
    } else if (lv.verificationStatus === "verified") {
      // Location verified - TRUST indicator
      const matchType = lv.isExactMatch ? "exact match" : "hierarchical match";
      assessment.findings.push({
        id: "location-verified",
        kind: "trust",
        severity: "low",
        points: -20, // Reduce score for verified location
        reason: `Location Verified: ${matchType} between job location and company's registered address`,
        evidence: `Company Address: ${ai.companyLocation?.fullAddress || "Not found"} | Job Location: ${lv.jobLocationFromDescription || "Not provided"}`,
      });
      assessment.score = Math.max(0, assessment.score - 20); // Deduct points for verified location
    }
    // If verificationStatus === "no_info", no action taken
  }

  // Phone number verification from AI audit
  if (ai.companyAudit?.phoneVerification && Array.isArray(ai.companyAudit.phoneVerification)) {
    // phoneVerification is an array of PhoneNumberVerification objects
    const scamPhones = ai.companyAudit.phoneVerification.filter(pv => !pv.isValid || pv.isTruecallerSpam);
    const mismatchPhones = ai.companyAudit.phoneVerification.filter(pv => !pv.matchesCompanyLocation);

    if (scamPhones.length > 0 && scamPhones[0]) {
      const phoneVerif = scamPhones[0];
      assessment.findings.unshift({
        id: "phone-scam-reported",
        kind: "risk",
        severity: "high",
        points: 40,
        reason: `Phone Number Alert: ${phoneVerif.details}`,
        evidence: phoneVerif.phoneNumber
      });
      assessment.level = "High";
      assessment.score = Math.min(100, Math.max(assessment.score + 40, 75));
      assessment.nextSteps.unshift(
        "🚨 WARNING: Phone numbers in this listing have been reported for scam activities. Do not call or share personal information.",
      );
    } else if (mismatchPhones.length > 0 && mismatchPhones[0]) {
      const phoneVerif = mismatchPhones[0];
      assessment.findings.push({
        id: "phone-location-mismatch-ai",
        kind: "risk",
        severity: "medium",
        points: 25,
        reason: `Phone Verification Warning: ${phoneVerif.details}`,
        evidence: phoneVerif.phoneNumber
      });
      assessment.score = Math.min(100, assessment.score + 25);
    }
  }

  if (ai.isScamLikely || ai.digitalFootprint === "suspicious") {
    const companyTag = ai.companyName ? ` for '${ai.companyName}'` : "";
    const topSignal =
      ai.scamSignals?.[0] ||
      ai.summary ||
      `Online reports or minimal digital footprint flag this employer${companyTag} for job fraud.`;

    assessment.findings.unshift({
      id: "ai-threat-intelligence",
      kind: "risk",
      severity: "high",
      points: 65, // Increase from 40 to 65 for parity with legitimacy override
      reason: `Employer Investigation: Fraud risk / unverified footprint${companyTag} — ${topSignal}`,
      evidence: ai.summary,
    });

    // Force to High Risk and boost score aggressively (same power as legitimacy override)
    assessment.level = "High";
    assessment.score = Math.min(100, Math.max(assessment.score + 65, 80)); // Increased from +40, 75 to +65, 80
    assessment.confidence = "High";
    assessment.nextSteps.unshift(
      `⚠️ Warning: Deep search identified suspicious signals or lack of verifiable digital footprint for this employer${companyTag}. Do not share documents or pay fees.`,
    );
  } else if (ai.digitalFootprint === "minimal" && !ai.hasScamReviews && (!ai.scamSignals || ai.scamSignals.length === 0)) {
    // IMPORTANT: Minimal footprint alone is NOT a scam indicator when there are NO actual scam reviews or signals.
    // This handles legitimate small companies, startups, and newly registered entities.
    // Only flag if there are ACTUAL scam reports or suspicious signals.
    const companyTag = ai.companyName ? ` (${ai.companyName})` : "";
    assessment.findings.push({
      id: "minimal-footprint-neutral",
      kind: "trust",
      severity: "low",
      points: 0,
      reason: `Company Information: Limited online presence${companyTag} but no scam reports found — typical for smaller or newly registered entities.`,
      evidence: "No employee scam complaints or fraud reports detected.",
    });
  } else if (ai.trustSignals && ai.trustSignals.length > 0 && !ai.isScamLikely) {
    const companyTag = ai.companyName ? ` (${ai.companyName})` : "";
    const topTrust =
      ai.trustSignals[0] || `Verified legitimate entity${companyTag} in web search index.`;

    // Replace generic platform finding with verified employer finding!
    assessment.findings = assessment.findings.filter((f) => f.id !== "trusted-platform");

    assessment.findings.push({
      id: "ai-verified-entity",
      kind: "trust",
      severity: "medium",
      points: Math.min(ai.adjustmentPoints || -15, -10),
      reason: `Employer Verified: Legitimate organization${companyTag} — ${topTrust}`,
      evidence: ai.officialDomain ? `Official domain: ${ai.officialDomain}` : undefined,
    });

    if (assessment.level !== "High") {
      assessment.score = Math.max(0, assessment.score - 15);
      if (assessment.score < 25) {
        assessment.level = "Low";
      }
    }
    assessment.confidence = "High";
  }

  // Process specific job description claim fact-checks (e.g. physical location match, contradicted claims)
  if (ai.claimVerifications && ai.claimVerifications.length > 0) {
    for (const cv of ai.claimVerifications) {
      if (cv.verifiedStatus === "contradicted") {
        assessment.findings.unshift({
          id: `claim-contradicted-${cv.claimType}`,
          kind: "risk",
          severity: "high",
          points: 25,
          reason: `Claim Contradicted (${cv.claimType.toUpperCase()}): '${cv.claimedValue}' contradicted by web search — ${cv.details}`,
          evidence: cv.claimedValue,
        });
        assessment.level = "High";
        assessment.score = Math.min(100, Math.max(assessment.score + 25, 70));
      } else if (cv.verifiedStatus === "verified" && cv.claimType === "location") {
        assessment.findings.push({
          id: "location-verified",
          kind: "trust",
          severity: "low",
          points: -10,
          reason: `Physical Location Matched: Employer confirmed at '${cv.claimedValue}' — ${cv.details}`,
          evidence: cv.claimedValue,
        });
      }
    }
  }

  // Employer background audit integration. The counts here come from the
  // model's own pillar assessment; the client's 100-criteria checklist is
  // computed later and is the number the UI leads with. This finding only
  // adjusts the risk score.
  if (ai.companyAudit) {
    if (ai.companyAudit.overallVerdict === "verified" && !ai.isScamLikely) {
      assessment.findings.push({
        id: "company-audit-passed",
        kind: "trust",
        severity: "medium",
        points: -10,
        reason: `Background Audit: ${ai.companyAudit.companyName} verified (${ai.companyAudit.criteriaPassedCount}/${ai.companyAudit.totalCriteriaCount} criteria satisfied, Score: ${ai.companyAudit.auditScore}/100)`,
        evidence: `${ai.companyAudit.legalStatus.details} | ${ai.companyAudit.physicalOffice.details}`,
      });
    } else if (ai.companyAudit.overallVerdict === "suspicious") {
      assessment.findings.unshift({
        id: "company-audit-failed",
        kind: "risk",
        severity: "high",
        points: 30,
        reason: `Background Audit: ${ai.companyAudit.companyName} failed verification (${ai.companyAudit.criteriaPassedCount}/${ai.companyAudit.totalCriteriaCount} criteria satisfied, Score: ${ai.companyAudit.auditScore}/100)`,
        evidence: `${ai.companyAudit.legalStatus.details} | ${ai.companyAudit.fraudDatabaseCheck.details}`,
      });
      assessment.level = "High";
      assessment.score = Math.min(100, Math.max(assessment.score + 30, 75));
    }
  }
}
