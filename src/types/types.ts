/**
 * Core type definitions for JobCheck
 * A scam vs. legit job-link checker for Indian freshers
 */

import type { CriteriaReport } from "../criteria/types";

export type RiskLevel = "Low" | "Medium" | "High";
export type ConfidenceLevel = "Low" | "Medium" | "High";
export type FindingKind = "risk" | "trust";
export type FindingSeverity = "low" | "medium" | "high";

export interface PageData {
  status: number;
  finalUrl: string;
  redirectChain: string[];
  title: string;
  text: string;
  domainAgeDays: number | null;
  safeBrowsingFlagged: boolean | null;
  /** Which fallback strategy fetched this content, if not direct fetch */
  fetchSource?: "jina" | "google-cache" | "duckduckgo" | "search-index";
}

export interface ClaimVerification {
  claimType: "location" | "hiring_drive" | "salary" | "guarantee";
  claimedValue: string;
  verifiedStatus: "verified" | "contradicted" | "unverifiable";
  details: string;
}

export interface CompanyAuditPillar {
  status: "pass" | "warn" | "fail";
  title: string;
  details: string;
  /** URL to the source that confirmed this pillar's status */
  sourceUrl?: string;
}

export interface ScamReport {
  /** Platform where this complaint was found e.g. "Reddit r/developersIndia" */
  platform: string;
  /** Name of the reviewer/poster if available, e.g. "u/anonymous_user", "Ravi K." */
  reviewerName?: string;
  /** Job title or role of the reviewer if mentioned, e.g. "Fresher", "Software Engineer" */
  reviewerRole?: string;
  /** The exact complaint or warning text (verbatim or close paraphrase) */
  complaintText: string;
  /** When this was posted, e.g. "March 2024", "2 months ago" */
  reportedAt?: string;
  /** Direct URL to the source complaint/post */
  sourceUrl?: string;
}

export interface EmployeeReview {
  source: string; // "Glassdoor", "AmbitionBox", "Indeed", "Reddit"
  /** Direct URL to the company's reviews page on this platform */
  sourceUrl?: string;
  rating?: number; // 0-5 scale
  totalReviews?: number;
  positiveHighlights?: string[]; // Top positive points
  negativeHighlights?: string[]; // Top negative points
  scamWarnings?: string[]; // Brief summaries of scam/fraud mentions
  /** Detailed individual scam/fraud complaints found on this platform */
  scamReports?: ScamReport[];
}

export interface LocationVerification {
  claimedLocation: string; // From job description
  verifiedAddress?: string; // From Google Maps/AI search
  matchStatus: "exact_match" | "partial_match" | "mismatch" | "unverifiable";
  distance?: number; // Distance in km if partial match
  verificationSource: string; // "Google Maps", "MCA Records", "Company Website"
  details: string;
  /** Direct link to the map or registry page used for verification */
  sourceUrl?: string;
}

export interface PhoneNumberVerification {
  phoneNumber: string;
  countryCode: string;
  isValid: boolean;
  isTruecallerSpam: boolean;
  spamReports?: number;
  truecallerName?: string;
  matchesCompanyLocation: boolean;
  details: string;
}

export interface DirectorInfo {
  name: string;
  din?: string; // Director Identification Number
  otherCompanies?: string[];
  hasScamHistory: boolean;
  details: string;
}

export interface McaVerification {
  cinNumber?: string; // Corporate Identification Number
  llpin?: string; // Limited Liability Partnership Identification Number
  companyStatus: "Active" | "Strike Off" | "Amalgamated" | "Under Liquidation" | "Unknown";
  incorporationDate?: string;
  registeredCapital?: string;
  directors?: DirectorInfo[];
  lastVerified: string;
  confidence: number; // 0-100
  verificationSource: "MCA21 API" | "Zauba" | "Tofler" | "AI Search";
}

export interface ComplianceCheck {
  gstNumber?: string;
  gstStatus?: "Active" | "Cancelled" | "Suspended" | "Unknown";
  epfoRegistered?: boolean;
  esicRegistered?: boolean;
  hasLaborViolations?: boolean;
  details: string;
}

export interface SocialMediaPresence {
  linkedinUrl?: string;
  linkedinFollowers?: number;
  linkedinEmployeeCount?: number;
  twitterHandle?: string;
  twitterVerified?: boolean;
  facebookPage?: string;
  consistencyScore: number; // 0-100, how consistent is social presence with claimed company age/size
  details: string;
}

export interface DomainOwnership {
  registrantName?: string;
  registrantOrg?: string;
  registrationDate?: string;
  expiryDate?: string;
  registrar?: string;
  matchesCompanyName: boolean;
  isPrivacyProtected: boolean;
  suspiciousFlags: string[];
}

export interface FinancialHealth {
  creditRating?: string; // e.g., "CRISIL BB+", "CIBIL 650"
  annualTurnover?: string;
  netWorth?: string;
  profitLoss?: "Profit" | "Loss" | "Unknown";
  isDefaulter?: boolean;
  financialRiskLevel: "Low" | "Medium" | "High" | "Unknown";
  details: string;
}

export interface CompanyAuditChecklist {
  companyName: string;
  auditScore: number;
  criteriaPassedCount: number;
  totalCriteriaCount: number;
  overallVerdict: "verified" | "suspicious" | "unverified";
  legalStatus: CompanyAuditPillar;
  physicalOffice: CompanyAuditPillar;
  digitalFootprint: CompanyAuditPillar;
  employeeReviews: CompanyAuditPillar;
  fraudDatabaseCheck: CompanyAuditPillar;
  hiringAuthenticity: CompanyAuditPillar;
  // New enhanced pillars
  mcaVerification?: McaVerification;
  complianceCheck?: ComplianceCheck;
  financialHealth?: FinancialHealth;
  socialMediaPresence?: SocialMediaPresence;
  domainOwnership?: DomainOwnership;
  phoneVerification?: PhoneNumberVerification[];
  confidenceScores?: {
    legalStatus: number; // 0-100
    physicalOffice: number;
    digitalFootprint: number;
    employeeReviews: number;
    fraudDatabase: number;
    hiringAuthenticity: number;
  };
}

export interface AiIntelligenceResult {
  status: "completed" | "skipped" | "failed";
  /**
   * Why the investigation did not complete, so the UI can be specific instead
   * of saying "could not be completed" for every distinct cause.
   */
  failureReason?:
    | "no-api-key"
    | "timeout"
    | "rate-limited"
    | "network"
    | "bad-response";
  /**
   * False when the model answered without the Google Search tool (the
   * last-resort attempt), i.e. from its own knowledge rather than a fresh
   * search. The panel used to switch its heading on this and does not any more
   * — see the note in `ResultPanel.ts` — so it survives as a diagnostic: pair it
   * with `groundingError` to find out why live search did not happen.
   */
  grounded?: boolean;
  /**
   * The API's own explanation when a search-grounded attempt was rejected —
   * the difference between a rejected request shape and a rate limit lives
   * here. Truncated; never shown as raw HTML.
   */
  groundingError?: string;
  summary?: string;
  isScamLikely?: boolean;
  companyName?: string;
  companyLocation?: {
    fullAddress?: string; // Complete address with street, city, state, postal code
    city?: string;
    state?: string;
    country?: string;
  };
  locationVerification?: {
    jobLocationFromDescription?: string; // Location extracted from job description
    matched: boolean;
    isExactMatch: boolean;
    verificationStatus: "verified" | "unverified" | "no_info";
    reason: string; // Explanation of match
  };
  digitalFootprint?: "verified" | "moderate" | "minimal" | "suspicious";
  physicalLocationStatus?: string;
  companyReviews?: string;
  officialDomain?: string;
  officialLinkedinUrl?: string;
  claimVerifications?: ClaimVerification[];
  companyAudit?: CompanyAuditChecklist;
  scamSignals?: string[];
  trustSignals?: string[];
  sources?: Array<{ title: string; url: string }>;
  adjustmentPoints?: number;
  // Enhanced fields
  employeeReviews?: EmployeeReview[];
  overallReviewScore?: number; // Aggregated 0-5 rating
  hasScamReviews?: boolean; // True if any review mentions scam/fraud
  trustPlatformHosted?: boolean; // True if hosted on trusted job platform
}

export interface JobInput {
  url: string;
  description?: string;
  fetched?: PageData;
  extractedLinks?: ExtractedLinkResult[];
  aiIntel?: AiIntelligenceResult;
  isTrustedPlatform?: boolean;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: FindingSeverity;
  points: number;
  reason: string;
  evidence?: string;
}

export interface Assessment {
  score: number;
  level: RiskLevel;
  confidence: ConfidenceLevel;
  findings: Finding[];
  nextSteps: string[];
  linkAssessments?: LinkAssessment[];
  aiIntel?: AiIntelligenceResult;
  /**
   * The computed 100-criteria checklist. Independent of `score` — it explains
   * what was checked, and which checks could not be run.
   */
  criteria?: CriteriaReport;
}

/** Result of inspecting a single extracted link from description text */
export interface ExtractedLinkResult {
  url: string;
  fetched: boolean;
  data?: PageData;
  error?: string;
}

/** Per-link assessment shown in the result panel */
export interface LinkAssessment {
  url: string;
  assessment: Assessment;
  fetchNotice?: string | null;
}

export interface InspectApiResponse {
  fetched: boolean;
  data?: PageData;
  error?: string;
  /** Inspection results for links found inside the description text */
  extractedLinks?: ExtractedLinkResult[];
  /** Whether the submitted URL belongs to a trusted job platform */
  isTrustedPlatform?: boolean;
  /** Google AI Web Search Grounding Intelligence */
  aiIntel?: AiIntelligenceResult;
}

export interface UrlRuleContext {
  rawUrl: string;
  parsedUrl: URL;
  hostname: string;
  rootDomain: string;
  subdomain: string;
  domainAgeDays: number | null;
  safeBrowsingFlagged: boolean | null;
  redirectChain: string[];
  finalUrl?: string;
}

export interface TextRuleContext {
  normalizedText: string;
  rawText: string;
  websiteDomain?: string;
}
