#!/usr/bin/env node
/**
 * Confirms the landing reactions are real: reads the peak frames out of the
 * JSON, then measures the scale actually applied in the rendered SVG.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'lineage.json'), 'utf8'));

const peaksOf = (name) => {
  const l = data.layers.find((x) => x.nm === name);
  if (!l || l.ks.s.a !== 1) return [];
  return l.ks.s.k.filter((kf) => kf.s[0] > 100.5 && kf.t >= 180).map((kf) => kf.t);
};

const targets = ['node-ds', 'node-dash', 'node-rep'];
for (const t of targets) console.log(t, '→ reactions at', peaksOf(t).join(', ') || '(none)');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'preview.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.anim && window.anim.isLoaded);

  const maxScaleAt = (frame) => page.evaluate((f) => {
    window.anim.goToAndStop(f, true);
    const svg = document.querySelector('#anim svg').outerHTML;
    const scales = [...svg.matchAll(/matrix\(([-\d.]+),/g)].map((m) => Number(m[1]));
    return Math.max(...scales);
  }, frame);

  // A control frame has to clear every node's reaction window, not just the
  // dataset's — otherwise the "quiet" reading catches a different node mid-nudge.
  const allPeaks = targets.flatMap(peaksOf);
  const quiet = [];
  for (let f = 190; f < 470; f++) {
    if (allPeaks.every((p) => Math.abs(f - p) > 26)) quiet.push(f);
  }

  // Pick whichever node still reacts — the dataset deliberately does not.
  const reacting = targets.find((t) => peaksOf(t).length);
  const peak = peaksOf(reacting)[1];
  console.log(`\nframe ${peak} (a dot lands on ${reacting}): max scale ${(await maxScaleAt(peak)).toFixed(4)}`);
  console.log(`frame ${quiet[0]} (no node reacting):       max scale ${(await maxScaleAt(quiet[0])).toFixed(4)}`);
  await browser.close();
})();
