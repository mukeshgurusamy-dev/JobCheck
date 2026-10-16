import { describe, it, expect } from "vitest";
import { Assessment } from "../src/types/types";
import {
  generateAuditReportHtml,
  resolveCompanyName,
  resolveCompanyAudit,
  getReportFilename,
} from "../src/utils/pdfReport";

describe("PDF Report Generator", () => {
  const sampleScamAssessment: Assessment = {
    score: 85,
    level: "High",
    confidence: "High",
    findings: [
      {
        id: "fee-gatepass-01",
        kind: "risk",
        severity: "high",
        points: 40,
        reason: "Demands ₹2,500 upfront registration fee for interview gate pass.",
        evidence: "Pay ₹2,500 refundable security deposit before slot confirmation.",
      },
      {
        id: "chat-whatsapp-01",
        kind: "risk",
        severity: "medium",
        points: 20,
        reason: "Recruiter redirects communication to unmonitored WhatsApp channel.",
        evidence: "Contact HR Sneha on WhatsApp 9876543210.",
      },
    ],
    nextSteps: [
      "Do not pay any fee or transfer money via UPI/QR code.",
      "Stop communication with the recruiter.",
      "Report fraud to cybercrime.gov.in or helpline 1930.",
    ],
    aiIntel: {
      status: "completed",
      companyName: "Tridin Software",
      companyAudit: {
        companyName: "Tridin Software Private Limited",
        auditScore: 33,
        criteriaPassedCount: 2,
        totalCriteriaCount: 6,
        overallVerdict: "unverified",
        legalStatus: {
          status: "fail",
          title: "Unverified Legal Identity",
          details: "No verifiable MCA Corporate Identification Number (CIN/LLPIN) found.",
        },
        physicalOffice: {
          status: "fail",
          title: "No Confirmed Physical Office",
          details: "Claimed address not matched in commercial zoning registry.",
        },
        digitalFootprint: {
          status: "fail",
          title: "Disposable / Lookalike Domain",
          details: "Registered less than 30 days ago on disposable registrar.",
        },
        employeeReviews: {
          status: "warn",
          title: "Zero Verified Employees",
          details: "No authentic employee presence on Glassdoor or LinkedIn.",
        },
        fraudDatabaseCheck: {
          status: "fail",
          title: "Flagged on Fraud Syndicates",
          details: "UPI ID associated with known payment fraud reports.",
        },
        hiringAuthenticity: {
          status: "fail",
          title: "Illegal Fee Demand",
          details: "Mandatory interview gate pass deposit violates zero-fee policy.",
        },
      },
      claimVerifications: [
        {
          claimType: "salary",
          claimedValue: "₹85,000 / month for fresher",
          verifiedStatus: "contradicted",
          details: "Industry standard for entry level role is ₹25,000 - ₹35,000.",
        },
      ],
    },
  };

  const sampleLegitAssessment: Assessment = {
    score: 0,
    level: "Low",
    confidence: "High",
    findings: [],
    nextSteps: [
      "Confirm application status on the official corporate careers portal.",
      "Ensure all communications originate from the official domain.",
    ],
    aiIntel: {
      status: "completed",
      companyName: "Tata Consultancy Services Limited",
      companyAudit: {
        companyName: "Tata Consultancy Services Limited",
        auditScore: 100,
        criteriaPassedCount: 6,
        totalCriteriaCount: 6,
        overallVerdict: "verified",
        legalStatus: {
          status: "pass",
          title: "Active Listed Public Enterprise",
          details: "CIN L22210MH1995PLC084781 active with ROC Mumbai.",
        },
        physicalOffice: {
          status: "pass",
          title: "Confirmed Global Headquarters",
          details: "TCS House, Raveline Street, Fort, Mumbai 400001.",
        },
        digitalFootprint: {
          status: "pass",
          title: "Authentic Enterprise Domain",
          details: "tcs.com registered in 1995 with enterprise SSL certification.",
        },
        employeeReviews: {
          status: "pass",
          title: "600,000+ Verified Employees",
          details: "Glassdoor 3.8/5 rating across 150,000+ employee reviews.",
        },
        fraudDatabaseCheck: {
          status: "pass",
          title: "Clean Anti-Fraud Standing",
          details: "No adverse listings across national cybercrime directories.",
        },
        hiringAuthenticity: {
          status: "pass",
          title: "Strict Zero-Fee Policy",
          details: "Multi-stage assessment via TCS iON portal with zero candidate fees.",
        },
      },
    },
  };

  it("generates user-requested filename: JobCheck━company name.pdf", () => {
    const filename1 = getReportFilename("Tridin Software Private Limited");
    expect(filename1).toBe("JobCheck━Tridin Software Private Limited.pdf");

    const filename2 = getReportFilename("Tata Consultancy Services Limited");
    expect(filename2).toBe("JobCheck━Tata Consultancy Services Limited.pdf");
  });

  it("resolves company name with legal entity suffix and never uses platform name", () => {
    const name1 = resolveCompanyName(sampleScamAssessment);
    expect(name1).toBe("Tridin Software Private Limited");

    const name2 = resolveCompanyName(sampleLegitAssessment);
    expect(name2).toBe("Tata Consultancy Services Limited");

    // Job posted on LinkedIn with company in description
    const linkedInBareAssessment: Assessment = {
      score: 10,
      level: "Low",
      confidence: "Medium",
      findings: [],
      nextSteps: [],
    };
    const extractedFromLinkedIn = resolveCompanyName(
      linkedInBareAssessment,
      "https://www.linkedin.com/jobs/view/123456",
      "Company: Tridin Software\nSoftware Engineer role."
    );
    expect(extractedFromLinkedIn).toBe("Tridin Software Private Limited");
    expect(extractedFromLinkedIn.toLowerCase()).not.toContain("linkedin");

    // Job posted on Naukri with no description
    const naukriNoDesc = resolveCompanyName(
      linkedInBareAssessment,
      "https://www.naukri.com/job-listings-123456"
    );
    expect(naukriNoDesc).toBe("Hiring Organization (Name Unspecified)");
    expect(naukriNoDesc.toLowerCase()).not.toContain("naukri");
  });

  it("resolves 6-pillar company audit checklist even when aiIntel is missing", () => {
    const bareAssessment: Assessment = {
      score: 90,
      level: "High",
      confidence: "Medium",
      findings: [
        {
          id: "fee-01",
          kind: "risk",
          severity: "high",
          points: 40,
          reason: "Demands ₹2,000 training fee.",
        },
      ],
      nextSteps: ["Do not pay money."],
    };

    const audit = resolveCompanyAudit(bareAssessment, "Wipro Lookalike Private Limited");
    expect(audit.companyName).toBe("Wipro Lookalike Private Limited");
    expect(audit.totalCriteriaCount).toBe(6);
    expect(audit.legalStatus).toBeDefined();
    expect(audit.physicalOffice).toBeDefined();
    expect(audit.digitalFootprint).toBeDefined();
    expect(audit.employeeReviews).toBeDefined();
    expect(audit.fraudDatabaseCheck).toBeDefined();
    expect(audit.hiringAuthenticity).toBeDefined();
    expect(audit.hiringAuthenticity.status).toBe("fail");
  });

  it("generates complete HTML report with all required sections for scam job", () => {
    const html = generateAuditReportHtml(sampleScamAssessment, "https://tcs-careers.xyz/apply");

    // Company Name
    expect(html).toContain("Tridin Software Private Limited");

    // Score & Risk Level
    expect(html).toContain("85 / 100");
    expect(html).toContain("HIGH RISK");

    // Clear Scam Verdict & Advice
    expect(html).toContain("DO NOT APPLY — AND DO NOT PAY ANYTHING");
    expect(html).toContain("legitimate employers never ask a candidate for money");
    expect(html).toContain("Do not pay any fee");
    expect(html).toContain("Do not share Aadhaar");
    expect(html).toContain("cybercrime.gov.in");
    expect(html).toContain("1930");

    // All 6 Pillars
    expect(html).toContain("Legal &amp; MCA Corporate Status");
    expect(html).toContain("Physical Office Infrastructure");
    expect(html).toContain("Website &amp; Domain Security");
    expect(html).toContain("Workforce &amp; Employee Reviews");
    expect(html).toContain("Cybercrime &amp; Blacklist Screening");
    expect(html).toContain("Hiring Process Authenticity");

    // Detailed Findings
    expect(html).toContain("Demands ₹2,500 upfront registration fee");
    expect(html).toContain("Pay ₹2,500 refundable security deposit");

    // Recruiter Fact-Checks
    expect(html).toContain("Recruiter Fact-Checks & Claim Grounding");
    expect(html).toContain("₹85,000 / month for fresher");
  });

  it("generates legitimate confirmation verdict for authentic job", () => {
    const html = generateAuditReportHtml(sampleLegitAssessment, "https://careers.tcs.com/job/123");

    expect(html).toContain("Tata Consultancy Services Limited");
    expect(html).toContain("0 / 100");
    expect(html).toContain("LOW RISK");
    expect(html).toContain("SAFE TO APPLY — THROUGH THE OFFICIAL PORTAL");
    expect(html).toContain("The checks we run found no scam signals on this posting");
    expect(html).toContain("PASSED ✓");
  });
});
