import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatCopySummary,
  renderShareCardToCanvas,
  copyToClipboard,
} from "../src/utils/share";
import { Assessment } from "../src/types/types";

const assessment: Assessment = {
  score: 80,
  level: "High",
  confidence: "Medium",
  findings: [
    {
      id: "upfront-payment",
      kind: "risk",
      severity: "high",
      points: 45,
      reason: "Asks you to pay money before getting the job.",
    },
    {
      id: "shortener",
      kind: "risk",
      severity: "medium",
      points: 20,
      reason: "Shortened links hide the real destination.",
    },
    {
      id: "trusted-ats",
      kind: "trust",
      severity: "low",
      points: -10,
      reason: "Hosted on a known applicant tracking system.",
    },
  ],
  nextSteps: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatCopySummary", () => {
  it("states level, score and confidence, and lists reasons", () => {
    const text = formatCopySummary(assessment);
    expect(text).toContain("JobCheck: High risk (80/100, confidence Medium).");
    expect(text).toContain("- Asks you to pay money before getting the job.");
  });

  it("never contains a URL and includes the honesty disclaimer", () => {
    const text = formatCopySummary(assessment);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).toContain("cannot confirm a job is real");
    expect(text).toContain("1930");
  });

  it("handles an assessment with no findings", () => {
    const text = formatCopySummary({
      ...assessment,
      findings: [],
      score: 0,
      level: "Low",
    });
    expect(text).toContain("Low risk (0/100");
    expect(text).toContain("No specific risk signals");
  });
});

describe("renderShareCardToCanvas", () => {
  function stubContext() {
    const drawn: string[] = [];
    const ctx = {
      fillText: vi.fn((text: string) => drawn.push(text)),
      measureText: vi.fn((text: string) => ({ width: text.length * 9 })),
      fillRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    return drawn;
  }

  it("is 1200x630 and shows level, score, confidence and the disclaimer", () => {
    const drawn = stubContext();
    const canvas = renderShareCardToCanvas(assessment);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(630);
    const all = drawn.join("\n");
    expect(all).toContain("HIGH RISK");
    expect(all).toContain("80");
    expect(all).toContain("Confidence: Medium");
    expect(all).toContain("Verify independently");
  });

  it("draws at most the top 3 findings and never a URL", () => {
    const drawn = stubContext();
    renderShareCardToCanvas({
      ...assessment,
      findings: [
        ...assessment.findings,
        {
          id: "x",
          kind: "risk",
          severity: "low",
          points: 5,
          reason: "Fourth finding should not appear.",
        },
      ],
    });
    const all = drawn.join("\n");
    expect(all).not.toContain("Fourth finding");
    expect(all).not.toMatch(/https?:\/\//);
  });

  it("wraps very long reasons instead of drawing one overflowing line", () => {
    const drawn = stubContext();
    const long = "word ".repeat(80).trim();
    renderShareCardToCanvas({
      ...assessment,
      findings: [{ ...assessment.findings[0]!, reason: long }],
    });
    expect(
      drawn.every(
        (line) =>
          line.length * 9 <= 520 ||
          line.startsWith("Real employers") ||
          line.startsWith("Estimates"),
      ),
    ).toBe(true);
  });
});

describe("copyToClipboard", () => {
  it("uses navigator.clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });
});
