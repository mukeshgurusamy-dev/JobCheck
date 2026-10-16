import { describe, it, expect } from "vitest";
import { evaluateTextRules } from "../src/rules/textRules";
import { evaluatePositiveSignals } from "../src/rules/positiveSignals";
import { normalizeText } from "../src/engine/normalize";
import { TextRuleContext } from "../src/types/types";

function createTextCtx(raw: string, websiteDomain?: string): TextRuleContext {
  return {
    rawText: raw,
    normalizedText: normalizeText(raw),
    websiteDomain
  };
}

describe("Text Rules: Positive Detections", () => {
  it("flags upfront-payment (+45)", () => {
    const ctx = createTextCtx("Registration fee of ₹1,000 required before interview.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "upfront-payment")).toBe(true);
  });

  it("flags task-scam (+40)", () => {
    const ctx = createTextCtx("Like YouTube videos and rate Google Maps hotels to earn commission in USDT.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "task-scam")).toBe(true);
  });

  it("flags sensitive-docs-early (+35)", () => {
    const ctx = createTextCtx("Upload your Aadhaar card and PAN card details before telephonic screening.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "sensitive-docs-early")).toBe(true);
  });

  it("flags mlm-referral (+30)", () => {
    const ctx = createTextCtx("Refer friends to earn passive income. Build your own team and enjoy financial freedom.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "mlm-referral")).toBe(true);
  });

  it("flags unrealistic-pay (+30)", () => {
    const ctx = createTextCtx("Earn ₹3,500 per day with guaranteed daily payout for freshers.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "unrealistic-pay")).toBe(true);
  });

  it("flags training-then-job (+30)", () => {
    const ctx = createTextCtx("Paid training program of ₹10,000 with 100% guaranteed placement in top MNC.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "training-then-job")).toBe(true);
  });

  it("flags no-skill-easy-money (+25)", () => {
    const ctx = createTextCtx("Simple copy paste and data entry job. 10th pass can earn. No interview needed.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "no-skill-easy-money")).toBe(true);
  });

  it("flags messaging-app-contact (+25)", () => {
    const ctx = createTextCtx("Do not call. Contact HR recruiter only on WhatsApp: wa.me/919988776655.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "messaging-app-contact")).toBe(true);
  });

  it("flags instant-offer (+25)", () => {
    const ctx = createTextCtx("Congratulations! Direct joining without interview. Offer letter within 24 hours.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "instant-offer")).toBe(true);
  });

  it("flags overseas-offer (+25)", () => {
    const ctx = createTextCtx("Guaranteed visa job in Dubai. Visa processing fee ₹25,000 payable to travel agent.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "overseas-offer")).toBe(true);
  });

  it("flags free-email (+20)", () => {
    const ctx = createTextCtx("Send your updated CV to tcs.recruitment2026@gmail.com immediately.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "free-email")).toBe(true);
  });

  it("flags fake-fresher-demands (+20)", () => {
    const ctx = createTextCtx("Fresher role with 3+ years of exp required in enterprise cloud architecture.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "fake-fresher-demands")).toBe(true);
  });

  it("flags urgency-pressure (+15)", () => {
    const ctx = createTextCtx("Limited seats remaining! Apply now before registration link expires!");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "urgency-pressure")).toBe(true);
  });

  it("flags vague-employer (+15)", () => {
    const ctx = createTextCtx("Leading MNC is hiring. Work location: anywhere in India. Any graduate any stream.");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "vague-employer")).toBe(true);
  });

  it("flags writing-style (+10)", () => {
    const ctx = createTextCtx("APPLY NOW URGENT REQUIREMENT !!! 💰🔥✅ JOIN TODAY");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "writing-style")).toBe(true);
  });

  it("flags sender-domain-mismatch (+20)", () => {
    const ctx = createTextCtx("Send resume to hr@randomconsultancy.com", "infosys.com");
    const findings = evaluateTextRules(ctx);
    expect(findings.some((f) => f.id === "sender-domain-mismatch")).toBe(true);
  });
});

describe("Positive Signals & False-Positive Resistance", () => {
  it("rewards structured job descriptions (-10)", () => {
    const text = `
      About the Company: We build enterprise payment software.
      Key Responsibilities: Design, test, and document backend APIs in Go.
      Requirements & Qualifications: B.Tech in Computer Science; knowledge of SQL.
    `;
    const findings = evaluatePositiveSignals(createTextCtx(text, "stripe.com"));
    expect(findings.some((f) => f.id === "structured-description")).toBe(true);
  });

  it("rewards matching recruiter domain (-10)", () => {
    const text = "For inquiries, write to careers@infosys.com.";
    const findings = evaluatePositiveSignals(createTextCtx(text, "careers.infosys.com"));
    expect(findings.some((f) => f.id === "email-domain-match")).toBe(true);
  });

  it("rewards realistic ranged salary (-5)", () => {
    const text = "Annual CTC: 4 LPA - 6 LPA with health insurance benefits.";
    const findings = evaluatePositiveSignals(createTextCtx(text));
    expect(findings.some((f) => f.id === "realistic-ranged-salary")).toBe(true);
  });

  it("does not false-positive a legitimate job that merely mentions 'immediate spot joining' or 'work from home'", () => {
    const legitimateText = `
      About Us: Global Technology Services.
      Responsibilities: Work on cloud applications.
      Qualifications: B.Tech 2025 batch. Immediate spot joining within today preferred.
    `;
    const findings = evaluateTextRules(createTextCtx(legitimateText));
    // It may trigger urgency-pressure (+15), but NOT upfront-payment, task-scam, etc.
    const hasCriticalScam = findings.some(
      (f) => f.id === "upfront-payment" || f.id === "task-scam" || f.id === "sensitive-docs-early"
    );
    expect(hasCriticalScam).toBe(false);
  });
});
