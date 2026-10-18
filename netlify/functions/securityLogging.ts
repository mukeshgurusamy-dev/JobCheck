/**
 * SECURITY LOGGING - AUDIT TRAILS & EVENT LOGGING
 *
 * Logs security-relevant events to Netlify function logs without storing PII.
 * Events: rate limit violations, suspicious inputs, failed validations, attacks.
 */

export enum SecurityEventType {
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  RATE_LIMIT_BURST = "RATE_LIMIT_BURST",
  INVALID_INPUT = "INVALID_INPUT",
  SQL_INJECTION_ATTEMPT = "SQL_INJECTION_ATTEMPT",
  NOSQL_INJECTION_ATTEMPT = "NOSQL_INJECTION_ATTEMPT",
  XSS_ATTEMPT = "XSS_ATTEMPT",
  SSRF_ATTEMPT = "SSRF_ATTEMPT",
  MALFORMED_REQUEST = "MALFORMED_REQUEST",
  UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS",
  RESPONSE_SANITIZATION = "RESPONSE_SANITIZATION",
  API_ERROR = "API_ERROR",
  REPLAY_ATTACK = "REPLAY_ATTACK",
  SIGNATURE_INVALID = "SIGNATURE_INVALID",
}

export interface SecurityEvent {
  type: SecurityEventType;
  timestamp: number;
  ip: string;
  endpoint: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Security event logger
 * Writes to console (Netlify function logs) without PII
 */
export class SecurityLogger {
  private static instance: SecurityLogger;

  private constructor() {}

  static getInstance(): SecurityLogger {
    if (!SecurityLogger.instance) {
      SecurityLogger.instance = new SecurityLogger();
    }
    return SecurityLogger.instance;
  }

  /**
   * Log security event
   * Format: [SECURITY] [SEVERITY] [TYPE] IP endpoint message
   */
  log(event: SecurityEvent): void {
    const timestamp = new Date(event.timestamp).toISOString();
    const logLevel = this.getSyslogLevel(event.severity);

    // Format: TIMESTAMP [SECURITY] SEVERITY TYPE IP ENDPOINT MESSAGE
    const logEntry = [
      timestamp,
      "[SECURITY]",
      `[${event.severity.toUpperCase()}]`,
      `[${event.type}]`,
      `IP:${this.maskIp(event.ip)}`,
      `ENDPOINT:${event.endpoint}`,
      event.message,
    ].join(" ");

    console[logLevel](logEntry);

    // Log details if present (but never log sensitive data)
    if (event.details) {
      const sanitizedDetails = this.sanitizeDetails(event.details);
      console[logLevel](`  Details: ${JSON.stringify(sanitizedDetails)}`);
    }
  }

  /**
   * Log rate limit violation
   */
  logRateLimitExceeded(ip: string, endpoint: string, retryAfter: number): void {
    this.log({
      type: SecurityEventType.RATE_LIMIT_EXCEEDED,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "high",
      message: `Rate limit exceeded, retry after ${retryAfter}s`,
      details: { retryAfter },
    });
  }

  /**
   * Log burst attack
   */
  logBurstAttack(ip: string, endpoint: string, requestCount: number): void {
    this.log({
      type: SecurityEventType.RATE_LIMIT_BURST,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "critical",
      message: `Burst attack detected: ${requestCount} requests`,
      details: { requestCount },
    });
  }

  /**
   * Log invalid input
   */
  logInvalidInput(ip: string, endpoint: string, reason: string): void {
    this.log({
      type: SecurityEventType.INVALID_INPUT,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "medium",
      message: `Invalid input: ${reason}`,
      details: { reason },
    });
  }

  /**
   * Log SQL injection attempt
   */
  logSqlInjectionAttempt(ip: string, endpoint: string, threats: string[]): void {
    this.log({
      type: SecurityEventType.SQL_INJECTION_ATTEMPT,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "critical",
      message: `SQL injection attempt detected: ${threats.join(", ")}`,
      details: { threatCount: threats.length },
    });
  }

  /**
   * Log NoSQL injection attempt
   */
  logNoSqlInjectionAttempt(ip: string, endpoint: string, threats: string[]): void {
    this.log({
      type: SecurityEventType.NOSQL_INJECTION_ATTEMPT,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "critical",
      message: `NoSQL injection attempt detected: ${threats.join(", ")}`,
      details: { threatCount: threats.length },
    });
  }

  /**
   * Log XSS attempt
   */
  logXssAttempt(ip: string, endpoint: string, patterns: string[]): void {
    this.log({
      type: SecurityEventType.XSS_ATTEMPT,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "high",
      message: `XSS attempt detected: ${patterns.length} patterns`,
      details: { patternCount: patterns.length },
    });
  }

  /**
   * Log SSRF attempt
   */
  logSsrfAttempt(ip: string, endpoint: string, url: string, reason: string): void {
    this.log({
      type: SecurityEventType.SSRF_ATTEMPT,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "critical",
      message: `SSRF attempt blocked: ${reason}`,
      details: { urlLength: url.length, reason },
    });
  }

  /**
   * Log malformed request
   */
  logMalformedRequest(ip: string, endpoint: string, error: string): void {
    this.log({
      type: SecurityEventType.MALFORMED_REQUEST,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "medium",
      message: `Malformed request: ${error}`,
      details: { error },
    });
  }

  /**
   * Log replay attack
   */
  logReplayAttack(ip: string, endpoint: string, nonce: string): void {
    this.log({
      type: SecurityEventType.REPLAY_ATTACK,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "critical",
      message: `Replay attack detected: duplicate nonce`,
      details: { noncePrefix: nonce.substring(0, 8) },
    });
  }

  /**
   * Log signature verification failure
   */
  logSignatureInvalid(ip: string, endpoint: string, reason: string): void {
    this.log({
      type: SecurityEventType.SIGNATURE_INVALID,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "high",
      message: `Signature verification failed: ${reason}`,
      details: { reason },
    });
  }

  /**
   * Log response sanitization event
   */
  logResponseSanitization(ip: string, endpoint: string, removedTags: number): void {
    this.log({
      type: SecurityEventType.RESPONSE_SANITIZATION,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "low",
      message: `Response sanitized: ${removedTags} dangerous elements removed`,
      details: { removedTags },
    });
  }

  /**
   * Log API error
   */
  logApiError(ip: string, endpoint: string, status: number, message: string): void {
    this.log({
      type: SecurityEventType.API_ERROR,
      timestamp: Date.now(),
      ip,
      endpoint,
      severity: "medium",
      message: `API error ${status}: ${message}`,
      details: { status },
    });
  }

  /**
   * Get syslog severity level for console method
   */
  private getSyslogLevel(severity: "low" | "medium" | "high" | "critical"): "warn" | "error" {
    return severity === "low" ? "warn" : "error";
  }

  /**
   * Mask IP address for privacy
   */
  private maskIp(ip: string): string {
    if (ip === "unknown") return "unknown";
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.* `;
    }
    return ip.substring(0, 10) + "***";
  }

  /**
   * Sanitize details object - remove sensitive fields
   */
  private sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ["password", "token", "secret", "key", "auth", "credential", "email", "phone"];

    for (const [key, value] of Object.entries(details)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "string" && value.length > 100) {
        sanitized[key] = value.substring(0, 50) + "... [truncated]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = "[Object]";
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

/**
 * Get singleton instance
 */
export function getSecurityLogger(): SecurityLogger {
  return SecurityLogger.getInstance();
}
