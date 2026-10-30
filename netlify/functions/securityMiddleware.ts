/**
 * SECURITY MIDDLEWARE - RATE LIMITING & REQUEST THROTTLING
 *
 * Implements per-IP rate limiting to prevent abuse, DDoS, and brute-force attacks.
 * Uses in-memory store with automatic cleanup of expired entries.
 */

interface RateLimitConfig {
  maxRequests: number; // Max requests per window
  windowMs: number; // Time window in milliseconds
  burstSize?: number; // Allow burst (default: 1.5x max)
  cleanupIntervalMs?: number; // Cleanup old entries (default: 60000ms)
}

interface RateLimitEntry {
  requests: number[];
  blocked: boolean;
  blockedUntil?: number;
}

/**
 * In-memory rate limiter with per-IP tracking
 */
export class RateLimiter {
  private store: Map<string, RateLimitEntry>;
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      ...config,
      burstSize: config.burstSize || Math.ceil(config.maxRequests * 1.5),
      cleanupIntervalMs: config.cleanupIntervalMs || 60000,
    };
    this.store = new Map();
    this.startCleanup();
  }

  /**
   * Check if request from IP is allowed
   * Returns: { allowed: boolean, remaining: number, resetTime: number }
   */
  checkLimit(ip: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    let entry = this.store.get(ip);

    // Check if IP is temporarily blocked
    if (entry?.blocked && entry.blockedUntil) {
      if (now < entry.blockedUntil) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: entry.blockedUntil,
          retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
        };
      }
      // Unblock if window expired
      entry.blocked = false;
      entry.blockedUntil = undefined;
    }

    // Initialize entry if new IP
    if (!entry) {
      entry = {
        requests: [now],
        blocked: false,
      };
      this.store.set(ip, entry);
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime: now + this.config.windowMs,
      };
    }

    // Remove requests outside current window
    const windowStart = now - this.config.windowMs;
    entry.requests = entry.requests.filter(t => t > windowStart);

    // Check if within limit
    const requestCount = entry.requests.length;
    const burstSize = this.config.burstSize || this.config.maxRequests;

    if (requestCount >= burstSize) {
      // Block IP for 15 minutes on burst violation
      entry.blocked = true;
      entry.blockedUntil = now + 15 * 60 * 1000;
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.blockedUntil,
        retryAfter: 900, // 15 minutes
      };
    }

    // Allow request and track it
    entry.requests.push(now);
    const remaining = Math.max(0, this.config.maxRequests - entry.requests.length);

    return {
      allowed: true,
      remaining,
      resetTime: Math.min(...entry.requests) + this.config.windowMs,
    };
  }

  /**
   * Get current metrics
   */
  getMetrics(): {
    totalIPs: number;
    blockedIPs: number;
    requestsTracked: number;
  } {
    let blockedCount = 0;
    let totalRequests = 0;

    for (const entry of this.store.values()) {
      if (entry.blocked) blockedCount++;
      totalRequests += entry.requests.length;
    }

    return {
      totalIPs: this.store.size,
      blockedIPs: blockedCount,
      requestsTracked: totalRequests,
    };
  }

  /**
   * Start automatic cleanup of old entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      for (const [ip, entry] of this.store.entries()) {
        // Remove old requests from this IP
        entry.requests = entry.requests.filter(t => t > windowStart);

        // Remove entry if no recent requests and not blocked
        if (entry.requests.length === 0 && !entry.blocked) {
          this.store.delete(ip);
        }

        // Unblock if window expired
        if (entry.blocked && entry.blockedUntil && now >= entry.blockedUntil) {
          entry.blocked = false;
          entry.blockedUntil = undefined;
        }
      }
    }, this.config.cleanupIntervalMs);
    if (this.cleanupInterval && typeof (this.cleanupInterval as any).unref === "function") {
      (this.cleanupInterval as any).unref();
    }
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Reset limiter for specific IP
   */
  resetIP(ip: string): void {
    this.store.delete(ip);
  }

  /**
   * Reset all limiters
   */
  resetAll(): void {
    this.store.clear();
  }
}

/**
 * Create default rate limiter (10 req/min per IP)
 */
export function createDefaultRateLimiter(): RateLimiter {
  return new RateLimiter({
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
    burstSize: 15, // Allow burst of 15
    cleanupIntervalMs: 60 * 1000,
  });
}

/**
 * Extract client IP from request
 * Handles Netlify X-Forwarded-For header
 */
export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
  // Check X-Forwarded-For first (Netlify/proxies)
  const forwarded = headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    if (ip) {
      return ip.trim();
    }
  }

  // Fallback to CF-Connecting-IP (Cloudflare)
  const cfIp = headers["cf-connecting-ip"];
  if (cfIp) {
    const ipValue = Array.isArray(cfIp) ? cfIp[0] : cfIp;
    if (ipValue) {
      return ipValue;
    }
  }

  return "unknown";
}

/**
 * Format rate limit headers for response
 */
export function formatRateLimitHeaders(check: ReturnType<RateLimiter["checkLimit"]>): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": String(check.remaining),
    "X-RateLimit-Reset": String(Math.ceil(check.resetTime / 1000)),
  };

  if (check.retryAfter !== undefined) {
    headers["Retry-After"] = String(check.retryAfter);
  }

  return headers;
}
