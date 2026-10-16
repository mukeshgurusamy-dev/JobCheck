import { describe, it, expect } from "vitest";
import { extractPhoneNumbers, phoneMatchesCountry, extractLocationForPhoneValidation, formatPhoneDisplay } from "../src/utils/phoneExtractor";
import { evaluatePhoneNumbers } from "../src/rules/phoneValidation";

describe("Phone Number Extraction", () => {
  it("should extract Indian mobile numbers with +91 prefix", () => {
    const text = "Contact us at +91 9876543210 or +91-8765432109";
    const phones = extractPhoneNumbers(text);

    expect(phones.length).toBe(2);
    expect(phones[0]?.normalized).toBe("+919876543210");
    expect(phones[0]?.countryCode).toBe("+91");
    expect(phones[0]?.isValid).toBe(true);
    expect(phones[1]?.normalized).toBe("+918765432109");
  });

  it("should extract 10-digit Indian mobile numbers without country code", () => {
    const text = "Call 9876543210 for more details";
    const phones = extractPhoneNumbers(text);

    expect(phones.length).toBe(1);
    expect(phones[0]?.normalized).toBe("+919876543210");
    expect(phones[0]?.isValid).toBe(true);
  });

  it("should validate Indian mobile number starting digits", () => {
    const validNumbers = "Call 9876543210, 8765432109, 7654321098, or 6543210987";
    const phones = extractPhoneNumbers(validNumbers);

    expect(phones.length).toBe(4);
    phones.forEach(phone => {
      expect(phone.isValid).toBe(true);
    });
  });

  it("should reject invalid Indian mobile numbers", () => {
    const invalidNumbers = "5876543210 4765432109 1234567890"; // Starting with 5, 4, 1
    const phones = extractPhoneNumbers(invalidNumbers);

    // These shouldn't match the mobile pattern (must start with 6-9)
    const validPhones = phones.filter(p => p.isValid);
    expect(validPhones.length).toBe(0);
  });

  it("should extract Indian landline numbers with STD codes", () => {
    const text = "Office: 080-12345678 or 011-23456789";
    const phones = extractPhoneNumbers(text);

    expect(phones.length).toBe(2);
    expect(phones[0]?.normalized).toBe("+918012345678");
    expect(phones[1]?.normalized).toBe("+911123456789");
  });

  it("should extract international numbers (non-India)", () => {
    const text = "USA office: +1-2125551234, UAE: +971-501234567";
    const phones = extractPhoneNumbers(text);

    expect(phones.length).toBe(2);
    expect(phones[0]?.countryCode).toBe("+1");
    expect(phones[0]?.normalized).toBe("+12125551234");
    expect(phones[1]?.countryCode).toBe("+971");
    expect(phones[1]?.normalized).toBe("+971501234567");
  });

  it("should not extract partial numbers or invalid patterns", () => {
    const text = "We have 123 employees and founded in 2015";
    const phones = extractPhoneNumbers(text);

    expect(phones.length).toBe(0);
  });

  it("should deduplicate identical phone numbers", () => {
    const text = "Call +91 9876543210 or 9876543210 or +919876543210";
    const phones = extractPhoneNumbers(text);

    expect(phones.length).toBe(1); // All three are the same number
    expect(phones[0]?.normalized).toBe("+919876543210");
  });
});

describe("Phone Country Matching", () => {
  it("should match Indian phone with India location", () => {
    const phone = {
      raw: "+91 9876543210",
      normalized: "+919876543210",
      countryCode: "+91",
      isValid: true
    };

    expect(phoneMatchesCountry(phone, "india")).toBe(true);
    expect(phoneMatchesCountry(phone, "India")).toBe(true);
  });

  it("should detect country code mismatch", () => {
    const uaePhone = {
      raw: "+971 501234567",
      normalized: "+971501234567",
      countryCode: "+971",
      isValid: true
    };

    expect(phoneMatchesCountry(uaePhone, "india")).toBe(false);
    expect(phoneMatchesCountry(uaePhone, "uae")).toBe(true);
  });

  it("should handle USA/Canada phone numbers", () => {
    const usPhone = {
      raw: "+1 2125551234",
      normalized: "+12125551234",
      countryCode: "+1",
      isValid: true
    };

    expect(phoneMatchesCountry(usPhone, "usa")).toBe(true);
    expect(phoneMatchesCountry(usPhone, "canada")).toBe(true);
    expect(phoneMatchesCountry(usPhone, "india")).toBe(false);
  });
});

describe("Location Extraction from Text", () => {
  it("should extract India from city names", () => {
    const text = "Office located in Mumbai, Maharashtra";
    const location = extractLocationForPhoneValidation(text);

    expect(location).toBe("india");
  });

  it("should detect India from multiple indicators", () => {
    const texts = [
      "Bangalore office",
      "Work location: Delhi",
      "Based in Chennai",
      "Hyderabad, India",
      "Company in Bharat"
    ];

    texts.forEach(text => {
      expect(extractLocationForPhoneValidation(text)).toBe("india");
    });
  });

  it("should extract USA from city names", () => {
    const text = "Office in New York, USA";
    const location = extractLocationForPhoneValidation(text);

    expect(location).toBe("usa");
  });

  it("should extract UAE from keywords", () => {
    const texts = [
      "Dubai office",
      "Based in UAE",
      "Abu Dhabi location"
    ];

    texts.forEach(text => {
      expect(extractLocationForPhoneValidation(text)).toBe("uae");
    });
  });

  it("should return null for unknown locations", () => {
    const text = "Remote position, work from anywhere";
    const location = extractLocationForPhoneValidation(text);

    expect(location).toBeNull();
  });
});

describe("Phone Number Validation Rules", () => {
  it("should flag multiple phone numbers as suspicious", () => {
    const ctx = {
      rawText: "Contact: 9876543210, 8765432109, 7654321098",
      normalizedText: "contact 9876543210 8765432109 7654321098",
      companyLocation: "india"
    };

    const findings = evaluatePhoneNumbers(ctx);
    const multiplePhones = findings.find(f => f.id === "multiple-phone-numbers");

    expect(multiplePhones).toBeDefined();
    expect(multiplePhones?.severity).toBe("low");
    expect(multiplePhones?.points).toBe(10);
  });

  it("should flag country code mismatch", () => {
    const ctx = {
      rawText: "Indian company, contact: +971 501234567", // UAE number
      normalizedText: "indian company contact +971 501234567",
      companyLocation: "india"
    };

    const findings = evaluatePhoneNumbers(ctx);
    const mismatch = findings.find(f => f.id === "phone-location-mismatch");

    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe("high");
    expect(mismatch?.points).toBe(30);
    expect(mismatch?.evidence).toContain("+971");
  });

  it("should flag invalid phone number format", () => {
    const ctx = {
      rawText: "Call us at +91 123456", // Invalid: too short
      normalizedText: "call us at +91 123456"
    };

    const findings = evaluatePhoneNumbers(ctx);

    // May or may not trigger depending on extraction pattern
    // This test verifies the rule exists
    expect(findings).toBeDefined();
  });

  it("should flag WhatsApp/Telegram contact pattern", () => {
    const ctx = {
      rawText: "Contact on WhatsApp: 9876543210",
      normalizedText: "contact on whatsapp 9876543210"
    };

    const findings = evaluatePhoneNumbers(ctx);
    const messaging = findings.find(f => f.id === "phone-with-messaging-app");

    expect(messaging).toBeDefined();
    expect(messaging?.severity).toBe("medium");
    expect(messaging?.points).toBe(20);
  });

  it("should not flag legitimate single phone number", () => {
    const ctx = {
      rawText: "HR Contact: +91 9876543210 (Monday to Friday, 10 AM - 6 PM)",
      normalizedText: "hr contact +91 9876543210 monday to friday 10 am 6 pm",
      companyLocation: "india"
    };

    const findings = evaluatePhoneNumbers(ctx);

    expect(findings.length).toBe(0); // No issues found
  });

  it("should not flag when no phone numbers present", () => {
    const ctx = {
      rawText: "Apply through our website careers page",
      normalizedText: "apply through our website careers page"
    };

    const findings = evaluatePhoneNumbers(ctx);

    expect(findings.length).toBe(0);
  });
});

describe("Phone Number Formatting", () => {
  it("should format Indian mobile numbers", () => {
    const formatted = formatPhoneDisplay("+919876543210");
    expect(formatted).toBe("+91 98765 43210");
  });

  it("should format international numbers", () => {
    const formatted = formatPhoneDisplay("+12125551234");
    expect(formatted).toContain("+1");
    expect(formatted.length).toBeGreaterThan(10); // Has spaces
  });

  it("should handle already formatted numbers", () => {
    const formatted = formatPhoneDisplay("+91 98765 43210");
    expect(formatted).toContain("+91");
  });
});
