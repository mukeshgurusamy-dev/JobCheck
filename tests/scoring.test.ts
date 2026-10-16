import { describe, it, expect } from "vitest";
import { computeAssessment } from "../src/engine/scoring";
import { Finding } from "../src/types/types";

describe("Scoring & Assessment Logic", () => {
  it("caps total trust reduction at 30 points", () => {
    const findings: Finding[] = [
      { id: "trust-1", kind: "trust", severity: "medium", points: -20, reason: "Trust signal 1" },
      { id: "trust-2", kind: "trust", severity: "medium", points: -20, reason: "Trust signal 2" }
    ];

    const assessment = computeAssessment({
      findings,
      hasDescriptionOrPageText: true,
      hasDomainAge: true,
      pageFetched: true,
      hostname: "careers.example.com"
    });

    // Score cannot be negative, clamped to 0
    expect(assessment.score).toBe(0);
    expect(assessment.level).toBe("Low");
  });

  it("floors level to High when high-risk hard flags exist regardless of score", () => {
    // Only one finding with 20 points, but it's a hard flag (upfront-payment)
    const findings: Finding[] = [
      { id: "upfront-payment", kind: "risk", severity: "high", points: 20, reason: "Asks for registration fee" }
    ];

    const assessment = computeAssessment({
      findings,
      hasDescriptionOrPageText: true,
      hasDomainAge: false,
      pageFetched: true,
      hostname: "jobs.example.com"
    });

    // Score is 20 (normally Low), but hard flag forces High!
    expect(assessment.score).toBe(20);
    expect(assessment.level).toBe("High");
  });

  it("floors level to at least Medium when lookalike-brand exists", () => {
    const findings: Finding[] = [
      { id: "lookalike-brand", kind: "risk", severity: "high", points: 15, reason: "Lookalike domain" }
    ];

    const assessment = computeAssessment({
      findings,
      hasDescriptionOrPageText: false,
      hasDomainAge: false,
      pageFetched: false,
      hostname: "infosyss.com"
    });

    // Score is 15 (normally Low), but lookalike forces at least Medium
    expect(assessment.level).toBe("Medium");
  });

  it("calculates confidence levels correctly", () => {
    // Both available -> High
    const highConf = computeAssessment({
      findings: [],
      hasDescriptionOrPageText: true,
      hasDomainAge: true,
      pageFetched: true,
      hostname: "example.com"
    });
    expect(highConf.confidence).toBe("High");

    // Only one available -> Medium
    const medConf = computeAssessment({
      findings: [],
      hasDescriptionOrPageText: false,
      hasDomainAge: true,
      pageFetched: true,
      hostname: "example.com"
    });
    expect(medConf.confidence).toBe("Medium");

    // Neither available -> Low
    const lowConf = computeAssessment({
      findings: [],
      hasDescriptionOrPageText: false,
      hasDomainAge: false,
      pageFetched: false,
      hostname: "example.com"
    });
    expect(lowConf.confidence).toBe("Low");
    expect(lowConf.nextSteps[0]).toContain("Confidence is Low");
  });

  it("adds special note if trusted job platform is unfetched", () => {
    const assessment = computeAssessment({
      findings: [],
      hasDescriptionOrPageText: false,
      hasDomainAge: false,
      pageFetched: false,
      hostname: "www.linkedin.com"
    });

    expect(assessment.nextSteps[0]).toContain("The platform is genuine, but individual postings can still be fake");
  });
});
