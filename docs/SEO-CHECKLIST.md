# Implementation Checklist

## Immediate Actions (Today)

- [ ] Review `index-seo.html` for completeness
- [ ] Replace current `index.html` with SEO version (or merge `<head>` sections)
- [ ] Create OG image (1200×630px) and save as `/public/og-image.png`
- [ ] Test in [Facebook Debugger](https://developers.facebook.com/tools/debug/sharing/)
- [ ] Test in [Twitter Validator](https://cards-dev.twitter.com/validator)
- [ ] Run `npm test -- tests/seo.test.ts` to confirm all tests pass

## Search Engine Setup (Week 1)

- [ ] Register at [Google Search Console](https://search.google.com/search-console)
- [ ] Add verification code to `index-seo.html`
- [ ] Submit sitemap: `https://jobcheck.in/sitemap.xml`
- [ ] Register at [Bing Webmaster Tools](https://www.bing.com/webmasters)
- [ ] Add Bing verification code
- [ ] Set canonical URLs and language preferences

## Monitoring & Analytics (Week 2)

- [ ] Set up Google Analytics 4
- [ ] Create custom searches for main keywords in Search Console
- [ ] Set up alerts for indexing issues
- [ ] Enable mobile-friendly test notifications
- [ ] Monitor Core Web Vitals

## Content & Media (Week 2-3)

- [ ] Create PWA app icons (192×192, 512×512, maskable)
- [ ] Create PWA screenshots (540×720, 1280×720)
- [ ] Update `/public/manifest.json` with correct icon paths
- [ ] Add short descriptions to `COMMON_FAQS` if needed
- [ ] Create help/documentation pages

## Performance & Optimization (Ongoing)

- [ ] Monitor Search Console impressions and CTR
- [ ] Track keyword rankings (target top 5 for primary keywords)
- [ ] Monitor mobile usability issues
- [ ] Review Core Web Vitals monthly
- [ ] Update SEO config for new features

## Code Quality (Continuous)

- [ ] Run `npm run typecheck` before commits
- [ ] Run `npm test -- tests/seo.test.ts` before deploy
- [ ] Run full `npm test` to ensure no regressions
- [ ] Keep `COMMON_FAQS` and keywords up-to-date

