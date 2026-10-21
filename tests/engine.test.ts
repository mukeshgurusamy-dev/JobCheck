import { describe, it, expect } from "vitest";
import { analyzeJob } from "../src/engine/engine";

describe("Anti-fraud warning detection", () => {
  it("should detect HPE's recruitment fraud alert and convert upfront-payment to trust", () => {
    const res = analyzeJob({
      url: "https://careers.hpe.com/job/123",
      description: `
        Recruitment Fraud Alert

        Hewlett Packard Enterprise (HPE) is aware of fraudulent recruitment activities.
        We will never charge a candidate a registration fee, hiring fee, or any other fee in connection with its recruitment and hiring process.

        This is a real job posting for a Senior Software Engineer. We are hiring!
      `,
      fetched: {
        status: 200,
        finalUrl: "https://careers.hpe.com/job/123",
        redirectChain: [],
        title: "Senior Software Engineer - HPE",
        text: "Real job posting",
        domainAgeDays: 5000,
        safeBrowsingFlagged: false
      }
    });

    console.log("=== HPE Test Results ===");
    console.log("Score:", res.score);
    console.log("Level:", res.level);
    console.log("Findings:", res.findings.map(f => ({ id: f.id, kind: f.kind, points: f.points })));
    console.log("Has anti-fraud-warning-legitimate:", res.findings.some(f => f.id === "anti-fraud-warning-legitimate"));
    console.log("Has upfront-payment:", res.findings.some(f => f.id === "upfront-payment"));

    expect(res.findings.some(f => f.id === "anti-fraud-warning-legitimate")).toBe(true);
    expect(res.findings.some(f => f.id === "upfront-payment")).toBe(false);
  });
});

describe("Engine Core: analyzeJob integration", () => {

  it("shortened link returns risk findings and medium/high score", () => {
    const res = analyzeJob({ url: "https://bit.ly/fresher-hiring" });
    const hasShortenerFinding = res.findings.some((f) => f.id === "shortener");
    expect(hasShortenerFinding).toBe(true);
    expect(res.confidence).toBe("Low"); // no description or domain age yet
  });

  it("lookalike domain on .xyz returns High risk and hard floor", () => {
    const res = analyzeJob({ url: "https://infosyss.xyz/apply-online" });
    const hasLookalike = res.findings.some((f) => f.id === "lookalike-brand");
    const hasTld = res.findings.some((f) => f.id === "suspicious-tld");

    expect(hasLookalike).toBe(true);
    expect(hasTld).toBe(true);
    expect(res.level).toBe("High");
  });

  it("clean corporate careers portal returns Low risk", () => {
    const res = analyzeJob({
      url: "https://careers.google.com/jobs/results/123456",
      fetched: {
        status: 200,
        finalUrl: "https://careers.google.com/jobs/results/123456",
        redirectChain: [],
        title: "Software Engineer - Google Careers",
        text: "Responsibilities: Design and implement software solutions...",
        domainAgeDays: 9000,
        safeBrowsingFlagged: false
      }
    });

    expect(res.level).toBe("Low");
    expect(res.confidence).toBe("High");
  });

  it("unfetched LinkedIn link prompts to paste description", () => {
    const res = analyzeJob({
      url: "https://www.linkedin.com/jobs/view/987654321"
    });

    expect(res.confidence).toBe("Low");
    expect(res.nextSteps[0]).toContain("The platform is genuine, but individual postings can still be fake");
  });

  it("detects and analyzes external scam links embedded in description text", () => {
    const res = analyzeJob({
      url: "https://www.linkedin.com/jobs/view/987654321",
      description: `
        TCS Ninja Hiring 2026. Spot offer letter will be provided.
        Confirm your registration at https://tcs-careers-entry.xyz/apply now!
      `,
      extractedLinks: [
        {
          url: "https://tcs-careers-entry.xyz/apply",
          fetched: true,
          data: {
            status: 200,
            finalUrl: "https://tcs-careers-entry.xyz/apply",
            redirectChain: [],
            title: "TCS Entry Registration",
            text: "Pay ₹2,000 security deposit for gate pass and interview kit.",
            domainAgeDays: 12,
            safeBrowsingFlagged: false
          }
        }
      ]
    });

    expect(res.linkAssessments).toBeDefined();
    expect(res.linkAssessments?.length).toBe(1);

    const subLink = res.linkAssessments![0]!;
    expect(subLink.url).toBe("https://tcs-careers-entry.xyz/apply");
    expect(subLink.assessment.level).toBe("High");
    expect(subLink.assessment.findings.some((f) => f.id === "upfront-payment")).toBe(true);

    // Parent assessment should stay Low since the JOB POSTING itself is safe
    // The risky link is shown separately in linkAssessments
    // Forcing parent to High just because of an embedded link is the bug we fixed
    expect(res.level).toBe("Low");
    expect(res.findings.some((f) => f.id === "link-in-description-high-risk")).toBe(false);
  });

  it("identifies official-portal-verified signal on corporate careers pages", () => {
    const res = analyzeJob({
      url: "https://www.tcs.com/careers",
      fetched: {
        status: 200,
        finalUrl: "https://www.tcs.com/careers",
        redirectChain: [],
        title: "TCS Careers",
        text: "TCS is an equal opportunity employer. Explore active careers and campus recruitment.",
        domainAgeDays: 10545,
        safeBrowsingFlagged: false,
        fetchSource: "jina",
      },
    });

    expect(res.level).toBe("Low");
    expect(res.confidence).toBe("High");
    expect(res.findings.some((f) => f.id === "official-portal-verified")).toBe(true);
  });

  it("detects 'pay to get a job' scam phrase and flags as High risk", () => {
    const res = analyzeJob({
      url: "https://quick-jobs-portal.com/job/123",
      description: "You must pay ₹4,000 to get a job placement in our company. 100% job guarantee.",
    });

    expect(res.level).toBe("High");
    expect(res.findings.some((f) => f.id === "upfront-payment")).toBe(true);
  });

  it("escalates score to High risk when Google AI Search identifies online fraud complaints", () => {
    const res = analyzeJob({
      url: "https://tcs-careers-spot-offer.com/apply",
      aiIntel: {
        status: "completed",
        isScamLikely: true,
        summary: "Domain reported on Reddit r/developersIndia for charging ₹3,500 fake interview fees.",
        scamSignals: ["Fake interview fee reports on Reddit", "Domain not affiliated with official TCS"],
        adjustmentPoints: 40,
      },
    });

    expect(res.level).toBe("High");
    expect(res.score).toBeGreaterThanOrEqual(75);
    expect(res.findings.some((f) => f.id === "ai-threat-intelligence")).toBe(true);
    expect(res.aiIntel?.isScamLikely).toBe(true);
  });

  it("adds trust findings and lowers risk when Google AI Search verifies official entity", () => {
    const res = analyzeJob({
      url: "https://careers.infosys.com",
      aiIntel: {
        status: "completed",
        isScamLikely: false,
        summary: "Verified official global careers portal of Infosys Limited.",
        officialDomain: "infosys.com",
        trustSignals: ["Official corporate careers portal", "Zero upfront payment complaints"],
        adjustmentPoints: -20,
      },
    });

    expect(res.level).toBe("Low");
    expect(res.findings.some((f) => f.id === "ai-verified-entity")).toBe(true);
  });
});

