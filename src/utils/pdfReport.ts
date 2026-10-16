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
 * Resolves AI company research, or marks company-level evidence unassessed.
 */
export function resolveCompanyAudit(
  assessment: Assessment,
  companyName: string,
): CompanyAuditChecklist {
  if (assessment.aiIntel?.companyAudit) {
    return applyCriteriaCounts(assessment.aiIntel.companyAudit, assessment);
  }

  // Without an AI company investigation, a low job-post score says nothing
  // about corporate registration, office presence, reviews, or fraud history.
  const unavailable = (title: string): CompanyAuditPillar => ({
    status: "warn",
    title,
    details:
      "Not assessed as a company fact in this scan. Review cited evidence or confirm directly with the employer.",
  });
  const pillars = {
    legalStatus: unavailable("Legal identity not independently assessed"),
    physicalOffice: unavailable("Office location not independently assessed"),
    digitalFootprint: unavailable(
      "Company web presence not independently assessed",
    ),
    employeeReviews: unavailable("Employee reviews not independently assessed"),
    fraudDatabaseCheck: unavailable(
      "Fraud-report history not independently assessed",
    ),
    hiringAuthenticity: unavailable(
      "Hiring process not independently assessed",
    ),
  };

  return applyCriteriaCounts(
    {
      companyName,
      auditScore: 50,
      criteriaPassedCount: 0,
      totalCriteriaCount: 0,
      overallVerdict: "unverified",
      ...pillars,
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
      ? `<div class="c-finding-empty">No negative risk indicators were detected in the evidence available for this scan. This does not confirm that the employer or vacancy is genuine.</div>`
      : assessment.findings
          .map((f) => {
            const isRisk = f.kind === "risk";
            const badgeColor = isRisk ? "#dc2626" : "#059669";
            const badgeBg = isRisk ? "#fee2e2" : "#d1fae5";
            const pointsTag = f.points > 0 ? `+${f.points}` : `${f.points}`;

            return `
          <div class="c-finding-card">
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
        <h2 class="c-section-title"><span>📑</span> AI-assisted claim review</h2>
        <table class="c-audit-table">
          <thead>
            <tr>
              <th>Claim Type</th>
              <th>Recruiter Claim</th>
              <th>AI search summary</th>
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
                    ? "AI REPORTS MATCH ✓"
                    : cv.verifiedStatus === "contradicted"
                      ? "AI REPORTS CONTRADICTION ✗"
                      : "UNCONFIRMED ℹ";
                return `
                <tr>
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

  const aiSources = (assessment.aiIntel?.sources ?? []).filter((source) => {
    try {
      const url = new URL(source.url);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  });
  const noSourcesMessage =
    assessment.aiIntel?.status === "completed"
      ? "No cited search sources were returned for the AI response."
      : "The AI web investigation did not complete, so no AI search citations are available.";
  const sourcesHtml =
    aiSources.length > 0
      ? `<div class="c-section c-no-break"><h2 class="c-section-title">Web pages cited in the AI response</h2><p>These pages were cited in an AI-assisted search response. Review them directly; citations do not independently verify every summary claim.</p><ul>${aiSources.map((source) => `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.title || source.url)}</a></li>`).join("")}</ul></div>`
      : `<div class="c-section"><h2 class="c-section-title">AI search sources</h2><p>${noSourcesMessage}</p></div>`;

  // The 100-criteria checklist, when the engine produced one. Criteria that
  // could not be checked are listed as "not assessed" rather than quietly
  // dropped, and are excluded from the score's denominator.
  const criteria = assessment.criteria;
  const criteriaHtml =
    criteria && criteria.total > 0
      ? `
    <div class="c-section c-no-break">
      <h2 class="c-section-title"><span>📋</span> Automated checklist (${criteria.total} criteria)</h2>
      <p class="c-criteria-summary">These criteria evaluate evidence available in this scan; they are not separate live database checks. Items marked not assessed are excluded from the checklist score.</p>
      <p class="c-criteria-summary">
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
          <div class="c-criteria-group-head">
            <span class="c-criteria-group-title">${escapeHtml(pillar.label)}</span>
            <span class="c-criteria-group-count">${pillar.passed} passed of ${pillar.results.length - pillar.notAssessed} assessed</span>
          </div>
          <ul class="c-criteria-list">
            ${pillar.results
              .map(
                (r) => `
              <li class="c-criteria-item c-criteria-item--${r.status}">
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
                  <span class="c-criteria-source">Evidence to check: ${escapeHtml(r.verifyAgainst)}</span>
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
      color: #0f172a !important;
      background: #ffffff !important;
      line-height: 1.45;
      font-size: 12px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-scheme: light;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    /* Force text visibility for html2canvas rendering */
    * {
      color-scheme: light;
    }

    body, body * {
      color: inherit !important;
      fill: currentColor !important;
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
    .c-criteria-source {
      color: #64748b;
      font-size: 8.5px;
      font-style: italic;
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
  </style>
</head>
<body>
  <div class="c-report-container">
    
    <!-- 1. Header -->
    <header class="c-header">
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
    <div class="c-target-banner">
      <div class="c-target-col-left">
        <div class="c-target-label">Employer in this scan</div>
        <div class="c-target-company">${escapeHtml(companyName)}</div>
        ${jobUrl ? `<a href="${escapeHtml(jobUrl)}" class="c-target-url jc-pdf-link" target="_blank" rel="noopener noreferrer">${escapeHtml(jobUrl)}</a>` : ""}
      </div>
      <div class="c-target-col-right">
        <div class="c-target-label">Assessed checklist result</div>
        <div style="font-size: 16px; font-weight: 800; color: ${themeColor};">
          ${audit.totalCriteriaCount > 0 ? `${audit.criteriaPassedCount} / ${audit.totalCriteriaCount} assessed criteria passed` : "Company details not assessed"}
        </div>
        <div style="font-size: 10.5px; color: #64748b; margin-top: 2px;">Confidence: ${assessment.confidence}</div>
      </div>
    </div>

    <!-- 3. Primary Executive Verdict -->
    <div class="c-verdict-banner">
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
      <h2 class="c-section-title"><span>🏛️</span> Employer research summary</h2>
      <p class="c-criteria-summary">This summary may include AI-generated search findings. It is not an official company verification; check linked sources and confirm important claims directly.</p>
      <div class="c-pillars-grid">
        ${pillarsList
          .map(
            (item) => `
          <div class="c-pillar-card">
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

    <!-- 5a. AI search source links -->
    ${sourcesHtml}

    <!-- 5b. Full 100-criteria checklist (computed, not model-estimated) -->
    ${criteriaHtml}

    <!-- 6. Detailed Findings & Evidence Quotes -->
    <div class="c-section c-no-break">
      <h2 class="c-section-title"><span>🔍</span> Forensic Findings & Evidence Analysis (${assessment.findings.length} Signals Identified)</h2>
      <div class="c-findings-list">
        ${findingsHtml}
      </div>
    </div>

    <!-- 7. Action Plan Checklist -->
    <div class="c-section c-no-break">
      <h2 class="c-section-title"><span>🛡️</span> Step-by-Step Candidate Action Plan</h2>
      <ul class="c-checklist">
        ${assessment.nextSteps
          .map(
            (step) => `
          <li class="c-checklist-item">
            <span class="c-checklist-box">☑</span>
            <span>${escapeHtml(step)}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    </div>

    <!-- 8. Footer -->
    <footer class="c-footer">
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

/**
 * Directly generates and downloads a beautifully styled .pdf file via html2canvas & jsPDF.
 * Renders into high-resolution multi-page PDF without blank pages or layout clipping.
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

  // Create isolated off-screen rendering container - use absolute positioning to ensure proper rendering
  const container = document.createElement("div");
  container.className = "jc-pdf-offscreen-render";
  container.style.position = "absolute";
  container.style.left = "-99999px"; // Far off-screen but in document flow
  container.style.top = "0";
  container.style.width = "794px"; // 210mm at 96 DPI
  container.style.height = "auto";
  container.style.opacity = "1"; // Must be 1 so html2canvas captures full color & contrast!
  container.style.pointerEvents = "none";
  container.style.backgroundColor = "#ffffff";
  container.style.boxSizing = "border-box";
  container.style.padding = "20px 24px";
  container.style.visibility = "visible"; // Ensure it's visible to html2canvas

  // Inject scoped styles and HTML
  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  container.appendChild(styleEl);

  const wrapperEl = document.createElement("div");
  wrapperEl.innerHTML = reportBody;
  container.appendChild(wrapperEl);

  document.body.appendChild(container);

  try {
    // Wait for fonts, images, and layout to fully render
    await new Promise((r) => setTimeout(r, 500));

    // Force layout recalculation
    void container.offsetHeight;

    // Render DOM to high-DPI canvas with explicit error checking
    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(container, {
        scale: 2, // 2x DPI for crisp text and graphics
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 794,
        imageTimeout: 5000,
        removeContainer: true,
      });
    } catch (error) {
      console.error("html2canvas failed:", error);
      throw new Error(`PDF rendering failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Verify canvas has actual content
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error("Canvas rendered with zero dimensions - content not captured");
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2D context from canvas");
    }

    // Check if canvas has any pixel data (simple verification)
    const imageData = ctx.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
    if (imageData.data.length === 0) {
      throw new Error("Canvas appears empty - no pixel data captured");
    }

    // Initialize A4 PDF in mm
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pdfWidth = 210; // A4 width mm
    const pdfHeight = 297; // A4 height mm

    // Extract coordinates of all interactive links relative to container
    const linkElements = container.querySelectorAll("a[href]");
    const containerRect = container.getBoundingClientRect();
    const mmPerPx = pdfWidth / containerRect.width;

    interface PdfLinkMeta {
      url: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }

    const linksMeta: PdfLinkMeta[] = [];
    linkElements.forEach((el) => {
      const a = el as HTMLAnchorElement;
      const href = a.href || a.getAttribute("href");
      if (!href) return;
      const rect = a.getBoundingClientRect();
      const relX = (rect.left - containerRect.left) * mmPerPx;
      const relY = (rect.top - containerRect.top) * mmPerPx;
      const relW = rect.width * mmPerPx;
      const relH = rect.height * mmPerPx;
      linksMeta.push({
        url: href,
        x: relX,
        y: relY,
        w: relW,
        h: relH,
      });
    });

    const pxPerA4Page = Math.floor((canvas.width * pdfHeight) / pdfWidth);
    // The report is rasterised to one tall canvas and then cut into A4 slices,
    // so CSS `page-break-inside: avoid` has no effect — the browser never
    // paginates. Cutting at a fixed offset sliced whichever card happened to
    // straddle it in half, which is what made a component appear half on one
    // page and half on the next. Instead, every cut is nudged back to the
    // nearest fully-blank row, so blocks stay whole.
    const pageBreaks = computePageBreaks(canvas, pxPerA4Page);
    const totalPages = pageBreaks.length + 1;

    let sourceY = 0;
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      if (pageIdx > 0) {
        pdf.addPage();
      }

      const pageEnd = pageBreaks[pageIdx] ?? canvas.height;
      const sourceHeight = Math.max(1, pageEnd - sourceY);
      sourceY = pageEnd;

      // Create a canvas specifically for this page slice
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeight;
      const ctx = pageCanvas.getContext("2d");

      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          sourceY - sourceHeight,
          canvas.width,
          sourceHeight,
          0,
          0,
          canvas.width,
          sourceHeight,
        );
      }

      // Height scales with the slice rather than being stretched to a full A4
      // page, so a short final page is not vertically distorted.
      const sliceStartMm = (sourceY - sourceHeight) * (pdfWidth / canvas.width);
      const sliceHeightMm = sourceHeight * (pdfWidth / canvas.width);

      const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
      // Drawn at the origin of *this* page. `sliceStartMm` is the offset inside
      // the whole document; using it as `y` here would push every page after
      // the first one below the bottom edge of its own A4 sheet.
      pdf.addImage(
        pageImgData,
        "JPEG",
        0,
        0,
        pdfWidth,
        sliceHeightMm,
        undefined,
        "FAST",
      );

      // Place link annotations that land on this page slice
      const pageBottomMm = sliceStartMm + sliceHeightMm;

      for (const link of linksMeta) {
        if (link.y >= sliceStartMm && link.y < pageBottomMm) {
          const pageLocalY = link.y - sliceStartMm;
          pdf.link(
            link.x,
            pageLocalY,
            Math.max(link.w, 10),
            Math.max(link.h, 4),
            { url: link.url },
          );
        }
      }
    }

    pdf.save(filename);
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Whether every sampled pixel across a 1px strip is effectively white.
 * Sampled rather than exhaustive — a row that is white at every 8th column is
 * white enough to cut through.
 */
function isBlankRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
  colStep: number,
): boolean {
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, y, width, 1).data;
  } catch {
    // Canvas is tainted or the read failed — treat as "not blank" so we fall
    // back to the ideal offset rather than producing a wrong cut.
    return false;
  }
  for (let x = 0; x < width; x += colStep) {
    const i = x * 4;
    // 250 rather than 255: anti-aliased page edges and subtle backgrounds would
    // otherwise mean no row ever reads as blank.
    if ((data[i] ?? 255) < 250) return false;
    if ((data[i + 1] ?? 255) < 250) return false;
    if ((data[i + 2] ?? 255) < 250) return false;
  }
  return true;
}

/**
 * Chooses where to cut the rendered report canvas into A4-sized page slices.
 *
 * Returns the end-offset of each page except the last. Each ideal boundary is
 * pulled back to the nearest blank row so a card is never sliced through the
 * middle; if no blank row is found within the search window, the ideal offset
 * is used and the block is cut (unavoidable when content is taller than a page).
 */
function computePageBreaks(
  canvas: HTMLCanvasElement,
  pageHeightPx: number,
): number[] {
  const breaks: number[] = [];
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || pageHeightPx <= 0) {
    for (let y = pageHeightPx; y < canvas.height; y += pageHeightPx)
      breaks.push(y);
    return breaks;
  }

  const colStep = Math.max(1, Math.floor(canvas.width / 200));
  // Never waste more than a fifth of a page looking for a clean cut.
  const lookBack = Math.floor(pageHeightPx * 0.2);

  let pageStart = 0;
  while (pageStart + pageHeightPx < canvas.height) {
    const ideal = pageStart + pageHeightPx;
    let cut = ideal;

    const lowest = Math.max(
      pageStart + Math.floor(pageHeightPx * 0.5),
      ideal - lookBack,
    );
    for (let y = ideal - 1; y >= lowest; y--) {
      if (isBlankRow(ctx, y, canvas.width, colStep)) {
        cut = y;
        break;
      }
    }

    breaks.push(cut);
    pageStart = cut;
  }
  return breaks;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
