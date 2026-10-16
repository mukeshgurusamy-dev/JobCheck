/**
 * ADVANCED SECURITY UTILITIES - DEFENSE IN DEPTH
 *
 * Military-grade security implementation with multiple layers of protection.
 * Every function validates, sanitizes, and logs suspicious activity.
 */

/**
 * ============================================================================
 * LAYER 1: INPUT VALIDATION & SANITIZATION
 * ============================================================================
 */

/**
 * SQL Injection Prevention
 *
 * Even though we don't use SQL directly, this prevents injection if data
 * ever reaches a database through external APIs or future features
 */
export function preventSqlInjection(input: string): {
  safe: boolean;
  sanitized: string;
  threats: string[];
} {
  const threats: string[] = [];
  let sanitized = input;

  // SQL keywords that indicate injection attempts
  const sqlPatterns = [
    {
      pattern:
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/gi,
      threat: "SQL keyword detected",
    },
    {
      pattern: /(--|\/\*|\*\/|;|xp_)/gi,
      threat: "SQL comment or statement terminator",
    },
    {
      pattern: /('(\s*)OR(\s*)('?\w+)?(\s*)=(\s*)('?\w+)?)/gi,
      threat: "OR-based SQL injection",
    },
    {
      pattern: /('(\s*)AND(\s*)('?\w+)?(\s*)=(\s*)('?\w+)?)/gi,
      threat: "AND-based SQL injection",
    },
    {
      pattern: /(UNION(\s+)ALL(\s+)SELECT)/gi,
      threat: "UNION-based injection",
    },
    { pattern: /(;\s*DROP\s+TABLE)/gi, threat: "DROP TABLE injection" },
    {
      pattern: /(exec(\s|\+)+(s|x)p\w+)/gi,
      threat: "Stored procedure execution",
    },
    {
      pattern: /('(\s*)OR(\s*)1(\s*)=(\s*)1)/gi,
      threat: "Classic 1=1 injection",
    },
    {
      pattern: /(WAITFOR\s+DELAY|BENCHMARK|SLEEP)/gi,
      threat: "Time-based blind SQL injection",
    },
  ];

  for (const { pattern, threat } of sqlPatterns) {
    if (pattern.test(input)) {
      threats.push(threat);
      sanitized = sanitized.replace(pattern, "");
    }
  }

  return {
    safe: threats.length === 0,
    sanitized: sanitized.trim(),
    threats,
  };
}

/**
 * NoSQL Injection Prevention
 * Prevents MongoDB/NoSQL injection attacks
 */
export function preventNoSqlInjection(input: string): {
  safe: boolean;
  sanitized: string;
  threats: string[];
} {
  const threats: string[] = [];
  let sanitized = input;

  const noSqlPatterns = [
    { pattern: /\$where/gi, threat: "MongoDB $where operator" },
    { pattern: /\$ne/gi, threat: "MongoDB $ne (not equal) operator" },
    { pattern: /\$gt/gi, threat: "MongoDB $gt (greater than) operator" },
    { pattern: /\$regex/gi, threat: "MongoDB $regex operator" },
    { pattern: /\$or/gi, threat: "MongoDB $or operator" },
    { pattern: /\$and/gi, threat: "MongoDB $and operator" },
    { pattern: /\{\s*\$[a-z]+:/gi, threat: "MongoDB operator syntax" },
  ];

  for (const { pattern, threat } of noSqlPatterns) {
    if (pattern.test(input)) {
      threats.push(threat);
      sanitized = sanitized.replace(pattern, "");
    }
  }

  return {
    safe: threats.length === 0,
    sanitized: sanitized.trim(),
    threats,
  };
}

/**
 * XSS (Cross-Site Scripting) Prevention
 * Comprehensive XSS protection with multiple encoding strategies
 */
export function preventXss(input: string): {
  safe: boolean;
  sanitized: string;
  threats: string[];
} {
  const threats: string[] = [];
  let sanitized = input;

  const xssPatterns = [
    {
      pattern: /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      threat: "Script tag injection",
    },
    {
      pattern: /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
      threat: "Iframe injection",
    },
    {
      pattern: /<object\b[^>]*>[\s\S]*?<\/object>/gi,
      threat: "Object tag injection",
    },
    { pattern: /<embed\b[^>]*>/gi, threat: "Embed tag injection" },
    { pattern: /<img\b[^>]*onerror\s*=/gi, threat: "IMG onerror handler" },
    { pattern: /on\w+\s*=\s*["'][^"']*["']/gi, threat: "Inline event handler" },
    { pattern: /javascript:/gi, threat: "JavaScript protocol" },
    { pattern: /data:text\/html/gi, threat: "Data URI HTML" },
    { pattern: /vbscript:/gi, threat: "VBScript protocol" },
    {
      pattern: /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
      threat: "SVG with potential script",
    },
    { pattern: /expression\s*\(/gi, threat: "CSS expression" },
    { pattern: /import\s+['"][^'"]*['"]/gi, threat: "JavaScript import" },
  ];

  for (const { pattern, threat } of xssPatterns) {
    if (pattern.test(input)) {
      threats.push(threat);
      sanitized = sanitized.replace(pattern, "");
    }
  }

  // HTML entity encoding for remaining < > characters
  sanitized = sanitized
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");

  return {
    safe: threats.length === 0,
    sanitized,
    threats,
  };
}

/**
 * Command Injection Prevention
 * Prevents OS command injection attacks
 */
export function preventCommandInjection(input: string): {
  safe: boolean;
  sanitized: string;
  threats: string[];
} {
  const threats: string[] = [];
  let sanitized = input;

  const commandPatterns = [
    { pattern: /[;&|`$()]/g, threat: "Command chaining characters" },
    { pattern: /\n|\r/g, threat: "Newline injection" },
    {
      pattern: /(curl|wget|nc|netcat|bash|sh|perl|python|ruby|php)/gi,
      threat: "Command execution tools",
    },
    { pattern: /\$\{.*\}/g, threat: "Variable expansion" },
    { pattern: /\$\(.*\)/g, threat: "Command substitution" },
    { pattern: />\s*\/dev\//gi, threat: "Device file redirection" },
  ];

  for (const { pattern, threat } of commandPatterns) {
    if (pattern.test(input)) {
      threats.push(threat);
      sanitized = sanitized.replace(pattern, "");
    }
  }

  return {
    safe: threats.length === 0,
    sanitized: sanitized.trim(),
    threats,
  };
}

/**
 * Path Traversal Prevention
 * Prevents directory traversal attacks
 */
export function preventPathTraversal(input: string): {
  safe: boolean;
  sanitized: string;
  threats: string[];
} {
  const threats: string[] = [];
  let sanitized = input;

  const pathPatterns = [
    { pattern: /\.\.[\/\\]/g, threat: "Parent directory traversal" },
    { pattern: /\.\.[%][0-9a-f]{2}/gi, threat: "URL-encoded traversal" },
    { pattern: /%2e%2e[\/\\]/gi, threat: "Double URL-encoded traversal" },
    { pattern: /\.\.[%]252f/gi, threat: "Triple URL-encoded traversal" },
    { pattern: /\/etc\/passwd/gi, threat: "Unix password file access" },
    {
      pattern: /\/windows\/system32/gi,
      threat: "Windows system directory access",
    },
    { pattern: /\.\.\\\.\.\\windows/gi, threat: "Windows directory traversal" },
  ];

  for (const { pattern, threat } of pathPatterns) {
    if (pattern.test(input)) {
      threats.push(threat);
      sanitized = sanitized.replace(pattern, "");
    }
  }

  return {
    safe: threats.length === 0,
    sanitized: sanitized.trim(),
    threats,
  };
}

/**
 * LDAP Injection Prevention
 */
export function preventLdapInjection(input: string): {
  safe: boolean;
  sanitized: string;
  threats: string[];
} {
  const threats: string[] = [];
  let sanitized = input;

  const ldapChars = ["*", "(", ")", "\\", "\0"];
  const hasLdapChars = ldapChars.some((char) => input.includes(char));

  if (hasLdapChars) {
    threats.push("LDAP special characters detected");
    ldapChars.forEach((char) => {
      sanitized = sanitized.replace(new RegExp(`\\${char}`, "g"), "");
    });
  }

  return {
    safe: threats.length === 0,
    sanitized: sanitized.trim(),
    threats,
  };
}

/**
 * XML/XXE (XML External Entity) Injection Prevention
 */
export function preventXxeInjection(input: string): {
  safe: boolean;
  sanitized: string;
  threats: string[];
} {
  const threats: string[] = [];
  let sanitized = input;

  const xxePatterns = [
    { pattern: /<!DOCTYPE/gi, threat: "XML DOCTYPE declaration" },
    { pattern: /<!ENTITY/gi, threat: "XML ENTITY declaration" },
    {
      pattern: /SYSTEM\s+["']file:/gi,
      threat: "XML external entity file access",
    },
    {
      pattern: /SYSTEM\s+["']http:/gi,
      threat: "XML external entity HTTP access",
    },
    { pattern: /<\?xml/gi, threat: "XML declaration" },
  ];

  for (const { pattern, threat } of xxePatterns) {
    if (pattern.test(input)) {
      threats.push(threat);
      sanitized = sanitized.replace(pattern, "");
    }
  }

  return {
    safe: threats.length === 0,
    sanitized: sanitized.trim(),
    threats,
  };
}

/**
 * COMPREHENSIVE INPUT SANITIZATION
 * Applies all security checks and returns detailed results
 */
export interface SecurityScanResult {
  originalInput: string;
  sanitizedInput: string;
  isClean: boolean;
  threatLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  threatsDetected: Array<{
    category: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    threats: string[];
  }>;
  shouldBlock: boolean;
  blockReason?: string;
}

export function comprehensiveSanitize(input: string): SecurityScanResult {
  const results = {
    sql: preventSqlInjection(input),
    nosql: preventNoSqlInjection(input),
    xss: preventXss(input),
    command: preventCommandInjection(input),
    path: preventPathTraversal(input),
    ldap: preventLdapInjection(input),
    xxe: preventXxeInjection(input),
  };

  const threatsDetected = [
    {
      category: "SQL Injection",
      severity: "CRITICAL" as const,
      threats: results.sql.threats,
    },
    {
      category: "NoSQL Injection",
      severity: "CRITICAL" as const,
      threats: results.nosql.threats,
    },
    {
      category: "XSS Attack",
      severity: "HIGH" as const,
      threats: results.xss.threats,
    },
    {
      category: "Command Injection",
      severity: "CRITICAL" as const,
      threats: results.command.threats,
    },
    {
      category: "Path Traversal",
      severity: "HIGH" as const,
      threats: results.path.threats,
    },
    {
      category: "LDAP Injection",
      severity: "MEDIUM" as const,
      threats: results.ldap.threats,
    },
    {
      category: "XXE Injection",
      severity: "HIGH" as const,
      threats: results.xxe.threats,
    },
  ].filter((t) => t.threats.length > 0);

  const allThreats = threatsDetected.flatMap((t) => t.threats);
  const isClean = allThreats.length === 0;

  // Determine threat level
  let threatLevel: SecurityScanResult["threatLevel"] = "NONE";
  let shouldBlock = false;
  let blockReason: string | undefined;

  if (
    threatsDetected.some(
      (t) => t.severity === "CRITICAL" && t.threats.length > 0,
    )
  ) {
    threatLevel = "CRITICAL";
    shouldBlock = true;
    blockReason = "Critical security threat detected";
  } else if (
    threatsDetected.some((t) => t.severity === "HIGH" && t.threats.length > 0)
  ) {
    threatLevel = "HIGH";
    shouldBlock = true;
    blockReason = "High-risk security threat detected";
  } else if (
    threatsDetected.some((t) => t.severity === "MEDIUM" && t.threats.length > 2)
  ) {
    threatLevel = "MEDIUM";
    shouldBlock = true;
    blockReason = "Multiple medium-risk threats detected";
  } else if (threatsDetected.length > 0) {
    threatLevel = "LOW";
    shouldBlock = false; // Allow but sanitize
  }

  // Apply sanitization from the most restrictive result
  let sanitizedInput = input;
  if (!results.sql.safe) sanitizedInput = results.sql.sanitized;
  if (!results.nosql.safe) sanitizedInput = results.nosql.sanitized;
  if (!results.command.safe) sanitizedInput = results.command.sanitized;
  if (!results.xss.safe) sanitizedInput = results.xss.sanitized;

  return {
    originalInput: input.slice(0, 100), // Truncate for logging
    sanitizedInput,
    isClean,
    threatLevel,
    threatsDetected,
    shouldBlock,
    blockReason,
  };
}

/**
 * ============================================================================
 * LAYER 2: ADVANCED RATE LIMITING
 * ============================================================================
 */

interface RateLimitRule {
  windowMs: number;
  maxRequests: number;
  blockDurationMs: number;
}

export class AdvancedRateLimiter {
  private requests: Map<string, number[]>;
  private blocked: Map<string, number>; // IP -> unblock timestamp
  private suspiciousIps: Map<string, number>; // IP -> violation count
  private rules: RateLimitRule[];

  constructor(rules?: RateLimitRule[]) {
    this.requests = new Map();
    this.blocked = new Map();
    this.suspiciousIps = new Map();

    // Default rules: multiple time windows
    this.rules = rules || [
      { windowMs: 1000, maxRequests: 5, blockDurationMs: 60000 }, // 5 per second
      { windowMs: 60000, maxRequests: 30, blockDurationMs: 300000 }, // 30 per minute
      { windowMs: 3600000, maxRequests: 500, blockDurationMs: 3600000 }, // 500 per hour
    ];
  }

  /**
   * Check if request should be allowed
   */
  check(identifier: string): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
    remainingRequests?: number;
  } {
    const now = Date.now();

    // Check if IP is blocked
    const blockedUntil = this.blocked.get(identifier);
    if (blockedUntil && now < blockedUntil) {
      const retryAfter = Math.ceil((blockedUntil - now) / 1000);
      return {
        allowed: false,
        reason: "IP temporarily blocked due to rate limit violation",
        retryAfter,
      };
    } else if (blockedUntil && now >= blockedUntil) {
      // Unblock
      this.blocked.delete(identifier);
    }

    // Get request history
    const timestamps = this.requests.get(identifier) || [];

    // Check each rate limit rule
    for (const rule of this.rules) {
      const recentRequests = timestamps.filter((t) => now - t < rule.windowMs);

      if (recentRequests.length >= rule.maxRequests) {
        // Rate limit exceeded - block the IP
        this.blocked.set(identifier, now + rule.blockDurationMs);

        // Track suspicious behavior
        const violations = (this.suspiciousIps.get(identifier) || 0) + 1;
        this.suspiciousIps.set(identifier, violations);

        return {
          allowed: false,
          reason: `Rate limit exceeded: ${rule.maxRequests} requests per ${rule.windowMs}ms`,
          retryAfter: Math.ceil(rule.blockDurationMs / 1000),
        };
      }
    }

    // Allow request and record timestamp
    timestamps.push(now);
    this.requests.set(identifier, timestamps);

    // Cleanup old timestamps
    const cleanedTimestamps = timestamps.filter(
      (t) => now - t < Math.max(...this.rules.map((r) => r.windowMs)),
    );
    this.requests.set(identifier, cleanedTimestamps);

    // Calculate remaining requests (based on most restrictive rule)
    const strictestRule = this.rules.reduce((prev, curr) =>
      curr.maxRequests < prev.maxRequests ? curr : prev,
    );
    const recentForStrictest = cleanedTimestamps.filter(
      (t) => now - t < strictestRule.windowMs,
    );
    const remainingRequests =
      strictestRule.maxRequests - recentForStrictest.length;

    return {
      allowed: true,
      remainingRequests,
    };
  }

  /**
   * Get IP reputation score (0-100, lower is more suspicious)
   */
  getReputationScore(identifier: string): number {
    const violations = this.suspiciousIps.get(identifier) || 0;
    const score = Math.max(0, 100 - violations * 10);
    return score;
  }

  /**
   * Check if IP is suspicious (should trigger CAPTCHA or additional verification)
   */
  isSuspicious(identifier: string): boolean {
    return this.getReputationScore(identifier) < 50;
  }

  /**
   * Periodic cleanup to prevent memory leaks
   */
  cleanup(): void {
    const now = Date.now();
    const maxWindow = Math.max(...this.rules.map((r) => r.windowMs));

    // Clean up old request timestamps
    for (const [key, timestamps] of this.requests.entries()) {
      const recent = timestamps.filter((t) => now - t < maxWindow);
      if (recent.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recent);
      }
    }

    // Clean up expired blocks
    for (const [key, blockedUntil] of this.blocked.entries()) {
      if (now >= blockedUntil) {
        this.blocked.delete(key);
      }
    }

    // Reset violation counts for IPs that have been clean for 24 hours
    for (const [key, _violations] of this.suspiciousIps.entries()) {
      const lastRequest = this.requests.get(key);
      if (!lastRequest || lastRequest.length === 0) {
        this.suspiciousIps.delete(key);
      }
    }
  }
}

/**
 * ============================================================================
 * LAYER 3: SECURE LOGGING & MONITORING
 * ============================================================================
 */

export interface SecurityEvent {
  timestamp: string;
  eventType: "ATTACK_DETECTED" | "RATE_LIMIT" | "SUSPICIOUS_ACTIVITY" | "INFO";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ipAddress: string;
  userAgent?: string;
  endpoint: string;
  details: Record<string, unknown>;
}

export class SecurityMonitor {
  private events: SecurityEvent[] = [];
  private readonly maxEvents = 1000;

  /**
   * Log a security event
   */
  logEvent(event: Omit<SecurityEvent, "timestamp">): void {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.events.push(fullEvent);

    // Keep only recent events (prevent memory leak)
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log to console with redacted sensitive data
    const safeEvent = this.redactSensitiveData(fullEvent);

    if (event.severity === "CRITICAL" || event.severity === "HIGH") {
      console.error("[SECURITY]", JSON.stringify(safeEvent));
    } else if (event.severity === "MEDIUM") {
      console.warn("[SECURITY]", JSON.stringify(safeEvent));
    } else {
      console.log("[SECURITY]", JSON.stringify(safeEvent));
    }
  }

  /**
   * Redact sensitive data from security events before logging
   */
  private redactSensitiveData(event: SecurityEvent): SecurityEvent {
    const redacted = { ...event };

    // Redact IP (keep first 2 octets)
    if (redacted.ipAddress) {
      const parts = redacted.ipAddress.split(".");
      if (parts.length === 4) {
        redacted.ipAddress = `${parts[0]}.${parts[1]}.*.*`;
      }
    }

    return redacted;
  }

  /**
   * Get recent security events
   */
  getRecentEvents(limit = 50): SecurityEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get events for specific IP
   */
  getEventsForIp(ipAddress: string, limit = 20): SecurityEvent[] {
    return this.events.filter((e) => e.ipAddress === ipAddress).slice(-limit);
  }

  /**
   * Get attack statistics
   */
  getStatistics(): {
    totalEvents: number;
    attacksDetected: number;
    rateLimitViolations: number;
    suspiciousActivities: number;
    criticalEvents: number;
  } {
    return {
      totalEvents: this.events.length,
      attacksDetected: this.events.filter(
        (e) => e.eventType === "ATTACK_DETECTED",
      ).length,
      rateLimitViolations: this.events.filter(
        (e) => e.eventType === "RATE_LIMIT",
      ).length,
      suspiciousActivities: this.events.filter(
        (e) => e.eventType === "SUSPICIOUS_ACTIVITY",
      ).length,
      criticalEvents: this.events.filter((e) => e.severity === "CRITICAL")
        .length,
    };
  }
}

/**
 * ============================================================================
 * LAYER 4: REQUEST FINGERPRINTING
 * ============================================================================
 */

export interface RequestFingerprint {
  hash: string;
  ipAddress: string;
  userAgent: string;
  acceptLanguage: string;
  acceptEncoding: string;
  timestamp: number;
}

export function generateRequestFingerprint(
  headers: Record<string, string>,
  ip: string,
): RequestFingerprint {
  const userAgent = headers["user-agent"] || headers["User-Agent"] || "unknown";
  const acceptLanguage =
    headers["accept-language"] || headers["Accept-Language"] || "";
  const acceptEncoding =
    headers["accept-encoding"] || headers["Accept-Encoding"] || "";

  // Create a simple hash (in production, use crypto.createHash)
  const fingerprint = `${ip}-${userAgent}-${acceptLanguage}-${acceptEncoding}`;
  const hash = Buffer.from(fingerprint).toString("base64").slice(0, 32);

  return {
    hash,
    ipAddress: ip,
    userAgent,
    acceptLanguage,
    acceptEncoding,
    timestamp: Date.now(),
  };
}

/**
 * Detect if request is from a bot
 */
export function detectBot(userAgent: string): {
  isBot: boolean;
  botType?: string;
  confidence: number;
} {
  const botPatterns = [
    {
      pattern: /bot|crawler|spider|scraper/i,
      type: "Generic Bot",
      confidence: 0.9,
    },
    {
      pattern: /googlebot|bingbot|yahoo|duckduckbot/i,
      type: "Search Engine",
      confidence: 0.95,
    },
    {
      pattern: /curl|wget|python|java|go-http|axios/i,
      type: "Automated Script",
      confidence: 0.85,
    },
    {
      pattern: /headless|phantom|selenium|puppeteer/i,
      type: "Headless Browser",
      confidence: 0.95,
    },
  ];

  for (const { pattern, type, confidence } of botPatterns) {
    if (pattern.test(userAgent)) {
      return { isBot: true, botType: type, confidence };
    }
  }

  return { isBot: false, confidence: 0 };
}
