#!/usr/bin/env node
/** Renders specific frames of the animation to PNGs so they can be inspected. */
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const FRAMES = process.argv.slice(2).map(Number);
const here = __dirname;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PW_EXEC,
  });
  const page = await browser.newPage({ viewportSize: { width: 900, height: 620 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('file://' + path.join(here, 'preview.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.anim && window.anim.isLoaded);

  for (const f of FRAMES) {
    await page.evaluate((frame) => window.anim.goToAndStop(frame, true), f);
    await page.waitForTimeout(120);
    await page.locator('#stage').screenshot({ path: path.join(here, `frame-${f}.png`) });
  }

  const svgCount = await page.evaluate(
    () => document.querySelectorAll('#anim svg g').length);
  console.log('svg groups rendered:', svgCount);
  console.log('console errors:', errors.length ? errors : 'none');
  await browser.close();
})();
