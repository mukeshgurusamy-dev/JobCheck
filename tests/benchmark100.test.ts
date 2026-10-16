import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { analyzeJob } from "../src/engine/engine";
import benchmark100 from "./fixtures/benchmark100.json";
import { RiskLevel } from "../src/types/types";

interface BenchmarkItem {
  id: string;
  platform: string;
  company: string;
  url: string;
  description: string;
  expected: RiskLevel;
}

describe("100-Company Multi-Platform Comprehensive Benchmark", () => {
  it("evaluates 100 jobs across 10 platforms (10 companies each) with genuine vs scam detection", () => {
    const items = benchmark100 as BenchmarkItem[];
    let correctCount = 0;
    let falsePositives = 0; // Genuine predicted as High
    let falseNegatives = 0; // Scam predicted as Low

    console.log("\n================================================================================");
    console.log("JOBCHECK 100-COMPANY MULTI-PLATFORM EVALUATION BENCHMARK");
    console.log("================================================================================\n");

    const platformStats: Record<string, { total: number; correct: number; scams: number; genuine: number }> = {};

    const failedList: any[] = [];

    const tableRows = items.map((item) => {
      if (!platformStats[item.platform]) {
        platformStats[item.platform] = { total: 0, correct: 0, scams: 0, genuine: 0 };
      }
      const pStat = platformStats[item.platform]!;
      pStat.total++;
      if (item.expected === "High") {
        pStat.scams++;
      } else {
        pStat.genuine++;
      }

      const assessment = analyzeJob({
        url: item.url,
        description: item.description,
      });

      const actual = assessment.level;
      const isCorrect = actual === item.expected;

      if (isCorrect) {
        correctCount++;
        pStat.correct++;
      } else {
        failedList.push({
          id: item.id,
          platform: item.platform,
          company: item.company,
          expected: item.expected,
          actual: actual,
          score: assessment.score,
          findings: assessment.findings.map(f => f.id),
          description: item.description
        });
        if (item.expected === "Low" && actual === "High") {
          falsePositives++;
        } else if (item.expected === "High" && actual === "Low") {
          falseNegatives++;
        }
      }

      return {
        ID: item.id,
        Platform: item.platform,
        Company: item.company,
        Expected: item.expected,
        Actual: actual,
        Score: assessment.score,
        Confidence: assessment.confidence,
        Status: isCorrect ? "PASS" : "FAIL",
      };
    });

    console.table(tableRows);

    console.log("\n================================================================================");
    console.log("PLATFORM-BY-PLATFORM ACCURACY BREAKDOWN (10 COMPANIES EACH)");
    console.log("================================================================================\n");

    const platformSummary = Object.entries(platformStats).map(([name, stats]) => ({
      Platform: name,
      TotalCases: stats.total,
      GenuineCount: stats.genuine,
      ScamCount: stats.scams,
      Passed: stats.correct,
      Accuracy: `${((stats.correct / stats.total) * 100).toFixed(1)}%`,
    }));

    console.table(platformSummary);

    const total = items.length;
    const accuracy = ((correctCount / total) * 100).toFixed(2);

    console.log("\n--------------------------------------------------------------------------------");
    console.log(`TOTAL SAMPLES:       ${total} (10 platforms x 10 companies)`);
    console.log(`CORRECT:             ${correctCount} / ${total}`);
    console.log(`OVERALL ACCURACY:    ${accuracy}%`);
    console.log(`FALSE POSITIVES:     ${falsePositives} (Genuine flagged as High Scam)`);
    console.log(`FALSE NEGATIVES:     ${falseNegatives} (Scams slipped through as Low Risk)`);
    console.log("--------------------------------------------------------------------------------\n");

    fs.writeFileSync("tests/failures.json", JSON.stringify(failedList, null, 2), "utf8");

    expect(Number(accuracy)).toBeGreaterThanOrEqual(95);
    expect(falseNegatives).toBe(0); // 0 scams must slip through as Low risk
  });
});
