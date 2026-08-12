#!/usr/bin/env node
/**
 * Loop-seam check: the rendered SVG at frame A must equal the SVG at frame
 * A + loopLength, otherwise the idle loop visibly jumps when it wraps.
 */
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const [a, b] = process.argv.slice(2).map(Number);

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'preview.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.anim && window.anim.isLoaded);

  const dump = async (f) => page.evaluate((frame) => {
    window.anim.goToAndStop(frame, true);
    return document.querySelector('#anim svg').outerHTML;
  }, f);

  const svgA = await dump(a);
  const svgB = await dump(b);

  if (svgA === svgB) {
    console.log(`SEAM OK — frame ${a} and frame ${b} render identically`);
  } else {
    console.log(`SEAM MISMATCH between frame ${a} and frame ${b}`);
    const ta = svgA.match(/transform="[^"]*"/g) || [];
    const tb = svgB.match(/transform="[^"]*"/g) || [];
    let shown = 0;
    for (let i = 0; i < Math.max(ta.length, tb.length) && shown < 12; i++) {
      if (ta[i] !== tb[i]) { console.log(`  #${i}\n    A ${ta[i]}\n    B ${tb[i]}`); shown++; }
    }
    const oa = svgA.match(/opacity="[^"]*"/g) || [];
    const ob = svgB.match(/opacity="[^"]*"/g) || [];
    shown = 0;
    for (let i = 0; i < Math.max(oa.length, ob.length) && shown < 12; i++) {
      if (oa[i] !== ob[i]) { console.log(`  opacity #${i}: A ${oa[i]} / B ${ob[i]}`); shown++; }
    }
  }
  await browser.close();
})();
