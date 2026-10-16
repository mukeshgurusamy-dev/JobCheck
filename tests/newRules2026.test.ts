import { describe, it, expect } from "vitest";
import { evaluateTextRules } from "../src/rules/textRules";
import { TextRuleContext } from "../src/types/types";
import { normalizeText } from "../src/engine/normalize";

describe("2026 New Detection Rules - Cryptocurrency Payment", () => {
  it("should detect cryptocurrency payment requests", () => {
    const samples = [
      "Pay joining fee of ₹5000 in USDT to this TRC-20 address",
      "Deposit amount via Bitcoin wallet to activate account",
      "Send registration fee using cryptocurrency only",
      "Top-up your wallet in crypto to unlock daily tasks",
      "Minimum USDT deposit required to start earning",
      "Withdraw your earnings in Bitcoin or Ethereum",
      "Connect your MetaMask wallet to verify identity",
    ];

    for (const text of samples) {
      const ctx: TextRuleContext = {
        rawText: text,
        normalizedText: normalizeText(text),
        websiteDomain: "example.com",
      };

      const findings = evaluateTextRules(ctx);
      const cryptoFinding = findings.find((f) => f.id === "cryptocurrency-payment");

      expect(cryptoFinding).toBeDefined();
      expect(cryptoFinding?.severity).toBe("high");
      expect(cryptoFinding?.points).toBe(45);
    }
  });

  it("should not flag legitimate crypto job roles", () => {
    const legitimateText = `
      We are hiring a Blockchain Developer
      Skills: Solidity, Web3, Ethereum smart contracts
      Experience with cryptocurrency exchanges is a plus
    `;

    const ctx: TextRuleContext = {
      rawText: legitimateText,
      normalizedText: normalizeText(legitimateText),
      websiteDomain: "techcorp.com",
    };

    const findings = evaluateTextRules(ctx);
    const cryptoFinding = findings.find((f) => f.id === "cryptocurrency-payment");

    expect(cryptoFinding).toBeUndefined();
  });
});

describe("2026 New Detection Rules - Investment Scheme", () => {
  it("should detect investment schemes disguised as jobs", () => {
    const samples = [
      "Invest ₹10,000 and earn guaranteed 15% ROI daily",
      "Forex trading job with assured profit and zero loss",
      "Binary options trading with fixed returns of 20% weekly",
      "Capital required to start this trading opportunity",
      "Day trading position with guaranteed returns",
      "Passive income with one-time investment of ₹5000",
    ];

    for (const text of samples) {
      const ctx: TextRuleContext = {
        rawText: text,
        normalizedText: normalizeText(text),
        websiteDomain: "example.com",
      };

      const findings = evaluateTextRules(ctx);
      const investmentFinding = findings.find((f) => f.id === "investment-scheme");

      expect(investmentFinding).toBeDefined();
      expect(investmentFinding?.severity).toBe("high");
      expect(investmentFinding?.points).toBe(40);
    }
  });
});

describe("2026 New Detection Rules - Advance Salary Loan", () => {
  it("should detect advance salary loan scams", () => {
    const samples = [
      "Get advance salary before joining, just pay processing fee",
      "Salary in advance available, insurance charges apply",
      "Receive ₹50,000 advance before start date",
      "Loan against salary before joining, processing fee ₹2000",
      "Instant salary advance available after paying verification fee",
      "Collect advance payment by paying insurance charges",
    ];

    for (const text of samples) {
      const ctx: TextRuleContext = {
        rawText: text,
        normalizedText: normalizeText(text),
        websiteDomain: "example.com",
      };

      const findings = evaluateTextRules(ctx);
      const advanceFinding = findings.find((f) => f.id === "advance-salary-loan");

      expect(advanceFinding).toBeDefined();
      expect(advanceFinding?.severity).toBe("high");
      expect(advanceFinding?.points).toBe(35);
    }
  });
});

describe("2026 New Detection Rules - Fake Government Job", () => {
  it("should detect fake government job scams", () => {
    const samples = [
      "Government job guaranteed, registration fee ₹1500",
      "Railway recruitment, application processing charges apply",
      "Indian Army vacancy, pay fee to secure position",
      "UPSC exam guaranteed shortcut, fee required",
      "Sarkari Naukri confirmed after payment of ₹3000",
      "PSU Bank PO recruitment, processing charges ₹2500",
    ];

    for (const text of samples) {
      const ctx: TextRuleContext = {
        rawText: text,
        normalizedText: normalizeText(text),
        websiteDomain: "example.com",
      };

      const findings = evaluateTextRules(ctx);
      const govFinding = findings.find((f) => f.id === "fake-government-job");

      expect(govFinding).toBeDefined();
      expect(govFinding?.severity).toBe("high");
      expect(govFinding?.points).toBe(40);
    }
  });

  it("should not flag legitimate government job portals", () => {
    const legitimateText = `
      Visit the official UPSC website at upsc.gov.in
      Apply through the government portal
      No fees charged for application
    `;

    const ctx: TextRuleContext = {
      rawText: legitimateText,
      normalizedText: normalizeText(legitimateText),
      websiteDomain: "upsc.gov.in",
    };

    const findings = evaluateTextRules(ctx);
    const govFinding = findings.find((f) => f.id === "fake-government-job");

    expect(govFinding).toBeUndefined();
  });
});

describe("2026 New Detection Rules - Data Harvesting", () => {
  it("should detect suspicious data collection requests", () => {
    const samples = [
      "Submit biometric fingerprint data for verification",
      "Provide parents Aadhaar and PAN card details",
      "3 personal references with full Aadhaar details mandatory",
      "Family members bank account information required",
      "Download our app to complete KYC verification",
      "Nominee bank account and PAN card needed",
    ];

    for (const text of samples) {
      const ctx: TextRuleContext = {
        rawText: text,
        normalizedText: normalizeText(text),
        websiteDomain: "example.com",
      };

      const findings = evaluateTextRules(ctx);
      const dataFinding = findings.find((f) => f.id === "data-harvesting");

      expect(dataFinding).toBeDefined();
      expect(dataFinding?.severity).toBe("medium");
      expect(dataFinding?.points).toBe(30);
    }
  });
});

describe("2026 New Detection Rules - Fake Internship Conversion", () => {
  it("should detect fake internship with job guarantee scams", () => {
    const samples = [
      "Paid internship with 100% job guarantee, registration fee ₹3000",
      "Internship cum placement, enrollment charges apply",
      "6 months internship then guaranteed PPO, internship fee ₹5000",
      "Pay for internship and get assured full-time offer",
      "₹4000 internship fee refundable after job placement",
      "Intern for 3 months then direct hiring confirmed",
    ];

    for (const text of samples) {
      const ctx: TextRuleContext = {
        rawText: text,
        normalizedText: normalizeText(text),
        websiteDomain: "example.com",
      };

      const findings = evaluateTextRules(ctx);
      const internFinding = findings.find((f) => f.id === "fake-internship-conversion");

      expect(internFinding).toBeDefined();
      expect(internFinding?.severity).toBe("high");
      expect(internFinding?.points).toBe(35);
    }
  });
});

describe("2026 New Detection Rules - Fake Verification Portal", () => {
  it("should detect fake verification portal scams", () => {
    const samples = [
      "Complete background verification on our external portal",
      "Police verification charges ₹1500, pay on verification portal",
      "Click link to verify your profile and submit documents",
      "Third-party verification mandatory, payment required",
      "Background check fee on our screening website",
      "Visit verification portal to complete identity check",
    ];

    for (const text of samples) {
      const ctx: TextRuleContext = {
        rawText: text,
        normalizedText: normalizeText(text),
        websiteDomain: "example.com",
      };

      const findings = evaluateTextRules(ctx);
      const verifyFinding = findings.find((f) => f.id === "fake-verification-portal");

      expect(verifyFinding).toBeDefined();
      expect(verifyFinding?.severity).toBe("high");
      expect(verifyFinding?.points).toBe(35);
    }
  });
});

describe("2026 New Detection Rules - Exam Study Material Fee", () => {
  it("should detect exam material fee scams", () => {
    const samples = [
      "Buy study material for ₹2000 before interview",
      "Mandatory preparation kit charges ₹1500",
      "Purchase exam guide to qualify for position",
      "Mock test package compulsory, cost ₹1000",
      "Pay for preparation course before assessment",
      "Test preparation material required, fee ₹2500",
    ];

    for (const text of samples) {
      const ctx: TextRuleContext = {
        rawText: text,
        normalizedText: normalizeText(text),
        websiteDomain: "example.com",
      };

      const findings = evaluateTextRules(ctx);
      const examFinding = findings.find((f) => f.id === "exam-study-material-fee");

      expect(examFinding).toBeDefined();
      expect(examFinding?.severity).toBe("medium");
      expect(examFinding?.points).toBe(30);
    }
  });
});

describe("2026 Rules - Combined Detection Scenarios", () => {
  it("should detect multiple new scam patterns in single text", () => {
    const scamText = `
      Government bank recruitment guaranteed!
      Pay ₹3000 in USDT for registration
      Complete verification on our portal
      Get advance salary before joining
      100% placement assured
    `;

    const ctx: TextRuleContext = {
      rawText: scamText,
      normalizedText: normalizeText(scamText),
      websiteDomain: "fake-govt-jobs.com",
    };

    const findings = evaluateTextRules(ctx);

    // Should detect multiple patterns
    expect(findings.length).toBeGreaterThan(3);

    const ruleIds = findings.map((f) => f.id);
    expect(ruleIds).toContain("fake-government-job");
    expect(ruleIds).toContain("cryptocurrency-payment");
    expect(ruleIds).toContain("advance-salary-loan");
  });

  it("should handle legitimate job posting without false positives", () => {
    const legitimateText = `
      Software Engineer - Full Stack
      Company: Infosys Limited
      Location: Bangalore, Karnataka

      Responsibilities:
      - Develop web applications
      - Work with React and Node.js
      - Collaborate with team

      Requirements:
      - 2+ years experience
      - Knowledge of JavaScript
      - Bachelor's degree in CS

      About Infosys:
      Global technology consulting company with offices worldwide.
      Equal opportunity employer.

      Salary: ₹8-12 LPA
      Apply through our careers portal at infosys.com/careers
    `;

    const ctx: TextRuleContext = {
      rawText: legitimateText,
      normalizedText: normalizeText(legitimateText),
      websiteDomain: "infosys.com",
    };

    const findings = evaluateTextRules(ctx);

    // Should not trigger any new 2026 scam rules
    const new2026Rules = [
      "cryptocurrency-payment",
      "investment-scheme",
      "advance-salary-loan",
      "fake-government-job",
      "data-harvesting",
      "fake-internship-conversion",
      "fake-verification-portal",
      "exam-study-material-fee"
    ];

    const triggeredNew2026Rules = findings.filter((f) => new2026Rules.includes(f.id));
    expect(triggeredNew2026Rules.length).toBe(0);
  });
});
