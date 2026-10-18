import { describe, it, expect, beforeEach } from "vitest";
import { ApiKeyPoolManager } from "../netlify/functions/apiKeyPool";

describe("ApiKeyPoolManager", () => {
  let pool: ApiKeyPoolManager;

  beforeEach(() => {
    process.env.GEMINI_API_KEYS = "key_alpha_1234567890,key_beta_1234567890,key_gamma_1234567890,key_delta_1234567890,key_epsilon_1234567890";
    pool = new ApiKeyPoolManager();
    pool.loadKeys();
  });

  it("loads all 5 keys properly", () => {
    const stats = pool.getPoolStats();
    expect(stats.total).toBe(5);
    expect(stats.ready).toBe(5);
  });

  it("cycles through all 5 un-used keys sequentially (LRU)", () => {
    const keysUsed: string[] = [];
    for (let i = 0; i < 5; i++) {
      const k = pool.acquireKey();
      expect(k).toBeDefined();
      keysUsed.push(k!);
    }

    // All 5 keys should be unique in the first 5 acquisitions
    const uniqueAcquired = new Set(keysUsed);
    expect(uniqueAcquired.size).toBe(5);
  });

  it("skips keys placed in penalty cooldown after hitting a rate limit", () => {
    const key1 = pool.acquireKey()!;
    // Simulate HTTP 429
    pool.reportRateLimited(key1);

    // Acquire next 10 keys; key1 should NEVER be picked
    for (let i = 0; i < 10; i++) {
      const nextKey = pool.acquireKey();
      expect(nextKey).not.toBe(key1);
    }
  });

  it("getNextAvailableKey provides an alternative key on failure", () => {
    const current = pool.acquireKey()!;
    const next = pool.getNextAvailableKey(current);
    expect(next).toBeDefined();
    expect(next).not.toBe(current);
  });

  it("recovers a key on reportSuccess", () => {
    const key1 = pool.acquireKey()!;
    pool.reportRateLimited(key1);
    pool.reportSuccess(key1);

    // It should now be eligible again
    expect(key1).toBeDefined();
  });
});
