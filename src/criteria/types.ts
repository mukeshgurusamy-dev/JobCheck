/**
 * The 100-criteria employment-integrity checklist.
 *
 * This layer re-evaluates evidence the engine has already gathered (findings,
 * page data, AI search results) against a fixed, enumerable set of questions.
 * It does not detect anything new, and it does not influence the risk score —
 * it exists so the app can state, honestly, which specific things were checked
 * and how each one came out.
 *
 * The previous "100 Criteria Satisfied" figure was produced by the language
 * model guessing a number. This module replaces it with a real count.
 */

import { AiIntelligenceResult, Finding, PageData } from "../types/types";

/**
 * `na` means the criterion could not be assessed — typically because it needs
 * live web-search evidence and the AI investigation did not run. An `na` is
 * never counted as a pass, and never counted in the score denominator.
 */
export type CriterionStatus = "pass" | "fail" | "warn" | "na";

export type CriteriaPillar =
  | "digital-footprint"
  | "payment-demands"
  | "offer-realism"
  | "legal-identity"
  | "physical-presence"
  | "contact-channels"
  | "reputation";

export interface CriteriaContext {
  /** Every finding the rule engine produced for this listing. */
  findings: Finding[];
  pageData?: PageData;
  ai?: AiIntelligenceResult;
  hostname: string;
  rootDomain: string;
  /** Whether the user pasted a job description. */
  hasDescription: boolean;
  hasDomainAge: boolean;
  pageFetched: boolean;
  /** Raw description/page text, for criteria that key off a specific phrase. */
  rawText: string;
}

export interface Criterion {
  id: string;
  pillar: CriteriaPillar;
  title: string;
  /** What this criterion is actually asking. */
  description: string;
  /** Where a human could confirm the criterion's premise. */
  verifyAgainst: string;
  evaluate(ctx: CriteriaContext): { status: CriterionStatus; detail: string };
}

export interface CriterionResult {
  id: string;
  pillar: CriteriaPillar;
  title: string;
  status: CriterionStatus;
  detail: string;
  verifyAgainst: string;
}

export interface CriteriaPillarReport {
  pillar: CriteriaPillar;
  label: string;
  passed: number;
  failed: number;
  warned: number;
  notAssessed: number;
  results: CriterionResult[];
}

export interface CriteriaReport {
  total: number;
  passed: number;
  failed: number;
  warned: number;
  notAssessed: number;
  /** passed + failed + warned. `na` is deliberately excluded. */
  assessed: number;
  /** 0-100 over assessed criteria only, or null when nothing was assessed. */
  score: number | null;
  byPillar: CriteriaPillarReport[];
  results: CriterionResult[];
}
