import { describe, it, expect } from "vitest";
import { analyzeJob } from "../src/engine/engine";
import fixtures from "./fixtures/fixtures.json";
import { RiskLevel } from "../src/types/types";

interface FixtureItem {
  id: string;
  url: string;
  description: string;
  expected: RiskLevel;
}

describe("Evaluation Benchmark Suite (30 Fixtures)", () => {
  it("evaluates dataset and prints accuracy, false positives, and false negatives", () => {
    const items = fixtures as FixtureItem[];
    let correctCount = 0;
    let falsePositives = 0; // Genuine predicted as High or Medium
    let falseNegatives = 0; // Scam predicted as Low

    console.log("\n================================================================================");
    console.log("JOBCHECK EVALUATION BENCHMARK RESULTS");
    console.log("================================================================================\n");

    const tableRows = items.map((item) => {
      const assessment = analyzeJob({
        url: item.url,
        description: item.description
      });

      const actual = assessment.level;
      const isCorrect = actual === item.expected;

      if (isCorrect) {
        correctCount++;
      } else {
        if (item.expected === "Low" && actual === "High") {
          falsePositives++;
        } else if (item.expected === "High" && actual === "Low") {
          falseNegatives++;
        }
      }

      return {
        ID: item.id,
        Expected: item.expected,
        Actual: actual,
        Score: assessment.score,
        Confidence: assessment.confidence,
        Status: isCorrect ? "PASS" : "FAIL"
      };
    });

    console.table(tableRows);

    const total = items.length;
    const accuracy = ((correctCount / total) * 100).toFixed(2);

    console.log("\n--------------------------------------------------------------------------------");
    console.log(`TOTAL SAMPLES:    ${total}`);
    console.log(`CORRECT:          ${correctCount} / ${total}`);
    console.log(`ACCURACY:         ${accuracy}%`);
    console.log(`FALSE POSITIVES:  ${falsePositives}`);
    console.log(`FALSE NEGATIVES:  ${falseNegatives}`);
    console.log("--------------------------------------------------------------------------------\n");

    // Expect at least 90% accuracy on standard benchmark
    expect(Number(accuracy)).toBeGreaterThanOrEqual(90);
    expect(falseNegatives).toBe(0); // Scams must not slip through as Low risk
  });
});
