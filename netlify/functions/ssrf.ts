import * as dns from "dns/promises";

/**
 * Checks if an IPv4 octet array is in a private, loopback, or reserved range.
 */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 treated as unsafe
  }

  const [b0, b1] = [parts[0]!, parts[1]!];

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;

  // 10.0.0.0/8 (Private network)
  if (b0 === 10) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 169.254.0.0/16 (Link-local)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 (Private network 172.16 - 172.31)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;

  // 192.168.0.0/16 (Private network)
  if (b0 === 192 && b1 === 168) return true;

  // 198.18.0.0/15 (Network benchmark testing)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use)
  if (b0 >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, or reserved range.
 */
export function isPrivateIpv6(ip: string): boolean {
  const clean = ip.toLowerCase().trim();

  // Loopback (::1) and Unspecified (::)
  if (clean === "::1" || clean === "::") return true;

  // IPv4-mapped IPv6 address (::ffff:192.168.1.1 or ::ffff:c0a8:0101)
  if (clean.startsWith("::ffff:") || clean.includes("::ffff:")) {
    const lastPart = clean.split(":").pop() ?? "";
    if (lastPart.includes(".")) {
      return isPrivateIpv4(lastPart);
    }
    return true; // Hex mapped IPv4 treated as unsafe
  }

  // Unique local addresses (fc00::/7 -> fc00:: to fdff::)
  if (clean.startsWith("fc") || clean.startsWith("fd")) return true;

  // Link-local addresses (fe80::/10)
  if (clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb")) {
    return true;
  }

  // Multicast (ff00::/8)
  if (clean.startsWith("ff")) return true;

  // Discard / documentation
  if (clean.startsWith("100::") || clean.startsWith("2001:db8:")) return true;

  return false;
}

/**
 * Validates a URL against SSRF attacks:
 * 1. Checks scheme (strictly http: or https:).
 * 2. Checks hostname for known local strings.
 * 3. Resolves hostname via DNS and checks EVERY IP against private/reserved ranges.
 */
export async function assertSafeUrl(urlString: string): Promise<{ url: URL; hostname: string }> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format.");
  }

  // 1. Strict scheme validation
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Forbidden protocol '${parsed.protocol}'. Only HTTP and HTTPS are permitted.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error("Missing hostname.");
  }

  // 2. Localhost and standard local names
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Local and internal hostnames are blocked.");
  }

  // If hostname is directly an IP literal
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    if (isPrivateIpv4(hostname)) {
      throw new Error("Private or loopback IP addresses are blocked.");
    }
    return { url: parsed, hostname };
  }

  if (hostname.includes(":")) {
    const rawIpv6 = hostname.replace(/^\[|\]$/g, "");
    if (isPrivateIpv6(rawIpv6)) {
      throw new Error("Private or local IPv6 addresses are blocked.");
    }
    return { url: parsed, hostname };
  }

  // 3. DNS resolution check (all resolved addresses must be public)
  try {
    const lookups = await dns.lookup(hostname, { all: true });

    if (!lookups || lookups.length === 0) {
      throw new Error("Could not resolve host via DNS.");
    }

    for (const record of lookups) {
      if (record.family === 4) {
        if (isPrivateIpv4(record.address)) {
          throw new Error("Host resolves to a private or reserved IPv4 address.");
        }
      } else if (record.family === 6) {
        if (isPrivateIpv6(record.address)) {
          throw new Error("Host resolves to a private or reserved IPv6 address.");
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("private or reserved")) {
      throw err;
    }
    // DNS resolution failure (domain doesn't exist or DNS down)
    throw new Error("Host resolution failed or domain does not exist.");
  }

  return { url: parsed, hostname };
}
