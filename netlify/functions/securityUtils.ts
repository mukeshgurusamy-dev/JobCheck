/**
 * Security utility functions for Netlify functions
 * Implements input validation, sanitization, and security checks
 */

/**
 * Validates that a URL is safe for processing
 * Blocks file://, data://, javascript:// and other dangerous protocols
 */
export function validateJobUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required and must be a string" };
  }

  // Length check to prevent DoS
  if (url.length > 2048) {
    return { valid: false, error: "URL exceeds maximum length of 2048 characters" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only allow HTTP(S)
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      valid: false,
      error: `Protocol '${parsed.protocol}' not allowed. Only HTTP and HTTPS are supported.`,
    };
  }

  // Additional checks are in SSRF protection, but defense-in-depth here
  // Block obvious internal/private addresses at the URL parsing level
  const hostname = parsed.hostname.toLowerCase();

  // Block localhost variants
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  ) {
    return { valid: false, error: "Localhost URLs are not allowed" };
  }

  // Block private IP patterns (basic check, full check in SSRF module)
  if (/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(hostname)) {
    return { valid: false, error: "Private IP addresses are not allowed" };
  }

  return { valid: true };
}

/**
 * Sanitizes job description text to prevent prompt injection and other attacks
 * Implements defense against:
 * - Prompt injection (instruction override attempts)
 * - XSS payloads
 * - Excessively long inputs (DoS)
 * - Binary data / null bytes
 */
export function sanitizeDescription(
  text: string | undefined,
  maxLength = 10000,
): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  // Length limit to prevent memory exhaustion
  let cleaned = text.slice(0, maxLength);

  // Remove null bytes (potential binary data)
  cleaned = cleaned.replace(/\0/g, "");

  // Remove excessive whitespace (normalize)
  cleaned = cleaned.replace(/\s+/g, " ");

  // Strip markdown code fence markers that could confuse AI
  cleaned = cleaned.replace(/```/g, "");

  // Strip potential XSS vectors (script tags, even though this is server-side)
  // Defense-in-depth: prevent any downstream processing issues
  cleaned = cleaned.replace(/<script[^>]*>.*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<iframe[^>]*>.*?<\/iframe>/gi, "");
  cleaned = cleaned.replace(/javascript:/gi, "");
  cleaned = cleaned.replace(/on\w+\s*=/gi, ""); // Remove inline event handlers

  return cleaned.trim();
}

/**
 * Validates request body size to prevent memory exhaustion attacks
 */
export function validateBodySize(
  body: string | null | undefined,
  maxSizeBytes = 50000,
): { valid: boolean; error?: string } {
  if (!body) {
    return { valid: true };
  }

  const size = Buffer.byteLength(body, "utf8");

  if (size > maxSizeBytes) {
    return {
      valid: false,
      error: `Request body too large (${size} bytes). Maximum allowed: ${maxSizeBytes} bytes.`,
    };
  }

  return { valid: true };
}

/**
 * Detects suspicious patterns that may indicate malicious requests
 * Used for additional security monitoring and alerting
 */
export function detectSuspiciousPatterns(input: string): {
  suspicious: boolean;
  reason?: string;
} {
  if (!input) return { suspicious: false };

  const suspiciousPatterns: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern: /(<script|javascript:|data:text\/html|file:|vbscript:)/i,
      reason: "Potential XSS or protocol injection",
    },
    {
      pattern: /(union\s+select|drop\s+table|insert\s+into|delete\s+from)/i,
      reason: "Potential SQL injection attempt",
    },
    {
      pattern: /(\.\.[\/\\]|\.\.%2f|\.\.%5c)/i,
      reason: "Potential path traversal attempt",
    },
    {
      pattern: /(eval\(|exec\(|system\(|passthru\()/i,
      reason: "Potential code execution attempt",
    },
    {
      pattern:
        /(ignore\s+previous\s+instructions|ignore\s+above|disregard\s+previous)/i,
      reason: "Potential prompt injection attempt",
    },
  ];

  for (const { pattern, reason } of suspiciousPatterns) {
    if (pattern.test(input)) {
      return { suspicious: true, reason };
    }
  }

  return { suspicious: false };
}

/**
 * Sanitizes error messages for production to avoid information disclosure
 * In production, returns generic messages
 * In development, returns detailed messages
 */
export function sanitizeErrorMessage(
  error: unknown,
  isDevelopment = false,
): string {
  if (isDevelopment) {
    // In dev, show full error for debugging
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  // In production, return generic message
  // Never expose internal error details to end users
  return "An error occurred while processing your request. Please try again.";
}

/**
 * Creates a secure logger that redacts sensitive information
 * Prevents API keys, tokens, and PII from appearing in logs
 */
export class SecureLogger {
  private readonly context: string;

  constructor(context: string) {
    this.context = context;
  }

  /**
   * Redacts sensitive patterns from strings before logging
   */
  private redact(message: string): string {
    let redacted = message;

    // Redact API keys (pattern: AIza..., AQ...., etc.)
    redacted = redacted.replace(/\b[A-Za-z0-9_-]{20,}\b/g, (match) => {
      if (
        /^(AIza|AQ\.|ya29\.|[A-Za-z0-9]{32,})/.test(match) ||
        match.length > 30
      ) {
        return `[REDACTED-${match.slice(0, 4)}...]`;
      }
      return match;
    });

    // Redact email addresses (PII)
    redacted = redacted.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      "[EMAIL-REDACTED]",
    );

    // Redact phone numbers (Indian format)
    redacted = redacted.replace(/\b\d{10}\b/g, "[PHONE-REDACTED]");
    redacted = redacted.replace(/\+91[-\s]?\d{10}/g, "[PHONE-REDACTED]");

    // Redact potential Aadhaar numbers (12 digits)
    redacted = redacted.replace(/\b\d{12}\b/g, "[AADHAAR-REDACTED]");

    // Redact PAN numbers (format: ABCDE1234F)
    redacted = redacted.replace(
      /\b[A-Z]{5}\d{4}[A-Z]\b/g,
      "[PAN-REDACTED]",
    );

    return redacted;
  }

  error(message: string, error?: unknown): void {
    const redactedMessage = this.redact(message);

    if (error instanceof Error) {
      // Don't log full error object (may contain sensitive data)
      console.error(`[${this.context}] ${redactedMessage}: ${error.message}`);
    } else {
      console.error(`[${this.context}] ${redactedMessage}`);
    }
  }

  warn(message: string): void {
    const redactedMessage = this.redact(message);
    console.warn(`[${this.context}] ${redactedMessage}`);
  }

  info(message: string): void {
    const redactedMessage = this.redact(message);
    console.log(`[${this.context}] ${redactedMessage}`);
  }
}

/**
 * Rate limiter helper - checks if action should be allowed
 * This is the in-memory implementation (per-instance)
 * For production, consider using Redis/Upstash for distributed rate limiting
 */
export class RateLimiter {
  private requests: Map<string, number[]>;
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.requests = new Map();
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Checks if the request should be allowed
   * Returns true if allowed, false if rate limit exceeded
   */
  check(identifier: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(identifier) ?? [];

    // Filter out timestamps outside the window
    const recent = timestamps.filter((t) => now - t < this.windowMs);

    if (recent.length >= this.maxRequests) {
      return false; // Rate limit exceeded
    }

    recent.push(now);
    this.requests.set(identifier, recent);

    // Periodic cleanup to prevent memory leak
    if (this.requests.size > 10000) {
      this.cleanup(now);
    }

    return true;
  }

  /**
   * Removes expired entries to prevent memory leak
   */
  private cleanup(now: number): void {
    for (const [key, timestamps] of this.requests.entries()) {
      const recent = timestamps.filter((t) => now - t < this.windowMs);
      if (recent.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recent);
      }
    }
  }

  /**
   * Gets remaining requests for an identifier
   */
  remaining(identifier: string): number {
    const now = Date.now();
    const timestamps = this.requests.get(identifier) ?? [];
    const recent = timestamps.filter((t) => now - t < this.windowMs);
    return Math.max(0, this.maxRequests - recent.length);
  }
}
