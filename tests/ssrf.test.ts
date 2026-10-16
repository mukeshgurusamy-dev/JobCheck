import { describe, it, expect } from "vitest";
import { assertSafeUrl, isPrivateIpv4, isPrivateIpv6 } from "../netlify/functions/ssrf";

describe("SSRF Protection Guard: IP Range Checks", () => {
  it("blocks all IPv4 loopback and private subnets", () => {
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateIpv4("127.255.255.255")).toBe(true);
    expect(isPrivateIpv4("10.0.0.1")).toBe(true);
    expect(isPrivateIpv4("10.255.255.255")).toBe(true);
    expect(isPrivateIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateIpv4("172.31.255.255")).toBe(true);
    expect(isPrivateIpv4("192.168.0.1")).toBe(true);
    expect(isPrivateIpv4("192.168.255.255")).toBe(true);
    expect(isPrivateIpv4("169.254.1.1")).toBe(true);
    expect(isPrivateIpv4("0.0.0.0")).toBe(true);
    expect(isPrivateIpv4("100.64.0.1")).toBe(true); // CGNAT
    expect(isPrivateIpv4("198.51.100.1")).toBe(true); // TEST-NET-2
  });

  it("permits public routable IPv4 addresses", () => {
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("1.1.1.1")).toBe(false);
    expect(isPrivateIpv4("142.250.190.46")).toBe(false);
  });

  it("blocks IPv6 local, loopback, and IPv4-mapped addresses", () => {
    expect(isPrivateIpv6("::1")).toBe(true);
    expect(isPrivateIpv6("::")).toBe(true);
    expect(isPrivateIpv6("fe80::1")).toBe(true);
    expect(isPrivateIpv6("fc00::1")).toBe(true);
    expect(isPrivateIpv6("fd00::1234")).toBe(true);
    expect(isPrivateIpv6("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:10.0.0.1")).toBe(true);
  });
});

describe("SSRF Protection Guard: URL & Hostname Assertions", () => {
  it("rejects non-HTTP schemes (ftp, file, gopher, javascript)", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow("Forbidden protocol");
    await expect(assertSafeUrl("ftp://ftp.example.com/file")).rejects.toThrow("Forbidden protocol");
    await expect(assertSafeUrl("javascript:alert(1)")).rejects.toThrow("Forbidden protocol");
    await expect(assertSafeUrl("gopher://127.0.0.1")).rejects.toThrow("Forbidden protocol");
  });

  it("rejects localhost and internal domain names", async () => {
    await expect(assertSafeUrl("http://localhost:8080")).rejects.toThrow("blocked");
    await expect(assertSafeUrl("http://app.localhost")).rejects.toThrow("blocked");
    await expect(assertSafeUrl("http://service.local")).rejects.toThrow("blocked");
    await expect(assertSafeUrl("http://database.internal")).rejects.toThrow("blocked");
  });

  it("rejects direct private IP literals in URL", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/admin")).rejects.toThrow("blocked");
    await expect(assertSafeUrl("http://192.168.1.1/router")).rejects.toThrow("blocked");
    await expect(assertSafeUrl("http://10.0.0.5/secrets")).rejects.toThrow("blocked");
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow("blocked");
    await expect(assertSafeUrl("http://[::1]/")).rejects.toThrow("blocked");
  });

  it("accepts valid, public HTTP/HTTPS URLs", async () => {
    const res1 = await assertSafeUrl("https://google.com");
    expect(res1.hostname).toBe("google.com");

    const res2 = await assertSafeUrl("https://example.com");
    expect(res2.hostname).toBe("example.com");
  });
});
