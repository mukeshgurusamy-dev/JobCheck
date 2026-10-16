import { describe, it, expect } from "vitest";
import { normalizeText, containsIndicScript } from "../src/engine/normalize";

describe("Text Normalization Utilities", () => {
  it("converts text to lowercase and collapses whitespace", () => {
    const res = normalizeText("  URGENT   HIRING \n\t NOW   ");
    expect(res).toBe("urgent hiring now");
  });

  it("strips invisible zero-width spaces used to evade filters", () => {
    // String with embedded zero-width space (\u200B)
    const hidden = "reg\u200Bistration fee";
    expect(normalizeText(hidden)).toBe("registration fee");
  });

  it("collapses spaced-out scam evasion words like 'w h a t s a p p'", () => {
    const raw = "Contact hr on w h a t s a p p for offer letter";
    const normalized = normalizeText(raw);
    expect(normalized).toContain("whatsapp");
  });

  it("collapses spaced-out 't e l e g r a m'", () => {
    const raw = "Join our t e l e g r a m channel";
    const normalized = normalizeText(raw);
    expect(normalized).toContain("telegram");
  });

  it("maps homoglyphs and number-for-letter substitutions in words", () => {
    expect(normalizeText("g00gle jobs")).toContain("google jobs");
    expect(normalizeText("p@ytm upi")).toContain("paytm upi");
  });

  it("preserves pure numbers (does not destroy amounts or years)", () => {
    expect(normalizeText("pay 5000 in 2025")).toContain("5000 in 2025");
  });

  it("detects Indic script (Devanagari, Tamil, etc.)", () => {
    expect(containsIndicScript("नौकरी के लिए संपर्क करें")).toBe(true);
    expect(containsIndicScript("வேலை வாய்ப்பு")).toBe(true);
    expect(containsIndicScript("Software Engineer in Bangalore")).toBe(false);
  });

  it("normalizes and strips company legal suffixes accurately", async () => {
    const { stripCompanySuffix, expandCompanyNameVariants } = await import("../src/engine/normalize");
    expect(stripCompanySuffix("Tridin Software Private Limited")).toBe("Tridin Software");
    expect(stripCompanySuffix("Tridin Software Pvt Ltd")).toBe("Tridin Software");
    expect(stripCompanySuffix("Tridin Software LLP")).toBe("Tridin Software");
    expect(stripCompanySuffix("Infosys Limited")).toBe("Infosys");

    const variants = expandCompanyNameVariants("Tridin Software");
    expect(variants).toContain("Tridin Software");
    expect(variants).toContain("Tridin Software Private Limited");
    expect(variants).toContain("Tridin Software Pvt Ltd");
    expect(variants).toContain("Tridin Software LLP");
  });
});
