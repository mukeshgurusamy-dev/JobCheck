/**
 * RESPONSE SANITIZATION - XSS PREVENTION FOR AI RESPONSES
 *
 * Sanitizes AI-generated content (Gemini responses) before rendering.
 * Removes dangerous HTML/JS while preserving safe formatting.
 * Uses text sanitization and pattern detection for safety.
 */

/**
 * Dangerous patterns that indicate XSS or malicious content
 */
const DANGEROUS_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // Event handlers
  /<iframe[^>]*>/gi,
  /<object[^>]*>/gi,
  /<embed[^>]*>/gi,
  /<form[^>]*>/gi,
  /eval\(/gi,
  /expression\s*\(/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
  /<svg[^>]*onload/gi,
  /<img[^>]*onerror/gi,
  /<body[^>]*onload/gi,
  /<!--[\s\S]*?-->/g, // HTML comments
];

/**
 * Check if content contains dangerous patterns
 */
export function hasDangerousPatterns(content: string): {
  safe: boolean;
  patterns: string[];
} {
  const patterns: string[] = [];

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      patterns.push(pattern.source);
      pattern.lastIndex = 0; // Reset regex for next test
    }
  }

  return {
    safe: patterns.length === 0,
    patterns,
  };
}

/**
 * Sanitize HTML content
 * Uses text-only extraction as safest option for AI responses
 */
export function sanitizeHtmlContent(content: string): {
  safe: string;
  dangerous: boolean;
  removedElements: number;
} {
  // First check for dangerous patterns
  const patternCheck = hasDangerousPatterns(content);

  // Remove dangerous patterns
  let sanitized = content;
  let removedCount = 0;

  for (const pattern of DANGEROUS_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches) {
      removedCount += matches.length;
      sanitized = sanitized.replace(pattern, "");
    }
  }

  // Additional sanitization: encode HTML entities
  sanitized = sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

  // Decode safe entities back
  sanitized = sanitized
    .replace(/&lt;b&gt;/g, "<b>")
    .replace(/&lt;\/b&gt;/g, "</b>")
    .replace(/&lt;i&gt;/g, "<i>")
    .replace(/&lt;\/i&gt;/g, "</i>")
    .replace(/&lt;strong&gt;/g, "<strong>")
    .replace(/&lt;\/strong&gt;/g, "</strong>")
    .replace(/&lt;em&gt;/g, "<em>")
    .replace(/&lt;\/em&gt;/g, "</em>")
    .replace(/&lt;p&gt;/g, "<p>")
    .replace(/&lt;\/p&gt;/g, "</p>")
    .replace(/&lt;br&gt;/g, "<br>")
    .replace(/&lt;br\/&gt;/g, "<br/>")
    .replace(/&lt;ul&gt;/g, "<ul>")
    .replace(/&lt;\/ul&gt;/g, "</ul>")
    .replace(/&lt;ol&gt;/g, "<ol>")
    .replace(/&lt;\/ol&gt;/g, "</ol>")
    .replace(/&lt;li&gt;/g, "<li>")
    .replace(/&lt;\/li&gt;/g, "</li>")
    .replace(/&lt;code&gt;/g, "<code>")
    .replace(/&lt;\/code&gt;/g, "</code>")
    .replace(/&lt;pre&gt;/g, "<pre>")
    .replace(/&lt;\/pre&gt;/g, "</pre>")
    .replace(/&lt;blockquote&gt;/g, "<blockquote>")
    .replace(/&lt;\/blockquote&gt;/g, "</blockquote>");

  return {
    safe: sanitized,
    dangerous: patternCheck.patterns.length > 0 || removedCount > 0,
    removedElements: removedCount,
  };
}

/**
 * Sanitize plain text content (safest option)
 * Simply removes all HTML and scripts
 */
export function sanitizeTextContent(content: string): string {
  // Remove all HTML tags
  let sanitized = content.replace(/<[^>]*>/g, "");

  // Remove HTML entities that could be interpreted as code
  sanitized = sanitized.replace(/&#?[a-z0-9]+;/gi, "");

  // Trim extra whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Sanitize JSON response from API
 * Recursively sanitizes all string fields
 */
export function sanitizeJsonResponse(data: unknown): {
  safe: unknown;
  removedElements: number;
} {
  let removedElements = 0;

  function sanitize(obj: unknown): unknown {
    if (typeof obj === "string") {
      const result = sanitizeHtmlContent(obj);
      removedElements += result.removedElements;
      return result.safe;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item));
    }

    if (obj !== null && typeof obj === "object") {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }

    return obj;
  }

  return {
    safe: sanitize(data),
    removedElements,
  };
}

/**
 * Validate URL safety
 * Ensures URL doesn't contain malicious protocols or patterns
 */
export function validateUrlSafety(url: string): {
  safe: boolean;
  reason?: string;
} {
  try {
    const urlObj = new URL(url);

    // Check protocol
    const allowedProtocols = ["http:", "https:"];
    if (!allowedProtocols.includes(urlObj.protocol)) {
      return { safe: false, reason: `Disallowed protocol: ${urlObj.protocol}` };
    }

    // Check for data: URLs
    if (url.startsWith("data:")) {
      return { safe: false, reason: "Data URLs not allowed" };
    }

    // Check for javascript: URLs
    if (url.startsWith("javascript:")) {
      return { safe: false, reason: "JavaScript URLs not allowed" };
    }

    // Check hostname
    const hostname = urlObj.hostname.toLowerCase();

    // Block localhost and internal IPs
    const internalPatterns = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^fc00:/i, // IPv6 private
      /^fe80:/i, // IPv6 link-local
    ];

    for (const pattern of internalPatterns) {
      if (pattern.test(hostname)) {
        return { safe: false, reason: `Internal IP blocked: ${hostname}` };
      }
    }

    return { safe: true };
  } catch (err) {
    return { safe: false, reason: `Invalid URL: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

/**
 * Escape HTML for safe rendering in text context
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };
  return text.replace(/[&<>"'/]/g, char => map[char] || char);
}

/**
 * Remove null bytes and control characters
 */
export function removeControlCharacters(content: string): string {
  // Remove null bytes and control characters (ASCII 0-31, except common whitespace)
  return content
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control chars
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); // Remove Unicode control chars
}

/**
 * Validate response length (prevent DoS via huge responses)
 */
export function validateResponseLength(content: string, maxLength = 100000): {
  valid: boolean;
  length: number;
} {
  return {
    valid: content.length <= maxLength,
    length: content.length,
  };
}

/**
 * Comprehensive response sanitization
 */
export function sanitizeResponse(content: unknown): {
  sanitized: unknown;
  warnings: string[];
  removedElements: number;
} {
  const warnings: string[] = [];
  let removedElements = 0;

  if (typeof content === "string") {
    let processedContent = content;

    // Check length
    const lengthCheck = validateResponseLength(processedContent);
    if (!lengthCheck.valid) {
      warnings.push(`Response truncated from ${lengthCheck.length} to 100000 characters`);
      processedContent = processedContent.substring(0, 100000);
    }

    // Remove control characters
    processedContent = removeControlCharacters(processedContent);

    // Check for dangerous patterns
    const patternCheck = hasDangerousPatterns(processedContent);
    if (!patternCheck.safe) {
      warnings.push(`Dangerous patterns detected: ${patternCheck.patterns.slice(0, 3).join(", ")}`);
    }

    // Sanitize HTML
    const sanitized = sanitizeHtmlContent(processedContent);
    removedElements += sanitized.removedElements;
    if (sanitized.dangerous) {
      warnings.push("Response contained malicious elements, sanitized");
    }

    return {
      sanitized: sanitized.safe,
      warnings,
      removedElements,
    };
  }

  if (typeof content === "object" && content !== null) {
    const result = sanitizeJsonResponse(content);
    removedElements = result.removedElements;

    if (removedElements > 0) {
      warnings.push(`Removed ${removedElements} dangerous elements from response`);
    }

    return {
      sanitized: result.safe,
      warnings,
      removedElements,
    };
  }

  return {
    sanitized: content,
    warnings,
    removedElements: 0,
  };
}
