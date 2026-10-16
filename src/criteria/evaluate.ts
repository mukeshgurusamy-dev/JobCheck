/**
 * Runs the 100-criteria checklist and aggregates the result.
 *
 * The score is deliberately computed over *assessed* criteria only. Criteria
 * that could not be checked (`na`) are reported separately and never enter the
 * denominator — otherwise a scan that only checked a third of the list would
 * advertise a confident-looking number built on two thirds of nothing.
 */

import { CRITERIA, PILLAR_ORDER } from "./definitions";
import {
  CriteriaContext,
  CriteriaPillarReport,
  CriteriaReport,
  CriterionResult,
  CriterionStatus,
} from "./types";

export function evaluateCriteria(ctx: CriteriaContext): CriteriaReport {
  const results: CriterionResult[] = CRITERIA.map((criterion) => {
    const outcome = criterion.evaluate(ctx);
    return {
      id: criterion.id,
      pillar: criterion.pillar,
      title: criterion.title,
      status: outcome.status,
      detail: outcome.detail,
      verifyAgainst: criterion.verifyAgainst,
    };
  });

  const countOf = (status: CriterionStatus): number =>
    results.filter((r) => r.status === status).length;

  const passed = countOf("pass");
  const failed = countOf("fail");
  const warned = countOf("warn");
  const notAssessed = countOf("na");
  const assessed = passed + failed + warned;

  const byPillar: CriteriaPillarReport[] = PILLAR_ORDER.map(
    ({ pillar, label }) => {
      const pillarResults = results.filter((r) => r.pillar === pillar);
      const pillarCount = (status: CriterionStatus): number =>
        pillarResults.filter((r) => r.status === status).length;
      return {
        pillar,
        label,
        passed: pillarCount("pass"),
        failed: pillarCount("fail"),
        warned: pillarCount("warn"),
        notAssessed: pillarCount("na"),
        results: pillarResults,
      };
    },
  );

  return {
    total: results.length,
    passed,
    failed,
    warned,
    notAssessed,
    assessed,
    score: assessed === 0 ? null : Math.round((passed / assessed) * 100),
    byPillar,
    results,
  };
}
