#!/usr/bin/env node
/** Full-page screenshot of preview.html in both themes, for design review. */
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const errors = [];
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 900 }, colorScheme: scheme,
    });
    page.on('pageerror', (e) => errors.push(scheme + ': ' + e));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(scheme + ': ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, 'preview.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.anim && window.anim.isLoaded);
    await page.evaluate(() => window.anim.goToAndStop(150, true));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(__dirname, `page-${scheme}.png`), fullPage: true });
    await page.close();
  }
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
