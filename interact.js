#!/usr/bin/env node
/** Exercises the preview controls: variant swap, scrub, replay, pause. */
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('file://' + path.join(__dirname, 'preview.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.anim && window.anim.isLoaded);

  const nameOf = () => page.evaluate(() => window.anim.animationData.nm);
  console.log('initial variant:', await nameOf());

  await page.click('.swatches button[data-bg="dark"]');
  await page.waitForFunction(() => window.anim && window.anim.isLoaded);
  await page.evaluate(() => window.anim.goToAndStop(300, true));
  await page.waitForTimeout(200);
  console.log('after Dark click:', await nameOf());
  await page.locator('#stage').screenshot({ path: path.join(__dirname, 'check-swap-dark.png') });

  await page.click('.swatches button[data-bg="checker"]');
  await page.waitForFunction(() => window.anim && window.anim.isLoaded);
  console.log('after Transparent click:', await nameOf());

  await page.click('#replay');
  await page.waitForTimeout(300);
  await page.click('#pause');
  const paused = await page.evaluate(() => window.anim.isPaused);
  console.log('pause works:', paused);

  await page.fill('#scrub', '250').catch(() => {});
  await page.evaluate(() => {
    const s = document.getElementById('scrub');
    s.value = 250; s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  console.log('scrub label:', await page.textContent('#frameLabel'));

  // The wrap must land back in the idle segment, not at the start of the build.
  await page.evaluate(() => window.anim.goToAndPlay(470, true));
  await page.waitForTimeout(600);
  const wrapped = await page.evaluate(() => Math.round(window.anim.currentFrame));
  console.log('after playing past the end, frame =', wrapped,
    wrapped >= 180 && wrapped < 300 ? '(wrapped into idle)' : '(WRONG)');
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
