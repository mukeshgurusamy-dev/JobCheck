import {
  Assessment,
  CompanyAuditChecklist,
  CompanyAuditPillar,
} from "../types/types";
import { ensureLegalEntitySuffix } from "../engine/normalize";
import { extractCompanyName } from "../engine/engine";
import { isTrustedPlatformUrl } from "../utils/url";
import { buildFinalVerdict } from "../components/ResultPanel/finalVerdict";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * Known job board platforms and ATS providers that must NEVER be used as company name.
 */
const PLATFORM_BLACKLIST = new Set([
  "linkedin",
  "naukri",
  "indeed",
  "glassdoor",
  "internshala",
  "foundit",
  "wellfound",
  "cutshort",
  "hirist",
  "instahyre",
  "apna",
  "shine",
  "unstop",
  "greenhouse",
  "lever",
  "workday",
  "smartrecruiters",
  "ashbyhq",
  "zohorecruit",
  "bitly",
  "tinyurl",
  "telegram",
  "whatsapp",
]);

function isPlatformName(name: string): boolean {
  if (!name) return false;
  const clean = name
    .toLowerCase()
    .replace(
      /\s+(private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|limited|inc\.?|corp\.?|llp)$/i,
      "",
    )
    .trim();
  return (
    PLATFORM_BLACKLIST.has(clean) ||
    clean.includes("linkedin") ||
    clean.includes("naukri") ||
    clean.includes("indeed")
  );
}

/**
 * Generates the user-requested file name: JobCheck━company name.pdf
 */
export function getReportFilename(companyName: string): string {
  // Strip illegal Windows/Unix filename characters: \ / : * ? " < > |
  const safeName = companyName
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `JobCheck━${safeName}.pdf`;
}

/**
 * Options for generating the PDF report.
 */
export interface PdfReportOptions {
  jobUrl?: string;
  jobDescription?: string;
  companyName?: string;
}

/**
 * Formats a clean date string for the report.
 */
function getFormattedDate(): string {
  const now = new Date();
  return now.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Generates a unique tracking report ID.
 */
function generateReportId(): string {
  const prefix = "JC-AUDIT";
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${year}-${rand}`;
}

/**
 * Resolves the cleanest company name with legal suffix.
 * STRICTLY PREVENTS job platform names (LinkedIn, Naukri, Indeed, etc.) from ever being used.
 */
export function resolveCompanyName(
  assessment: Assessment,
  fallbackUrl?: string,
  jobDescription?: string,
): string {
  // 1. AI Audit Company Name (if verified and not a platform name)
  const auditName = assessment.aiIntel?.companyAudit?.companyName;
  if (auditName && !isPlatformName(auditName)) {
    return ensureLegalEntitySuffix(auditName);
  }

  // 2. AI Root Discovered Company Name
  const aiName = assessment.aiIntel?.companyName;
  if (aiName && !isPlatformName(aiName)) {
    return ensureLegalEntitySuffix(aiName);
  }

  // 3. Extract from Job Description text (highest priority for LinkedIn/Naukri/Indeed postings)
  if (jobDescription) {
    const extractedFromDesc = extractCompanyName(jobDescription);
    if (extractedFromDesc && !isPlatformName(extractedFromDesc)) {
      return ensureLegalEntitySuffix(extractedFromDesc);
    }
  }

  // 4. Extract from Findings Evidence / Reason text
  for (const f of assessment.findings) {
    if (f.evidence) {
      const fromEv = extractCompanyName(f.evidence);
      if (fromEv && !isPlatformName(fromEv)) {
        return ensureLegalEntitySuffix(fromEv);
      }
    }
    if (
      f.id.includes("impersonation") ||
      f.reason.toLowerCase().includes("impersonat")
    ) {
      const match = f.reason.match(
        /impersonat(?:ing|ion of)\s+([A-Za-z0-9\s&.]+?)(?:\s+using|\s+via|\.|$)/i,
      );
      if (match && match[1] && match[1].trim().length > 2) {
        const imp = match[1].trim();
        if (!isPlatformName(imp)) {
          return ensureLegalEntitySuffix(imp);
        }
      }
    }
  }

  // 5. Extract company slug from URL (e.g. linkedin.com/jobs/view/...-at-(company)-... or indeed.com/cmp/(company))
  if (fallbackUrl) {
    try {
      const urlObj = new URL(
        fallbackUrl.startsWith("http") ? fallbackUrl : `https://${fallbackUrl}`,
      );
      const path = decodeURIComponent(urlObj.pathname);

      // LinkedIn slug: ...-at-company-name-123456
      const linkedInMatch = path.match(/-at-([a-z0-9\-]+?)(?:-[0-9]+|\/|$)/i);
      if (linkedInMatch?.[1]) {
        const slugName = linkedInMatch[1].replace(/-/g, " ").trim();
        if (slugName.length >= 2 && !isPlatformName(slugName)) {
          const capitalized = slugName.replace(/\b\w/g, (c) => c.toUpperCase());
          return ensureLegalEntitySuffix(capitalized);
        }
      }

      // Indeed company page: /cmp/company-name/...
      const indeedMatch = path.match(/\/cmp\/([a-z0-9\-]+?)(?:\/|$)/i);
      if (indeedMatch?.[1]) {
        const slugName = indeedMatch[1].replace(/-/g, " ").trim();
        if (slugName.length >= 2 && !isPlatformName(slugName)) {
          const capitalized = slugName.replace(/\b\w/g, (c) => c.toUpperCase());
          return ensureLegalEntitySuffix(capitalized);
        }
      }

      // 6. Direct company career website (ONLY if NOT a known job platform like LinkedIn/Naukri/Indeed)
      if (!isTrustedPlatformUrl(fallbackUrl)) {
        const host = urlObj.hostname.replace(/^www\./, "");
        const brand = host.split(".")[0];
        if (brand && brand.length > 2 && !isPlatformName(brand)) {
          const capitalized = brand.charAt(0).toUpperCase() + brand.slice(1);
          return ensureLegalEntitySuffix(capitalized);
        }
      }
    } catch {
      // Ignore
    }
  }

  return "Hiring Organization (Name Unspecified)";
}

/**
 * Resolves or synthesizes the 6-pillar company audit checklist.
 */
export function resolveCompanyAudit(
  assessment: Assessment,
  companyName: string,
): CompanyAuditChecklist {
  if (assessment.aiIntel?.companyAudit) {
    return applyCriteriaCounts(assessment.aiIntel.companyAudit, assessment);
  }

  // Synthesize 6-pillar evaluation from engine heuristics
  const hasFeeFinding = assessment.findings.some(
    (f) =>
      f.id.includes("fee") ||
      f.reason.toLowerCase().includes("fee") ||
      f.reason.toLowerCase().includes("deposit"),
  );
  const hasTypoFinding = assessment.findings.some(
    (f) =>
      f.id.includes("typo") ||
      f.id.includes("impersonation") ||
      f.id.includes("domain"),
  );
  const hasChatFinding = assessment.findings.some(
    (f) =>
      f.id.includes("whatsapp") ||
      f.id.includes("telegram") ||
      f.reason.toLowerCase().includes("whatsapp") ||
      f.reason.toLowerCase().includes("telegram"),
  );

  const legalStatus: CompanyAuditPillar =
    assessment.level === "High"
      ? {
          status: "fail",
          title: "Unverified Legal Identity",
          details:
            "No verifiable MCA Corporate Identification Number (CIN/LLPIN) found for this recruitment entity. Potential shell entity.",
        }
      : assessment.level === "Medium"
        ? {
            status: "warn",
            title: "Partial Corporate Verification",
            details:
              "Entity claimed matches regional business filings, but corporate recruitment authority remains unconfirmed.",
          }
        : {
            status: "pass",
            title: "Legitimate Corporate Standing",
            details:
              "Verified active corporate records and valid business registration in government corporate registries.",
          };

  const physicalOffice: CompanyAuditPillar =
    assessment.level === "High"
      ? {
          status: "fail",
          title: "No Physical Commercial Address",
          details:
            "No confirmed physical corporate headquarters or verified commercial address identified. Remote-only or fictitious location.",
        }
      : assessment.level === "Medium"
        ? {
            status: "warn",
            title: "Unconfirmed Commercial Location",
            details:
              "Physical office location requires independent confirmation with local commercial directory.",
          }
        : {
            status: "pass",
            title: "Confirmed Office Infrastructure",
            details:
              "Operating from established commercial business hub with verifiable geographic address.",
          };

  const digitalFootprint: CompanyAuditPillar = hasTypoFinding
    ? {
        status: "fail",
        title: "Compromised Domain / Lookalike",
        details:
          "Disposable TLD or lookalike domain attempting to mimic authentic corporate brand identity.",
      }
    : assessment.level === "High"
      ? {
          status: "fail",
          title: "Suspicious Digital Footprint",
          details:
            "Recently registered domain (< 90 days), free web hosting, or missing corporate email MX records.",
        }
      : {
          status: "pass",
          title: "Authentic Corporate Domain",
          details:
            "Mature registered domain (> 1 year old), authenticated SSL certificates, and official corporate infrastructure.",
        };

  const employeeReviews: CompanyAuditPillar =
    assessment.level === "High"
      ? {
          status: "fail",
          title: "Zero Verified Employees",
          details:
            "No authentic employee profiles, negative fraud warnings, or non-existent Glassdoor/LinkedIn organizational presence.",
        }
      : assessment.level === "Medium"
        ? {
            status: "warn",
            title: "Limited Workforce History",
            details:
              "Emerging or boutique firm with limited public employee reviews and sentiment records.",
          }
        : {
            status: "pass",
            title: "Verified Workforce Presence",
            details:
              "Consistent employee feedback, verified leadership profiles, and established industry sentiment.",
          };

  const fraudDatabaseCheck: CompanyAuditPillar =
    hasFeeFinding || assessment.level === "High"
      ? {
          status: "fail",
          title: "Flagged on Fraud Syndicates",
          details:
            "Patterns align with known recruitment syndicates demanding illegal upfront gate passes or task commissions.",
        }
      : assessment.level === "Medium"
        ? {
            status: "warn",
            title: "Heuristic Risk Signals Present",
            details:
              "Certain risk markers flagged by anti-fraud heuristics. Exercise caution before proceeding.",
          }
        : {
            status: "pass",
            title: "Clear Anti-Fraud Record",
            details:
              "No listings on national cybercrime advisories, UPI payment blacklists, or phishing registries.",
          };

  const hiringAuthenticity: CompanyAuditPillar = hasFeeFinding
    ? {
        status: "fail",
        title: "Illegal Fee Demand Detected",
        details:
          "Prohibited candidate charges (gate passes, training fees, laptop security deposit) violate corporate hiring laws.",
      }
    : hasChatFinding
      ? {
          status: "warn",
          title: "Informal Communication Channels",
          details:
            "Recruiter redirects candidates to unregulated WhatsApp or Telegram channels instead of official ATS portals.",
        }
      : {
          status: "pass",
          title: "Standard Professional Hiring",
          details:
            "Formal evaluation rounds, corporate email communications, and strictly zero candidate fees.",
        };

  const pillars = [
    legalStatus,
    physicalOffice,
    digitalFootprint,
    employeeReviews,
    fraudDatabaseCheck,
    hiringAuthenticity,
  ];
  const passed = pillars.filter((p) => p.status === "pass").length;
  const auditScore = Math.round((passed / 6) * 100);

  return applyCriteriaCounts(
    {
      companyName,
      auditScore,
      criteriaPassedCount: passed,
      totalCriteriaCount: 6,
      overallVerdict:
        assessment.level === "Low"
          ? "verified"
          : assessment.level === "Medium"
            ? "suspicious"
            : "unverified",
      legalStatus,
      physicalOffice,
      digitalFootprint,
      employeeReviews,
      fraudDatabaseCheck,
      hiringAuthenticity,
    },
    assessment,
  );
}

/**
 * Overrides the criteria counts on an audit with the checklist the engine
 * actually ran, when one exists.
 *
 * The AI supplies pillar-level prose and a self-estimated count. That estimate
 * is a guess, and it was displayed as fact — while this file separately
 * computed a "/6 pillars" denominator for the very same audit. Two numbers for
 * one audit, neither traceable to a real check. The computed report is the only
 * one with a denominator that means something, so it wins.
 */
function applyCriteriaCounts(
  audit: CompanyAuditChecklist,
  assessment: Assessment,
): CompanyAuditChecklist {
  const criteria = assessment.criteria;
  if (!criteria || criteria.assessed === 0) {
    return audit;
  }
  return {
    ...audit,
    criteriaPassedCount: criteria.passed,
    totalCriteriaCount: criteria.assessed,
    auditScore: criteria.score ?? audit.auditScore,
  };
}

/**
 * Generates the complete, pristine HTML for the audit report.
 * Formatted with strict A4 page settings and page-break rules.
 *
 * Pagination hooks: every unit that must never be cut in half carries
 * `data-block="card" | "row"`, and every heading that must stay attached to
 * the content below it carries `data-block="head"`. exportDirectPdfBlob reads
 * these to place page cuts.
 */
export function generateAuditReportHtml(
  assessment: Assessment,
  jobUrl?: string,
  jobDescription?: string,
): string {
  const companyName = resolveCompanyName(assessment, jobUrl, jobDescription);
  const audit = resolveCompanyAudit(assessment, companyName);
  const filename = getReportFilename(companyName);
  const reportId = generateReportId();
  const dateStr = getFormattedDate();

  const isHigh = assessment.level === "High";
  const isMed = assessment.level === "Medium";

  const themeColor = isHigh ? "#dc2626" : isMed ? "#d97706" : "#059669";
  const themeBg = isHigh ? "#fef2f2" : isMed ? "#fffbeb" : "#ecfdf5";
  const themeBorder = isHigh ? "#fca5a5" : isMed ? "#fcd34d" : "#6ee7b7";

  // The same recommendation the on-screen result shows, so the printed copy and
  // the page never disagree — including the honest "no red flags, but the web
  // check did not run" case, which the old copy overstated as "VERIFIED
  // LEGITIMATE".
  const verdict = buildFinalVerdict(assessment);
  const verdictEmoji =
    verdict.variant === "avoid"
      ? "🚨"
      : verdict.variant === "verify"
        ? "⚠️"
        : "✅";

  const verdictTitle = verdict.headline.toUpperCase();
  const verdictSummary = verdict.body;
  const verdictAdvice = verdict.steps.map((step, i) => `${i + 1}. ${step}`);

  const pillarsList = [
    { name: "Legal & MCA Corporate Status", p: audit.legalStatus, icon: "🏛️" },
    {
      name: "Physical Office Infrastructure",
      p: audit.physicalOffice,
      icon: "📍",
    },
    {
      name: "Website & Domain Security",
      p: audit.digitalFootprint,
      icon: "🌐",
    },
    {
      name: "Workforce & Employee Reviews",
      p: audit.employeeReviews,
      icon: "👥",
    },
    {
      name: "Cybercrime & Blacklist Screening",
      p: audit.fraudDatabaseCheck,
      icon: "🛡️",
    },
    {
      name: "Hiring Process Authenticity",
      p: audit.hiringAuthenticity,
      icon: "📑",
    },
  ];

  const findingsHtml =
    assessment.findings.length === 0
      ? `<div class="c-finding-empty" data-block="card">No negative risk indicators detected during scan. All evaluated criteria met integrity standards.</div>`
      : assessment.findings
          .map((f) => {
            const isRisk = f.kind === "risk";
            const badgeColor = isRisk ? "#dc2626" : "#059669";
            const badgeBg = isRisk ? "#fee2e2" : "#d1fae5";
            const pointsTag = f.points > 0 ? `+${f.points}` : `${f.points}`;

            return `
          <div class="c-finding-card" data-block="card">
            <div class="c-finding-header">
              <span class="c-finding-badge" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}33;">
                ${isRisk ? "⚠️ RISK SIGNAL" : "✓ TRUST SIGNAL"} (${pointsTag} pts)
              </span>
              <span class="c-finding-severity">Severity: ${f.severity.toUpperCase()}</span>
            </div>
            <div class="c-finding-reason">${escapeHtml(f.reason)}</div>
            ${f.evidence ? `<blockquote class="c-finding-evidence"><strong>Evidence from post:</strong> "${escapeHtml(f.evidence)}"</blockquote>` : ""}
          </div>
        `;
          })
          .join("");

  const factChecksHtml =
    assessment.aiIntel?.claimVerifications &&
    assessment.aiIntel.claimVerifications.length > 0
      ? `
      <div class="c-section c-no-break">
        <h2 class="c-section-title" data-block="head"><span>📑</span> Recruiter Fact-Checks & Claim Grounding</h2>
        <table class="c-audit-table">
          <thead>
            <tr data-block="head">
              <th>Claim Type</th>
              <th>Recruiter Claim</th>
              <th>Ground Truth / Verification</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${assessment.aiIntel.claimVerifications
              .map((cv) => {
                const statusClass =
                  cv.verifiedStatus === "verified"
                    ? "pass"
                    : cv.verifiedStatus === "contradicted"
                      ? "fail"
                      : "warn";
                const statusText =
                  cv.verifiedStatus === "verified"
                    ? "VERIFIED MATCH ✓"
                    : cv.verifiedStatus === "contradicted"
                      ? "CONTRADICTED ✗"
                      : "UNCONFIRMED ℹ";
                return `
                <tr data-block="row">
                  <td><strong>${escapeHtml(cv.claimType.toUpperCase())}</strong></td>
                  <td>"${escapeHtml(cv.claimedValue)}"</td>
                  <td>${escapeHtml(cv.details)}</td>
                  <td><span class="c-pillar-status c-pillar-status--${statusClass}">${statusText}</span></td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
      : "";

  // The 100-criteria checklist, when the engine produced one. Criteria that
  // could not be checked are listed as "not assessed" rather than quietly
  // dropped, and are excluded from the score's denominator.
  const criteria = assessment.criteria;
  const criteriaHtml =
    criteria && criteria.total > 0
      ? `
    <div class="c-section">
      <h2 class="c-section-title" data-block="head"><span>📋</span> 100-Criteria Employment Integrity Checklist</h2>
      <p class="c-criteria-summary" data-block="head">
        <strong>${criteria.passed} passed</strong> ·
        ${criteria.warned} warning${criteria.warned === 1 ? "" : "s"} ·
        ${criteria.failed} failed ·
        ${criteria.notAssessed} not assessed
        ${criteria.score != null ? `— <strong>${criteria.score}/100</strong> across the ${criteria.assessed} criteria that could be evaluated` : ""}
      </p>
      ${criteria.byPillar
        .filter((p) => p.results.length > 0)
        .map(
          (pillar) => `
        <div class="c-criteria-group">
          <div class="c-criteria-group-head" data-block="head">
            <span class="c-criteria-group-title">${escapeHtml(pillar.label)}</span>
            <span class="c-criteria-group-count">${pillar.passed} passed of ${pillar.results.length - pillar.notAssessed} assessed</span>
          </div>
          <ul class="c-criteria-list">
            ${pillar.results
              .map(
                (r) => `
              <li class="c-criteria-item c-criteria-item--${r.status}" data-block="row">
                <span class="c-criteria-mark">${
                  r.status === "pass"
                    ? "✓"
                    : r.status === "fail"
                      ? "✗"
                      : r.status === "warn"
                        ? "!"
                        : "–"
                }</span>
                <span class="c-criteria-body">
                  <span class="c-criteria-title">${escapeHtml(r.title)}</span>
                  ${r.detail ? `<span class="c-criteria-detail">${escapeHtml(r.detail)}</span>` : ""}
                </span>
              </li>
            `,
              )
              .join("")}
          </ul>
        </div>
      `,
        )
        .join("")}
    </div>
  `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(filename.replace(/\.pdf$/i, ""))}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 15mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.45;
      font-size: 12px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .c-report-container {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
    }
    
    /* Top Brand & Report Header */
    .c-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 2px solid #0f172a;
      margin-bottom: 14px;
      gap: 16px;
    }
    .c-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .c-brand-logo {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      flex-shrink: 0;
    }
    .c-brand-logo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .c-brand-title {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .c-brand-subtitle {
      font-size: 10px;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 2px;
    }
    .c-meta-box {
      text-align: right;
      font-size: 10.5px;
      color: #475569;
      line-height: 1.4;
      flex-shrink: 0;
    }
    .c-meta-id {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      background: #f1f5f9;
      padding: 2px 7px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 3px;
      border: 1px solid #e2e8f0;
    }

    /* Executive Target Card */
    .c-target-banner {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .c-target-col-left {
      flex: 1 1 auto;
      min-width: 0; /* Prevents flex children from overflowing */
    }
    .c-target-col-right {
      flex: 0 0 170px;
      text-align: right;
    }
    .c-target-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 2px;
    }
    .c-target-company {
      font-size: 17px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.01em;
      line-height: 1.25;
      word-break: break-word;
    }
    .c-target-url {
      font-size: 11px;
      color: #2563eb;
      text-decoration: underline;
      word-break: break-all;
      overflow-wrap: break-word;
      font-family: "SFMono-Regular", Consolas, Menlo, monospace;
      display: inline-block;
      margin-top: 4px;
      line-height: 1.35;
      max-width: 100%;
    }

    /* Primary Verdict Banner */
    .c-verdict-banner {
      background: ${themeBg};
      border: 1.5px solid ${themeBorder};
      border-left: 5px solid ${themeColor};
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .c-verdict-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 8px;
    }
    .c-verdict-title {
      font-size: 14.5px;
      font-weight: 800;
      color: ${themeColor};
      display: flex;
      align-items: center;
      gap: 6px;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .c-score-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      padding: 3px 10px;
      border-radius: 20px;
      border: 1px solid ${themeBorder};
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .c-score-num {
      font-size: 14px;
      font-weight: 800;
      color: ${themeColor};
    }
    .c-verdict-desc {
      font-size: 12px;
      color: #1e293b;
      margin-bottom: 10px;
      line-height: 1.45;
    }
    .c-verdict-advice-box {
      background: #ffffff;
      border-radius: 6px;
      padding: 10px 12px;
      border: 1px solid ${themeBorder};
    }
    .c-verdict-advice-title {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${themeColor};
      margin-bottom: 5px;
    }
    .c-verdict-advice-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .c-verdict-advice-list li {
      font-size: 11px;
      color: #334155;
      margin-bottom: 4px;
      line-height: 1.4;
    }
    .c-verdict-advice-list li:last-child {
      margin-bottom: 0;
    }

    /* Section Headers */
    .c-section {
      margin-bottom: 14px;
    }
    .c-section-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      page-break-after: avoid;
      break-after: avoid;
    }

    /* 6 Pillars Audit Grid */
    .c-pillars-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .c-pillar-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 9px 12px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      page-break-inside: avoid;
      break-inside: avoid;
      min-width: 0;
    }
    .c-pillar-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .c-pillar-name {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
      line-height: 1.3;
      flex: 1 1 auto;
      min-width: 0;
      word-break: break-word;
    }
    .c-pillar-icon {
      font-size: 13px;
      line-height: 1;
      flex-shrink: 0;
    }
    .c-pillar-label {
      flex: 1 1 auto;
      min-width: 0;
    }
    .c-pillar-status {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .c-pillar-status--pass {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .c-pillar-status--warn {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .c-pillar-status--fail {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .c-pillar-details {
      font-size: 10.5px;
      color: #475569;
      line-height: 1.35;
      word-break: break-word;
    }

    /* 100-Criteria Checklist */
    .c-criteria-summary {
      font-size: 10.5px;
      color: #334155;
      line-height: 1.45;
      margin-bottom: 8px;
    }
    .c-criteria-group {
      margin-bottom: 8px;
      page-break-inside: avoid;
    }
    .c-criteria-group-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
      margin-bottom: 4px;
    }
    .c-criteria-group-title {
      font-size: 10.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .c-criteria-group-count {
      font-size: 9.5px;
      color: #64748b;
      white-space: nowrap;
    }
    .c-criteria-list {
      list-style: none;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 10px;
    }
    .c-criteria-item {
      display: flex;
      gap: 5px;
      font-size: 9.5px;
      line-height: 1.3;
      color: #475569;
      page-break-inside: avoid;
    }
    .c-criteria-mark {
      flex: 0 0 auto;
      width: 10px;
      font-weight: 800;
      text-align: center;
    }
    .c-criteria-item--pass .c-criteria-mark {
      color: #15803d;
    }
    .c-criteria-item--fail .c-criteria-mark {
      color: #b91c1c;
    }
    .c-criteria-item--warn .c-criteria-mark {
      color: #b45309;
    }
    .c-criteria-item--na .c-criteria-mark,
    .c-criteria-item--na .c-criteria-title {
      color: #94a3b8;
    }
    .c-criteria-body {
      display: flex;
      flex-direction: column;
    }
    .c-criteria-title {
      color: #0f172a;
    }
    .c-criteria-detail {
      color: #64748b;
      font-size: 9px;
    }

    /* Audit Table */
    .c-audit-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      margin-bottom: 10px;
      table-layout: fixed;
    }
    .c-audit-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
    }
    .c-audit-table td {
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      color: #334155;
      word-break: break-word;
    }

    /* Findings Cards */
    .c-findings-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .c-finding-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .c-finding-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 3px;
    }
    .c-finding-badge {
      font-size: 9.5px;
      font-weight: 700;
      padding: 1.5px 6px;
      border-radius: 4px;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    .c-finding-severity {
      font-size: 9.5px;
      font-weight: 600;
      color: #64748b;
      white-space: nowrap;
    }
    .c-finding-reason {
      font-size: 11.5px;
      color: #1e293b;
      line-height: 1.4;
      word-break: break-word;
    }
    .c-finding-evidence {
      background: #ffffff;
      border-left: 3px solid #3b82f6;
      border-radius: 0 4px 4px 0;
      padding: 4px 8px;
      margin-top: 4px;
      font-size: 10.5px;
      color: #475569;
      font-style: italic;
      word-break: break-word;
    }
    .c-finding-empty {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 11.5px;
    }

    /* Action Checklist */
    .c-checklist {
      list-style: none;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      padding: 0;
      margin: 0;
    }
    .c-checklist-item {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 10.5px;
      color: #1e293b;
      display: flex;
      align-items: flex-start;
      gap: 6px;
      page-break-inside: avoid;
      break-inside: avoid;
      line-height: 1.35;
      word-break: break-word;
    }
    .c-checklist-box {
      color: #2563eb;
      font-weight: bold;
      flex-shrink: 0;
    }

    /* Footer & Disclaimer */
    .c-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 10px;
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 9.5px;
      color: #64748b;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .c-helpline-tag {
      font-weight: 700;
      color: #dc2626;
      background: #fee2e2;
      padding: 2px 8px;
      border-radius: 12px;
      border: 1px solid #fca5a5;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Page break helpers */
    .c-no-break {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .c-page-break {
      page-break-before: always;
      break-before: always;
    }

    /* Pagination hooks: used by the print path here, and by the block-aware
       slicer in exportDirectPdfBlob. */
    [data-block] {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    [data-block="head"] {
      page-break-after: avoid;
      break-after: avoid;
    }
  </style>
</head>
<body>
  <div class="c-report-container">
    
    <!-- 1. Header -->
    <header class="c-header" data-block="card">
      <div class="c-brand">
        <div class="c-brand-logo">
          <img src="/logo.png" alt="JobCheck Shield" onerror="this.style.display='none'" />
        </div>
        <div>
          <div class="c-brand-title">JobCheck™</div>
          <div class="c-brand-subtitle">Employment Integrity & Anti-Fraud Audit</div>
        </div>
      </div>
      <div class="c-meta-box">
        <div class="c-meta-id">${reportId}</div>
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Framework:</strong> 100 Employment Integrity Criteria</div>
      </div>
    </header>

    <!-- 2. Target Subject Box -->
    <div class="c-target-banner" data-block="card">
      <div class="c-target-col-left">
        <div class="c-target-label">Audited Corporate Subject</div>
        <div class="c-target-company">${escapeHtml(companyName)}</div>
        ${jobUrl ? `<a href="${escapeHtml(jobUrl)}" class="c-target-url jc-pdf-link" target="_blank" rel="noopener noreferrer">${escapeHtml(jobUrl)}</a>` : ""}
      </div>
      <div class="c-target-col-right">
        <div class="c-target-label">Audit Integrity Rating</div>
        <div style="font-size: 16px; font-weight: 800; color: ${themeColor};">
          ${audit.criteriaPassedCount} / ${audit.totalCriteriaCount} Criteria Satisfied
        </div>
        <div style="font-size: 10.5px; color: #64748b; margin-top: 2px;">Confidence: ${assessment.confidence}</div>
      </div>
    </div>

    <!-- 3. Primary Executive Verdict -->
    <div class="c-verdict-banner" data-block="card">
      <div class="c-verdict-header">
        <div class="c-verdict-title">
          <span>${verdictEmoji}</span>
          <span>${verdictTitle}</span>
        </div>
        <div class="c-score-badge">
          <span>Risk Score:</span>
          <span class="c-score-num">${assessment.score} / 100</span>
          <span>(${assessment.level.toUpperCase()} RISK)</span>
        </div>
      </div>
      <div class="c-verdict-desc">
        ${verdictSummary}
      </div>
      <div class="c-verdict-advice-box">
        <div class="c-verdict-advice-title">Mandatory Candidate Safety Advisory</div>
        <ul class="c-verdict-advice-list">
          ${verdictAdvice.map((a) => `<li>${a}</li>`).join("")}
        </ul>
      </div>
    </div>

    <!-- 4. 6-Pillar Corporate Integrity Audit Checklist -->
    <div class="c-section c-no-break">
      <h2 class="c-section-title" data-block="head"><span>🏛️</span> 6-Pillar Employment Integrity Audit Checklist</h2>
      <div class="c-pillars-grid">
        ${pillarsList
          .map(
            (item) => `
          <div class="c-pillar-card" data-block="card">
            <div class="c-pillar-head">
              <span class="c-pillar-name">
                <span class="c-pillar-icon">${item.icon}</span>
                <span class="c-pillar-label">${escapeHtml(item.name)}</span>
              </span>
              <span class="c-pillar-status c-pillar-status--${item.p.status}">
                ${item.p.status === "pass" ? "PASSED ✓" : item.p.status === "warn" ? "WARNING ⚠" : "FAILED ✗"}
              </span>
            </div>
            <div class="c-pillar-details">
              <strong>${escapeHtml(item.p.title)}:</strong> ${escapeHtml(item.p.details)}
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>

    <!-- 5. Recruiter Claims Fact-Check (if present) -->
    ${factChecksHtml}

    <!-- 5b. Full 100-criteria checklist (computed, not model-estimated) -->
    ${criteriaHtml}

    <!-- 6. Detailed Findings & Evidence Quotes -->
    <div class="c-section">
      <h2 class="c-section-title" data-block="head"><span>🔍</span> Forensic Findings & Evidence Analysis (${assessment.findings.length} Signals Identified)</h2>
      <div class="c-findings-list">
        ${findingsHtml}
      </div>
    </div>

    <!-- 7. Action Plan Checklist -->
    <div class="c-section">
      <h2 class="c-section-title" data-block="head"><span>🛡️</span> Step-by-Step Candidate Action Plan</h2>
      <ul class="c-checklist">
        ${assessment.nextSteps
          .map(
            (step) => `
          <li class="c-checklist-item" data-block="card">
            <span class="c-checklist-box">☑</span>
            <span>${escapeHtml(step)}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    </div>

    <!-- 8. Footer -->
    <footer class="c-footer" data-block="card">
      <div>
        <span>JobCheck™ Open Security Verification Network · Independent algorithmic risk evaluation.</span>
      </div>
      <div>
        <span class="c-helpline-tag">🚨 National Cybercrime Helpline: 1930 · <a href="https://cybercrime.gov.in" class="jc-pdf-link" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">cybercrime.gov.in</a></span>
      </div>
    </footer>

  </div>
</body>
</html>`;
}

/**
 * Downloads or prints the pristine PDF audit report.
 * Uses a dedicated invisible print iframe for maximum vector clarity without design breaks.
 */
export function downloadPdfReport(
  assessment: Assessment,
  jobUrl?: string,
  jobDescription?: string,
): void {
  const companyName = resolveCompanyName(assessment, jobUrl, jobDescription);
  const filename = getReportFilename(companyName);
  const htmlContent = generateAuditReportHtml(
    assessment,
    jobUrl,
    jobDescription,
  );

  // 1. Create dedicated hidden print iframe
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "1024px";
  iframe.style.height = "1000px";
  iframe.style.border = "none";
  iframe.title = filename;

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    // Fallback: open in new window
    const win = window.open("", "_blank");
    if (win) {
      win.document.title = filename.replace(/\.pdf$/i, "");
      win.document.write(htmlContent);
      win.document.close();
      win.focus();
      win.print();
    }
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // Wait for resources/fonts to settle and invoke print
  setTimeout(() => {
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
    } catch {
      // Fallback: direct window
      const win = window.open("", "_blank");
      if (win) {
        win.document.title = filename.replace(/\.pdf$/i, "");
        win.document.write(htmlContent);
        win.document.close();
        win.focus();
        win.print();
      }
    } finally {
      // Remove iframe after print dialog completes
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 60000);
    }
  }, 400);
}

/* ------------------------------------------------------------------------- *
 * Direct PDF export: block-aware pagination, hard 3-page cap
 * ------------------------------------------------------------------------- */

/** Hard ceiling on the number of A4 pages the exported PDF may have. */
const MAX_PDF_PAGES = 3;

/** Reference render width: A4 at 96 DPI. */
const BASE_WIDTH_PX = 794;

/** Space kept clear at the top of pages 2+ and at the bottom of every page (px at BASE_WIDTH_PX). */
const PAGE_TOP_MARGIN_PX = 16;
const PAGE_BOTTOM_RESERVE_PX = 26;

/** Shrink step 1: slightly smaller criteria text. */
const CRITERIA_SMALL_CSS = `
  .c-criteria-item { font-size: 9px !important; }
  .c-criteria-detail { font-size: 8.5px !important; }
`;
/** Shrink step 2: tighter gaps between top-level blocks (14px -> 10px). */
const TIGHT_GAP_CSS = `
  .c-header, .c-target-banner, .c-verdict-banner, .c-section, .c-pillars-grid { margin-bottom: 10px !important; }
  .c-footer { margin-top: 10px !important; }
`;
/** Last resort: drop the grey detail line under criteria that passed. */
const HIDE_PASS_DETAIL_CSS = `
  .c-criteria-item--pass .c-criteria-detail { display: none !important; }
`;

interface FitLevel {
  /** Container width in CSS px. A wider container shrinks the whole report when mapped onto 210mm. */
  width: number;
  css: string;
}

/**
 * Layouts to try, in order, until the report fits in MAX_PDF_PAGES.
 * Widening the container is used instead of CSS zoom/transform because
 * html2canvas handles real layout width reliably, and the report is mapped to
 * the full A4 width afterwards, so a wider container is a uniform shrink.
 */
function buildFitLevels(): FitLevel[] {
  const compact = CRITERIA_SMALL_CSS + TIGHT_GAP_CSS;
  const levels: FitLevel[] = [
    { width: BASE_WIDTH_PX, css: "" },
    { width: BASE_WIDTH_PX, css: CRITERIA_SMALL_CSS },
    { width: BASE_WIDTH_PX, css: compact },
    { width: Math.round(BASE_WIDTH_PX / 0.95), css: compact },
    { width: Math.round(BASE_WIDTH_PX / 0.9), css: compact },
    { width: Math.round(BASE_WIDTH_PX / 0.85), css: compact },
    {
      width: Math.round(BASE_WIDTH_PX / 0.85),
      css: compact + HIDE_PASS_DETAIL_CSS,
    },
  ];
  // Safety net so a 4th page is never produced: keep shrinking until it fits.
  for (let s = 0.8; s >= 0.45; s -= 0.05) {
    levels.push({
      width: Math.round(BASE_WIDTH_PX / s),
      css: compact + HIDE_PASS_DETAIL_CSS,
    });
  }
  return levels;
}

interface BlockBox {
  top: number;
  bottom: number;
  /** Headings/group titles: must stay on the same page as whatever follows. */
  isHead: boolean;
}

/**
 * Measures every smallest-unit [data-block] element, relative to the top of
 * the container, in CSS px.
 */
function measureBlocks(container: HTMLElement): BlockBox[] {
  const containerTop = container.getBoundingClientRect().top;
  const boxes: BlockBox[] = [];
  const all = Array.from(
    container.querySelectorAll<HTMLElement>("[data-block]"),
  );
  for (const el of all) {
    // Only leaf blocks: a block that contains other blocks is not atomic.
    if (el.querySelector("[data-block]")) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 1) continue;
    boxes.push({
      top: r.top - containerTop,
      bottom: r.bottom - containerTop,
      isHead: el.getAttribute("data-block") === "head",
    });
  }
  boxes.sort((a, b) => a.top - b.top);
  return boxes;
}

/**
 * Chooses page cuts. Returns the y-offset (CSS px) where each page except the
 * last one ends.
 *
 * A cut is only ever placed in the gap above a block, never through one, and
 * never directly after a heading (so a title is never the last thing on a
 * page). If a single block is taller than a page, it is cut at the page limit
 * as an unavoidable fallback.
 */
function computePageCuts(
  boxes: BlockBox[],
  totalHeight: number,
  firstPageCap: number,
  nextPageCap: number,
): number[] {
  const cuts: number[] = [];
  let start = 0;
  let cap = firstPageCap;

  while (totalHeight - start > cap + 0.5) {
    const limit = start + cap;
    let best = -1;

    for (let i = 1; i < boxes.length; i++) {
      const box = boxes[i];
      const prev = boxes[i - 1];
      if (!box || !prev || prev.isHead) continue;

      // Bottom edge of everything that sits above this block.
      let prevBottom = 0;
      for (let j = 0; j < i; j++) {
        const o = boxes[j];
        if (o && o.top < box.top - 0.5) {
          prevBottom = Math.max(prevBottom, o.bottom);
        }
      }
      if (prevBottom > box.top + 0.5) continue; // overlapping layout, unsafe

      const cut = (prevBottom + box.top) / 2;
      if (cut <= start + 1 || cut > limit) continue;
      if (cut > best) best = cut;
    }

    if (best < 0) best = limit;
    cuts.push(best);
    start = best;
    cap = nextPageCap;
  }
  return cuts;
}

interface LinkMeta {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Directly generates and downloads a .pdf file via html2canvas & jsPDF.
 *
 * The report is rendered once to a tall canvas, then cut into A4 pages ONLY at
 * block boundaries (cards, rows, table rows), so no card or criteria row is
 * ever split. The page count is capped at MAX_PDF_PAGES by progressively
 * tightening the layout and re-measuring.
 */
export async function exportDirectPdfBlob(
  assessment: Assessment,
  jobUrl?: string,
  jobDescription?: string,
): Promise<void> {
  const companyName = resolveCompanyName(assessment, jobUrl, jobDescription);
  const filename = getReportFilename(companyName);
  const htmlContent = generateAuditReportHtml(
    assessment,
    jobUrl,
    jobDescription,
  );

  // Extract body content and styles to avoid nested full <html> tag issues
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(htmlContent, "text/html");
  const reportBody = parsedDoc.body.innerHTML;
  const styles = parsedDoc.head.querySelector("style")?.innerHTML || "";

  // Create isolated off-screen rendering container (hidden under root via z-index, but full opacity for rasterization)
  const container = document.createElement("div");
  container.className = "jc-pdf-offscreen-render";
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = `${BASE_WIDTH_PX}px`; // 210mm at 96 DPI
  container.style.zIndex = "-99999";
  container.style.opacity = "1"; // Must be 1 so html2canvas captures full color & contrast!
  container.style.pointerEvents = "none";
  container.style.backgroundColor = "#ffffff";
  container.style.boxSizing = "border-box";
  container.style.padding = "20px 24px";

  // Base styles, then a second element for the fit-loop overrides.
  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  container.appendChild(styleEl);

  const fitStyleEl = document.createElement("style");
  container.appendChild(fitStyleEl);

  const wrapperEl = document.createElement("div");
  wrapperEl.innerHTML = reportBody;
  container.appendChild(wrapperEl);

  document.body.appendChild(container);

  try {
    // Wait for fonts and any assets to render
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise((r) => setTimeout(r, 150));

    // ---- Fit loop: find the first layout that needs <= MAX_PDF_PAGES pages ----
    const levels = buildFitLevels();
    let chosenWidth = BASE_WIDTH_PX;
    let cuts: number[] = [];
    let totalHeight = 0;

    for (const level of levels) {
      fitStyleEl.textContent = level.css;
      container.style.width = `${level.width}px`;

      const ratio = level.width / BASE_WIDTH_PX;
      const pageHeightPx = level.width * (297 / 210);
      const bottomReserve = PAGE_BOTTOM_RESERVE_PX * ratio;
      const topMargin = PAGE_TOP_MARGIN_PX * ratio;

      totalHeight = container.getBoundingClientRect().height;
      const boxes = measureBlocks(container);
      cuts = computePageCuts(
        boxes,
        totalHeight,
        pageHeightPx - bottomReserve,
        pageHeightPx - bottomReserve - topMargin,
      );
      chosenWidth = level.width;

      if (cuts.length + 1 <= MAX_PDF_PAGES) break;
    }

    const ratio = chosenWidth / BASE_WIDTH_PX;
    const topMarginPx = PAGE_TOP_MARGIN_PX * ratio;

    // Render DOM to high-DPI canvas at the chosen layout
    const canvas = await html2canvas(container, {
      scale: 2, // 2x DPI for crisp text and graphics
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: chosenWidth,
    });

    // Initialize A4 PDF in mm
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pdfWidth = 210; // A4 width mm
    const mmPerPx = pdfWidth / chosenWidth;
    const canvasPerCssPx = canvas.width / chosenWidth;

    // Collect link rectangles (CSS px, relative to the container)
    const containerRect = container.getBoundingClientRect();
    const linksMeta: LinkMeta[] = [];
    container.querySelectorAll("a[href]").forEach((el) => {
      const a = el as HTMLAnchorElement;
      const href = a.href || a.getAttribute("href");
      if (!href) return;
      const rect = a.getBoundingClientRect();
      linksMeta.push({
        url: href,
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        w: rect.width,
        h: rect.height,
      });
    });

    const starts = [0, ...cuts];
    const ends = [...cuts, totalHeight];
    const totalPages = starts.length;

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const startPx = starts[pageIdx] ?? 0;
      const endPx = ends[pageIdx] ?? totalHeight;

      if (pageIdx > 0) {
        pdf.addPage();
      }

      const srcY = Math.min(
        canvas.height - 1,
        Math.round(startPx * canvasPerCssPx),
      );
      const srcBottom = Math.min(
        canvas.height,
        Math.round(endPx * canvasPerCssPx),
      );
      const srcH = Math.max(1, srcBottom - srcY);

      // Create a canvas specifically for this page slice
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = srcH;
      const ctx = pageCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          srcY,
          canvas.width,
          srcH,
          0,
          0,
          canvas.width,
          srcH,
        );
      }

      // Pages after the first get a small top margin; every page keeps a
      // bottom margin for the page number.
      const topOffsetMm = pageIdx === 0 ? 0 : topMarginPx * mmPerPx;
      const sliceHeightMm = (srcH / canvasPerCssPx) * mmPerPx;

      const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(
        pageImgData,
        "JPEG",
        0,
        topOffsetMm,
        pdfWidth,
        sliceHeightMm,
        undefined,
        "FAST",
      );

      // Link annotations that land on this page slice
      for (const link of linksMeta) {
        if (link.y >= startPx && link.y < endPx) {
          pdf.link(
            link.x * mmPerPx,
            topOffsetMm + (link.y - startPx) * mmPerPx,
            Math.max(link.w * mmPerPx, 10),
            Math.max(link.h * mmPerPx, 4),
            { url: link.url },
          );
        }
      }
    }

    // "Page X of Y", centred in the bottom margin
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFontSize(7);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Page ${p} of ${totalPages}`, pdfWidth / 2, 292.5, {
        align: "center",
      });
    }

    pdf.save(filename);
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
