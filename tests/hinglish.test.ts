import { describe, it, expect } from "vitest";
import { evaluateTextRules } from "../src/rules/textRules";
import { normalizeText } from "../src/engine/normalize";
import { TextRuleContext } from "../src/types/types";

function createTextCtx(raw: string, websiteDomain?: string): TextRuleContext {
  return {
    rawText: raw,
    normalizedText: normalizeText(raw),
    websiteDomain,
  };
}

function hasHinglish(text: string): boolean {
  return evaluateTextRules(createTextCtx(text)).some(
    (f) => f.id === "hinglish-scam-language",
  );
}

describe("Hinglish (romanised Hindi) scam language", () => {
  it("flags the common 'work from home and earn' bait", () => {
    expect(hasHinglish("Ghar baithe paisa kamao, roz 3000 rupaye kamai.")).toBe(true);
  });

  it("flags a fee demand phrased in Hinglish", () => {
    expect(hasHinglish("Registration ke paise 1500 bhejo aur joining letter lo.")).toBe(true);
  });

  it("flags a guaranteed-job pitch with an urgency marker", () => {
    expect(hasHinglish("Sirf 2500 mein naukri pakki, turant joining.")).toBe(true);
  });

  it("flags 'nothing to pay' phrasing used as bait", () => {
    expect(hasHinglish("Koi fees nahi, sirf form bharo aur kaam shuru karo.")).toBe(true);
  });

  it("flags an upfront-payment demand in Hinglish", () => {
    expect(hasHinglish("Pehle payment karo, phir hi interview schedule hoga.")).toBe(true);
  });

  it("flags a Hinglish investment bait", () => {
    expect(hasHinglish("Kamai ke liye paisa lagaye, double ho jayega.")).toBe(true);
  });

  it("flags being asked to contact on WhatsApp in Hinglish", () => {
    expect(hasHinglish("WhatsApp par message karo turant, offer ready hai.")).toBe(true);
  });
});

describe("Hinglish rule: false-positive guards", () => {
  it("does not fire on an ordinary English posting", () => {
    const text = `
      Role: Software Engineer at Chargebee.
      Location: DLF Cybercity, Manapakkam, Chennai.
      Responsibilities: Subscription billing APIs and merchant dashboard.
      Skills: Java, Spring Boot, Vue.js, MySQL.
    `;
    expect(hasHinglish(text)).toBe(false);
  });

  it("does not fire on a place name that contains a Hinglish marker substring", () => {
    // "Manapakkam" contains "pakka"; the rule must require a word boundary
    // and a preceding job/kaam/naukri token.
    const text = "Our office is in Manapakkam, Chennai and in Pakkam, Tamil Nadu.";
    expect(hasHinglish(text)).toBe(false);
  });

  it("does not fire merely because a posting mentions the Naukri platform", () => {
    const text =
      "Apply on Naukri or send your CV to careers@techmahindra.com. " +
      "Position: Graduate Engineer Trainee. Location: Hyderabad.";
    expect(hasHinglish(text)).toBe(false);
  });

  it("does not fire on English fee language (that is the upfront-payment rule's job)", () => {
    const findings = evaluateTextRules(
      createTextCtx("A refundable security deposit of Rs 5000 is required before joining."),
    );
    expect(findings.some((f) => f.id === "upfront-payment")).toBe(true);
    expect(findings.some((f) => f.id === "hinglish-scam-language")).toBe(false);
  });
});
