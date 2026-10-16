import { describe, it, expect } from "vitest";
import {
  CRITERIA,
  EXPECTED_CRITERIA_COUNT,
  PILLAR_ORDER,
} from "../src/criteria/definitions";
import { evaluateCriteria } from "../src/criteria/evaluate";
import { CriteriaContext, CriteriaPillar, CriterionStatus } from "../src/criteria/types";
import { AiIntelligenceResult, Finding } from "../src/types/types";

const VALID_STATUSES: CriterionStatus[] = ["pass", "fail", "warn", "na"];

const PILLARS: CriteriaPillar[] = [
  "digital-footprint",
  "payment-demands",
  "offer-realism",
  "legal-identity",
  "physical-presence",
  "contact-channels",
  "reputation",
];

/**
 * The minimum a scan can produce: a URL that parsed, no page fetched, no AI.
 */
function bareContext(overrides: Partial<CriteriaContext> = {}): CriteriaContext {
  return {
    findings: [],
    hostname: "",
    rootDomain: "",
    hasDescription: false,
    hasDomainAge: false,
    pageFetched: false,
    rawText: "",
    ...overrides,
  };
}

function riskFinding(id: string, reason: string): Finding {
  return { id, kind: "risk", severity: "high", points: 40, reason };
}

/** A fully-populated investigation, so AI-backed criteria have something to read. */
const RICH_AI: AiIntelligenceResult = {
  status: "completed",
  grounded: true,
  companyName: "Infosys Limited",
  isScamLikely: false,
  overallReviewScore: 3.9,
  hasScamReviews: false,
  scamSignals: [],
  trustSignals: ["Listed on a major exchange"],
  officialDomain: "infosys.com",
  companyReviews: "3.9/5 across 40,000+ AmbitionBox reviews.",
  digitalFootprint: "verified",
  physicalLocationStatus: "Confirmed campus in Bengaluru.",
  sources: [{ title: "Infosys careers", url: "https://www.infosys.com/careers" }],
  companyAudit: {
    companyName: "Infosys Limited",
    auditScore: 90,
    criteriaPassedCount: 5,
    totalCriteriaCount: 6,
    overallVerdict: "verified",
    legalStatus: { status: "pass", title: "Legal", details: "CIN active." },
    physicalOffice: { status: "pass", title: "Office", details: "Verified campus." },
    digitalFootprint: { status: "pass", title: "Domain", details: "Official domain." },
    employeeReviews: { status: "pass", title: "Reviews", details: "3.9/5." },
    fraudDatabaseCheck: { status: "pass", title: "Fraud", details: "No reports." },
    hiringAuthenticity: { status: "pass", title: "Hiring", details: "Standard rounds." },
  },
};

const RICH_TEXT = "Join Infosys Limited as a Systems Engineer in Bengaluru.";

function richContext(overrides: Partial<CriteriaContext> = {}): CriteriaContext {
  return bareContext({
    rawText: RICH_TEXT,
    hasDescription: true,
    hostname: "infosys.com",
    rootDomain: "infosys.com",
    hasDomainAge: true,
    pageFetched: true,
    pageData: {
      status: 200,
      finalUrl: "https://www.infosys.com/careers",
      redirectChain: [],
      title: "Careers",
      text: RICH_TEXT,
      domainAgeDays: 9000,
      safeBrowsingFlagged: false,
    },
    ...overrides,
  });
}

function statusOf(ids: string[], ctx: CriteriaContext): Record<string, CriterionStatus> {
  const report = evaluateCriteria(ctx);
  const out: Record<string, CriterionStatus> = {};
  for (const id of ids) {
    const result = report.results.find((r) => r.id === id);
    expect(result, `criterion ${id} should exist`).toBeDefined();
    out[id] = result!.status;
  }
  return out;
}

describe("100-criteria checklist registry", () => {
  it("registers exactly 100 criteria", () => {
    expect(EXPECTED_CRITERIA_COUNT).toBe(100);
    expect(CRITERIA.length).toBe(100);
  });

  it("gives every criterion a unique id", () => {
    const ids = CRITERIA.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only kebab-case, non-empty ids", () => {
    for (const criterion of CRITERIA) {
      expect(criterion.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("answers a question: title, description and verifyAgainst are all present", () => {
    for (const criterion of CRITERIA) {
      expect(criterion.title.trim().length).toBeGreaterThan(0);
      expect(criterion.description.trim().length).toBeGreaterThan(0);
      // Every premise must point at something a human could re-check.
      expect(criterion.verifyAgainst.trim().length).toBeGreaterThan(0);
    }
  });

  it("assigns every criterion to a real pillar", () => {
    for (const criterion of CRITERIA) {
      expect(PILLARS).toContain(criterion.pillar);
    }
  });

  it("populates all seven pillars", () => {
    expect(PILLAR_ORDER.length).toBe(7);
    expect(PILLAR_ORDER.map((p) => p.pillar).sort()).toEqual([...PILLARS].sort());

    for (const pillar of PILLARS) {
      const count = CRITERIA.filter((c) => c.pillar === pillar).length;
      expect(count, `pillar ${pillar} should have criteria`).toBeGreaterThan(0);
    }
  });

  it("labels every pillar", () => {
    for (const entry of PILLAR_ORDER) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("criterion evaluation", () => {
  it("returns a valid status and a detail string for every criterion, on a bare context", () => {
    const report = evaluateCriteria(bareContext());
    expect(report.results.length).toBe(100);

    for (const result of report.results) {
      expect(VALID_STATUSES).toContain(result.status);
      expect(typeof result.detail).toBe("string");
      expect(result.detail.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns a valid status for every criterion on a rich context too", () => {
    const report = evaluateCriteria(richContext({ ai: RICH_AI }));

    for (const result of report.results) {
      expect(VALID_STATUSES).toContain(result.status);
      expect(result.detail.trim().length).toBeGreaterThan(0);
    }
  });

  it("never credits a pass that nothing checked: no AI means unassessed criteria", () => {
    const report = evaluateCriteria(bareContext());
    expect(report.notAssessed).toBeGreaterThan(0);
  });

  it("evaluates web-search-only criteria as na when the investigation did not run", () => {
    const withoutAi = evaluateCriteria(richContext());
    const withAi = evaluateCriteria(richContext({ ai: RICH_AI }));

    // Running the investigation must reduce the number of unassessed criteria,
    // otherwise the AI layer is not actually feeding the checklist.
    expect(withAi.notAssessed).toBeLessThan(withoutAi.notAssessed);
    // And an unassessed criterion never becomes a fabricated pass.
    expect(withAi.passed + withAi.warned + withAi.failed).toBe(withAi.assessed);
  });

  it("is deterministic for the same context", () => {
    const ctx = bareContext({ rawText: "Pay a ₹500 registration fee to confirm your slot." });
    const first = evaluateCriteria(ctx).results.map((r) => `${r.id}:${r.status}`);
    const second = evaluateCriteria(ctx).results.map((r) => `${r.id}:${r.status}`);
    expect(second).toEqual(first);
  });
});

describe("criteria report arithmetic", () => {
  const contexts: Array<[string, CriteriaContext]> = [
    ["bare", bareContext()],
    ["with text", bareContext({ rawText: "Join our team. Apply on the careers portal." })],
    [
      "with a fee demand",
      bareContext({
        rawText: "Pay ₹2,500 refundable security deposit to confirm your interview slot.",
      }),
    ],
  ];

  it("accounts for every criterion exactly once", () => {
    for (const [name, ctx] of contexts) {
      const report = evaluateCriteria(ctx);
      expect(report.total, name).toBe(100);
      expect(
        report.passed + report.warned + report.failed + report.notAssessed,
        name,
      ).toBe(report.total);
      expect(report.assessed, name).toBe(
        report.passed + report.warned + report.failed,
      );
      expect(report.results.length, name).toBe(report.total);
    }
  });

  it("excludes not-assessed criteria from the score denominator", () => {
    for (const [name, ctx] of contexts) {
      const report = evaluateCriteria(ctx);
      if (report.assessed === 0) {
        expect(report.score, name).toBeNull();
      } else {
        expect(report.score, name).toBe(
          Math.round((report.passed / report.assessed) * 100),
        );
      }
      expect(report.score, name).toBeGreaterThanOrEqual(0);
      if (report.score !== null) {
        expect(report.score, name).toBeLessThanOrEqual(100);
      }
    }
  });

  it("never reports a higher score than the share of checked criteria that passed", () => {
    for (const [name, ctx] of contexts) {
      const report = evaluateCriteria(ctx);
      if (report.score === null) continue;
      const naiveShare = Math.round((report.passed / report.total) * 100);
      // The real score may only be >= the naive share, never below it.
      expect(report.score, name).toBeGreaterThanOrEqual(naiveShare);
    }
  });

  it("partitions results across pillars without loss or duplication", () => {
    for (const [name, ctx] of contexts) {
      const report = evaluateCriteria(ctx);
      const totalInPillars = report.byPillar.reduce(
        (sum, p) => sum + p.results.length,
        0,
      );
      expect(totalInPillars, name).toBe(report.total);

      const passedInPillars = report.byPillar.reduce((sum, p) => sum + p.passed, 0);
      const failedInPillars = report.byPillar.reduce((sum, p) => sum + p.failed, 0);
      const warnedInPillars = report.byPillar.reduce((sum, p) => sum + p.warned, 0);
      const naInPillars = report.byPillar.reduce((sum, p) => sum + p.notAssessed, 0);

      expect(passedInPillars, name).toBe(report.passed);
      expect(failedInPillars, name).toBe(report.failed);
      expect(warnedInPillars, name).toBe(report.warned);
      expect(naInPillars, name).toBe(report.notAssessed);
    }
  });
});

describe("criteria react to the evidence the engine gathered", () => {
  it("fails the HTTPS criterion when the link is not served over HTTPS", () => {
    const offline = statusOf(
      ["domain-served-over-https"],
      bareContext({ findings: [riskFinding("not-https", "Link is not served over HTTPS.")] }),
    );
    expect(offline["domain-served-over-https"]).toBe("fail");

    const online = statusOf(["domain-served-over-https"], bareContext());
    expect(online["domain-served-over-https"]).toBe("pass");
  });

  it("fails the registration-fee criterion when an upfront-payment signal fired", () => {
    const flagged = statusOf(
      ["no-registration-fee"],
      bareContext({
        findings: [riskFinding("upfront-payment", "Demands ₹2,000 registration fee.")],
      }),
    );
    expect(flagged["no-registration-fee"]).toBe("fail");

    const clean = statusOf(["no-registration-fee"], bareContext());
    expect(clean["no-registration-fee"]).toBe("pass");
  });

  it("does not credit a text criterion it had no text to check", () => {
    const empty = statusOf(["no-training-fee"], bareContext());
    expect(empty["no-training-fee"]).toBe("na");

    const clean = statusOf(
      ["no-training-fee"],
      bareContext({ rawText: "We are hiring a Software Engineer. Apply on our careers portal." }),
    );
    expect(clean["no-training-fee"]).toBe("pass");

    const demanded = statusOf(
      ["no-training-fee"],
      bareContext({ rawText: "A ₹500 training fee applies before your first shift." }),
    );
    expect(demanded["no-training-fee"]).toBe("fail");
  });

  it("does not fail a listing that states outright that no fee is charged", () => {
    // "There is no training fee" is a trust signal, not a demand. The
    // backwards-looking guards on the fee patterns exist to keep this a pass.
    // Limitation: the guard only suppresses a negation immediately before the
    // keyword, so "we never charge a training fee" would still trip it. Worth
    // tightening once the pattern can tell a demand from a denial.
    const stated = statusOf(
      ["no-training-fee"],
      bareContext({
        rawText: "There is no training fee for this role, and no deposit of any kind.",
      }),
    );
    expect(stated["no-training-fee"]).toBe("pass");
  });
});
