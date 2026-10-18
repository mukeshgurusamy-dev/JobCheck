import puppeteer from 'puppeteer';

const widths = [300, 450, 720, 1040, 1500];
const baseUrl = 'http://localhost:3001';

const checks = {
  'Navigation bar': {
    selectors: ['.c-nav', '.c-nav__inner', '.c-nav__brand', '.c-nav__links', '.c-nav__controls'],
    verify: (el, width) => {
      const issues = [];
      if (!el) return ['Navigation not found'];

      const style = window.getComputedStyle(el);
      const innerNav = document.querySelector('.c-nav__inner');
      if (innerNav) {
        const innerStyle = window.getComputedStyle(innerNav);
        const overflowX = innerStyle.overflowX;
        if (overflowX === 'scroll' || overflowX === 'auto') {
          issues.push('Navigation has horizontal scroll');
        }

        const rect = innerNav.getBoundingClientRect();
        if (rect.width > window.innerWidth) {
          issues.push(`Navigation width (${rect.width}px) exceeds viewport (${window.innerWidth}px)`);
        }
      }

      const navLinks = document.querySelector('.c-nav__links');
      if (navLinks && width <= 720) {
        const style = window.getComputedStyle(navLinks);
        if (style.display !== 'none') {
          issues.push('Navigation links visible on mobile (should be hidden)');
        }
      }

      const controls = document.querySelector('.c-nav__controls');
      if (controls) {
        const rect = controls.getBoundingClientRect();
        if (rect.width < 44) {
          issues.push(`Control buttons too small: ${rect.width}px (need ≥44px)`);
        }
      }

      return issues;
    }
  },

  'Hero section': {
    selectors: ['.c-ent-hero', '.c-ent-hero__title', '.c-ent-hero__subtitle'],
    verify: (el, width) => {
      const issues = [];
      if (!el) return ['Hero section not found'];

      const rect = el.getBoundingClientRect();
      if (rect.width > window.innerWidth + 1) {
        issues.push(`Hero width (${rect.width}px) exceeds viewport (${window.innerWidth}px)`);
      }

      const title = document.querySelector('.c-ent-hero__title');
      if (title) {
        const style = window.getComputedStyle(title);
        const fontSize = parseFloat(style.fontSize);
        if (fontSize < 16) {
          issues.push(`Title too small: ${fontSize}px`);
        }
        const titleRect = title.getBoundingClientRect();
        if (titleRect.width > window.innerWidth) {
          issues.push(`Title overflows: ${titleRect.width}px > ${window.innerWidth}px`);
        }
      }

      const subtitle = document.querySelector('.c-ent-hero__subtitle');
      if (subtitle) {
        const subtitleRect = subtitle.getBoundingClientRect();
        if (subtitleRect.width > window.innerWidth) {
          issues.push(`Subtitle overflows: ${subtitleRect.width}px > ${window.innerWidth}px`);
        }
      }

      const pill = document.querySelector('.c-ent-hero__status-pill');
      if (pill) {
        const pillRect = pill.getBoundingClientRect();
        if (pillRect.width < 44 || pillRect.height < 44) {
          issues.push(`Status pill too small: ${pillRect.width}x${pillRect.height}px`);
        }
      }

      return issues;
    }
  },

  'Skip link': {
    selectors: ['a[href="#main"]', '[role="navigation"]'],
    verify: (el, width) => {
      const issues = [];
      const skipLink = document.querySelector('a[href="#main"]') || document.querySelector('[aria-label*="Skip"]');
      if (!skipLink) {
        return ['Skip link not found'];
      }

      const style = window.getComputedStyle(skipLink);
      if (style.visibility === 'hidden' && style.position !== 'absolute') {
        issues.push('Skip link not properly hidden off-screen');
      }

      return issues;
    }
  },

  'Logo & brand': {
    selectors: ['.c-nav__brand', '.c-nav__logo-wrapper'],
    verify: (el, width) => {
      const issues = [];
      const brand = document.querySelector('.c-nav__brand');
      if (!brand) return ['Brand element not found'];

      const rect = brand.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.5) {
        issues.push(`Brand too wide: ${rect.width}px (${(rect.width/window.innerWidth*100).toFixed(1)}% of viewport)`);
      }

      const logo = document.querySelector('.c-nav__logo-wrapper');
      if (logo) {
        const logoRect = logo.getBoundingClientRect();
        if (logoRect.width < 24 && width > 720) {
          issues.push(`Logo too small at ${width}px: ${logoRect.width}px`);
        }
      }

      return issues;
    }
  }
};

async function testWidth(width) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing at ${width}px viewport`);
  console.log(`${'='.repeat(70)}`);

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 10000 });
    await page.waitForSelector('.c-nav', { timeout: 5000 });

    for (const [componentName, checkConfig] of Object.entries(checks)) {
      console.log(`\n${componentName}:`);

      const issues = await page.evaluate(({ componentName, checkConfig, width }) => {
        const el = document.querySelector(checkConfig.selectors[0]);
        return checkConfig.verify(el, width);
      }, { componentName, checkConfig, width });

      if (issues.length === 0) {
        console.log(`  ✓ No issues detected`);
      } else {
        issues.forEach(issue => {
          console.log(`  ✗ ${issue}`);
        });
      }

      // Check element visibility
      const visibility = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return 'not-found';
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (style.display === 'none') return 'hidden';
        if (style.visibility === 'hidden') return 'invisible';
        if (rect.width === 0 || rect.height === 0) return 'zero-size';
        return 'visible';
      }, checkConfig.selectors[0]);

      console.log(`  Status: ${visibility}`);
    }

    // Check for horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    console.log(`\nHorizontal scroll: ${hasHorizontalScroll ? '✗ YES (ISSUE)' : '✓ NO'}`);

    // Take a screenshot for visual inspection
    const screenshotPath = `./audit-${width}px.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Screenshot saved: ${screenshotPath}`);

  } catch (error) {
    console.error(`Error testing ${width}px:`, error.message);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('Starting responsive UI audit for JobCheck');
  console.log(`Testing widths: ${widths.join(', ')}px`);
  console.log(`Base URL: ${baseUrl}`);

  for (const width of widths) {
    try {
      await testWidth(width);
    } catch (error) {
      console.error(`Failed to test ${width}px:`, error.message);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('Audit complete');
  console.log(`${'='.repeat(70)}`);
}

main().catch(console.error);
