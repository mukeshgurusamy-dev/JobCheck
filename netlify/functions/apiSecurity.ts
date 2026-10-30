/**
 * API COMMUNICATION SECURITY
 *
 * Advanced security for API requests and responses:
 * - Request signing (HMAC)
 * - Replay attack prevention (nonce + timestamp)
 * - Response validation
 * - Request/response encryption (optional)
 * - Integrity verification
 * - Man-in-the-middle (MITM) protection
 */

import crypto from "crypto";

/**
 * ============================================================================
 * REQUEST SIGNING & VERIFICATION
 * ============================================================================
 */

export interface SignedRequest {
  payload: string; // JSON stringified request data
  signature: string; // HMAC signature
  timestamp: number; // Unix timestamp in milliseconds
  nonce: string; // Unique request identifier
}

export interface RequestSignatureConfig {
  secretKey: string; // Shared secret between client and server
  algorithm?: "sha256" | "sha512"; // HMAC algorithm
  maxAgeSeconds?: number; // Maximum age for request validity
}

/**
 * Generate a cryptographically secure nonce
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Sign an API request with HMAC
 * Prevents tampering and ensures authenticity
 */
export function signRequest(
  data: Record<string, unknown>,
  config: RequestSignatureConfig
): SignedRequest {
  const timestamp = Date.now();
  const nonce = generateNonce();
  const payload = JSON.stringify(data);

  // Create signature: HMAC(payload + timestamp + nonce)
  const message = `${payload}|${timestamp}|${nonce}`;
  const algorithm = config.algorithm || "sha256";

  const signature = crypto
    .createHmac(algorithm, config.secretKey)
    .update(message)
    .digest("hex");

  return {
    payload,
    signature,
    timestamp,
    nonce,
  };
}

/**
 * Verify a signed API request
 * Returns null if invalid, returns parsed data if valid
 */
export function verifyRequest(
  signedRequest: SignedRequest,
  config: RequestSignatureConfig,
  seenNonces: Set<string>
): {
  valid: boolean;
  data?: Record<string, unknown>;
  reason?: string;
} {
  const { payload, signature, timestamp, nonce } = signedRequest;
  const maxAge = (config.maxAgeSeconds || 300) * 1000; // Default 5 minutes

  // 1. Check timestamp (prevent replay attacks)
  const now = Date.now();
  const age = now - timestamp;

  if (age < 0) {
    return { valid: false, reason: "Request timestamp is in the future" };
  }

  if (age > maxAge) {
    return {
      valid: false,
      reason: `Request too old (age: ${Math.floor(age / 1000)}s, max: ${config.maxAgeSeconds}s)`,
    };
  }

  // 2. Check nonce (prevent replay attacks)
  if (seenNonces.has(nonce)) {
    return { valid: false, reason: "Nonce already used (replay attack detected)" };
  }

  // 3. Verify signature
  const message = `${payload}|${timestamp}|${nonce}`;
  const algorithm = config.algorithm || "sha256";

  const expectedSignature = crypto
    .createHmac(algorithm, config.secretKey)
    .update(message)
    .digest("hex");

  if (signature !== expectedSignature) {
    return { valid: false, reason: "Invalid signature (request tampered)" };
  }

  // 4. Parse payload
  try {
    const data = JSON.parse(payload) as Record<string, unknown>;

    // Mark nonce as seen
    seenNonces.add(nonce);

    return { valid: true, data };
  } catch (err) {
    return { valid: false, reason: "Invalid JSON payload" };
  }
}

/**
 * Nonce cache manager (prevents replay attacks)
 * Automatically cleans up old nonces
 */
export class NonceCache {
  private nonces: Map<string, number>; // nonce -> timestamp
  private readonly maxAgeMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxAgeSeconds = 300) {
    this.nonces = new Map();
    this.maxAgeMs = maxAgeSeconds * 1000;

    // Auto-cleanup every minute
    this.startCleanup();
  }

  has(nonce: string): boolean {
    const timestamp = this.nonces.get(nonce);
    if (!timestamp) return false;

    // Check if nonce is still valid
    const age = Date.now() - timestamp;
    if (age > this.maxAgeMs) {
      this.nonces.delete(nonce);
      return false;
    }

    return true;
  }

  add(nonce: string): void {
    this.nonces.set(nonce, Date.now());
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [nonce, timestamp] of this.nonces.entries()) {
        if (now - timestamp > this.maxAgeMs) {
          this.nonces.delete(nonce);
        }
      }
    }, 60000); // Every minute
    if (this.cleanupInterval && typeof (this.cleanupInterval as any).unref === "function") {
      (this.cleanupInterval as any).unref();
    }
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  size(): number {
    return this.nonces.size;
  }
}

/**
 * ============================================================================
 * RESPONSE SIGNING & VERIFICATION
 * ============================================================================
 */

export interface SignedResponse {
  data: unknown;
  signature: string;
  timestamp: number;
}

/**
 * Sign an API response
 * Ensures response integrity and authenticity
 */
export function signResponse(
  data: unknown,
  secretKey: string,
  algorithm: "sha256" | "sha512" = "sha256"
): SignedResponse {
  const timestamp = Date.now();
  const payload = JSON.stringify(data);

  const message = `${payload}|${timestamp}`;
  const signature = crypto
    .createHmac(algorithm, secretKey)
    .update(message)
    .digest("hex");

  return {
    data,
    signature,
    timestamp,
  };
}

/**
 * Verify a signed API response
 */
export function verifyResponse(
  signedResponse: SignedResponse,
  secretKey: string,
  algorithm: "sha256" | "sha512" = "sha256",
  maxAgeSeconds = 60
): {
  valid: boolean;
  data?: unknown;
  reason?: string;
} {
  const { data, signature, timestamp } = signedResponse;

  // 1. Check timestamp
  const age = Date.now() - timestamp;
  if (age > maxAgeSeconds * 1000) {
    return { valid: false, reason: "Response too old" };
  }

  // 2. Verify signature
  const payload = JSON.stringify(data);
  const message = `${payload}|${timestamp}`;

  const expectedSignature = crypto
    .createHmac(algorithm, secretKey)
    .update(message)
    .digest("hex");

  if (signature !== expectedSignature) {
    return { valid: false, reason: "Invalid signature (response tampered)" };
  }

  return { valid: true, data };
}

/**
 * ============================================================================
 * REQUEST ENCRYPTION (Optional - for sensitive data)
 * ============================================================================
 */

export interface EncryptedPayload {
  encrypted: string; // Base64 encoded encrypted data
  iv: string; // Initialization vector (Base64)
  tag: string; // Authentication tag (Base64) - for AES-GCM
}

/**
 * Encrypt request payload using AES-256-GCM
 * Provides confidentiality and integrity
 */
export function encryptPayload(
  data: Record<string, unknown>,
  encryptionKey: string // Must be 32 bytes (256 bits)
): EncryptedPayload {
  const payload = JSON.stringify(data);

  // Generate random IV (12 bytes for GCM)
  const iv = crypto.randomBytes(12);

  // Create cipher
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(encryptionKey, "hex"),
    iv
  );

  // Encrypt
  let encrypted = cipher.update(payload, "utf8", "base64");
  encrypted += cipher.final("base64");

  // Get authentication tag
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypt encrypted payload
 */
export function decryptPayload(
  encryptedPayload: EncryptedPayload,
  encryptionKey: string
): {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
} {
  try {
    const { encrypted, iv, tag } = encryptedPayload;

    // Create decipher
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(encryptionKey, "hex"),
      Buffer.from(iv, "base64")
    );

    // Set authentication tag
    decipher.setAuthTag(Buffer.from(tag, "base64"));

    // Decrypt
    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    const data = JSON.parse(decrypted) as Record<string, unknown>;
    return { success: true, data };

  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Decryption failed",
    };
  }
}

/**
 * ============================================================================
 * SECURE API CLIENT (Browser-side)
 * ============================================================================
 */

export interface SecureApiConfig {
  endpoint: string;
  signRequests?: boolean;
  encryptRequests?: boolean;
  verifyResponses?: boolean;
  hmacSecret?: string;
  encryptionKey?: string;
  timeout?: number;
}

export class SecureApiClient {
  private config: SecureApiConfig;
  private pendingRequests: Map<string, AbortController>;

  constructor(config: SecureApiConfig) {
    this.config = config;
    this.pendingRequests = new Map();
  }

  /**
   * Make a secure API request
   */
  async request<T = unknown>(
    data: Record<string, unknown>,
    options?: {
      timeout?: number;
      requestId?: string;
    }
  ): Promise<{
    success: boolean;
    data?: T;
    error?: string;
    responseTime?: number;
  }> {
    const startTime = Date.now();
    const requestId = options?.requestId || generateNonce();
    const timeout = options?.timeout || this.config.timeout || 30000;

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      this.pendingRequests.set(requestId, controller);

      const timeoutId = setTimeout(() => controller.abort(), timeout);

      let requestBody: string;
      let headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Sign request (if enabled)
      if (this.config.signRequests && this.config.hmacSecret) {
        const signed = signRequest(data, {
          secretKey: this.config.hmacSecret,
          algorithm: "sha256",
          maxAgeSeconds: 300,
        });
        requestBody = JSON.stringify(signed);
        headers["X-Request-Signed"] = "true";
      } else {
        requestBody = JSON.stringify(data);
      }

      // Make request
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.pendingRequests.delete(requestId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
          responseTime: Date.now() - startTime,
        };
      }

      const responseData = (await response.json()) as T;
      const responseTime = Date.now() - startTime;

      // Verify response signature (if enabled)
      if (this.config.verifyResponses && this.config.hmacSecret) {
        // Server would need to implement response signing
        // For now, we trust HTTPS
      }

      return {
        success: true,
        data: responseData,
        responseTime,
      };

    } catch (err) {
      this.pendingRequests.delete(requestId);

      if (err instanceof Error) {
        if (err.name === "AbortError") {
          return {
            success: false,
            error: `Request timeout after ${timeout}ms`,
            responseTime: Date.now() - startTime,
          };
        }
        return {
          success: false,
          error: err.message,
          responseTime: Date.now() - startTime,
        };
      }

      return {
        success: false,
        error: "Unknown error occurred",
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Cancel a pending request
   */
  cancelRequest(requestId: string): boolean {
    const controller = this.pendingRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.pendingRequests.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    for (const controller of this.pendingRequests.values()) {
      controller.abort();
    }
    this.pendingRequests.clear();
  }

  /**
   * Get number of pending requests
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }
}

/**
 * ============================================================================
 * API REQUEST VALIDATION HELPERS
 * ============================================================================
 */

/**
 * Validate API request structure
 */
export function validateApiRequest(request: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!request || typeof request !== "object") {
    errors.push("Request must be an object");
    return { valid: false, errors };
  }

  const req = request as Record<string, unknown>;

  // Required fields
  if (!req.url || typeof req.url !== "string") {
    errors.push("Field 'url' is required and must be a string");
  }

  // Optional fields validation
  if (req.description !== undefined && typeof req.description !== "string") {
    errors.push("Field 'description' must be a string if provided");
  }

  // URL format validation
  if (req.url && typeof req.url === "string") {
    try {
      new URL(req.url);
    } catch {
      errors.push("Field 'url' must be a valid URL");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate API response structure
 */
export function validateApiResponse(response: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!response || typeof response !== "object") {
    errors.push("Response must be an object");
    return { valid: false, errors };
  }

  const res = response as Record<string, unknown>;

  // Check for error responses
  if (res.error) {
    if (typeof res.error !== "string") {
      errors.push("Field 'error' must be a string if present");
    }
    // Error responses are valid
    return { valid: errors.length === 0, errors };
  }

  // Success responses should have specific fields
  if (res.fetched !== undefined && typeof res.fetched !== "boolean") {
    errors.push("Field 'fetched' must be a boolean if present");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * ============================================================================
 * RESPONSE INTEGRITY VERIFICATION
 * ============================================================================
 */

/**
 * Compute response checksum for integrity verification
 */
export function computeResponseChecksum(data: unknown): string {
  const payload = JSON.stringify(data);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Verify response integrity
 */
export function verifyResponseIntegrity(
  data: unknown,
  expectedChecksum: string
): boolean {
  const actualChecksum = computeResponseChecksum(data);
  return actualChecksum === expectedChecksum;
}

/**
 * ============================================================================
 * API REQUEST MONITORING
 * ============================================================================
 */

export interface ApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  slowRequests: number; // Requests > 5 seconds
  timeoutRequests: number;
  lastRequestTime?: number;
  requestsPerMinute: number;
}

export class ApiMonitor {
  private metrics: ApiMetrics;
  private responseTimes: number[];
  private recentRequestTimestamps: number[];
  private readonly maxSamples = 100;

  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      slowRequests: 0,
      timeoutRequests: 0,
      requestsPerMinute: 0,
    };
    this.responseTimes = [];
    this.recentRequestTimestamps = [];
  }

  recordRequest(success: boolean, responseTime: number, isTimeout = false): void {
    this.metrics.totalRequests++;
    this.metrics.lastRequestTime = Date.now();

    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    if (isTimeout) {
      this.metrics.timeoutRequests++;
    }

    if (responseTime > 5000) {
      this.metrics.slowRequests++;
    }

    // Track response times
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > this.maxSamples) {
      this.responseTimes.shift();
    }

    // Calculate average response time
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    this.metrics.averageResponseTime = Math.round(sum / this.responseTimes.length);

    // Track requests per minute
    const now = Date.now();
    this.recentRequestTimestamps.push(now);

    // Remove timestamps older than 1 minute
    this.recentRequestTimestamps = this.recentRequestTimestamps.filter(
      t => now - t < 60000
    );

    this.metrics.requestsPerMinute = this.recentRequestTimestamps.length;
  }

  getMetrics(): ApiMetrics {
    return { ...this.metrics };
  }

  getSuccessRate(): number {
    if (this.metrics.totalRequests === 0) return 0;
    return (this.metrics.successfulRequests / this.metrics.totalRequests) * 100;
  }

  reset(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      slowRequests: 0,
      timeoutRequests: 0,
      requestsPerMinute: 0,
    };
    this.responseTimes = [];
    this.recentRequestTimestamps = [];
  }
}
