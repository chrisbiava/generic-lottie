#!/usr/bin/env node
/**
 * Measures what the animation costs the main thread: JSON parse, player
 * construction plus first paint, and the per-frame render cost, for both
 * renderers.
 *
 * Absolute numbers depend on the machine; the ratio between renderers and the
 * split between setup and steady state are what to read.
 *
 * Usage: node perf.js [file.json]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const SOURCE = process.argv[2] || 'lineage.json';

/** Total keyframes in the file — the thing that drives both size and cost. */
function countKeyframes(node) {
  if (Array.isArray(node)) return node.reduce((n, x) => n + countKeyframes(x), 0);
  if (node && typeof node === 'object') {
    if (node.a === 1 && Array.isArray(node.k)) return node.k.length;
    return Object.values(node).reduce((n, x) => n + countKeyframes(x), 0);
  }
  return 0;
}

(async () => {
  const player = fs.readFileSync(
    path.join(__dirname, 'node_modules/lottie-web/build/player/lottie.min.js'), 'utf8');
  const text = fs.readFileSync(path.join(__dirname, SOURCE), 'utf8');
  const data = JSON.parse(text);

  console.log(`${SOURCE}: ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB, ` +
    `${data.layers.length} layers, ${countKeyframes(data.layers)} keyframes, ` +
    `${data.op} frames\n`);

  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });

  // THROTTLE=6 simulates a machine roughly six times slower than this one —
  // closer to the laptop the stutter was reported on than a dev box is.
  const throttle = Number(process.env.THROTTLE || 1);
  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    console.log(`CPU throttled ${throttle}×\n`);
  }
  await page.setContent(
    `<body style="margin:0"><div id="a" style="width:800px;height:450px"></div>` +
    `<script>${player}</script></body>`);
  await page.evaluate((t) => { window.__json = t; }, text);

  const variants = [
    { label: 'svg', renderer: 'svg', settings: {} },
    { label: 'svg + progressiveLoad', renderer: 'svg', settings: { progressiveLoad: true } },
    { label: 'canvas', renderer: 'canvas', settings: {} },
  ];

  for (const { label, renderer, settings } of variants) {
    const r = await page.evaluate(async ({ renderer, settings, frames }) => {
      document.getElementById('a').innerHTML = '';
      if (window.__anim) window.__anim.destroy();

      const t0 = performance.now();
      const parsed = JSON.parse(window.__json);
      const t1 = performance.now();

      const anim = lottie.loadAnimation({
        container: document.getElementById('a'),
        renderer, loop: true, autoplay: false, animationData: parsed,
        rendererSettings: settings,
      });
      anim.goToAndStop(0, true);
      const t2 = performance.now();
      window.__anim = anim;

      // Steady-state cost: render every frame of the loop once.
      const t3 = performance.now();
      for (let f = 0; f < frames; f++) anim.goToAndStop(f, true);
      const t4 = performance.now();

      const nodes = document.querySelectorAll('#a *').length;
      return {
        parse: t1 - t0,
        build: t2 - t1,
        perFrame: (t4 - t3) / frames,
        nodes,
      };
    }, { renderer, settings, frames: data.op });

    console.log(`renderer: ${label}`);
    console.log(`  JSON.parse        ${r.parse.toFixed(1)} ms`);
    console.log(`  build + 1st paint ${r.build.toFixed(1)} ms`);
    console.log(`  per frame         ${r.perFrame.toFixed(2)} ms  (16.7 ms is one frame at 60fps)`);
    console.log(`  DOM nodes         ${r.nodes}\n`);
  }

  await browser.close();
})();
