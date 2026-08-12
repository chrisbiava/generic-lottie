#!/usr/bin/env node
/**
 * Renders any of the generated files standalone, on a chosen background.
 * Usage: node render-json.js <file.json|file.svg> <frame> <cssBackground> <out.png>
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const [file, frameArg, bg, out] = process.argv.slice(2);
const abs = path.join(__dirname, file);
const isSvg = file.endsWith('.svg');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const page = await browser.newPage({ viewport: { width: 880, height: 500 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  if (isSvg) {
    await page.setContent(
      `<body style="margin:0;background:${bg}"><div style="width:840px;padding:20px">` +
      fs.readFileSync(abs, 'utf8').replace(/<\?xml[^>]*\?>/, '') + '</div></body>');
  } else {
    const player = fs.readFileSync(
      path.join(__dirname, 'node_modules/lottie-web/build/player/lottie.min.js'), 'utf8');
    await page.setContent(
      `<body style="margin:0;background:${bg}"><div id="a" style="width:840px"></div>` +
      `<script>${player}</script><script>` +
      `window.anim = lottie.loadAnimation({container:document.getElementById('a'),` +
      `renderer:'svg',loop:false,autoplay:false,animationData:${fs.readFileSync(abs, 'utf8')}});` +
      `</script></body>`);
    await page.waitForFunction(() => window.anim && window.anim.isLoaded);
    await page.evaluate((f) => window.anim.goToAndStop(f, true), Number(frameArg));
  }

  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(__dirname, out) });
  console.log(`${out} ← ${file}` + (errors.length ? ` | errors: ${errors}` : ' | no errors'));
  await browser.close();
})();
