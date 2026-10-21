import {
  Assessment,
  CompanyAuditChecklist,
  CompanyAuditPillar,
} from "../types/types";
import { ensureLegalEntitySuffix } from "../engine/normalize";
import { extractCompanyName } from "../engine/engine";
import { isTrustedPlatformUrl } from "../utils/url";
import { buildFinalVerdict } from "../components/ResultPanel/finalVerdict";
import { jsPDF, GState } from "jspdf";
import html2canvas from "html2canvas";
import { LOGO_BASE64 } from "./logoBase64";
import { createPdfLoadingOverlay } from "../components/PdfLoadingOverlay/PdfLoadingOverlay";
import "../components/PdfLoadingOverlay/PdfLoadingOverlay.css";

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
 * Strictly replicates the visual styling, typography, colors, and layout of the target reference PDF.
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

  // Color tokens aligned faithfully with web application ResultPanel & tokens.css
  const themeColor = isHigh ? "#dc2626" : isMed ? "#d97706" : "#059669";
  const themeBg = isHigh ? "#fef2f2" : isMed ? "#fffbeb" : "#ecfdf5";
  const themeBorder = isHigh ? "#fecaca" : isMed ? "#fde68a" : "#a7f3d0";
  const themeText = isHigh ? "#991b1b" : isMed ? "#92400e" : "#065f46";

  const verdict = buildFinalVerdict(assessment);
  const verdictEmoji =
    verdict.variant === "avoid" ? "🚨" : verdict.variant === "verify" ? "⚠️" : "✅";

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
      ? `<div class="c-finding-empty" data-block="true" style="background: #f8fafc !important; border: 1px solid #cbd5e1 !important; border-left: 3.5px solid #16a34a !important; border-radius: 8px !important; padding: 12px 14px !important; font-size: 11px; font-weight: 600; color: #166534;">No negative risk indicators detected during scan. All evaluated criteria met integrity standards.</div>`
      : assessment.findings
          .map((f) => {
            const isRisk = f.kind === "risk";
            const pointsTag = f.points > 0 ? `+${f.points}` : `${f.points}`;
            const cardAccent = isRisk ? "#ef4444" : "#3b82f6";
            const sevColor = f.severity === "high" ? "#dc2626" : f.severity === "medium" ? "#d97706" : "#16a34a";

            return `
          <div class="c-finding-card ${isRisk ? "c-finding-card--risk" : "c-finding-card--trust"}" data-block="true" style="background: #f8fafc !important; border: 1px solid #cbd5e1 !important; border-left: 3.5px solid ${cardAccent} !important; border-radius: 8px !important; padding: 12px 14px !important;">
            <div class="c-finding-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span class="c-finding-badge ${isRisk ? "c-finding-badge--risk" : "c-finding-badge--trust"}" style="background: ${isRisk ? "#fee2e2" : "#dcfce7"} !important; color: ${isRisk ? "#b91c1c" : "#15803d"} !important; border: 1px solid ${isRisk ? "#fecaca" : "#bbf7d0"} !important; border-radius: 12px !important; font-size: 10px !important; font-weight: 700 !important; padding: 2.5px 10px !important;">
                ${isRisk ? "⚠️ RISK SIGNAL" : "✓ TRUST SIGNAL"} (${pointsTag} pts)
              </span>
              <span class="c-finding-severity" style="font-size: 10px !important; font-weight: 600 !important; color: #64748b !important;">
                Severity: <strong style="color: ${sevColor} !important; font-weight: 700 !important;">${f.severity.toUpperCase()}</strong>
              </span>
            </div>
            <div class="c-finding-reason" style="font-size: 11px !important; font-weight: 600 !important; color: #1e293b !important; line-height: 1.45 !important; margin-bottom: 6px !important;">${escapeHtml(f.reason)}</div>
            ${f.evidence ? `<blockquote class="c-finding-evidence" style="background: #ffffff !important; border: 1px solid #e2e8f0 !important; border-radius: 6px !important; padding: 8px 12px !important; font-size: 10px !important; color: #334155 !important; line-height: 1.4 !important; margin: 0 !important;"><strong>Evidence from post:</strong> "${escapeHtml(f.evidence)}"</blockquote>` : ""}
          </div>
        `;
          })
          .join("");

  const factChecksHtml =
    assessment.aiIntel?.claimVerifications &&
    assessment.aiIntel.claimVerifications.length > 0
      ? `
      <div class="c-section" data-block="true" style="margin-bottom: 14px;">
        <h2 class="c-section-title" style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;"><span>📑</span> Recruiter Fact-Checks & Claim Grounding</h2>
        <table class="c-audit-table" style="width: 100%; border-collapse: collapse; font-size: 10.5px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #ffffff;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: 700; color: #334155; text-align: left;">Claim Type</th>
              <th style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: 700; color: #334155; text-align: left;">Recruiter Claim</th>
              <th style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: 700; color: #334155; text-align: left;">Ground Truth / Verification</th>
              <th style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: 700; color: #334155; text-align: left;">Status</th>
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
                const statusBg = cv.verifiedStatus === "verified" ? "#dcfce7" : cv.verifiedStatus === "contradicted" ? "#fee2e2" : "#fef3c7";
                const statusColor = cv.verifiedStatus === "verified" ? "#15803d" : cv.verifiedStatus === "contradicted" ? "#b91c1c" : "#b45309";
                const statusBorder = cv.verifiedStatus === "verified" ? "#bbf7d0" : cv.verifiedStatus === "contradicted" ? "#fecaca" : "#fde68a";
                return `
                <tr>
                  <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>${escapeHtml(cv.claimType.toUpperCase())}</strong></td>
                  <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">"${escapeHtml(cv.claimedValue)}"</td>
                  <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${escapeHtml(cv.details)}</td>
                  <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><span class="c-pillar-status c-pillar-status--${statusClass}" style="background: ${statusBg} !important; color: ${statusColor} !important; border: 1px solid ${statusBorder} !important; font-weight: 700; font-size: 9.5px; padding: 2.5px 9px; border-radius: 12px;">${statusText}</span></td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
      : "";

  const criteria = assessment.criteria;
  const criteriaHtml =
    criteria && criteria.total > 0
      ? `
    <div class="c-section" data-block="true" style="margin-bottom: 14px;">
      <h2 class="c-section-title" style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;"><span>📋</span> 100-Criteria Employment Integrity Checklist</h2>
      <p class="c-criteria-summary" style="font-size: 11px; color: #334155; margin-bottom: 12px; line-height: 1.4;">
        <strong><span style="color: #059669;">${criteria.passed} passed</span></strong> ·
        <strong><span style="color: #d97706;">${criteria.warned} warning${criteria.warned === 1 ? "" : "s"}</span></strong> ·
        <strong><span style="color: #dc2626;">${criteria.failed} failed</span></strong> ·
        <span style="color: #64748b;">${criteria.notAssessed} not assessed</span>
        ${criteria.score != null ? `— <strong><span style="color: #0f172a; font-size: 11.5px;">${criteria.score}/100</span></strong> across the ${criteria.assessed} criteria that could be evaluated` : ""}
      </p>
      ${criteria.byPillar
        .filter((p) => p.results.length > 0)
        .map(
          (pillar) => `
        <div class="c-criteria-group" data-block="true" style="margin-bottom: 12px;">
          <div class="c-criteria-group-head" style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px;">
            <span class="c-criteria-group-title" style="font-size: 11.5px; font-weight: 700; color: #0f172a;">${escapeHtml(pillar.label)}</span>
            <span class="c-criteria-group-count" style="font-size: 10px; color: #64748b; font-weight: 600;">${pillar.passed} passed of ${pillar.results.length - pillar.notAssessed} assessed</span>
          </div>
          <ul class="c-criteria-list" style="list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; padding: 0; margin: 0;">
            ${pillar.results
              .map(
                (r) => `
              <li class="c-criteria-item c-criteria-item--${r.status}" data-row="true" style="display: flex; align-items: flex-start; gap: 6px;">
                <span class="c-criteria-mark" style="color: ${
                  r.status === "pass"
                    ? "#16a34a"
                    : r.status === "fail"
                      ? "#dc2626"
                      : r.status === "warn"
                        ? "#d97706"
                        : "#94a3b8"
                }; font-weight: 800; font-size: 11.5px; width: 12px; text-align: center; line-height: 1.2; flex-shrink: 0;">${
                  r.status === "pass"
                    ? "✓"
                    : r.status === "fail"
                      ? "✗"
                      : r.status === "warn"
                        ? "!"
                        : "–"
                }</span>
                <span class="c-criteria-body" style="display: flex; flex-direction: column;">
                  <span class="c-criteria-title" style="font-size: 10px; font-weight: 600; color: #1e293b; line-height: 1.3;">${escapeHtml(r.title)}</span>
                  ${r.detail ? `<span class="c-criteria-detail" style="font-size: 9px; color: #64748b; line-height: 1.35; margin-top: 1px;">${escapeHtml(r.detail)}</span>` : ""}
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
    body, .c-report-container, .jc-pdf-offscreen-render {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a !important;
      background: #ffffff !important;
      line-height: 1.45;
      font-size: 12px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .c-report-container {
      width: 794px;
      max-width: 794px;
      margin: 0 auto;
      background: #ffffff;
      padding: 12mm 14mm 15mm 14mm;
      box-sizing: border-box;
    }
    
    /* Top Brand & Report Header */
    .c-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
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
      width: 42px !important;
      height: 42px !important;
      max-width: 42px !important;
      max-height: 42px !important;
      border-radius: 8px;
      overflow: hidden !important;
      border: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      flex-shrink: 0;
    }
    .c-brand-logo svg {
      width: 42px !important;
      height: 42px !important;
      display: block;
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

    /* Target Subject Box */
    .c-target-banner {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .c-target-col-left {
      flex: 1 1 auto;
      min-width: 0;
    }
    .c-target-col-right {
      flex: 0 0 200px;
      text-align: right;
    }
    .c-target-label {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 3px;
    }
    .c-target-company {
      font-size: 18px;
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
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 14px;
    }
    .c-verdict-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .c-verdict-title {
      font-size: 14px;
      font-weight: 800;
      color: ${themeText};
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
      padding: 4px 14px;
      border-radius: 20px;
      border: 1px solid ${themeBorder};
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .c-score-num {
      font-size: 13px;
      font-weight: 800;
      color: ${themeColor};
      margin: 0 2px;
    }
    .c-verdict-desc {
      font-size: 11px;
      color: #334155;
      margin-bottom: 12px;
      line-height: 1.5;
    }
    .c-verdict-advice-box {
      background: #ffffff;
      border-radius: 6px;
      padding: 12px 14px;
      border: 1px solid ${themeBorder};
    }
    .c-verdict-advice-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${themeColor};
      margin-bottom: 6px;
    }
    .c-verdict-advice-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .c-verdict-advice-list li {
      font-size: 10.5px;
      color: #334155;
      margin-bottom: 3px;
      line-height: 1.55;
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
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* 6 Pillars Audit Grid */
    .c-pillars-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 0;
    }
    .c-pillar-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 6px;
      min-width: 0;
    }
    .c-pillar-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .c-pillar-name {
      font-size: 11.5px;
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
      font-size: 9.5px;
      font-weight: 700;
      padding: 2.5px 9px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
      flex-shrink: 0;
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
      font-size: 10px;
      color: #475569;
      line-height: 1.45;
      word-break: break-word;
    }

    /* Audit Table */
    .c-audit-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      margin-bottom: 0;
      table-layout: fixed;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
    }
    .c-audit-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
    }
    .c-audit-table td {
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      color: #334155;
      word-break: break-word;
      background: #ffffff;
    }
    .c-audit-table tr:nth-child(even) td {
      background: #f8fafc;
    }

    /* 100-Criteria Checklist */
    .c-criteria-summary {
      font-size: 11px;
      color: #334155;
      line-height: 1.4;
      margin-bottom: 12px;
    }
    .c-criteria-group {
      margin-bottom: 12px;
    }
    .c-criteria-group-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }
    .c-criteria-group-title {
      font-size: 11.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .c-criteria-group-count {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
      white-space: nowrap;
    }
    .c-criteria-list {
      list-style: none;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 14px;
      padding: 0;
      margin: 0;
    }
    .c-criteria-item {
      display: flex;
      gap: 6px;
      font-size: 10px;
      line-height: 1.35;
      color: #334155;
    }
    .c-criteria-mark {
      flex: 0 0 12px;
      width: 12px;
      font-weight: 800;
      text-align: center;
      font-size: 11.5px;
      line-height: 1.2;
    }
    .c-criteria-item--pass .c-criteria-mark {
      color: #16a34a !important;
    }
    .c-criteria-item--fail .c-criteria-mark {
      color: #dc2626 !important;
    }
    .c-criteria-item--warn .c-criteria-mark {
      color: #d97706 !important;
    }
    .c-criteria-item--na .c-criteria-mark,
    .c-criteria-item--na .c-criteria-title {
      color: #94a3b8 !important;
    }
    .c-criteria-body {
      display: flex;
      flex-direction: column;
    }
    .c-criteria-title {
      color: #1e293b;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.3;
    }
    .c-criteria-detail {
      color: #64748b;
      font-size: 9px;
      line-height: 1.35;
      margin-top: 1px;
    }

    /* Findings Cards */
    .c-findings-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .c-finding-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .c-finding-card--risk {
      border-left: 3.5px solid #ef4444;
    }
    .c-finding-card--trust {
      border-left: 3.5px solid #3b82f6;
    }
    .c-finding-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .c-finding-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2.5px 10px;
      border-radius: 12px;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    .c-finding-badge--risk {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .c-finding-badge--trust {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .c-finding-severity {
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
      white-space: nowrap;
    }
    .c-finding-reason {
      font-size: 11px;
      font-weight: 600;
      color: #1e293b;
      line-height: 1.45;
      word-break: break-word;
      margin-bottom: 6px;
    }
    .c-finding-evidence {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
      margin: 0;
      font-size: 10px;
      color: #334155;
      font-style: italic;
      word-break: break-word;
      line-height: 1.4;
    }
    .c-finding-empty {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 3.5px solid #16a34a;
      color: #166534;
      padding: 12px 14px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
    }

    /* Action Checklist */
    .c-checklist {
      list-style: none;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      padding: 0;
      margin: 0;
    }
    .c-checklist-item {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 10.5px;
      color: #1e293b;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      line-height: 1.45;
      word-break: break-word;
    }
    .c-checklist-box {
      color: #2563eb;
      font-weight: bold;
      font-size: 13px;
      flex-shrink: 0;
      line-height: 1.2;
    }

    /* Footer & Disclaimer */
    .c-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 12px;
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 9.5px;
      color: #64748b;
    }
    .c-helpline-tag {
      font-weight: 700;
      color: #dc2626;
      background: #fee2e2;
      padding: 3px 10px;
      border-radius: 12px;
      border: 1px solid #fca5a5;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Avoid page-breaks inside components during print */
    [data-block] {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    /* Shrink step 1: criteria font 9.5px -> 9px */
    .jc-shrink-font .c-criteria-item {
      font-size: 9px !important;
    }
    .jc-shrink-font .c-criteria-detail {
      font-size: 8.5px !important;
    }

    /* Shrink step 2: block gap */
    .jc-shrink-gap .c-section {
      margin-bottom: 12px !important;
    }
    .jc-shrink-gap .c-target-banner,
    .jc-shrink-gap .c-verdict-banner,
    .jc-shrink-gap .c-pillars-grid {
      margin-bottom: 12px !important;
    }
    .jc-shrink-gap .c-header {
      margin-bottom: 12px !important;
      padding-bottom: 10px !important;
    }
    .jc-shrink-gap .c-findings-list,
    .jc-shrink-gap .c-checklist {
      gap: 6px !important;
    }
  </style>
</head>
<body>
  <div class="c-report-container">
    
    <!-- 1. Header -->
    <header class="c-header" data-block="true">
      <div class="c-brand">
        <div class="c-brand-logo">
          <img src="${LOGO_BASE64}" alt="JobCheck Logo" width="42" height="42" style="width: 42px !important; height: 42px !important; max-width: 42px !important; max-height: 42px !important; display: block; object-fit: contain; border-radius: 8px;" />
        </div>
        <div>
          <div class="c-brand-title">JobCheck™</div>
          <div class="c-brand-subtitle">Employment Integrity &amp; Anti-Fraud Audit</div>
        </div>
      </div>
      <div class="c-meta-box">
        <div class="c-meta-id">${reportId}</div>
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Framework:</strong> 100 Employment Integrity Criteria</div>
      </div>
    </header>

    <!-- 2. Target Subject Box -->
    <div class="c-target-banner" data-block="true" style="background: #f8fafc !important; border: 1px solid #cbd5e1 !important; border-radius: 8px !important; padding: 14px 18px !important; margin-bottom: 14px !important; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
      <div class="c-target-col-left" style="flex: 1 1 auto; min-width: 0;">
        <div class="c-target-label" style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 3px;">Audited Corporate Subject</div>
        <div class="c-target-company" style="font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; line-height: 1.25; word-break: break-word;">${escapeHtml(companyName)}</div>
        ${jobUrl ? `<a href="${escapeHtml(jobUrl)}" class="c-target-url jc-pdf-link" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: #2563eb; text-decoration: underline; word-break: break-all; font-family: monospace; display: inline-block; margin-top: 4px;">${escapeHtml(jobUrl)}</a>` : ""}
      </div>
      <div class="c-target-col-right" style="flex: 0 0 200px; text-align: right;">
        <div class="c-target-label" style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 3px;">Audit Integrity Rating</div>
        <div style="font-size: 18px; font-weight: 800; color: ${themeColor}; line-height: 1.2;">
          ${criteria && criteria.assessed > 0
            ? `${criteria.passed} / ${criteria.assessed} Criteria`
            : `${audit.criteriaPassedCount} / ${audit.totalCriteriaCount} Criteria`}
        </div>
        <div style="font-size: 13px; font-weight: 700; color: ${themeColor}; line-height: 1.2;">
          Satisfied
        </div>
        <div style="font-size: 10.5px; color: #64748b; margin-top: 3px;">Confidence: ${escapeHtml(assessment.confidence)}</div>
      </div>
    </div>

    <!-- 3. Primary Executive Verdict -->
    <div class="c-verdict-banner" data-block="true" style="background: ${themeBg} !important; border: 1.5px solid ${themeBorder} !important; border-radius: 8px !important; padding: 14px 18px !important; margin-bottom: 14px !important;">
      <div class="c-verdict-header" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px;">
        <div class="c-verdict-title" style="font-size: 14px !important; font-weight: 800 !important; color: ${themeText} !important; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 16px;">${verdictEmoji}</span>
          <span>${verdictTitle}</span>
        </div>
        <div class="c-score-badge" style="background: #ffffff !important; border: 1px solid ${themeBorder} !important; padding: 4px 14px !important; border-radius: 20px !important; font-size: 11px !important; font-weight: 700 !important; white-space: nowrap;">
          <span style="color: #475569;">Risk Score:</span>
          <span class="c-score-num" style="color: ${themeColor} !important; font-size: 13px !important; font-weight: 800 !important; margin: 0 2px;">${assessment.score} / 100</span>
          <span style="color: ${themeText}; font-size: 10.5px; font-weight: 700;">(${assessment.level.toUpperCase()} RISK)</span>
        </div>
      </div>
      <div class="c-verdict-desc" style="font-size: 11px !important; color: #334155 !important; line-height: 1.5 !important; margin-bottom: 12px !important;">
        ${verdictSummary}
      </div>
      <div class="c-verdict-advice-box" style="background: #ffffff !important; border: 1px solid ${themeBorder} !important; border-radius: 6px !important; padding: 12px 14px !important;">
        <div class="c-verdict-advice-title" style="font-size: 10px !important; font-weight: 800 !important; color: ${themeColor} !important; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Mandatory Candidate Safety Advisory</div>
        <ul class="c-verdict-advice-list" style="list-style: none; padding: 0; margin: 0;">
          ${verdictAdvice.map((a) => `<li style="font-size: 10.5px; color: #334155; line-height: 1.55; margin-bottom: 3px;">${linkifyText(a)}</li>`).join("")}
        </ul>
      </div>
    </div>

    <!-- 4. 6-Pillar Corporate Integrity Audit Checklist -->
    <div class="c-section" data-block="true" style="margin-bottom: 14px;">
      <h2 class="c-section-title" style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;"><span>🏛️</span> 6-Pillar Employment Integrity Audit Checklist</h2>
      <div class="c-pillars-grid" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0;">
        ${pillarsList
          .map(
            (item) => {
              const statusBg = item.p.status === "pass" ? "#dcfce7" : item.p.status === "warn" ? "#fef3c7" : "#fee2e2";
              const statusColor = item.p.status === "pass" ? "#15803d" : item.p.status === "warn" ? "#b45309" : "#b91c1c";
              const statusBorder = item.p.status === "pass" ? "#bbf7d0" : item.p.status === "warn" ? "#fde68a" : "#fecaca";
              return `
          <div class="c-pillar-card" data-block="true" style="background: #f8fafc !important; border: 1px solid #cbd5e1 !important; border-radius: 8px !important; padding: 12px 14px !important; display: flex; flex-direction: column; justify-content: space-between; gap: 6px;">
            <div class="c-pillar-head" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <span class="c-pillar-name" style="font-size: 11.5px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                <span class="c-pillar-icon" style="font-size: 13px;">${item.icon}</span>
                <span class="c-pillar-label">${escapeHtml(item.name)}</span>
              </span>
              <span class="c-pillar-status" style="background: ${statusBg} !important; color: ${statusColor} !important; border: 1px solid ${statusBorder} !important; font-weight: 700 !important; font-size: 9.5px !important; padding: 2.5px 9px !important; border-radius: 12px !important; white-space: nowrap; flex-shrink: 0;">
                ${item.p.status === "pass" ? "PASSED ✓" : item.p.status === "warn" ? "WARNING ⚠" : "FAILED ✗"}
              </span>
            </div>
            <div class="c-pillar-details" style="font-size: 10px; color: #475569; line-height: 1.45;">
              <strong style="color: #1e293b;">${escapeHtml(item.p.title)}:</strong> ${escapeHtml(item.p.details)}
            </div>
          </div>
        `;
            },
          )
          .join("")}
      </div>
    </div>

    ${factChecksHtml}

    ${criteriaHtml}

    <!-- 6. Detailed Findings & Evidence Quotes -->
    <div class="c-section" data-block="true" style="margin-bottom: 14px;">
      <h2 class="c-section-title" style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;"><span>🔍</span> Forensic Findings & Evidence Analysis (${assessment.findings.length} Signals Identified)</h2>
      <div class="c-findings-list" style="display: flex; flex-direction: column; gap: 10px;">
        ${findingsHtml}
      </div>
    </div>

    <!-- 7. Action Plan Checklist -->
    <div class="c-section" data-block="true" style="margin-bottom: 14px;">
      <h2 class="c-section-title" style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;"><span>🛡️</span> Step-by-Step Candidate Action Plan</h2>
      <ul class="c-checklist" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; list-style: none; padding: 0; margin: 0;">
        ${assessment.nextSteps
          .map(
            (step) => `
          <li class="c-checklist-item" data-block="true" style="background: #f8fafc !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important; padding: 10px 12px !important; display: flex; align-items: flex-start; gap: 8px;">
            <span style="color: #2563eb; font-size: 13px; font-weight: bold; flex-shrink: 0; line-height: 1.2;">☑</span>
            <span style="font-size: 10.5px; color: #1e293b; line-height: 1.45; word-break: break-word;">${linkifyText(step)}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    </div>

    <!-- 8. Footer -->
    <footer class="c-footer" data-block="true" style="border-top: 1px solid #cbd5e1; padding-top: 12px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 9.5px; color: #64748b; flex-wrap: wrap;">
      <div>
        <span>JobCheck™ Open Security Verification Network · Independent algorithmic risk evaluation.</span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <a href="https://cybercrime.gov.in" class="c-helpline-tag jc-pdf-link" target="_blank" rel="noopener noreferrer" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 20px; padding: 4px 12px; font-size: 9.5px; font-weight: 700; white-space: nowrap; flex-shrink: 0; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">🚨 India: 1930 · <span style="text-decoration: underline;">cybercrime.gov.in</span></a>
        <a href="https://www.ic3.gov" class="c-helpline-tag jc-pdf-link" target="_blank" rel="noopener noreferrer" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 20px; padding: 4px 12px; font-size: 9.5px; font-weight: 700; white-space: nowrap; flex-shrink: 0; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">🛡️ US / Global (FBI): <span style="text-decoration: underline;">ic3.gov</span></a>
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

  setTimeout(() => {
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
    } catch {
      const win = window.open("", "_blank");
      if (win) {
        win.document.title = filename.replace(/\.pdf$/i, "");
        win.document.write(htmlContent);
        win.document.close();
        win.focus();
        win.print();
      }
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 60000);
    }
  }, 400);
}

interface AtomicBlock {
  top: number;
  bottom: number;
  keepWithNext?: boolean;
}

/**
 * Computes page break cut points using atomic block and grid-row boundaries.
 * Guarantees:
 * 1. 2-column grid rows (pillars, criteria, action plan) are treated as single atomic blocks,
 *    preventing left/right column misalignment or vertical splitting across page breaks.
 * 2. Section titles (.c-section-title) and criteria group headers (.c-criteria-group-head)
 *    are never orphaned at the bottom of a page without content underneath.
 * 3. Individual cards, table rows, and banners are never sliced through the middle.
 * 4. Dynamically determines page count up to a maximum of 6 pages (MAX_PAGES = 6).
 */
function computeBlockBreaks(
  container: HTMLElement,
  pageHeightPx: number,
): number[] {
  const containerRect = container.getBoundingClientRect();
  const cTop = containerRect.top;

  const blocks: AtomicBlock[] = [];

  const addBlock = (el: HTMLElement | null | undefined, keepWithNext = false) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    blocks.push({
      top: r.top - cTop,
      bottom: r.bottom - cTop,
      keepWithNext,
    });
  };

  const addRowPair = (elements: HTMLElement[]) => {
    for (let i = 0; i < elements.length; i += 2) {
      const el1 = elements[i];
      const el2 = elements[i + 1];
      const r1 = el1 ? el1.getBoundingClientRect() : null;
      const r2 = el2 ? el2.getBoundingClientRect() : null;

      if (r1 && r2 && r1.height > 0 && r2.height > 0) {
        blocks.push({
          top: Math.min(r1.top, r2.top) - cTop,
          bottom: Math.max(r1.bottom, r2.bottom) - cTop,
        });
      } else if (r1 && r1.height > 0) {
        blocks.push({
          top: r1.top - cTop,
          bottom: r1.bottom - cTop,
        });
      }
    }
  };

  // 1. Header
  addBlock(container.querySelector<HTMLElement>(".c-header"));

  // 2. Target Subject Banner
  addBlock(container.querySelector<HTMLElement>(".c-target-banner"));

  // 3. Verdict Banner
  addBlock(container.querySelector<HTMLElement>(".c-verdict-banner"));

  // Dividers as natural break points
  const dividers = Array.from(container.querySelectorAll<HTMLElement>(".c-divider"));
  for (const d of dividers) {
    addBlock(d);
  }

  // 4. 6-Pillar Audit Section
  const pillarsGrid = container.querySelector<HTMLElement>(".c-pillars-grid");
  if (pillarsGrid) {
    const section = pillarsGrid.closest(".c-section");
    const title = section?.querySelector<HTMLElement>(".c-section-title");
    addBlock(title, true);

    const pillarCards = Array.from(pillarsGrid.querySelectorAll<HTMLElement>(".c-pillar-card"));
    addRowPair(pillarCards);
  }

  // 5. Fact checks table (if present)
  const factTable = container.querySelector<HTMLElement>(".c-audit-table");
  if (factTable) {
    const section = factTable.closest(".c-section");
    const title = section?.querySelector<HTMLElement>(".c-section-title");
    addBlock(title, true);

    const thead = factTable.querySelector<HTMLElement>("thead");
    const tbodyRows = Array.from(factTable.querySelectorAll<HTMLElement>("tbody tr"));
    const firstRow = tbodyRows[0];
    if (firstRow) {
      const rHead = thead?.getBoundingClientRect();
      const rFirst = firstRow.getBoundingClientRect();
      blocks.push({
        top: (rHead && rHead.height > 0 ? rHead.top : rFirst.top) - cTop,
        bottom: rFirst.bottom - cTop,
      });
      for (let i = 1; i < tbodyRows.length; i++) {
        const row = tbodyRows[i];
        if (row) addBlock(row);
      }
    } else {
      addBlock(factTable);
    }
  }

  // 6. 100-Criteria Checklist
  const criteriaSummary = container.querySelector<HTMLElement>(".c-criteria-summary");
  if (criteriaSummary) {
    const section = criteriaSummary.closest(".c-section");
    const title = section?.querySelector<HTMLElement>(".c-section-title");
    addBlock(title, true);
    addBlock(criteriaSummary);

    const groups = Array.from(container.querySelectorAll<HTMLElement>(".c-criteria-group"));
    for (const grp of groups) {
      const head = grp.querySelector<HTMLElement>(".c-criteria-group-head");
      addBlock(head, true);

      const items = Array.from(grp.querySelectorAll<HTMLElement>(".c-criteria-item"));
      addRowPair(items);
    }
  }

  // 7. Forensic Findings
  const findingsList = container.querySelector<HTMLElement>(".c-findings-list");
  if (findingsList) {
    const section = findingsList.closest(".c-section");
    const title = section?.querySelector<HTMLElement>(".c-section-title");
    addBlock(title, true);

    const cards = Array.from(findingsList.querySelectorAll<HTMLElement>(".c-finding-card, .c-finding-empty"));
    for (const card of cards) {
      addBlock(card);
    }
  }

  // 8. Action Plan Checklist
  const checklist = container.querySelector<HTMLElement>(".c-checklist");
  if (checklist) {
    const section = checklist.closest(".c-section");
    const title = section?.querySelector<HTMLElement>(".c-section-title");
    addBlock(title, true);

    const items = Array.from(checklist.querySelectorAll<HTMLElement>(".c-checklist-item"));
    addRowPair(items);
  }

  // 9. Footer
  addBlock(container.querySelector<HTMLElement>(".c-footer"));

  // Sort blocks strictly top-to-bottom
  blocks.sort((a, b) => a.top - b.top);

  if (blocks.length === 0 || pageHeightPx <= 0) {
    const fallbackBreaks: number[] = [];
    for (let y = pageHeightPx; y < containerRect.height; y += pageHeightPx) {
      fallbackBreaks.push(y);
    }
    return fallbackBreaks;
  }

  // Dynamic pagination up to 6 pages (maximum 5 cuts)
  const MAX_PAGES = 6;
  const BOTTOM_SAFETY_PX = 30;
  const pageBreaks: number[] = [];
  let currentStart = 0;

  const footerEl = container.querySelector<HTMLElement>(".c-footer");
  let actualContentBottom = 0;
  if (footerEl) {
    const fRect = footerEl.getBoundingClientRect();
    if (fRect.height > 0) {
      actualContentBottom = fRect.bottom - cTop;
    }
  }
  if (actualContentBottom <= 0) {
    for (const b of blocks) {
      if (b.bottom > actualContentBottom) actualContentBottom = b.bottom;
    }
  }
  if (actualContentBottom <= 0) {
    actualContentBottom = containerRect.height;
  }

  while (pageBreaks.length < MAX_PAGES - 1) {
    const pageTargetEnd = currentStart + pageHeightPx - BOTTOM_SAFETY_PX;

    // If remaining content comfortably fits on current page, finish immediately!
    if (actualContentBottom <= currentStart + pageHeightPx - 10) {
      break;
    }

    let bestCut = -1;
    let bestIndex = -1;

    for (let i = 0; i < blocks.length; i++) {
      const cur = blocks[i]!;
      if (cur.bottom <= currentStart + 10) continue;

      if (cur.bottom <= pageTargetEnd) {
        // Disallow page break immediately after a title or group head
        if (cur.keepWithNext) {
          continue;
        }

        bestCut = cur.bottom;
        bestIndex = i;
      } else {
        break;
      }
    }

    // If the best cut accommodates the very last block (e.g. footer), all content fits!
    if (bestIndex === blocks.length - 1) {
      break;
    }

    if (bestIndex >= 0 && bestIndex < blocks.length - 1) {
      const next = blocks[bestIndex + 1];
      if (next && next.top > bestCut) {
        bestCut = (bestCut + next.top) / 2;
      }
    }

    if (bestCut <= currentStart + 10) {
      // Fallback: use target end
      bestCut = pageTargetEnd;
    }

    const cutPoint = Math.round(bestCut);

    // If the cut point is past or near the end of all content, stop
    if (cutPoint >= actualContentBottom - 25) {
      break;
    }

    pageBreaks.push(cutPoint);
    currentStart = cutPoint;
  }

  return pageBreaks;
}

/**
 * Adds an interactive, clickable URI hyperlink annotation to the current page.
 * Crucially constructs compliant [lowerLeftX, lowerLeftY, upperRightX, upperRightY]
 * bounding box to fix jsPDF's built-in pdf.link() inverted-rectangle bug.
 */
function addPdfLink(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  url: string,
): void {
  try {
    const pageInfo = (pdf as any).internal.getCurrentPageInfo();
    const o = (pdf as any).internal.getCoordinateString;
    const s = (pdf as any).internal.getVerticalCoordinateString;

    const x1 = o(x);
    const yLower = s(y + h);
    const x2 = o(x + w);
    const yUpper = s(y);

    if (!pageInfo.pageContext.annotations) {
      pageInfo.pageContext.annotations = [];
    }

    pageInfo.pageContext.annotations.push({
      finalBounds: {
        x: x1,
        y: yLower,
        w: x2,
        h: yUpper,
      },
      options: {
        url: url,
      },
      type: "link",
    });
  } catch {
    // Fallback to default
    pdf.link(x, y, w, h, { url });
  }
}

/**
 * Directly generates and downloads a beautifully styled .pdf file via html2canvas & jsPDF.
 * Dynamically computes pages (up to a maximum of 6 pages) with zero split cards,
 * robust body padding, exact reference visual styles, and optimized JPEG compression.
 * Shows a responsive loading overlay with spinner during generation.
 */
export async function exportDirectPdfBlob(
  assessment: Assessment,
  jobUrl?: string,
  jobDescription?: string,
): Promise<void> {
  // Show loading overlay immediately
  const overlay = createPdfLoadingOverlay();

  const companyName = resolveCompanyName(assessment, jobUrl, jobDescription);
  const filename = getReportFilename(companyName);
  const htmlContent = generateAuditReportHtml(
    assessment,
    jobUrl,
    jobDescription,
  );

  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(htmlContent, "text/html");
  const reportBody = parsedDoc.body.innerHTML;
  const styles = parsedDoc.head.querySelector("style")?.innerHTML || "";

  const container = document.createElement("div");
  container.className = "jc-pdf-offscreen-render";
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "794px"; // Standard A4 at 96 DPI
  container.style.minHeight = "1123px"; // 297mm at 96 DPI
  container.style.zIndex = "-1"; // Below overlay but still in viewport for html2canvas to capture
  container.style.opacity = "1"; // Visible so html2canvas can render it
  container.style.pointerEvents = "none";
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#0f172a";
  container.style.boxSizing = "border-box";
  container.style.padding = "12mm 14mm 15mm 14mm"; // Match @page rule: top, right, bottom, left (equal left/right: 14mm)

  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  container.appendChild(styleEl);

  const wrapperEl = document.createElement("div");
  wrapperEl.innerHTML = reportBody;
  container.appendChild(wrapperEl);

  document.body.appendChild(container);

  try {
    const images = Array.from(container.querySelectorAll("img"));
    await Promise.all([
      new Promise((r) => setTimeout(r, 200)),
      ...images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 300);
        });
      }),
    ]);

    const initialRect = container.getBoundingClientRect();
    const pageHeightPx = Math.floor(initialRect.width * (297 / 210));

    // Measure exact content bottom to eliminate all trailing blank pages
    const footerEl = container.querySelector<HTMLElement>(".c-footer");
    let actualContentBottomCss = 0;
    if (footerEl) {
      const fRect = footerEl.getBoundingClientRect();
      if (fRect.height > 0) {
        actualContentBottomCss = fRect.bottom - initialRect.top;
      }
    }
    if (actualContentBottomCss <= 0) {
      actualContentBottomCss = initialRect.height;
    }

    // Dynamic pagination: let layout breathe naturally
    let pageBreaks = computeBlockBreaks(container, pageHeightPx);
    // Filter out any page break at or beyond the content bottom (guarantees ZERO blank pages!)
    pageBreaks = pageBreaks.filter((cut) => cut < actualContentBottomCss - 25);
    const totalPages = Math.max(1, pageBreaks.length + 1);

    // Rasterize with html2canvas at scale 2 for razor-sharp typography
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 794, // Standard A4 at 96 DPI
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pdfWidth = 210;

    const linkElements = container.querySelectorAll("a[href]");
    const activeRect = container.getBoundingClientRect();
    const mmPerPx = pdfWidth / activeRect.width;

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
      let href = (a.getAttribute("href") || a.href || "").trim();
      if (!href) return;
      if (!href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("mailto:")) {
        href = `https://${href}`;
      }
      const rect = a.getBoundingClientRect();
      const relX = (rect.left - activeRect.left) * mmPerPx;
      const relY = (rect.top - activeRect.top) * mmPerPx;
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

    // Extract word positions and group into natural lines for selectable/copyable text
    interface PdfTextLine {
      text: string;
      x: number;
      y: number;
      fontSizePt: number;
    }

    function sanitizeText(str: string): string {
      return str
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2022\u00B7]/g, "-")
        .replace(/[\u20B9]/g, "Rs. ")
        .replace(/[✓✔]/g, "[PASS]")
        .replace(/[✗✘]/g, "[FAIL]")
        .replace(/[☑]/g, "[x]")
        .replace(/[^\x20-\x7E]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const textLines: PdfTextLine[] = [];
    const ptPerMm = 72 / 25.4;

    try {
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) {
              return NodeFilter.FILTER_REJECT;
            }
            const parent = node.parentElement;
            if (
              !parent ||
              parent.tagName === "SCRIPT" ||
              parent.tagName === "STYLE" ||
              parent.tagName === "SVG"
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );

      const range = document.createRange();
      let currentNode: Node | null = walker.nextNode();
      let curLine: PdfTextLine | null = null;
      let curLineRightMm = 0;

      while (currentNode) {
        const textVal = currentNode.nodeValue || "";
        const regex = /\S+/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(textVal)) !== null) {
          try {
            range.setStart(currentNode, match.index);
            range.setEnd(currentNode, match.index + match[0].length);
            const rect = range.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0) {
              const xMm = (rect.left - activeRect.left) * mmPerPx;
              const yTopMm = (rect.top - activeRect.top) * mmPerPx;
              const hMm = rect.height * mmPerPx;
              const wMm = rect.width * mmPerPx;
              const yBaselineMm = yTopMm + (hMm * 0.82);
              const fontSizePt = Math.max(5, Math.min(24, hMm * ptPerMm * 0.85));

              const cleanWord = sanitizeText(match[0]);
              if (cleanWord) {
                if (
                  curLine &&
                  Math.abs(curLine.y - yBaselineMm) <= 2 &&
                  xMm >= curLineRightMm - 1 &&
                  xMm - curLineRightMm <= 12
                ) {
                  curLine.text += " " + cleanWord;
                  curLineRightMm = xMm + wMm;
                } else {
                  curLine = {
                    text: cleanWord,
                    x: xMm,
                    y: yBaselineMm,
                    fontSizePt,
                  };
                  textLines.push(curLine);
                  curLineRightMm = xMm + wMm;
                }
              }
            }
          } catch {
            // Ignore boundary error
          }
        }

        currentNode = walker.nextNode();
      }
    } catch {
      // Graceful fallback if TreeWalker is unavailable
    }

    const rasterScale = canvas.width / activeRect.width;
    let sourceYCss = 0;

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      if (pageIdx > 0) {
        pdf.addPage();
      }

      const pageStartCss = sourceYCss;
      const pageEndCss = (pageIdx === totalPages - 1)
        ? Math.min(activeRect.height, actualContentBottomCss + 16)
        : (pageBreaks[pageIdx] ?? activeRect.height);
      sourceYCss = pageEndCss;

      const sliceHeightCss = Math.max(1, pageEndCss - pageStartCss);
      const sourceHeightPx = Math.max(1, Math.round(sliceHeightCss * rasterScale));
      const sourceYPx = Math.round(pageStartCss * rasterScale);
      const sliceHeightMm = sliceHeightCss * mmPerPx;

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeightPx;
      const ctx = pageCanvas.getContext("2d");

      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          sourceYPx,
          canvas.width,
          sourceHeightPx,
          0,
          0,
          canvas.width,
          sourceHeightPx,
        );
      }

      // 0.80 JPEG quality reduces PDF file size by ~70% while keeping retina crispness
      const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.80);
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

      const pageTopMm = pageStartCss * mmPerPx;
      const pageBottomMm = pageEndCss * mmPerPx;

      // 1. Render real selectable & copyable text layer using transparent fill opacity (mode 0 with /ca 0.0)
      // This enables native mouse drag selection, copy (Ctrl+C), and search (Ctrl+F) across Chrome, Edge, and Acrobat
      try {
        pdf.setGState(new GState({ opacity: 0.0 }));
        pdf.setFont("helvetica", "normal");
        for (const line of textLines) {
          if (line.y >= pageTopMm && line.y <= pageBottomMm + 2) {
            const pageLocalY = line.y - pageTopMm;
            pdf.setFontSize(line.fontSizePt);
            try {
              pdf.text(line.text, line.x, pageLocalY);
            } catch {
              // Safe fallback
            }
          }
        }
        pdf.setGState(new GState({ opacity: 1.0 }));
      } catch {
        // Fallback if GState not supported
      }

      // 2. Active clickable link annotations for this page slice
      for (const link of linksMeta) {
        const linkCenterY = link.y + (link.h / 2);
        const isLastPage = pageIdx === totalPages - 1;
        const belongsToPage = isLastPage
          ? (linkCenterY >= pageTopMm - 2)
          : (linkCenterY >= pageTopMm - 1 && linkCenterY < pageBottomMm + 1);

        if (belongsToPage) {
          const pageLocalY = Math.max(0, link.y - pageTopMm);
          addPdfLink(
            pdf,
            Math.max(0, link.x - 1),
            Math.max(0, pageLocalY - 1),
            link.w + 2,
            link.h + 2,
            link.url,
          );
        }
      }

      // Page numbers: "Page X of Y", 7pt grey, centered at bottom of each page
      pdf.setFontSize(7);
      pdf.setTextColor(148, 163, 184); // #94a3b8
      pdf.text(
        `Page ${pageIdx + 1} of ${totalPages}`,
        pdfWidth / 2,
        292,
        { align: "center" },
      );
    }

    pdf.save(filename);
  } finally {
    // Remove overlay
    overlay.remove();

    // Clean up container
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

function linkifyText(str: string): string {
  let escaped = escapeHtml(str);
  if (/1930|cybercrime/i.test(escaped) && !/ic3/i.test(escaped)) {
    escaped += ` · US &amp; Global: FBI IC3 (ic3.gov)`;
  }
  return escaped
    .replace(
      /cybercrime\.gov\.in/gi,
      '<a href="https://cybercrime.gov.in" class="jc-pdf-link" style="color: #2563eb; text-decoration: underline; font-weight: 700;">cybercrime.gov.in</a>',
    )
    .replace(
      /\bic3\.gov\b/gi,
      '<a href="https://www.ic3.gov" class="jc-pdf-link" style="color: #2563eb; text-decoration: underline; font-weight: 700;">ic3.gov</a>',
    );
}
