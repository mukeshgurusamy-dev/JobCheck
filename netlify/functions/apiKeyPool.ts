import fs from "fs";
import path from "path";

export interface KeyState {
  key: string;
  lastUsedAt: number;
  cooldownUntil: number;
  failureCount: number;
  successCount: number;
}

// 4 minutes cooldown preference
const IDLE_COOLDOWN_MS = 4 * 60 * 1000;

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
    this.keys = uniqueKeys.map((k) => {
      const existing = existingMap.get(k);
      return (
        existing || {
          key: k,
          lastUsedAt: 0,
          cooldownUntil: 0,
          failureCount: 0,
          successCount: 0,
        }
      );
    });

    this.initialized = true;
  }

  /**
   * Selects the optimal key from the pool:
   * 1. Excludes any key currently in penalty cooldown (e.g. 429).
   * 2. Prefers keys that have been idle for >= 4 minutes.
   * 3. Among eligible keys, chooses the Least Recently Used (oldest lastUsedAt).
   */
  public acquireKey(): string | undefined {
    this.loadKeys();
    if (this.keys.length === 0) return undefined;

    const now = Date.now();

    // Filter out keys in penalty cooldown
    const activeKeys = this.keys.filter((k) => k.cooldownUntil <= now);
    const candidatePool = activeKeys.length > 0 ? activeKeys : this.keys;

    // Check for keys that have been resting >= 4 minutes (or never used)
    const restedKeys = candidatePool.filter(
      (k) => k.lastUsedAt === 0 || now - k.lastUsedAt >= IDLE_COOLDOWN_MS,
    );

    let chosen: KeyState;
    if (restedKeys.length > 0) {
      // Pick the key that has been idle the longest
      restedKeys.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      chosen = restedKeys[0]!;
    } else {
      // All keys were used recently: pick the oldest one to maximize rest time
      candidatePool.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      chosen = candidatePool[0]!;
    }

    chosen.lastUsedAt = now;
    return chosen.key;
  }

  /**
   * Called if a key hits an HTTP 429 (rate limit / quota exhaustion).
   * Puts this key into a 15-minute penalty cooldown.
   */
  public reportRateLimited(key: string): void {
    const entry = this.keys.find((k) => k.key === key);
    if (entry) {
      entry.cooldownUntil = Date.now() + PENALTY_COOLDOWN_MS;
      entry.failureCount++;
    }
  }

  /**
   * Called when a key successfully generates a response.
   */
  public reportSuccess(key: string): void {
    const entry = this.keys.find((k) => k.key === key);
    if (entry) {
      entry.successCount++;
      entry.failureCount = 0;
      entry.cooldownUntil = 0;
    }
  }

  /**
   * Provides the next best available key if the current key failed.
   */
  public getNextAvailableKey(excludeKey?: string): string | undefined {
    this.loadKeys();
    const now = Date.now();
    const candidates = this.keys.filter(
      (k) => k.key !== excludeKey && k.cooldownUntil <= now,
    );
    if (candidates.length === 0) {
      return this.keys.find((k) => k.key !== excludeKey)?.key;
    }
    candidates.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    const next = candidates[0]!;
    next.lastUsedAt = now;
    return next.key;
  }

  public getPoolStats(): {
    total: number;
    ready: number;
    cooling: number;
  } {
    this.loadKeys();
    const now = Date.now();
    const ready = this.keys.filter(
      (k) => k.cooldownUntil <= now && (k.lastUsedAt === 0 || now - k.lastUsedAt >= IDLE_COOLDOWN_MS),
    ).length;
    const cooling = this.keys.length - ready;
    return {
      total: this.keys.length,
      ready,
      cooling,
    };
  }
}

export const apiKeyPool = new ApiKeyPoolManager();
