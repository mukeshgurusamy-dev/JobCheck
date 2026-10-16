import { describe, it, expect } from "vitest";
import {
  notHttpsRule,
  ipHostRule,
  shortenerRule,
  freeHostOrFormRule,
  suspiciousTldRule,
  punycodeRule,
  lookalikeBrandRule,
  brandInWrongPlaceRule,
  keywordStuffedDomainRule,
  hyphenDigitHeavyRule,
  tooManySubdomainsRule,
  veryLongHostRule,
  newDomainRule,
  redirectChainRule,
  crossDomainRedirectRule,
  safeBrowsingRule,
  trustedPlatformSignal,
  trustedAtsSignal,
  domainAgeTrustSignal
} from "../src/rules/urlRules";
import { UrlRuleContext } from "../src/types/types";
import { extractDomainParts } from "../src/utils/url";

function createMockContext(urlStr: string, overrides: Partial<UrlRuleContext> = {}): UrlRuleContext {
  const parsedUrl = new URL(urlStr);
  const parts = extractDomainParts(parsedUrl.hostname);
  return {
    rawUrl: urlStr,
    parsedUrl,
    hostname: parts.hostname,
    rootDomain: parts.rootDomain,
    subdomain: parts.subdomain,
    domainAgeDays: null,
    safeBrowsingFlagged: null,
    redirectChain: [],
    finalUrl: undefined,
    ...overrides
  };
}

describe("URL Rules: not-https", () => {
  it("flags non-HTTPS URL (+10)", () => {
    const ctx = createMockContext("http://example-jobs.com/listing");
    const result = notHttpsRule(ctx);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("not-https");
    expect(result?.points).toBe(10);
  });

  it("passes valid HTTPS URL", () => {
    const ctx = createMockContext("https://example-jobs.com/listing");
    expect(notHttpsRule(ctx)).toBeNull();
  });
});

describe("URL Rules: ip-host", () => {
  it("flags raw IP host (+30)", () => {
    const ctx = createMockContext("http://198.51.100.12/apply");
    const result = ipHostRule(ctx);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("ip-host");
    expect(result?.points).toBe(30);
  });

  it("passes standard domain name", () => {
    const ctx = createMockContext("https://careers.google.com");
    expect(ipHostRule(ctx)).toBeNull();
  });
});

describe("URL Rules: shortener", () => {
  it("flags bit.ly and tinyurl (+20)", () => {
    const ctx1 = createMockContext("https://bit.ly/tcs-fresher-job");
    expect(shortenerRule(ctx1)?.id).toBe("shortener");

    const ctx2 = createMockContext("https://tinyurl.com/infosys-entry");
    expect(shortenerRule(ctx2)?.id).toBe("shortener");
  });

  it("passes regular website domains", () => {
    const ctx = createMockContext("https://careers.infosys.com/job");
    expect(shortenerRule(ctx)).toBeNull();
  });
});

describe("URL Rules: free-host-or-form", () => {
  it("flags forms.gle, Wix, and Telegram links (+20)", () => {
    expect(freeHostOrFormRule(createMockContext("https://forms.gle/xY87Z89q9"))?.id).toBe("free-host-or-form");
    expect(freeHostOrFormRule(createMockContext("https://hrrecruiter.wixsite.com/jobs"))?.id).toBe("free-host-or-form");
    expect(freeHostOrFormRule(createMockContext("https://t.me/freshers_hiring_now"))?.id).toBe("free-host-or-form");
    expect(freeHostOrFormRule(createMockContext("https://wa.me/919876543210"))?.id).toBe("free-host-or-form");
  });

  it("passes legitimate company domains", () => {
    expect(freeHostOrFormRule(createMockContext("https://careers.tatamotors.com"))).toBeNull();
  });
});

describe("URL Rules: suspicious-tld", () => {
  it("flags .xyz, .top, .buzz (+15)", () => {
    expect(suspiciousTldRule(createMockContext("https://tcs-careers-portal.xyz"))?.id).toBe("suspicious-tld");
    expect(suspiciousTldRule(createMockContext("https://freshers-hiring.top"))?.id).toBe("suspicious-tld");
    expect(suspiciousTldRule(createMockContext("https://amazon-jobs.buzz"))?.id).toBe("suspicious-tld");
  });

  it("passes .com, .org, .co.in", () => {
    expect(suspiciousTldRule(createMockContext("https://tcs.com"))).toBeNull();
    expect(suspiciousTldRule(createMockContext("https://infosys.co.in"))).toBeNull();
  });
});

describe("URL Rules: punycode", () => {
  it("flags punycode homograph domains (+30)", () => {
    const ctx = createMockContext("https://xn--tcs-jobs-74a.com/apply");
    expect(punycodeRule(ctx)?.id).toBe("punycode");
  });

  it("passes standard ASCII domain", () => {
    const ctx = createMockContext("https://jobs.tcs.com");
    expect(punycodeRule(ctx)).toBeNull();
  });
});

describe("URL Rules: lookalike-brand", () => {
  it("flags typo-squatted brand domains (edit distance 1-2) (+35)", () => {
    expect(lookalikeBrandRule(createMockContext("https://infosyss.com"))?.id).toBe("lookalike-brand");
    expect(lookalikeBrandRule(createMockContext("https://g00gle.com"))?.id).toBe("lookalike-brand");
    expect(lookalikeBrandRule(createMockContext("https://tcss.com"))?.id).toBe("lookalike-brand");
  });

  it("does not flag the authentic brand domain", () => {
    expect(lookalikeBrandRule(createMockContext("https://infosys.com"))).toBeNull();
    expect(lookalikeBrandRule(createMockContext("https://tcs.com"))).toBeNull();
    expect(lookalikeBrandRule(createMockContext("https://google.com"))).toBeNull();
  });
});

describe("URL Rules: brand-in-wrong-place", () => {
  it("flags brand in subdomain when root domain is unrelated (+30)", () => {
    const ctx = createMockContext("https://tcs.com.apply-now.xyz/hiring");
    const result = brandInWrongPlaceRule(ctx);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("brand-in-wrong-place");
  });

  it("passes authentic brand subdomains", () => {
    const ctx = createMockContext("https://careers.tcs.com/jobs");
    expect(brandInWrongPlaceRule(ctx)).toBeNull();
  });
});

describe("URL Rules: keyword-stuffed-domain", () => {
  it("flags domain with brand + multiple generic job keywords (+10)", () => {
    const ctx = createMockContext("https://tcs-careers-jobs-hiring-india.com");
    const result = keywordStuffedDomainRule(ctx);
    expect(result?.id).toBe("keyword-stuffed-domain");
  });

  it("passes simple company domain", () => {
    const ctx = createMockContext("https://careers.tcs.com");
    expect(keywordStuffedDomainRule(ctx)).toBeNull();
  });
});

describe("URL Rules: hyphen-digit-heavy", () => {
  it("flags domains with 3+ hyphens or 4+ digits (+10)", () => {
    expect(hyphenDigitHeavyRule(createMockContext("https://freshers-hiring-direct-entry.com"))?.id).toBe("hyphen-digit-heavy");
    expect(hyphenDigitHeavyRule(createMockContext("https://jobalert202688.com"))?.id).toBe("hyphen-digit-heavy");
  });

  it("passes normal domains with 1-2 hyphens", () => {
    expect(hyphenDigitHeavyRule(createMockContext("https://tech-mahindra.com"))).toBeNull();
  });
});

describe("URL Rules: too-many-subdomains", () => {
  it("flags hosts with more than 3 subdomain levels (+10)", () => {
    const ctx = createMockContext("https://entry.fresher.portal.hiring.example.com");
    expect(tooManySubdomainsRule(ctx)?.id).toBe("too-many-subdomains");
  });

  it("passes standard subdomains (1-3 levels)", () => {
    const ctx = createMockContext("https://jobs.careers.example.com");
    expect(tooManySubdomainsRule(ctx)).toBeNull();
  });
});

describe("URL Rules: new-domain", () => {
  it("graduates penalty based on age in days", () => {
    expect(newDomainRule(createMockContext("https://example.com", { domainAgeDays: 10 }))?.points).toBe(35);
    expect(newDomainRule(createMockContext("https://example.com", { domainAgeDays: 60 }))?.points).toBe(25);
    expect(newDomainRule(createMockContext("https://example.com", { domainAgeDays: 200 }))?.points).toBe(10);
    expect(newDomainRule(createMockContext("https://example.com", { domainAgeDays: 400 }))).toBeNull();
    expect(newDomainRule(createMockContext("https://example.com", { domainAgeDays: null }))).toBeNull();
  });
});

describe("URL Rules: very-long-host", () => {
  it("flags hostname longer than 40 characters (+5)", () => {
    const longHost = "a".repeat(41) + ".com";
    const ctx = createMockContext(`https://${longHost}`);
    expect(veryLongHostRule(ctx)?.id).toBe("very-long-host");
    expect(veryLongHostRule(ctx)?.points).toBe(5);
  });

  it("passes normal length hostname", () => {
    const ctx = createMockContext("https://careers.infosys.com");
    expect(veryLongHostRule(ctx)).toBeNull();
  });
});

describe("URL Rules: redirect-chain", () => {
  it("flags chains with > 3 hops (+15)", () => {
    const ctx = createMockContext("https://hop0.com", {
      redirectChain: ["https://hop1.com", "https://hop2.com", "https://hop3.com", "https://hop4.com"]
    });
    expect(redirectChainRule(ctx)?.id).toBe("redirect-chain");
    expect(redirectChainRule(ctx)?.points).toBe(15);
  });

  it("passes chains with <= 3 hops", () => {
    const ctx = createMockContext("https://hop0.com", {
      redirectChain: ["https://hop1.com", "https://hop2.com"]
    });
    expect(redirectChainRule(ctx)).toBeNull();
  });
});

describe("URL Rules: cross-domain-redirect", () => {
  it("flags cross-domain redirects for non-shorteners (+10)", () => {
    const ctx = createMockContext("https://fake-tcs-portal.com", {
      finalUrl: "https://totally-unrelated-domain.com/form"
    });
    expect(crossDomainRedirectRule(ctx)?.id).toBe("cross-domain-redirect");
    expect(crossDomainRedirectRule(ctx)?.points).toBe(10);
  });

  it("does not penalize known shorteners for redirecting across domains", () => {
    const ctx = createMockContext("https://bit.ly/fresher-job", {
      finalUrl: "https://legit-company.com/job"
    });
    expect(crossDomainRedirectRule(ctx)).toBeNull();
  });
});

describe("URL Rules: safe-browsing", () => {
  it("flags safeBrowsingFlagged true (+60)", () => {
    const ctx = createMockContext("https://deceptive-site.com", { safeBrowsingFlagged: true });
    expect(safeBrowsingRule(ctx)?.id).toBe("safe-browsing");
    expect(safeBrowsingRule(ctx)?.points).toBe(60);
  });
});

describe("URL Trust Signals", () => {
  it("rewards recognized job platforms (-10)", () => {
    const ctx = createMockContext("https://www.naukri.com/job-listings-12345");
    const sig = trustedPlatformSignal(ctx);
    expect(sig?.id).toBe("trusted-platform");
    expect(sig?.points).toBe(-10);
  });

  it("rewards recognized ATS platforms (-15)", () => {
    const ctx = createMockContext("https://jobs.lever.co/company-name/job-id");
    const sig = trustedAtsSignal(ctx);
    expect(sig?.id).toBe("trusted-ats");
    expect(sig?.points).toBe(-15);
  });

  it("rewards long-established domain ages (-15 or -10)", () => {
    expect(domainAgeTrustSignal(createMockContext("https://example.com", { domainAgeDays: 2500 }))?.points).toBe(-15);
    expect(domainAgeTrustSignal(createMockContext("https://example.com", { domainAgeDays: 800 }))?.points).toBe(-10);
  });
});
