import { describe, it, expect } from "vitest";
import {
  validateAndNormalizeUrl,
  extractDomainParts,
  isIpAddress,
  isPrivateOrReservedIp,
  extractUrlsFromText,
  isTrustedPlatformUrl,
  cleanJobBoardUrl
} from "../src/utils/url";

describe("URL Utilities: validateAndNormalizeUrl", () => {
  it("automatically prepends https:// if protocol is omitted", () => {
    const res = validateAndNormalizeUrl("careers.infosys.com/job/123");
    expect(res.valid).toBe(true);
    expect(res.normalizedUrl).toBe("https://careers.infosys.com/job/123");
  });

  it("trims whitespace from input", () => {
    const res = validateAndNormalizeUrl("   https://tcs.com/careers   ");
    expect(res.valid).toBe(true);
    expect(res.normalizedUrl).toBe("https://tcs.com/careers");
  });

  it("rejects empty or whitespace-only input", () => {
    const res = validateAndNormalizeUrl("   ");
    expect(res.valid).toBe(false);
    expect(res.error).toBe("URL cannot be empty.");
  });

  it("rejects javascript: and data: schemes", () => {
    const jsRes = validateAndNormalizeUrl("javascript:alert(1)");
    expect(jsRes.valid).toBe(false);

    const dataRes = validateAndNormalizeUrl("data:text/html,<h1>Hello</h1>");
    expect(dataRes.valid).toBe(false);

    const fileRes = validateAndNormalizeUrl("file:///etc/passwd");
    expect(fileRes.valid).toBe(false);
  });

  it("blocks localhost and loopback addresses", () => {
    const res1 = validateAndNormalizeUrl("http://localhost:3000/job");
    expect(res1.valid).toBe(false);

    const res2 = validateAndNormalizeUrl("http://127.0.0.1/admin");
    expect(res2.valid).toBe(false);
  });

  it("blocks private network IP ranges", () => {
    expect(validateAndNormalizeUrl("http://192.168.1.10/job").valid).toBe(false);
    expect(validateAndNormalizeUrl("http://10.0.0.5/job").valid).toBe(false);
    expect(validateAndNormalizeUrl("http://172.20.0.1/job").valid).toBe(false);
    expect(validateAndNormalizeUrl("http://169.254.1.1/job").valid).toBe(false);
  });
});

describe("URL Utilities: extractDomainParts", () => {
  it("correctly parses standard domains and subdomains", () => {
    const parts = extractDomainParts("https://careers.infosys.com/openings");
    expect(parts.hostname).toBe("careers.infosys.com");
    expect(parts.rootDomain).toBe("infosys.com");
    expect(parts.sld).toBe("infosys");
    expect(parts.tld).toBe(".com");
    expect(parts.subdomain).toBe("careers");
    expect(parts.subdomainPartsCount).toBe(1);
  });

  it("handles multi-part Indian TLDs (.co.in, .org.in)", () => {
    const parts = extractDomainParts("https://jobs.tcs.co.in/entry-level");
    expect(parts.hostname).toBe("jobs.tcs.co.in");
    expect(parts.rootDomain).toBe("tcs.co.in");
    expect(parts.sld).toBe("tcs");
    expect(parts.tld).toBe(".co.in");
    expect(parts.subdomain).toBe("jobs");
    expect(parts.subdomainPartsCount).toBe(1);
  });

  it("handles raw public IP hostnames", () => {
    const parts = extractDomainParts("http://198.51.100.42:8080/apply");
    expect(parts.hostname).toBe("198.51.100.42");
    expect(parts.rootDomain).toBe("198.51.100.42");
    expect(parts.sld).toBe("198.51.100.42");
    expect(parts.subdomain).toBe("");
  });
});

describe("URL Utilities: isIpAddress and isPrivateOrReservedIp", () => {
  it("identifies IPv4 and IPv6", () => {
    expect(isIpAddress("192.168.1.1")).toBe(true);
    expect(isIpAddress("8.8.8.8")).toBe(true);
    expect(isIpAddress("google.com")).toBe(false);
    expect(isIpAddress("2001:4860:4860::8888")).toBe(true);
  });

  it("identifies private IPv4 ranges", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("10.1.2.3")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.5.4")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
  });
});

describe("URL Utilities: extractUrlsFromText and isTrustedPlatformUrl", () => {
  it("extracts and normalizes multiple embedded URLs from natural text", () => {
    const text = `
      Apply here: https://tcs-interview.xyz/apply and confirm on wa.me/919876543210.
      Alternate link: https://bit.ly/fresher-job. More info at www.example.com.
    `;
    const urls = extractUrlsFromText(text);
    expect(urls).toHaveLength(4);
    expect(urls).toContain("https://tcs-interview.xyz/apply");
    expect(urls).toContain("https://wa.me/919876543210");
    expect(urls).toContain("https://bit.ly/fresher-job");
    expect(urls).toContain("https://www.example.com/");
  });

  it("handles empty or link-free text gracefully", () => {
    expect(extractUrlsFromText("")).toEqual([]);
    expect(extractUrlsFromText("Job description with no external links.")).toEqual([]);
  });

  it("identifies known trusted job platforms", () => {
    expect(isTrustedPlatformUrl("https://www.linkedin.com/jobs/view/123456")).toBe(true);
    expect(isTrustedPlatformUrl("https://www.naukri.com/job-listings-123")).toBe(true);
    expect(isTrustedPlatformUrl("https://internshala.com/internship/detail/123")).toBe(true);
    expect(isTrustedPlatformUrl("https://indeed.com/viewjob?jk=123")).toBe(true);
    expect(isTrustedPlatformUrl("https://glassdoor.co.in/job-listing/123")).toBe(true);
    expect(isTrustedPlatformUrl("https://tcs-interview.xyz/apply")).toBe(false);
    expect(isTrustedPlatformUrl("https://tcs.com/careers")).toBe(false);
  });
});

describe("URL Utilities: cleanJobBoardUrl & mobile app share normalization", () => {
  it("normalizes mobile Indeed share links by stripping tracking and retaining jk", () => {
    const raw = "https://in.indeed.com/viewjob?jk=7f0e77b07c8087cc&from=appshareandroid";
    const cleaned = cleanJobBoardUrl(raw);
    expect(cleaned).toBe("https://in.indeed.com/viewjob?jk=7f0e77b07c8087cc");

    const validated = validateAndNormalizeUrl(raw);
    expect(validated.valid).toBe(true);
    expect(validated.normalizedUrl).toBe("https://in.indeed.com/viewjob?jk=7f0e77b07c8087cc");
  });

  it("normalizes Naukri links by stripping mobile tracking params", () => {
    const raw = "https://www.naukri.com/job-listings-react-developer-xyz-123?src=jobsearchDesk&sid=1710000000&xp=1&px=1&utm_source=mobile_app";
    const cleaned = cleanJobBoardUrl(raw);
    expect(cleaned).toBe("https://www.naukri.com/job-listings-react-developer-xyz-123");
  });

  it("normalizes LinkedIn links by stripping refId and trackingId", () => {
    const raw = "https://www.linkedin.com/jobs/view/3800123456/?refId=abc123xyz&trackingId=def456uvw&trk=flagship3_search_srp_jobs";
    const cleaned = cleanJobBoardUrl(raw);
    expect(cleaned).toBe("https://www.linkedin.com/jobs/view/3800123456/");
  });
});

