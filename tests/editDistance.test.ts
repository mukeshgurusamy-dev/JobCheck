import { describe, it, expect } from "vitest";
import { getLevenshteinDistance } from "../src/utils/editDistance";

describe("Edit Distance (Levenshtein)", () => {
  it("returns 0 for identical strings", () => {
    expect(getLevenshteinDistance("infosys", "infosys")).toBe(0);
    expect(getLevenshteinDistance("google", "GOOGLE")).toBe(0); // case insensitive
  });

  it("calculates single character insertions, deletions, substitutions", () => {
    expect(getLevenshteinDistance("infosyss", "infosys")).toBe(1); // insertion
    expect(getLevenshteinDistance("infoss", "infosys")).toBe(1);   // deletion
    expect(getLevenshteinDistance("infasys", "infosys")).toBe(1);  // substitution
  });

  it("calculates edit distance of 2", () => {
    expect(getLevenshteinDistance("infosysss", "infosys")).toBe(2);
    expect(getLevenshteinDistance("infoxx", "infosys")).toBe(3);
  });
});
