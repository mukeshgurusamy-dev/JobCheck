/**
 * USER VALIDATION & SMART RATE LIMITING
 *
 * Distinguishes legitimate users from bots:
 * - Valid User: Provides a valid URL (with or without description)
 * - Invalid/Bot: No URL, malformed URL, or suspicious patterns
 *
 * Rate limits:
 * - Valid Users: 500 requests/day (generous for legitimate use)
 * - Invalid Attempts: Aggressive blocking after 5 attempts
 */

export interface UserValidationResult {
  isValid: boolean;
  reason?: string;
  requestsRemaining?: number;
  blockedUntil?: number;
  severity: "valid" | "warning" | "blocked";
}

interface ValidUserEntry {
  url: string;
  timestamp: number;
  hasDescription: boolean;
}

interface InvalidAttemptEntry {
  attempts: number[];
  blockedUntil?: number;
}

export class SmartRateLimiter {
  private validUsers: Map<string, ValidUserEntry[]> = new Map();
  private invalidAttempts: Map<string, InvalidAttemptEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Constants
  private readonly VALID_USER_LIMIT_PER_DAY = 500;
  private readonly VALID_USER_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly INVALID_ATTEMPT_THRESHOLD = 5;
  private readonly INVALID_ATTEMPT_BLOCK_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.startCleanup();
  }

  /**
   * Validate if request is from a legitimate user
   * Valid users must provide:
   * - A valid URL (can optionally include description)
   * Invalid users:
   * - No URL provided
   * - Malformed URL
   * - Suspicious patterns (SQL injection, etc)
   */
  public validateRequest(
    ipAddress: string,
    url?: string,
    description?: string
  ): UserValidationResult {
    const now = Date.now();

    // Check 1: URL is required and must be valid
    if (!url || url.trim().length === 0) {
      return this.handleInvalidAttempt(ipAddress, "No URL provided");
    }

    // Check 2: URL must be a valid HTTP/HTTPS URL
    if (!this.isValidUrl(url)) {
      return this.handleInvalidAttempt(ipAddress, "Invalid URL format");
    }

    // Check 3: Check for suspicious patterns (SQL injection, XSS, etc)
    if (this.containsSuspiciousPatterns(url) || (description && this.containsSuspiciousPatterns(description))) {
      return this.handleInvalidAttempt(ipAddress, "Suspicious patterns detected");
    }

    // Check 4: IP is blocked due to previous invalid attempts
    const invalidEntry = this.invalidAttempts.get(ipAddress);
    if (invalidEntry?.blockedUntil && now < invalidEntry.blockedUntil) {
      const secondsRemaining = Math.ceil((invalidEntry.blockedUntil - now) / 1000);
      return {
        isValid: false,
        reason: `Too many invalid attempts. Please try again in ${secondsRemaining} seconds.`,
        blockedUntil: invalidEntry.blockedUntil,
        severity: "blocked",
      };
    }

    // Valid request - check rate limit for valid users
    return this.checkValidUserLimit(ipAddress, url, description !== undefined);
  }

  /**
   * Handle invalid attempt - block after threshold
   */
  private handleInvalidAttempt(ipAddress: string, reason: string): UserValidationResult {
    const now = Date.now();
    let entry = this.invalidAttempts.get(ipAddress) || { attempts: [] };

    // Clean old attempts outside 24-hour window
    entry.attempts = entry.attempts.filter((t) => now - t < this.INVALID_ATTEMPT_BLOCK_DURATION);
    entry.attempts.push(now);

    // Block after threshold
    if (entry.attempts.length >= this.INVALID_ATTEMPT_THRESHOLD) {
      entry.blockedUntil = now + this.INVALID_ATTEMPT_BLOCK_DURATION;
      console.log(
        `[SECURITY] IP ${ipAddress} blocked after ${this.INVALID_ATTEMPT_THRESHOLD} invalid attempts. Reason: ${reason}`
      );
      return {
        isValid: false,
        reason: "Too many invalid requests. Your IP has been blocked for 24 hours.",
        blockedUntil: entry.blockedUntil,
        severity: "blocked",
      };
    }

    this.invalidAttempts.set(ipAddress, entry);
    const remainingAttempts = this.INVALID_ATTEMPT_THRESHOLD - entry.attempts.length;

    return {
      isValid: false,
      reason: `${reason}. Invalid attempts: ${entry.attempts.length}/${this.INVALID_ATTEMPT_THRESHOLD}. Your IP will be blocked after ${remainingAttempts} more invalid attempts.`,
      requestsRemaining: remainingAttempts,
      severity: "warning",
    };
  }

  /**
   * Check rate limit for valid users (generous: 500/day)
   */
  private checkValidUserLimit(ipAddress: string, url: string, hasDescription: boolean): UserValidationResult {
    const now = Date.now();
    const dayAgo = now - this.VALID_USER_WINDOW_MS;

    // Get or create entry for this IP
    let entries = this.validUsers.get(ipAddress) || [];

    // Remove requests older than 24 hours
    entries = entries.filter((e) => e.timestamp > dayAgo);

    // Check limit
    if (entries.length >= this.VALID_USER_LIMIT_PER_DAY) {
      return {
        isValid: false,
        reason: `Rate limit exceeded. You've made ${entries.length} requests today. Limit is ${this.VALID_USER_LIMIT_PER_DAY} per 24 hours.`,
        requestsRemaining: 0,
        severity: "blocked",
      };
    }

    // Add new request
    entries.push({
      url,
      timestamp: now,
      hasDescription,
    });
    this.validUsers.set(ipAddress, entries);

    const remaining = this.VALID_USER_LIMIT_PER_DAY - entries.length;
    console.log(
      `[SECURITY] Valid user from ${ipAddress}. Requests today: ${entries.length}/${this.VALID_USER_LIMIT_PER_DAY}. URL: ${url.substring(0, 50)}...`
    );

    return {
      isValid: true,
      requestsRemaining: remaining,
      severity: "valid",
    };
  }

  /**
   * Check if URL is valid
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Check for suspicious patterns (SQL injection, XSS, command injection, etc)
   */
  private containsSuspiciousPatterns(input: string): boolean {
    const suspiciousPatterns = [
      // SQL Injection
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/i,
      /(--|\/\*|\*\/|;)/,
      /('\s*OR\s*')/,

      // XSS
      /(<script|javascript:|onerror=|onload=)/i,
      /(<iframe|<img|<svg|<object)/i,

      // Command Injection
      /([;|&`$()\[\]{}])/,
      /(rm\s+-rf|rm\s+-r|del\s+\/|format\s+c:)/i,

      // Path Traversal
      /(\.\.[/\\])+/,
      /(%2e%2e[/\\])/i,

      // LDAP Injection
      /(\*|&|\||\(|\))/,
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Start automatic cleanup of old entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const dayAgo = now - this.VALID_USER_WINDOW_MS;

      // Clean valid user entries
      for (const [ip, entries] of this.validUsers.entries()) {
        const filtered = entries.filter((e) => e.timestamp > dayAgo);
        if (filtered.length === 0) {
          this.validUsers.delete(ip);
        } else {
          this.validUsers.set(ip, filtered);
        }
      }

      // Clean invalid attempt entries
      for (const [ip, entry] of this.invalidAttempts.entries()) {
        const filtered = entry.attempts.filter((t) => now - t < this.INVALID_ATTEMPT_BLOCK_DURATION);
        if (filtered.length === 0 && !entry.blockedUntil) {
          this.invalidAttempts.delete(ip);
        } else if (entry.blockedUntil && now >= entry.blockedUntil) {
          this.invalidAttempts.delete(ip);
        } else {
          entry.attempts = filtered;
          this.invalidAttempts.set(ip, entry);
        }
      }

      console.log(
        `[SECURITY] Cleanup: ${this.validUsers.size} active IPs, ${this.invalidAttempts.size} blocked IPs`
      );
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop cleanup
   */
  public stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get security metrics
   */
  public getMetrics() {
    let totalValidRequests = 0;
    for (const entries of this.validUsers.values()) {
      totalValidRequests += entries.length;
    }

    let totalInvalidAttempts = 0;
    let blockedIPs = 0;
    for (const entry of this.invalidAttempts.values()) {
      totalInvalidAttempts += entry.attempts.length;
      if (entry.blockedUntil && entry.blockedUntil > Date.now()) {
        blockedIPs++;
      }
    }

    return {
      activeValidUsers: this.validUsers.size,
      totalValidRequests,
      blockedIPs,
      totalInvalidAttempts,
    };
  }

  /**
   * Reset for specific IP (admin use)
   */
  public resetIP(ipAddress: string): void {
    this.validUsers.delete(ipAddress);
    this.invalidAttempts.delete(ipAddress);
  }
}

export const smartRateLimiter = new SmartRateLimiter();
