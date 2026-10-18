import { chromium } from 'playwright';
import * as fs from 'fs';

const widths = [300, 450, 720, 1040, 1500];
const baseUrl = 'http://localhost:5173';
const results = [];

async function testWidthBreakpoints() {
  const browser = await chromium.launch();

  try {
    for (const width of widths) {
      console.log(`\n=== Testing width: ${width}px ===`);
      const context = await browser.createBrowserContext({
        viewport: { width, height: 1200 }
      });

      const page = await context.newPage();

      try {
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        const audit = {
          width,
          components: {},
          issues: []
        };

        // Test URL Input Component
        console.log('  Checking URL Input...');
        const urlInputChecks = await page.evaluate(() => {
          const label = document.querySelector('.c-url-input__label');
          const field = document.querySelector('.c-url-input__field');
          const clearBtn = document.querySelector('.c-url-input__clear-btn');
          const errorEl = document.querySelector('.c-url-input__error');
          const wrapper = document.querySelector('.c-url-input');

          const results = {
            labelVisible: !!label && label.offsetHeight > 0,
            fieldWidth: field ? field.offsetWidth : 0,
            fieldHeight: field ? field.offsetHeight : 0,
            fieldPaddingLeft: field ? window.getComputedStyle(field).paddingLeft : 'N/A',
            fieldPaddingRight: field ? window.getComputedStyle(field).paddingRight : 'N/A',
            clearBtnSize: clearBtn ? `${clearBtn.offsetWidth}x${clearBtn.offsetHeight}` : 'N/A',
            containerWidth: wrapper ? wrapper.offsetWidth : 0,
            hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
            fieldVisible: !!field && field.offsetHeight > 0,
            fieldMinHeight: field ? window.getComputedStyle(field).minHeight : 'N/A'
          };
          return results;
        });

        audit.components.urlInput = urlInputChecks;

        // Test Textarea Component
        console.log('  Checking Textarea...');
        const textareaChecks = await page.evaluate(() => {
          const textarea = document.querySelector('.c-checker-form__textarea');
          const wrapper = document.querySelector('.c-checker-form__textarea-wrapper');
          const meta = document.querySelector('.c-checker-form__textarea-meta');

          const results = {
            visible: !!textarea && textarea.offsetHeight > 0,
            width: textarea ? textarea.offsetWidth : 0,
            height: textarea ? textarea.offsetHeight : 0,
            minHeight: textarea ? window.getComputedStyle(textarea).minHeight : 'N/A',
            padding: textarea ? `${window.getComputedStyle(textarea).paddingTop} ${window.getComputedStyle(textarea).paddingRight}` : 'N/A',
            wrapperWidth: wrapper ? wrapper.offsetWidth : 0,
            metaFlexWrap: meta ? window.getComputedStyle(meta).flexWrap : 'N/A'
          };
          return results;
        });

        audit.components.textarea = textareaChecks;

        // Test Sample Chips
        console.log('  Checking Sample Chips...');
        const chipsChecks = await page.evaluate(() => {
          const samplesWrapper = document.querySelector('.c-checker-form__samples');
          const chips = document.querySelectorAll('.c-checker-form__sample-chip');

          if (!samplesWrapper || chips.length === 0) {
            return { visible: false, chipCount: 0 };
          }

          const chipsSizes = Array.from(chips).map(chip => ({
            text: chip.textContent,
            width: chip.offsetWidth,
            height: chip.offsetHeight,
            minHeight: window.getComputedStyle(chip).height
          }));

          return {
            visible: true,
            wrapperWidth: samplesWrapper.offsetWidth,
            chipCount: chips.length,
            chips: chipsSizes,
            hasHorizontalOverflow: samplesWrapper.scrollWidth > samplesWrapper.offsetWidth
          };
        });

        audit.components.sampleChips = chipsChecks;

        // Test Submit Button
        console.log('  Checking Submit Button...');
        const submitChecks = await page.evaluate(() => {
          const btn = document.querySelector('.c-checker-form__submit-btn');
          const row = document.querySelector('.c-checker-form__submit-row');

          const results = {
            visible: !!btn && btn.offsetHeight > 0,
            width: btn ? btn.offsetWidth : 0,
            height: btn ? btn.offsetHeight : 0,
            minWidth: btn ? window.getComputedStyle(btn).minWidth : 'N/A',
            maxWidth: btn ? window.getComputedStyle(btn).maxWidth : 'N/A',
            textOverflow: btn ? btn.textContent.length > 25 : false,
            rowWidth: row ? row.offsetWidth : 0,
            padding: btn ? window.getComputedStyle(btn).padding : 'N/A'
          };
          return results;
        });

        audit.components.submitButton = submitChecks;

        // Test Form Container
        console.log('  Checking Form Container...');
        const formChecks = await page.evaluate(() => {
          const form = document.querySelector('.c-checker-form');

          const results = {
            width: form ? form.offsetWidth : 0,
            padding: form ? window.getComputedStyle(form).padding : 'N/A',
            hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
            viewport: {
              innerWidth: window.innerWidth,
              scrollWidth: document.documentElement.scrollWidth
            }
          };
          return results;
        });

        audit.components.formContainer = formChecks;

        // Test Platform Banner (inside form)
        console.log('  Checking Platform Banner...');
        const bannerChecks = await page.evaluate(() => {
          const banner = document.querySelector('.c-checker-form__platform-banner');

          if (!banner || banner.style.display === 'none') {
            return { visible: false };
          }

          const results = {
            visible: true,
            width: banner.offsetWidth,
            height: banner.offsetHeight,
            display: window.getComputedStyle(banner).display,
            alignItems: window.getComputedStyle(banner).alignItems,
            gap: window.getComputedStyle(banner).gap,
            textOverflow: banner.offsetHeight < banner.scrollHeight
          };
          return results;
        });

        audit.components.platformBanner = bannerChecks;

        // Test Disclosure Toggle
        console.log('  Checking Disclosure Toggle...');
        const disclosureChecks = await page.evaluate(() => {
          const toggle = document.querySelector('.c-checker-form__disclosure-toggle');

          if (!toggle) {
            return { visible: false };
          }

          const results = {
            visible: true,
            width: toggle.offsetWidth,
            height: toggle.offsetHeight,
            fontSize: window.getComputedStyle(toggle).fontSize,
            textOverflow: toggle.scrollWidth > toggle.offsetWidth
          };
          return results;
        });

        audit.components.disclosureToggle = disclosureChecks;

        // Check for horizontal scrolling at container level
        const scrollCheck = await page.evaluate(() => {
          return {
            hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
            bodyOverflow: window.getComputedStyle(document.body).overflow,
            htmlOverflow: window.getComputedStyle(document.documentElement).overflow
          };
        });

        audit.scrolling = scrollCheck;

        results.push(audit);

      } catch (error) {
        console.error(`Error testing ${width}px:`, error.message);
        results.push({ width, error: error.message });
      }

      await context.close();
    }

  } finally {
    await browser.close();
  }

  return results;
}

// Start dev server in background and run tests
async function main() {
  console.log('Starting responsive audit...');

  try {
    // Wait a bit for potential server startup
    console.log('Waiting for server...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const auditResults = await testWidthBreakpoints();

    // Write results to file
    const reportPath = '/c/Users/Mukesh/Desktop/final-backup/jobcheck/responsive-audit-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(auditResults, null, 2));

    console.log('\n=== AUDIT COMPLETE ===');
    console.log(`Report saved to: ${reportPath}`);

    // Print summary
    auditResults.forEach(audit => {
      if (audit.error) {
        console.log(`\n${audit.width}px: ERROR - ${audit.error}`);
      } else {
        console.log(`\n${audit.width}px:`);

        const { urlInput, textarea, sampleChips, submitButton, formContainer, scrolling } = audit.components;

        console.log(`  URL Input: ${urlInput.fieldWidth}px wide, ${urlInput.fieldHeight}px tall`);
        console.log(`  Textarea: ${textarea.width}px wide, ${textarea.height}px tall`);
        console.log(`  Sample Chips: ${sampleChips.chipCount} chips, wrapper ${sampleChips.wrapperWidth}px`);
        if (sampleChips.hasHorizontalOverflow) console.log(`    WARNING: Chips have horizontal overflow!`);
        console.log(`  Submit Button: ${submitButton.width}px wide, ${submitButton.height}px tall`);
        console.log(`  Form Container: ${formContainer.width}px wide`);
        console.log(`  Horizontal Scroll: ${scrolling.hasHorizontalScroll ? 'YES - ISSUE!' : 'No'}`);
      }
    });

  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
