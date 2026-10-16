/**
 * Phone Number Validation Rules
 * Detects suspicious phone number patterns in job postings
 */

import { Finding } from "../types/types";
import { extractPhoneNumbers, extractLocationForPhoneValidation } from "../utils/phoneExtractor";

export interface PhoneValidationContext {
  rawText: string;
  normalizedText: string;
  companyLocation?: string; // From AI intelligence
  isTrustedPlatform?: boolean; // True if on LinkedIn, company careers page, etc.
}

/**
 * Evaluate phone numbers in job description for scam indicators
 */
export function evaluatePhoneNumbers(ctx: PhoneValidationContext): Finding[] {
  const findings: Finding[] = [];
  const phones = extractPhoneNumbers(ctx.rawText);

  if (phones.length === 0) {
    return findings; // No phone numbers found, nothing to validate
  }

  // Get expected location from text or company data
  const expectedLocation = ctx.companyLocation || extractLocationForPhoneValidation(ctx.rawText);

  // Check for multiple phone numbers (common in scams)
  if (phones.length >= 3) {
    findings.push({
      id: "multiple-phone-numbers",
      kind: "risk",
      severity: "low",
      points: 10,
      reason: `Multiple phone numbers (${phones.length}) listed - legitimate companies typically provide one contact number`,
      evidence: phones.slice(0, 3).map(p => p.normalized).join(", ")
    });
  }

  // Check for country code mismatch
  // ONLY flag when Indian phone numbers (+91) don't match expected location
  // This is a strong scam indicator: scammers use Indian numbers from call centers
  // but claim to be international companies (USA, UK, etc.)
  //
  // SKIP this check for:
  // 1. Trusted platforms (LinkedIn, company career sites) - employer identity is verified
  // 2. When expected location is India - Indian companies naturally have +91 numbers
  // 3. When phones ARE Indian - mixing country codes is expected for global companies
  if (expectedLocation && !ctx.isTrustedPlatform && expectedLocation.toLowerCase() !== "india") {
    // Only check if we have Indian phone numbers but company claims non-Indian location
    const indianPhones = phones.filter(p => p.countryCode === "+91");

    if (indianPhones.length > 0 && indianPhones[0]) {
      findings.push({
        id: "phone-location-mismatch",
        kind: "risk",
        severity: "high",
        points: 30,
        reason: `Indian phone numbers (+91) but company location is ${expectedLocation.toUpperCase()} - common scam tactic (call center spoofing)`,
        evidence: `Phone: ${indianPhones[0].normalized}, Expected location: ${expectedLocation}`
      });
    }
  }

  // Check for invalid phone numbers
  const invalidPhones = phones.filter(p => !p.isValid);
  if (invalidPhones.length > 0 && invalidPhones[0]) {
    findings.push({
      id: "invalid-phone-number",
      kind: "risk",
      severity: "medium",
      points: 15,
      reason: "Invalid phone number format detected",
      evidence: invalidPhones[0].raw
    });
  }

  // Check for suspicious patterns in text around phone numbers
  const suspiciousPatterns = [
    /(?:whatsapp|telegram|signal).*?(?:\+91|91)?[6-9]\d{9}/gi,
    /(?:call|contact|reach).*?(?:immediately|urgently|now|today).*?(?:\+91|91)?[6-9]\d{9}/gi,
    /(?:personal|mobile|direct).*?(?:number|contact).*?(?:\+91|91)?[6-9]\d{9}/gi
  ];

  for (const pattern of suspiciousPatterns) {
    const match = ctx.rawText.match(pattern);
    if (match) {
      // The text pattern group "messaging-app-contact" (+25) may fire on the
      // same line. engine.ts removes this weaker finding when it does, so the
      // two never double-count in a final assessment.
      if (/whatsapp|telegram|signal/i.test(ctx.rawText)) {
        findings.push({
          id: "phone-with-messaging-app",
          kind: "risk",
          severity: "medium",
          points: 20,
          reason: "Asks to contact via WhatsApp/Telegram instead of official channels - common scam tactic",
          evidence: match[0] || "Contact via messaging app"
        });
      }
      break; // Only flag once
    }
  }

  return findings;
}
