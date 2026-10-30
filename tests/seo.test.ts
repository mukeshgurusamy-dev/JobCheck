import { describe, it, expect } from "vitest";
import {
  generateOgpMetaTags,
  generateTwitterCardMetaTags,
  generateSchemaOrgJsonLd,
  generateBreadcrumbSchema,
  generateFaqSchema,
  getCanonicalUrl,
  SeoMetaBuilder,
  HOMEPAGE_CONFIG,
  COMMON_FAQS,
} from "../src/lib/seo";

describe("SEO Metadata Generation", () => {
  describe("getCanonicalUrl", () => {
    it("should generate canonical URL with trailing slash normalization", () => {
      expect(getCanonicalUrl("/")).toBe("https://jobcheck.tech/");
      expect(getCanonicalUrl("/help/")).toBe("https://jobcheck.tech/help");
      expect(getCanonicalUrl("/about")).toBe("https://jobcheck.tech/about");
    });

    it("should support custom base URL", () => {
      expect(getCanonicalUrl("/help", "https://example.com")).toBe("https://example.com/help");
    });

    it("should handle empty pathname", () => {
      expect(getCanonicalUrl("")).toBe("https://jobcheck.tech/");
    });
  });

  describe("generateOgpMetaTags", () => {
    it("should generate basic OGP tags", () => {
      const tags = generateOgpMetaTags(HOMEPAGE_CONFIG);

      expect(tags["og:title"]).toBe(HOMEPAGE_CONFIG.title);
      expect(tags["og:description"]).toBe(HOMEPAGE_CONFIG.description);
      expect(tags["og:url"]).toBe(HOMEPAGE_CONFIG.url);
      expect(tags["og:site_name"]).toBe("JobCheck");
      expect(tags["og:type"]).toBe("website");
    });

    it("should include image metadata when provided", () => {
      const tags = generateOgpMetaTags(HOMEPAGE_CONFIG);

      expect(tags["og:image"]).toBe(HOMEPAGE_CONFIG.image);
      expect(tags["og:image:width"]).toBe("1200");
      expect(tags["og:image:height"]).toBe("630");
      expect(tags["og:image:type"]).toBe("image/png");
      expect(tags["og:image:alt"]).toBe(HOMEPAGE_CONFIG.imageAlt);
    });

    it("should omit image tags when not provided", () => {
      const config = { ...HOMEPAGE_CONFIG, image: undefined };
      const tags = generateOgpMetaTags(config);

      expect(tags["og:image"]).toBeUndefined();
      expect(tags["og:image:width"]).toBeUndefined();
    });
  });

  describe("generateTwitterCardMetaTags", () => {
    it("should generate Twitter Card tags with default summary_large_image", () => {
      const tags = generateTwitterCardMetaTags(HOMEPAGE_CONFIG);

      expect(tags["twitter:card"]).toBe("summary_large_image");
      expect(tags["twitter:title"]).toBe(HOMEPAGE_CONFIG.title);
      expect(tags["twitter:description"]).toBe(HOMEPAGE_CONFIG.description);
      expect(tags["twitter:site"]).toBe("@jobcheck_in");
      expect(tags["twitter:creator"]).toBe("@jobcheck_in");
      expect(tags["twitter:image"]).toBe(HOMEPAGE_CONFIG.image);
    });

    it("should support custom card types", () => {
      const config = { ...HOMEPAGE_CONFIG, twitterCard: "summary" as const };
      const tags = generateTwitterCardMetaTags(config);

      expect(tags["twitter:card"]).toBe("summary");
    });

    it("should include image alt text", () => {
      const tags = generateTwitterCardMetaTags(HOMEPAGE_CONFIG);
      expect(tags["twitter:image:alt"]).toBe(HOMEPAGE_CONFIG.imageAlt);
    });
  });

  describe("generateSchemaOrgJsonLd", () => {
    it("should generate valid JSON-LD for WebApplication", () => {
      const jsonLd = generateSchemaOrgJsonLd(HOMEPAGE_CONFIG);
      const schema = JSON.parse(jsonLd);

      expect(schema["@context"]).toBe("https://schema.org");
      expect(schema["@type"]).toBe("WebApplication");
      expect(schema.name).toBe(HOMEPAGE_CONFIG.title);
      expect(schema.description).toBe(HOMEPAGE_CONFIG.description);
      expect(schema.applicationCategory).toBe("UtilityApplication");
      expect(schema.offers).toBeDefined();
      expect(schema.offers.price).toBe("0");
    });

    it("should generate valid JSON-LD for article type", () => {
      const config = { ...HOMEPAGE_CONFIG, type: "article" as const, author: "Test Author" };
      const jsonLd = generateSchemaOrgJsonLd(config);
      const schema = JSON.parse(jsonLd);

      expect(schema["@type"]).toBe("NewsArticle");
      expect(schema.author).toBeDefined();
      expect(schema.author.name).toBe("Test Author");
    });

    it("should include organization and social links", () => {
      const jsonLd = generateSchemaOrgJsonLd(HOMEPAGE_CONFIG);
      const schema = JSON.parse(jsonLd);

      expect(schema.organization).toBeDefined();
      expect(schema.organization.sameAs).toContain("https://twitter.com/jobcheck_in");
      expect(schema.organization.sameAs).toContain("https://linkedin.com/company/jobcheck");
    });

    it("should be valid JSON", () => {
      const jsonLd = generateSchemaOrgJsonLd(HOMEPAGE_CONFIG);
      expect(() => JSON.parse(jsonLd)).not.toThrow();
    });
  });

  describe("generateBreadcrumbSchema", () => {
    it("should generate valid breadcrumb schema", () => {
      const items = [
        { name: "Home", url: "https://jobcheck.live/" },
        { name: "Checker", url: "https://jobcheck.live/#checker" },
      ];

      const jsonLd = generateBreadcrumbSchema(items);
      const schema = JSON.parse(jsonLd);

      expect(schema["@type"]).toBe("BreadcrumbList");
      expect(schema.itemListElement).toHaveLength(2);
      expect(schema.itemListElement[0].position).toBe(1);
      expect(schema.itemListElement[0].name).toBe("Home");
      expect(schema.itemListElement[1].position).toBe(2);
    });

    it("should be valid JSON", () => {
      const items = [{ name: "Home", url: "https://jobcheck.live/" }];
      const jsonLd = generateBreadcrumbSchema(items);
      expect(() => JSON.parse(jsonLd)).not.toThrow();
    });
  });

  describe("generateFaqSchema", () => {
    it("should generate valid FAQ schema", () => {
      const jsonLd = generateFaqSchema(COMMON_FAQS);
      const schema = JSON.parse(jsonLd);

      expect(schema["@type"]).toBe("FAQPage");
      expect(schema.mainEntity).toHaveLength(COMMON_FAQS.length);
      expect(schema.mainEntity[0]["@type"]).toBe("Question");
      expect(schema.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
    });

    it("should preserve FAQ content", () => {
      const testFaqs = [
        { question: "Q1?", answer: "A1" },
        { question: "Q2?", answer: "A2" },
      ];

      const jsonLd = generateFaqSchema(testFaqs);
      const schema = JSON.parse(jsonLd);

      expect(schema.mainEntity[0].name).toBe("Q1?");
      expect(schema.mainEntity[0].acceptedAnswer.text).toBe("A1");
    });

    it("should be valid JSON", () => {
      const jsonLd = generateFaqSchema(COMMON_FAQS);
      expect(() => JSON.parse(jsonLd)).not.toThrow();
    });
  });

  describe("SeoMetaBuilder", () => {
    it("should build with default configuration", () => {
      const builder = new SeoMetaBuilder();
      const config = builder.build();

      expect(config.title).toBe("JobCheck");
      expect(config.description).toContain("Scam vs. legit");
      expect(config.url).toBe("https://jobcheck.tech");
    });

    it("should chain setters", () => {
      const builder = new SeoMetaBuilder()
        .setTitle("Custom Title")
        .setDescription("Custom Description")
        .setUrl("https://example.com/page");

      const config = builder.build();
      expect(config.title).toBe("Custom Title");
      expect(config.description).toBe("Custom Description");
      expect(config.url).toBe("https://example.com/page");
    });

    it("should build OGP tags", () => {
      const builder = new SeoMetaBuilder().setTitle("Test");
      const ogp = builder.buildOgp();

      expect(ogp["og:title"]).toBe("Test");
      expect(ogp["og:site_name"]).toBe("JobCheck");
    });

    it("should build Twitter Card tags", () => {
      const builder = new SeoMetaBuilder();
      const twitter = builder.buildTwitter();

      expect(twitter["twitter:card"]).toBe("summary_large_image");
      expect(twitter["twitter:site"]).toBe("@jobcheck_in");
    });

    it("should build schema.org JSON-LD", () => {
      const builder = new SeoMetaBuilder();
      const schema = builder.buildSchema();

      expect(() => JSON.parse(schema)).not.toThrow();
      const parsed = JSON.parse(schema);
      expect(parsed["@context"]).toBe("https://schema.org");
    });

    it("should build HTML meta tags", () => {
      const builder = new SeoMetaBuilder().setTitle("Test Title");
      const html = builder.buildHtml();

      expect(html).toContain('<meta charset="UTF-8"');
      expect(html).toContain('name="viewport"');
      expect(html).toContain('property="og:');
      expect(html).toContain('name="twitter:');
      expect(html).toContain("Test Title");
    });

    it("should escape HTML entities in tags", () => {
      const builder = new SeoMetaBuilder()
        .setTitle('Test & "Special" Characters')
        .setDescription("Quote's & <angle> brackets");

      const html = builder.buildHtml();
      expect(html).toContain("&amp;");
      expect(html).toContain("&quot;");
      expect(html).toContain("&#39;");
    });
  });

  describe("HOMEPAGE_CONFIG", () => {
    it("should have all required fields", () => {
      expect(HOMEPAGE_CONFIG.title).toBeDefined();
      expect(HOMEPAGE_CONFIG.description).toBeDefined();
      expect(HOMEPAGE_CONFIG.url).toBeDefined();
      expect(HOMEPAGE_CONFIG.image).toBeDefined();
      expect(HOMEPAGE_CONFIG.keywords).toBeDefined();
    });

    it("should have meaningful keywords", () => {
      expect(HOMEPAGE_CONFIG.keywords).toBeDefined();
      expect(HOMEPAGE_CONFIG.keywords!).toContain("job scam detector");
      expect(HOMEPAGE_CONFIG.keywords!).toContain("job posting verification");
      expect(HOMEPAGE_CONFIG.keywords!.length).toBeGreaterThan(5);
    });
  });

  describe("COMMON_FAQS", () => {
    it("should have multiple FAQ entries", () => {
      expect(COMMON_FAQS.length).toBeGreaterThan(3);
    });

    it("should have question and answer for each entry", () => {
      COMMON_FAQS.forEach((faq) => {
        expect(faq.question).toBeDefined();
        expect(faq.answer).toBeDefined();
        expect(faq.question.length).toBeGreaterThan(0);
        expect(faq.answer.length).toBeGreaterThan(0);
      });
    });
  });
});
