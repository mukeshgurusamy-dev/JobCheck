import fs from "fs";
import path from "path";

export interface KeyState {
  key: string;
  usageCount: number; // Total usage (for tracking)
  usageThisMinute: number; // Usage in current minute window
  currentMinute: number; // Which minute window we're tracking
  isRateLimited: boolean;
  cooldownUntil: number;
}

// Soft limit: stop using a key at 55/60 to avoid hard 429
const SOFT_LIMIT_PER_MINUTE = 55;
// Penalty cooldown if Google returns 429 (40 seconds)
const PENALTY_COOLDOWN_MS = 40 * 1000;

export class ApiKeyPoolManager {
  private keys: KeyState[] = [];
  private initialized = false;

  public loadKeys(): void {
    if (this.initialized && this.keys.length > 0) return;

    const rawKeys: string[] = [];

    // 1. Check process.env.GEMINI_API_KEYS (comma or newline separated, possibly quoted)
    if (process.env.GEMINI_API_KEYS) {
      console.log(`[API_KEY_POOL] GEMINI_API_KEYS found: ${process.env.GEMINI_API_KEYS.substring(0, 80)}...`);

      // Handle quoted CSV format: "key1","key2","key3"
      // Also handle plain comma/newline separated: key1,key2 or key1\nkey2
      const csvMatches = process.env.GEMINI_API_KEYS.match(/"([^"]+)"/g);
      if (csvMatches && csvMatches.length > 0) {
        // Format: "key1","key2","key3" — extract from quotes
        rawKeys.push(...csvMatches.map(m => m.replace(/"/g, '')));
        console.log(`[API_KEY_POOL] Parsed ${csvMatches.length} quoted keys`);
      } else {
        // Format: key1,key2,key3 or key1\nkey2\nkey3
        rawKeys.push(...process.env.GEMINI_API_KEYS.split(/[\n,]/));
        console.log(`[API_KEY_POOL] After split: ${rawKeys.length} raw keys`);
      }
    }

    // 2. Check numbered keys GEMINI_API_KEY_1..20
    for (let i = 1; i <= 20; i++) {
      const k = process.env[`GEMINI_API_KEY_${i}`];
      if (k) rawKeys.push(k);
    }

    // 3. Check legacy single key variables
    if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
    if (process.env.GOOGLE_API_KEY) rawKeys.push(process.env.GOOGLE_API_KEY);

    // 4. Local development fallback: load from .env file if in local Node environment
    if (rawKeys.length === 0) {
      try {
        const envPath = path.resolve(process.cwd(), ".env");
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, "utf8");
          const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
          for (const line of lines) {
            if (line.startsWith("#")) continue;
            if (line.includes("GEMINI_API_KEYS=") || line.includes("GEMINI_API_KEY=")) {
              const val = line.split("=")[1]?.trim().replace(/^["']|["']$/g, "");
              if (val) rawKeys.push(...val.split(/[\n,]/));
            } else if (!line.includes("=") && line.length > 25) {
              rawKeys.push(line.replace(/^["']|["']$/g, ""));
            }
          }
        }
      } catch {
        // Safe fallback in restricted environments
      }
    }

    // Clean, trim, and deduplicate keys (strip quotes, trailing commas, whitespace)
    const uniqueKeys = Array.from(
      new Set(
        rawKeys
          .map((k) => k.trim().replace(/["'\r\n\s]/g, "").replace(/,+$/, ""))
          .filter((k) => k.length >= 10), // Valid API keys are at least 10 chars
      ),
    );

    console.log(`[API_KEY_POOL] Loaded ${uniqueKeys.length} unique API keys`);
    if (uniqueKeys.length > 0) {
      uniqueKeys.forEach((k, i) => {
        console.log(`[API_KEY_POOL] Key ${i + 1}: ${k.substring(0, 30)}...`);
      });
    }

    // Initialize or preserve existing state
    const existingMap = new Map(this.keys.map((s) => [s.key, s]));
    const currentMinute = Math.floor(Date.now() / 60000);

    this.keys = uniqueKeys.map((k) => {
      const existing = existingMap.get(k);
      return (
        existing || {
          key: k,
          usageCount: 0,
          usageThisMinute: 0,
          currentMinute: currentMinute,
          isRateLimited: false,
          cooldownUntil: 0,
        }
      );
    });

    this.initialized = true;
  }

  /**
   * Advanced algorithm: Track usage per minute window.
   * - Pick key with lowest usage in CURRENT minute
   * - If key at soft limit (55/60), don't use it, queue instead
   * - Prevents hitting hard 429 limit
   * - Distributes load evenly across all keys (1-2-3-4-5 pattern)
   *
   * Returns: API key string OR undefined if all keys at soft limit
   * Caller should queue the request if undefined is returned
   */
  public acquireKey(): string | undefined {
    this.loadKeys();
    if (this.keys.length === 0) return undefined;

    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);

    // Reset usage counters if minute changed
    for (const key of this.keys) {
      if (key.currentMinute !== currentMinute) {
        key.usageThisMinute = 0;
        key.currentMinute = currentMinute;
      }
    }

    // Filter out keys still in penalty cooldown
    const availableKeys = this.keys.filter((k) => k.cooldownUntil <= now);

    if (availableKeys.length === 0) {
      // All keys are rate limited, cannot proceed
      console.log(`[API_KEY_POOL] All keys in cooldown, request should be queued for retry`);
      return undefined;
    }

    // Filter keys that haven't hit soft limit this minute
    const usableKeys = availableKeys.filter((k) => k.usageThisMinute < SOFT_LIMIT_PER_MINUTE);

    if (usableKeys.length === 0) {
      // All available keys at soft limit, need to queue
      console.log(`[API_KEY_POOL] All keys at soft limit (${SOFT_LIMIT_PER_MINUTE}/60), request queued for next minute`);
      return undefined;
    }

    // Pick the available key with lowest usage this minute
    usableKeys.sort((a, b) => a.usageThisMinute - b.usageThisMinute);
    const chosenKey = usableKeys[0]!;
    chosenKey.usageCount++;
    chosenKey.usageThisMinute++;

    const minuteUsage = chosenKey.usageThisMinute;
    console.log(`[API_KEY_POOL] Selected key: ${chosenKey.key.substring(0, 30)}... (${minuteUsage}/${SOFT_LIMIT_PER_MINUTE} this minute, total: ${chosenKey.usageCount})`);
    return chosenKey.key;
  }

  /**
   * Called if a key hits an HTTP 429 (rate limit / quota exhaustion).
   * Puts this key into a penalty cooldown so it won't be used for 40 seconds.
   */
  public reportRateLimited(key: string): void {
    const entry = this.keys.find((k) => k.key === key);
    if (entry) {
      entry.cooldownUntil = Date.now() + PENALTY_COOLDOWN_MS;
      entry.isRateLimited = true;
      console.log(`[API_KEY_POOL] Key rate limited: ${key.substring(0, 30)}... (cooldown 40s)`);
    }
  }

  /**
   * Clear rate limit cooldown for a key (when cooldown expires or manually)
   */
  public clearCooldown(key: string): void {
    const entry = this.keys.find((k) => k.key === key);
    if (entry) {
      entry.cooldownUntil = 0;
      entry.isRateLimited = false;
      console.log(`[API_KEY_POOL] Key cooldown cleared: ${key.substring(0, 30)}...`);
    }
  }

  /**
   * Get current stats for monitoring and debugging
   */
  public getStats() {
    return {
      totalKeys: this.keys.length,
      keys: this.keys.map((k) => ({
        key: k.key.substring(0, 20) + "...",
        usageThisMinute: k.usageThisMinute,
        totalUsage: k.usageCount,
        isRateLimited: k.isRateLimited,
        cooldownUntil: k.cooldownUntil,
        nextAvailableIn: k.cooldownUntil > Date.now() ? Math.ceil((k.cooldownUntil - Date.now()) / 1000) + "s" : "now"
      }))
    };
  }

  /**
   * Get pool statistics (total, ready, cooling)
   */
  public getPoolStats(): { total: number; ready: number; cooling: number } {
    this.loadKeys();
    const now = Date.now();
    const ready = this.keys.filter((k) => k.cooldownUntil <= now).length;
    const cooling = this.keys.length - ready;
    return {
      total: this.keys.length,
      ready,
      cooling,
    };
  }

  /**
   * Get next available key, excluding a specific key (useful for fallback on failure)
   */
  public getNextAvailableKey(excludeKey?: string): string | undefined {
    this.loadKeys();
    const now = Date.now();
    const candidates = this.keys.filter(
      (k) => k.key !== excludeKey && k.cooldownUntil <= now
    );
    if (candidates.length === 0) {
      return this.keys.find((k) => k.key !== excludeKey)?.key;
    }
    // Pick the candidate with lowest usage count
    candidates.sort((a, b) => a.usageCount - b.usageCount);
    const next = candidates[0]!;
    next.usageCount++;
    console.log(`[API_KEY_POOL] Fallback to next key: usage=${next.usageCount}`);
    return next.key;
  }

  /**
   * Called when a key successfully generates a response.
   * Clears its cooldown if it was rate limited before.
   */
  public reportSuccess(key: string): void {
    const entry = this.keys.find((k) => k.key === key);
    if (entry) {
      entry.isRateLimited = false;
      entry.cooldownUntil = 0;
      console.log(`[API_KEY_POOL] Key success: ${key.substring(0, 30)}... (cooldown cleared)`);
    }
  }
}

export const apiKeyPool = new ApiKeyPoolManager();
