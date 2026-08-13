#!/usr/bin/env node
/**
 * Exports a static SVG of the finished graph, rendered from the animation
 * itself so the two can never drift apart.
 *
 * It reads the `--arrows` build: with nothing moving, the travelling dots no
 * longer show which way the data flows, so the poster keeps the arrowheads
 * that the animation does without.
 *
 * Serve it to visitors who asked for reduced motion — an endlessly looping
 * hero is exactly what that setting exists to switch off. It also works as a
 * placeholder behind the player while the JSON parses.
 *
 * Usage: PW_CORE=... PW_EXEC=... node poster.js [frame] [source.json]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

// Far enough from any node's reaction to a landing dot that nothing is caught
// mid-flinch, and with dots spread along the edges rather than bunched.
const FRAME = Number(process.argv[2] || 64);
const SOURCE = process.argv[3] || 'lineage-arrows.json';

const ALT = 'Data lineage: three sources feed two transformations, which feed the ' +
  'canonical dataset, which feeds a dashboard and a report';

(async () => {
  const player = fs.readFileSync(
    path.join(__dirname, 'node_modules/lottie-web/build/player/lottie.min.js'), 'utf8');
  const data = fs.readFileSync(path.join(__dirname, SOURCE), 'utf8');

  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.setContent(
    `<body><div id="a" style="width:800px"></div><script>${player}</script><script>` +
    `window.anim = lottie.loadAnimation({container:document.getElementById('a'),` +
    `renderer:'svg',loop:false,autoplay:false,animationData:${data}});</script></body>`);
  await page.waitForFunction(() => window.anim && window.anim.isLoaded);

  const svg = await page.evaluate((frame) => {
    window.anim.goToAndStop(frame, true);
    const el = document.querySelector('#a svg').cloneNode(true);
    // Drop the player's inline sizing so the file scales like any other SVG.
    el.removeAttribute('style');
    el.setAttribute('width', '100%');
    el.removeAttribute('height');
    el.setAttribute('role', 'img');
    return el.outerHTML;
  }, FRAME);

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));

  const out = path.join(__dirname, 'lineage-poster.svg');
  fs.writeFileSync(
    out,
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    svg.replace('<svg', `<svg aria-label="${ALT}"`));
  console.log(`wrote lineage-poster.svg from ${SOURCE} frame ${FRAME} ` +
    `(${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
  await browser.close();
})();
