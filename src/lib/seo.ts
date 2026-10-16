/**
 * SEO and Open Graph metadata generation
 * All markup is deterministic and testable without runtime APIs
 */

export interface MetadataConfig {
  title: string;
  description: string;
  url: string;
  image?: string;
  imageAlt?: string;
  type?: "website" | "article";
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  keywords?: string[];
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
}

/**
 * Generate canonical URL with trailing slash consistency
 */
export function getCanonicalUrl(pathname: string, baseUrl: string = "https://jobcheck.in"): string {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  return `${baseUrl}${cleanPath}`;
}

/**
 * Generate Open Graph meta tags
 */
export function generateOgpMetaTags(config: MetadataConfig): Record<string, string> {
  const ogpTags: Record<string, string> = {
    "og:title": config.title,
    "og:description": config.description,
    "og:url": config.url,
    "og:type": config.type || "website",
    "og:site_name": "JobCheck",
  };

  if (config.image) {
    ogpTags["og:image"] = config.image;
    ogpTags["og:image:width"] = "1200";
    ogpTags["og:image:height"] = "630";
    ogpTags["og:image:type"] = "image/png";
    if (config.imageAlt) {
      ogpTags["og:image:alt"] = config.imageAlt;
    }
  }

  return ogpTags;
}

/**
 * Generate Twitter Card meta tags
 */
export function generateTwitterCardMetaTags(
  config: MetadataConfig
): Record<string, string> {
  const twitterCard = config.twitterCard || "summary_large_image";

  return {
    "twitter:card": twitterCard,
    "twitter:title": config.title,
    "twitter:description": config.description,
    "twitter:site": "@jobcheck_in",
    "twitter:creator": "@jobcheck_in",
    ...(config.image && { "twitter:image": config.image }),
    ...(config.imageAlt && { "twitter:image:alt": config.imageAlt }),
  };
}

/**
 * Generate JSON-LD Schema.org structured data
 */
export function generateSchemaOrgJsonLd(config: MetadataConfig): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": config.type === "article" ? "NewsArticle" : "WebApplication",
    name: config.title,
    description: config.description,
    url: config.url,
    applicationCategory: "UtilityApplication",
    image: config.image || "https://jobcheck.in/logo.png",
    ...(config.type === "article" && {
      author: {
        "@type": "Organization",
        name: config.author || "JobCheck",
      },
      datePublished: config.publishedTime,
      dateModified: config.modifiedTime || config.publishedTime,
    }),
    ...(config.type !== "article" && {
      organization: {
        "@type": "Organization",
        name: "JobCheck",
        logo: "https://jobcheck.in/logo.png",
        sameAs: [
          "https://twitter.com/jobcheck_in",
          "https://linkedin.com/company/jobcheck",
          "https://github.com/jobcheck/jobcheck",
        ],
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free job posting verification tool",
      },
    }),
  };

  return JSON.stringify(schema, null, 2);
}

/**
 * Generate breadcrumb schema for navigation
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>): string {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return JSON.stringify(breadcrumb, null, 2);
}

/**
 * Generate FAQPage schema for commonly asked questions
 */
export function generateFaqSchema(
  faqs: Array<{ question: string; answer: string }>
): string {
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return JSON.stringify(faqPage, null, 2);
}

/**
 * Generate complete SEO meta tag string for HTML head
 */
export function generateSeoHeadTags(config: MetadataConfig): string {
  const ogp = generateOgpMetaTags(config);
  const twitter = generateTwitterCardMetaTags(config);
  const canonical = getCanonicalUrl(new URL(config.url).pathname);

  const metaTags: string[] = [
    `<meta charset="UTF-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
    `<meta name="description" content="${escapeHtml(config.description)}" />`,
    `<meta name="canonical" href="${canonical}" />`,
    ...(config.keywords && config.keywords.length > 0
      ? [`<meta name="keywords" content="${escapeHtml(config.keywords.join(", "))}" />`]
      : []),
    `<meta name="author" content="${config.author || "JobCheck"}" />`,
    `<meta name="color-scheme" content="dark light" />`,
    `<meta name="theme-color" content="#090d16" media="(prefers-color-scheme: dark)" />`,
    `<meta name="theme-color" content="#f8fafc" media="(prefers-color-scheme: light)" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    ...Object.entries(ogp).map(([key, value]) =>
      `<meta property="${key}" content="${escapeHtml(value ?? '')}" />`
    ),
    ...Object.entries(twitter).map(([key, value]) =>
      `<meta name="${key}" content="${escapeHtml(value ?? '')}" />`
    ),
    `<link rel="canonical" href="${canonical}" />`,
    `<link rel="icon" type="image/png" href="/logo.png" />`,
    `<link rel="apple-touch-icon" href="/logo.png" />`,
  ];

  return metaTags.join("\n  ");
}

/**
 * Escape HTML special characters in attribute values
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char] ?? char);
}

/**
 * Meta tag builder for dynamic page contexts
 */
export class SeoMetaBuilder {
  private config: MetadataConfig;

  constructor(baseConfig: Partial<MetadataConfig> = {}) {
    this.config = {
      title: baseConfig.title || "JobCheck",
      description:
        baseConfig.description ||
        "Scam vs. legit job-link checker for Indian freshers",
      url: baseConfig.url || "https://jobcheck.in",
      image: baseConfig.image || "https://jobcheck.in/og-image.png",
      imageAlt: baseConfig.imageAlt || "JobCheck - Scam vs. Legit Job Checker",
      type: baseConfig.type || "website",
      keywords: baseConfig.keywords,
      author: baseConfig.author,
      publishedTime: baseConfig.publishedTime,
      modifiedTime: baseConfig.modifiedTime,
      twitterCard: baseConfig.twitterCard,
    };
  }

  /**
   * Set custom title and return self for chaining
   */
  setTitle(title: string): SeoMetaBuilder {
    this.config.title = title;
    return this;
  }

  /**
   * Set custom description and return self for chaining
   */
  setDescription(description: string): SeoMetaBuilder {
    this.config.description = description;
    return this;
  }

  /**
   * Set URL and return self for chaining
   */
  setUrl(url: string): SeoMetaBuilder {
    this.config.url = url;
    return this;
  }

  /**
   * Set image and return self for chaining
   */
  setImage(image: string, alt?: string): SeoMetaBuilder {
    this.config.image = image;
    if (alt) {
      this.config.imageAlt = alt;
    }
    return this;
  }

  /**
   * Set keywords and return self for chaining
   */
  setKeywords(keywords: string[]): SeoMetaBuilder {
    this.config.keywords = keywords;
    return this;
  }

  /**
   * Build and return configuration
   */
  build(): MetadataConfig {
    return { ...this.config };
  }

  /**
   * Build and return all meta tags as HTML
   */
  buildHtml(): string {
    return generateSeoHeadTags(this.config);
  }

  /**
   * Build and return OGP tags
   */
  buildOgp(): Record<string, string> {
    return generateOgpMetaTags(this.config);
  }

  /**
   * Build and return Twitter Card tags
   */
  buildTwitter(): Record<string, string> {
    return generateTwitterCardMetaTags(this.config);
  }

  /**
   * Build and return JSON-LD schema
   */
  buildSchema(): string {
    return generateSchemaOrgJsonLd(this.config);
  }
}

/**
 * Precomputed homepage metadata
 */
export const HOMEPAGE_CONFIG: MetadataConfig = {
  title: "JobCheck — Scam vs. Legit Job Checker for Indian Freshers",
  description:
    "JobCheck analyzes job postings in real-time to identify scams. Detects fees, task scams, WhatsApp recruiters, lookalike domains, and 100+ risk signals with AI-powered verification.",
  url: "https://jobcheck.in/",
  image: "https://jobcheck.in/og-image.png",
  imageAlt: "JobCheck - Detect job scams instantly",
  type: "website",
  keywords: [
    "job scam detector",
    "job posting verification",
    "Indian job scams",
    "fake job alerts",
    "recruitment scam check",
    "job verification tool",
    "phishing job links",
  ],
};

/**
 * FAQs for structured data
 */
export const COMMON_FAQS = [
  {
    question: "How does JobCheck detect job scams?",
    answer:
      "JobCheck uses 100+ automated rules to analyze URLs for phishing patterns, checks domain age and registration history, detects suspicious TLDs and lookalike brands, and uses AI-powered web search to verify company information and employee reviews.",
  },
  {
    question: "Is JobCheck really free?",
    answer:
      "Yes, JobCheck is completely free. We do not charge for analysis, store your data server-side, or display ads. All scoring happens in your browser.",
  },
  {
    question: "What job posting platforms does JobCheck support?",
    answer:
      "JobCheck works with any job URL or description from any platform—LinkedIn, Naukri, Indeed, Glassdoor, company career pages, and more. Just paste the URL and optionally add the job description.",
  },
  {
    question: "Does JobCheck store my data?",
    answer:
      "No. Your job URLs and descriptions are analyzed entirely in your browser. We do not store, log, or track any user input server-side.",
  },
  {
    question: "What does the risk score mean?",
    answer:
      "Scores range from 0–100: 0–24 is Low Risk (likely legitimate), 25–54 is Medium Risk (verify independently), and 55–100 is High Risk (likely a scam or heavily suspicious).",
  },
];
