import { describe, it, expect } from "vitest";
import { analyzeJob, extractCompanyName } from "../src/engine/engine";
import { createResultPanel } from "../src/components/ResultPanel/ResultPanel";
import { CompanyAuditChecklist, JobInput } from "../src/types/types";

describe("Company 100-Criteria Background Verification & Audit", () => {
  describe("extractCompanyName helper", () => {
    it("extracts company name from 'Company: <Name>' label", () => {
      const text = "Job Title: Software Engineer\nCompany: Tata Consultancy Services\nLocation: Siruseri, Chennai";
      expect(extractCompanyName(text)).toBe("Tata Consultancy Services");
    });

    it("extracts company name from 'About <Name>:' statement", () => {
      const text = "About Infosys Limited: We are a global leader in next-generation digital services.";
      expect(extractCompanyName(text)).toBe("Infosys Limited");
    });

    it("extracts company name from 'Join <Name>!' call to action", () => {
      const text = "Join Zoho Corporation! We are looking for talented frontend engineers.";
      expect(extractCompanyName(text)).toBe("Zoho Corporation");
    });

    it("returns undefined when no recognizable company pattern exists", () => {
      const text = "We are hiring developers. Apply now!";
      expect(extractCompanyName(text)).toBeUndefined();
    });
  });

  describe("analyzeJob with 100-Criteria Company Audit Intelligence", () => {
    it("rewards verified company meeting 100-criteria background check", () => {
      const verifiedAudit: CompanyAuditChecklist = {
        companyName: "Tata Consultancy Services (TCS)",
        auditScore: 94,
        criteriaPassedCount: 94,
        totalCriteriaCount: 100,
        overallVerdict: "verified",
        legalStatus: {
          status: "pass",
          title: "Legal Registration & MCA",
          details: "Active incorporated entity on MCA registry (CIN verified). No shell entity flags.",
        },
        physicalOffice: {
          status: "pass",
          title: "Physical Office & Infrastructure",
          details: "Physical location matched: Confirmed campus at Siruseri SIPCOT IT Park, Chennai.",
        },
        digitalFootprint: {
          status: "pass",
          title: "Digital Footprint & Domain",
          details: "Official enterprise domain: tcs.com with active corporate web presence.",
        },
        employeeReviews: {
          status: "pass",
          title: "Employee Sentiment & Ratings",
          details: "4.1★ on Glassdoor/AmbitionBox across 100,000+ verified employee reviews.",
        },
        fraudDatabaseCheck: {
          status: "pass",
          title: "Fraud & Cybercrime Check",
          details: "Clean background: 0 fraud complaints on Reddit r/developersIndia or Cybercrime portals.",
        },
        hiringAuthenticity: {
          status: "pass",
          title: "Hiring Process & Offer Authenticity",
          details: "Standard multi-stage technical screening (TCS NQT); strict zero-fee recruitment policy.",
        },
      };

      const input: JobInput = {
        url: "https://www.tcs.com/careers/india/entry-level-hiring",
        description: "Company: Tata Consultancy Services\nRole: Systems Engineer\nLocation: Siruseri, Chennai",
        aiIntel: {
          status: "completed",
          isScamLikely: false,
          companyName: "Tata Consultancy Services",
          companyAudit: verifiedAudit,
          trustSignals: ["Verified global IT services enterprise", "Physical office confirmed in Chennai"],
        },
      };

      const assessment = analyzeJob(input);
      expect(assessment.level).toBe("Low");
      expect(assessment.confidence).toBe("High");
      expect(assessment.findings.some((f) => f.id === "company-audit-passed")).toBe(true);

      const auditFinding = assessment.findings.find((f) => f.id === "company-audit-passed");
      expect(auditFinding?.reason).toContain("94/100 criteria satisfied");
      expect(auditFinding?.reason).toContain("Score: 94/100");
    });

    it("penalizes unverified/scam employer failing 100-criteria background check", () => {
      const failedAudit: CompanyAuditChecklist = {
        companyName: "Apex Quick Hire Labs",
        auditScore: 12,
        criteriaPassedCount: 12,
        totalCriteriaCount: 100,
        overallVerdict: "suspicious",
        legalStatus: {
          status: "fail",
          title: "Legal Registration & MCA",
          details: "Unregistered entity: No MCA or corporate registration records found.",
        },
        physicalOffice: {
          status: "fail",
          title: "Physical Office & Infrastructure",
          details: "Location unverified: Claimed office in T. Nagar, Chennai does not exist on Google Maps.",
        },
        digitalFootprint: {
          status: "fail",
          title: "Digital Footprint & Domain",
          details: "Ghost entity: Zero corporate domain history; uses disposable email service.",
        },
        employeeReviews: {
          status: "fail",
          title: "Employee Sentiment & Ratings",
          details: "No employee reviews on Glassdoor or AmbitionBox.",
        },
        fraudDatabaseCheck: {
          status: "fail",
          title: "Fraud & Cybercrime Check",
          details: "Flagged on Reddit r/developersIndia for demanding ₹850 security deposit.",
        },
        hiringAuthenticity: {
          status: "fail",
          title: "Hiring Process & Offer Authenticity",
          details: "Promises 100% direct spot appointment without interview.",
        },
      };

      const input: JobInput = {
        url: "https://www.linkedin.com/jobs/view/999888777",
        description: "Company: Apex Quick Hire Labs\nInstant spot appointment! Deposit ₹850 for ID badge.",
        aiIntel: {
          status: "completed",
          isScamLikely: true,
          companyName: "Apex Quick Hire Labs",
          companyAudit: failedAudit,
          scamSignals: ["False guarantee: instant spot appointment", "Demands ₹850 upfront payment"],
        },
      };

      const assessment = analyzeJob(input);
      expect(assessment.level).toBe("High");
      expect(assessment.score).toBeGreaterThanOrEqual(75);
      expect(assessment.findings.some((f) => f.id === "company-audit-failed")).toBe(true);

      const auditFinding = assessment.findings.find((f) => f.id === "company-audit-failed");
      expect(auditFinding?.reason).toContain("failed verification");
      expect(auditFinding?.reason).toContain("Score: 12/100");
    });
  });

  describe("ResultPanel UI Rendering of 100-Criteria Audit", () => {
    it("renders audit container, score pill, progress bar, and all 6 pillars", () => {
      const sampleAudit: CompanyAuditChecklist = {
        companyName: "Infosys Limited",
        auditScore: 92,
        criteriaPassedCount: 92,
        totalCriteriaCount: 100,
        overallVerdict: "verified",
        legalStatus: {
          status: "pass",
          title: "Legal Registration & MCA",
          details: "Active public listed company (L85110KA1981PLC013115).",
        },
        physicalOffice: {
          status: "pass",
          title: "Physical Office & Infrastructure",
          details: "Physical location matched: Electronic City campus, Bangalore.",
        },
        digitalFootprint: {
          status: "pass",
          title: "Digital Footprint & Domain",
          details: "Official enterprise domain: infosys.com.",
        },
        employeeReviews: {
          status: "pass",
          title: "Employee Sentiment & Ratings",
          details: "3.9★ on AmbitionBox across 80,000+ reviews.",
        },
        fraudDatabaseCheck: {
          status: "pass",
          title: "Fraud & Cybercrime Check",
          details: "Clean background record — zero fraud reports.",
        },
        hiringAuthenticity: {
          status: "pass",
          title: "Hiring Process & Offer Authenticity",
          details: "Official InfyTQ / off-campus assessment drives.",
        },
      };

      const assessment = analyzeJob({
        url: "https://www.infosys.com/careers",
        description: "Join Infosys Limited as a Systems Engineer.",
        aiIntel: {
          status: "completed",
          isScamLikely: false,
          companyName: "Infosys Limited",
          companyAudit: sampleAudit,
        },
      });

      const panel = createResultPanel({
        assessment,
        onReset: () => {},
      });

      const auditContainer = panel.querySelector(".c-result-panel__audit-container");
      expect(auditContainer).not.toBeNull();

      // The pill now leads with the locally computed checklist rather than the
      // model's self-reported count, so assert against the computed report
      // instead of a hardcoded number.
      const criteria = assessment.criteria;
      expect(criteria).toBeDefined();
      const scorePill = panel.querySelector(".c-result-panel__audit-score-pill");
      expect(scorePill?.textContent).toContain(
        `${criteria!.passed}/${criteria!.assessed} Assessed Criteria Passed`,
      );

      const progressBar = panel.querySelector(".c-result-panel__audit-progress-fill");
      expect(progressBar).not.toBeNull();

      const cards = panel.querySelectorAll(".c-result-panel__audit-card");
      expect(cards.length).toBe(6);

      const cardTitles = Array.from(cards).map(
        (c) => c.querySelector(".c-result-panel__audit-card-title")?.textContent
      );
      expect(cardTitles.some((t) => t?.includes("Legal Registration & MCA"))).toBe(true);
      expect(cardTitles.some((t) => t?.includes("Physical Office & Infrastructure"))).toBe(true);
      expect(cardTitles.some((t) => t?.includes("Digital Footprint & Domain"))).toBe(true);
      expect(cardTitles.some((t) => t?.includes("Employee Sentiment & Ratings"))).toBe(true);
      expect(cardTitles.some((t) => t?.includes("Fraud & Cybercrime Check"))).toBe(true);
      expect(cardTitles.some((t) => t?.includes("Hiring Process & Offer Authenticity"))).toBe(true);
    });
  });
});
