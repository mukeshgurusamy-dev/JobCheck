/**
 * Computes the Levenshtein distance between two strings.
 * Used for detecting lookalike brand impersonation (e.g., "infosyss", "g00gle").
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();

  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row space-optimized dynamic programming table
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prevDiagonal = dp[0] as number;
    dp[0] = i;

    for (let j = 1; j <= n; j++) {
      const temp = dp[j] as number;
      const cost = s1.charAt(i - 1) === s2.charAt(j - 1) ? 0 : 1;

      dp[j] = Math.min(
        (dp[j] as number) + 1,       // deletion
        (dp[j - 1] as number) + 1,   // insertion
        prevDiagonal + cost          // substitution
      );

      prevDiagonal = temp;
    }
  }

  return dp[n] as number;
}
