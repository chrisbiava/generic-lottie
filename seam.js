#!/usr/bin/env node
/**
 * Loop-seam check: the render at frame 0 must be identical to the render at
 * frame `loopEnd`, otherwise the loop visibly jumps every time it wraps.
 *
 * Frame `loopEnd` is one past the last frame the shipped file plays, so the
 * check loads a copy with `op` extended and asks for it explicitly. The
 * keyframes are generated a full cycle beyond the loop for exactly this
 * reason — they describe what the next loop would do.
 *
 * Usage: node seam.js [file.json]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const SOURCE = process.argv[2] || 'lineage.json';

(async () => {
  const player = fs.readFileSync(
    path.join(__dirname, 'node_modules/lottie-web/build/player/lottie.min.js'), 'utf8');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, SOURCE), 'utf8'));
  const loopEnd = data.op;
  // Headroom so the wrap frame is addressable. Layers carry their own `op`
  // and lottie hides them past it, so those need extending too.
  data.op = loopEnd + 60;
  for (const l of data.layers) l.op = loopEnd + 60;

  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const page = await browser.newPage();
  await page.setContent(
    `<body><div id="a" style="width:800px"></div><script>${player}</script><script>` +
    `window.anim = lottie.loadAnimation({container:document.getElementById('a'),` +
    `renderer:'svg',loop:false,autoplay:false,animationData:${JSON.stringify(data)}});` +
    `</script></body>`);
  await page.waitForFunction(() => window.anim && window.anim.isLoaded);

  const dump = (f) => page.evaluate((frame) => {
    window.anim.goToAndStop(frame, true);
    return document.querySelector('#a svg').outerHTML;
  }, f);

  const first = await dump(0);
  const wrap = await dump(loopEnd);

  if (first === wrap) {
    console.log(`SEAM OK — frame 0 and frame ${loopEnd} render identically`);
  } else {
    console.log(`SEAM MISMATCH between frame 0 and frame ${loopEnd}`);
    const ta = first.match(/transform="[^"]*"/g) || [];
    const tb = wrap.match(/transform="[^"]*"/g) || [];
    let shown = 0;
    for (let i = 0; i < Math.max(ta.length, tb.length) && shown < 12; i++) {
      if (ta[i] !== tb[i]) { console.log(`  #${i}\n    frame 0    ${ta[i]}\n    frame ${loopEnd}  ${tb[i]}`); shown++; }
    }
    const oa = first.match(/opacity="[^"]*"/g) || [];
    const ob = wrap.match(/opacity="[^"]*"/g) || [];
    shown = 0;
    for (let i = 0; i < Math.max(oa.length, ob.length) && shown < 12; i++) {
      if (oa[i] !== ob[i]) { console.log(`  opacity #${i}: frame 0 ${oa[i]} / frame ${loopEnd} ${ob[i]}`); shown++; }
    }
    process.exitCode = 1;
  }
  await browser.close();
})();
