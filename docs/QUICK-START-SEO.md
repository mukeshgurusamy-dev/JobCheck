# Quick Integration Guide

## 1. Update Your Current `index.html`

Replace the `<head>` section of your current `index.html` with the content from `index-seo.html`. Keep everything else the same.

**Before:**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="..." />
    <title>JobCheck</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**After:**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <!-- Copy entire <head> from index-seo.html -->
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="..." />
    <!-- ... all other meta tags, OGP, Twitter, JSON-LD ... -->
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## 2. Add OG Image

Create or download a 1200×630px image and save it to:
```
/public/og-image.png
```

This image appears when JobCheck is shared on social media.

### Quick Option
Use your logo and add text "JobCheck — Detect Job Scams" using a tool like:
- Canva (free templates)
- GIMP (open source)
- Photoshop

## 3. Verify Everything Works

```bash
# Type check
npm run typecheck

# Run SEO tests
npm test -- tests/seo.test.ts

# Run full test suite (ensure no regressions)
npm test

# Run benchmark (must pass 100/100)
npm run benchmark
```

All should pass ✅

## 4. Test Social Sharing

### Facebook
1. Go to https://developers.facebook.com/tools/debug/sharing/
2. Paste your URL: `https://jobcheck.in/`
3. Click "Scrape Again"
4. Verify title, description, and image appear correctly

### Twitter
1. Go to https://cards-dev.twitter.com/validator
2. Paste your URL
3. Verify card type is "Summary Card with Large Image"

### LinkedIn
1. Go to https://www.linkedin.com/feed/
2. Paste your URL in the share box
3. Verify preview shows correct title, description, image

## 5. Submit to Search Engines

### Google Search Console

1. Go to https://search.google.com/search-console
2. Click "Add property"
3. Enter URL: `https://jobcheck.in/`
4. Choose verification method (Domain or URL prefix)
5. Add verification code to `index.html`:
   ```html
   <meta name="google-site-verification" content="YOUR_CODE_HERE" />
   ```
6. Click "Verify"
7. Go to Sitemaps > Add new > Enter: `https://jobcheck.in/sitemap.xml`

### Bing Webmaster Tools

1. Go to https://www.bing.com/webmasters
2. Add new site: `https://jobcheck.in/`
3. Choose verification method
4. Add code to `index.html`:
   ```html
   <meta name="msvalidate.01" content="YOUR_CODE_HERE" />
   ```
5. Verify
6. Add sitemap: `https://jobcheck.in/sitemap.xml`

## 6. Monitor Performance

### Google Search Console
- Check "Performance" tab after 1-2 weeks
- View impressions, clicks, CTR, average position
- Fix any indexing issues

### Tools to Monitor

**Weekly:**
- Google Search Console Performance tab
- Mobile-Friendly Test
- Core Web Vitals

**Monthly:**
- Rich Results Test (for schema.org)
- Keyword rankings
- Competitor analysis

## 7. Dynamic Page Metadata (Optional)

If you have multiple pages, you can generate custom metadata for each:

```typescript
import { SeoMetaBuilder } from "./src/lib/seo";

// For Help page
const helpMeta = new SeoMetaBuilder()
  .setTitle("Help & FAQ — JobCheck")
  .setDescription("Learn how JobCheck detects job scams and verifies postings...")
  .setUrl("https://jobcheck.in/help")
  .buildHtml();

// For About page
const aboutMeta = new SeoMetaBuilder()
  .setTitle("About JobCheck")
  .setDescription("JobCheck is a free, open-source job posting verification tool...")
  .setUrl("https://jobcheck.in/about")
  .buildHtml();
```

Then dynamically inject into `<head>` on page load.

## 8. Troubleshooting

### Meta tags not showing in social previews?
- Check Facebook/Twitter debuggers to see what they're reading
- Ensure image is accessible at full URL (`https://jobcheck.in/og-image.png`)
- Clear cache in debugger tools (usually a "Scrape Again" button)

### Search Console shows crawl errors?
- Check `robots.txt` for blocked paths
- Verify SSL certificate is valid
- Check sitemap.xml for broken links

### Rich snippets not appearing?
- Validate JSON-LD with https://validator.schema.org/
- Ensure `@context` and `@type` are correct
- Wait 1-2 weeks for Google to process

### Keywords not ranking?
- Check Google Search Console for impressions
- Ensure content matches keywords
- Build backlinks from authority sites
- Create unique, valuable content around each keyword

## 9. Files Reference

| File | What It Does |
|------|-------------|
| `index-seo.html` | Production HTML template (copy `<head>` to your index.html) |
| `src/lib/seo.ts` | TypeScript utilities for programmatic metadata generation |
| `tests/seo.test.ts` | Test suite (29 tests) |
| `public/robots.txt` | Tells search crawlers which pages to index |
| `public/sitemap.xml` | Lists all your pages for search engines |
| `public/manifest.json` | PWA app manifest for mobile installation |
| `public/seo-config.json` | Centralized SEO configuration (reference only) |
| `docs/SEO.md` | Full documentation |
| `docs/SEO-CHECKLIST.md` | Implementation checklist |

## 10. Next: Build & Deploy

```bash
# Build for production
npm run build

# Deploy to Netlify (if using Netlify)
netlify deploy --prod

# Or manually upload /dist folder to your host
```

Once deployed, Google will start crawling and indexing within days.

---

**Questions?** Review `docs/SEO.md` for detailed documentation.

**Need help?** Check the test file (`tests/seo.test.ts`) for usage examples of all utilities.
