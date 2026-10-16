import { describe, it, expect, vi } from "vitest";
import { createScoreGauge } from "../src/components/ScoreGauge/ScoreGauge";
import { createFindingItem } from "../src/components/FindingItem/FindingItem";
import { createResultPanel } from "../src/components/ResultPanel/ResultPanel";
import { Assessment, Finding } from "../src/types/types";

describe("Molecule Component: ScoreGauge", () => {
  it("creates accessible SVG meter with correct ARIA attributes", () => {
    const gauge = createScoreGauge({
      score: 75,
      level: "High",
      animated: false,
    });
    expect(gauge.getAttribute("role")).toBe("meter");
    expect(gauge.getAttribute("aria-valuenow")).toBe("75");
    expect(gauge.getAttribute("aria-valuemax")).toBe("100");
    expect(gauge.classList.contains("c-score-gauge--high")).toBe(true);

    const numberSpan = gauge.querySelector(".c-score-gauge__number");
    expect(numberSpan?.textContent).toBe("75");
  });

  it("applies correct risk skin modifiers for Low and Medium", () => {
    const lowGauge = createScoreGauge({
      score: 10,
      level: "Low",
      animated: false,
    });
    expect(lowGauge.classList.contains("c-score-gauge--low")).toBe(true);

    const medGauge = createScoreGauge({
      score: 45,
      level: "Medium",
      animated: false,
    });
    expect(medGauge.classList.contains("c-score-gauge--medium")).toBe(true);
  });
});

describe("Molecule Component: FindingItem", () => {
  it("renders risk finding securely without innerHTML vulnerabilities", () => {
    const maliciousEvidence = '<script>alert("xss")</script>';
    const finding: Finding = {
      id: "upfront-payment",
      kind: "risk",
      severity: "high",
      points: 45,
      reason: "Demands upfront registration fee",
      evidence: maliciousEvidence,
    };

    const item = createFindingItem({ finding });
    expect(item.classList.contains("c-finding-item--risk-high")).toBe(true);
    expect(item.textContent).toContain("Demands upfront registration fee");
    expect(item.textContent).toContain("+45");
    expect(item.textContent).toContain(maliciousEvidence);

    // Verify it was rendered as text and NOT executed or parsed as script
    expect(item.querySelector("script")).toBeNull();
  });

  it("renders trust signal finding with check icon", () => {
    const finding: Finding = {
      id: "structured-description",
      kind: "trust",
      severity: "low",
      points: -10,
      reason: "Structured job description",
    };

    const item = createFindingItem({ finding });
    expect(item.classList.contains("c-finding-item--trust")).toBe(true);
    expect(item.textContent).toContain("-10");
  });
});

describe("Organism Component: ResultPanel", () => {
  const mockAssessment: Assessment = {
    score: 80,
    level: "High",
    confidence: "Medium",
    findings: [
      {
        id: "upfront-payment",
        kind: "risk",
        severity: "high",
        points: 45,
        reason: "Registration fee required",
      },
      {
        id: "shortener",
        kind: "risk",
        severity: "medium",
        points: 20,
        reason: "Uses bit.ly shortener",
      },
    ],
    nextSteps: [
      "Verify on the company official careers page directly.",
      "Report fraud at cybercrime.gov.in or helpline 1930.",
    ],
  };

  it("renders summary, level badge, findings, and checklist", () => {
    const handleReset = vi.fn();
    const panel = createResultPanel({
      assessment: mockAssessment,
      fetchNotice: "Could not read remote page.",
      onReset: handleReset,
    });
    document.body.appendChild(panel);

    // Level badge
    expect(panel.textContent).toContain("High Risk");

    // Notice banner
    expect(panel.textContent).toContain("Could not read remote page.");

    // Findings
    expect(panel.textContent).toContain("Registration fee required");
    expect(panel.textContent).toContain("Uses bit.ly shortener");

    // Checklist with linked cybercrime portal
    expect(panel.textContent).toContain(
      "Verify on the company official careers page",
    );
    const link = panel.querySelector('a[href="https://cybercrime.gov.in"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("cybercrime.gov.in");

    // Reset button
    const buttons = Array.from(panel.querySelectorAll("button"));
    const resetBtn = buttons.find((b) =>
      b.textContent?.includes("Check Another Link"),
    );
    expect(resetBtn).toBeDefined();
    resetBtn?.click();
    expect(handleReset).toHaveBeenCalledTimes(1);

    document.body.removeChild(panel);
  });

  it("renders embedded links inspection section and per-link risk card when present", () => {
    const assessmentWithLinks: Assessment = {
      ...mockAssessment,
      linkAssessments: [
        {
          url: "https://tcs-interview-fee.xyz/apply",
          assessment: {
            score: 85,
            level: "High",
            confidence: "High",
            findings: [
              {
                id: "upfront-payment",
                kind: "risk",
                severity: "high",
                points: 45,
                reason: "Pay ₹4000 registration charge",
              },
              {
                id: "suspicious-tld",
                kind: "risk",
                severity: "medium",
                points: 15,
                reason: "Hosted on .xyz disposable TLD",
              }
            ],
            nextSteps: []
          },
          fetchNotice: null
        }
      ]
    };

    const panel = createResultPanel({
      assessment: assessmentWithLinks,
      onReset: vi.fn()
    });
    document.body.appendChild(panel);

    // Should render Embedded Links Inspection title
    expect(panel.textContent).toContain("Embedded Links Inspection");
    expect(panel.textContent).toContain("https://tcs-interview-fee.xyz/apply");
    expect(panel.textContent).toContain("Pay ₹4000 registration charge");
    expect(panel.textContent).toContain("Security Warning");

    document.body.removeChild(panel);
  });

  it("renders scam complaints with reviewer details, platform badge, complaint text, and source links", () => {
    const assessmentWithAiScam: Assessment = {
      ...mockAssessment,
      aiIntel: {
        status: "completed",
        isScamLikely: true,
        companyName: "Scammy Corp Private Limited",
        officialDomain: "scammycorp.com",
        officialLinkedinUrl: "https://linkedin.com/company/scammycorp",
        employeeReviews: [
          {
            source: "Glassdoor",
            sourceUrl: "https://glassdoor.co.in/Reviews/scammy-corp-reviews.htm",
            rating: 1.5,
            totalReviews: 42,
            positiveHighlights: [],
            negativeHighlights: ["Fake offer letters", "Demands money"],
            scamWarnings: ["Asks for registration fees"],
            scamReports: [
              {
                platform: "Glassdoor",
                reviewerName: "Rahul Sharma",
                reviewerRole: "Fresher Candidate",
                complaintText: "They called me for an interview and asked for ₹3500 via UPI as gate pass fee.",
                reportedAt: "February 2025",
                sourceUrl: "https://glassdoor.co.in/Reviews/review-123.htm"
              }
            ]
          }
        ],
        locationVerification: {
          jobLocationFromDescription: "Bengaluru, Karnataka",
          matched: true,
          isExactMatch: true,
          verificationStatus: "verified",
          reason: "Exact match between job location and company's verified address"
        },
        companyLocation: {
          fullAddress: "Plot 42, Electronic City, Bengaluru, Karnataka 560100, India",
          city: "Bengaluru",
          state: "Karnataka",
          country: "India"
        },
        companyAudit: {
          companyName: "Scammy Corp Private Limited",
          auditScore: 25,
          criteriaPassedCount: 1,
          totalCriteriaCount: 6,
          overallVerdict: "suspicious",
          legalStatus: {
            status: "pass",
            title: "Legal Registration & Incorporation",
            details: "Active MCA registration found. CIN: U72900KA2020PTC123456.",
            sourceUrl: "https://zaubacorp.com/company/SCAMMY-CORP/U72900KA2020PTC123456"
          },
          physicalOffice: {
            status: "warn",
            title: "Physical Office & Infrastructure",
            details: "Residential address found.",
            sourceUrl: "https://maps.google.com/?q=residential+address"
          },
          digitalFootprint: {
            status: "fail",
            title: "Digital Footprint & Domain",
            details: "Domain registered 3 days ago.",
            sourceUrl: "https://whois.com/scammycorp.com"
          },
          employeeReviews: {
            status: "fail",
            title: "Employee Reviews & Sentiment",
            details: "Multiple fraud complaints.",
            sourceUrl: "https://glassdoor.co.in/Reviews/scammycorp"
          },
          fraudDatabaseCheck: {
            status: "fail",
            title: "Fraud & Scam Threat Intelligence",
            details: "Reported on cybercrime forums.",
            sourceUrl: "https://reddit.com/r/developersIndia/search?q=scammycorp"
          },
          hiringAuthenticity: {
            status: "fail",
            title: "Hiring Process & Offer Authenticity",
            details: "Offers direct joining after fee payment."
          }
        }
      }
    };

    const panel = createResultPanel({
      assessment: assessmentWithAiScam,
      onReset: vi.fn()
    });
    document.body.appendChild(panel);

    // 1. Verify scam complaints container and details
    expect(panel.textContent).toContain("Individual Scam Complaints Found (1)");
    expect(panel.textContent).toContain("Rahul Sharma");
    expect(panel.textContent).toContain("Fresher Candidate");
    expect(panel.textContent).toContain("February 2025");
    expect(panel.textContent).toContain("Glassdoor");
    expect(panel.textContent).toContain("They called me for an interview and asked for ₹3500 via UPI as gate pass fee.");

    // Verify source link for the scam complaint
    const complaintLink = panel.querySelector('a[href="https://glassdoor.co.in/Reviews/review-123.htm"]');
    expect(complaintLink).not.toBeNull();
    expect(complaintLink?.textContent).toContain("View original complaint");

    // 2. Verify platform review page source link
    const reviewPlatformLink = panel.querySelector('a[href="https://glassdoor.co.in/Reviews/scammy-corp-reviews.htm"]');
    expect(reviewPlatformLink).not.toBeNull();
    expect(reviewPlatformLink?.textContent).toContain("View reviews");

    // 3. Verify location verification source link
    const locationLink = panel.querySelector('a[href="https://maps.google.com/?q=Plot+42+Electronic+City"]');
    expect(locationLink).not.toBeNull();
    expect(locationLink?.textContent).toContain("Google Maps Verified Business");

    // 4. Verify audit pillar source link — only appears for status="pass" pillars.
    // The legalStatus pillar is now "pass" with a company-specific Zauba URL.
    const mcaLink = panel.querySelector('a[href="https://zaubacorp.com/company/SCAMMY-CORP/U72900KA2020PTC123456"]');
    expect(mcaLink).not.toBeNull();
    expect(mcaLink?.textContent).toContain("View source");

    // Fail/warn pillars must NOT show source links (they would point to generic search pages).
    const failPillarLink = panel.querySelector('a[href*="maps.google.com/?q=residential"]');
    expect(failPillarLink).toBeNull();

    // 5. Verify official domain & LinkedIn chips
    const websiteChip = panel.querySelector('a[href="https://scammycorp.com"]');
    expect(websiteChip).not.toBeNull();
    expect(websiteChip?.textContent).toContain("Official Website");

    const linkedinChip = panel.querySelector('a[href="https://linkedin.com/company/scammycorp"]');
    expect(linkedinChip).not.toBeNull();
    expect(linkedinChip?.textContent).toContain("LinkedIn Company Page");

    document.body.removeChild(panel);
  });
});


