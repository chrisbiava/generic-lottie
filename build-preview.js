#!/usr/bin/env node
/** Bundles the player + the animation into one self-contained preview.html. */
const fs = require('fs');
const path = require('path');

const here = __dirname;
const player = fs.readFileSync(
  path.join(here, 'node_modules/lottie-web/build/player/lottie.min.js'), 'utf8');
const data = fs.readFileSync(path.join(here, 'lineage.json'), 'utf8');
const anim = JSON.parse(data);
const kb = (Buffer.byteLength(data) / 1024).toFixed(0);

// The poster goes in as a data URI rather than inline markup: lottie-web and
// the exported SVG share element ids, and two copies in one document collide.
const posterPath = path.join(here, 'lineage-poster.svg');
const poster = fs.existsSync(posterPath)
  ? 'data:image/svg+xml;base64,' + fs.readFileSync(posterPath).toString('base64')
  : null;
const posterKb = poster ? (fs.statSync(posterPath).size / 1024).toFixed(0) : null;
const darkPath = path.join(here, 'lineage-dark.json');
const hasDark = fs.existsSync(darkPath);
const darkData = hasDark ? fs.readFileSync(darkPath, 'utf8') : null;

const SNIPPET = `import { useRef, useSyncExternalStore } from "react";
import Lottie from "lottie-react";
import lineage from "./lineage.json";
import posterUrl from "./lineage-poster.svg";

const query = window.matchMedia("(prefers-reduced-motion: reduce)");
const useReducedMotion = () =&gt;
  useSyncExternalStore(
    (cb) =&gt; { query.addEventListener("change", cb); return () =&gt; query.removeEventListener("change", cb); },
    () =&gt; query.matches,
  );

export function LineageHero() {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  if (reduced) {
    return &lt;img src={posterUrl} alt="Data lineage: three sources feed two transformations,
      which feed the canonical dataset, which feeds a dashboard and a report." /&gt;;
  }

  // Play the build once, then jump back to the start of the idle segment on
  // every completion. Deliberately not playSegments(): a pending segment
  // change overwrites the next goToAndStop, which bites the moment anything
  // else wants to address a frame.
  return (
    &lt;Lottie
      lottieRef={ref}
      animationData={lineage}
      loop={false}
      autoplay
      onComplete={() =&gt; ref.current.goToAndPlay(180, true)}
      style={{ width: "100%", maxWidth: 800 }}
    /&gt;
  );
}`;

const html = `<title>Generic Lottie — hero lineage animation</title>
<style>
  :root {
    --ground:#f7f8fa; --card:#ffffff; --ink:#12161b; --muted:#697180;
    --line:#e2e6ec; --accent:#e4002b; --checker:#eceff3;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground:#0d1013; --card:#15191e; --ink:#e6e9ee; --muted:#939ba8;
      --line:#242a32; --accent:#ff2148; --checker:#1c2128;
    }
  }
  :root[data-theme="dark"] {
    --ground:#0d1013; --card:#15191e; --ink:#e6e9ee; --muted:#939ba8;
    --line:#242a32; --accent:#ff2148; --checker:#1c2128;
  }

  body {
    background:var(--ground); color:var(--ink); margin:0;
    font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  main { max-width:880px; margin:0 auto; padding:56px 20px 96px; display:flex; flex-direction:column; gap:40px; }
  .eyebrow {
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px;
    letter-spacing:0.14em; text-transform:uppercase; color:var(--accent); margin:0 0 10px;
  }
  h1 { font-size:clamp(1.6rem,3.4vw,2.2rem); line-height:1.15; letter-spacing:-0.02em; margin:0 0 10px; text-wrap:balance; }
  .lede { color:var(--muted); margin:0; max-width:62ch; }

  .stage {
    border:1px solid var(--line); border-radius:14px; padding:10px;
    background:var(--card); transition:background .18s ease;
  }
  .stage[data-bg="dark"] { background:#0d1013; }
  .stage[data-bg="checker"] {
    background-color:var(--card);
    background-image:
      linear-gradient(45deg,var(--checker) 25%,transparent 25%,transparent 75%,var(--checker) 75%),
      linear-gradient(45deg,var(--checker) 25%,transparent 25%,transparent 75%,var(--checker) 75%);
    background-size:20px 20px; background-position:0 0,10px 10px;
  }
  #anim { width:100%; aspect-ratio:16/9; }

  .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
  button {
    font:inherit; font-size:14px; padding:8px 15px; border-radius:9px; cursor:pointer;
    border:1px solid var(--line); background:var(--card); color:var(--ink);
  }
  button:hover { border-color:var(--accent); }
  button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  button[aria-pressed="true"] { border-color:var(--accent); color:var(--accent); }
  .spacer { flex:1 1 auto; }
  .swatches { display:flex; gap:6px; }

  .scrub { display:flex; align-items:center; gap:12px; }
  input[type=range] { flex:1; accent-color:var(--accent); }
  .frame {
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px;
    font-variant-numeric:tabular-nums; color:var(--muted); min-width:9ch; text-align:right;
  }

  h2 { font-size:1rem; letter-spacing:-0.01em; margin:0 0 14px; }
  dl.specs { display:grid; grid-template-columns:auto 1fr; gap:8px 24px; margin:0; }
  dl.specs dt { color:var(--muted); font-size:14px; }
  dl.specs dd {
    margin:0; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:13px; font-variant-numeric:tabular-nums;
  }
  .timeline { display:flex; border:1px solid var(--line); border-radius:9px; overflow:hidden; font-size:13px; }
  .timeline div { padding:10px 14px; }
  .timeline .build { flex:3; border-right:1px solid var(--line); }
  .timeline .idle { flex:5; color:var(--accent); }
  .timeline span { display:block; color:var(--muted); font-size:12px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  pre {
    background:var(--card); border:1px solid var(--line); border-radius:11px;
    padding:16px; overflow-x:auto; margin:0;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; line-height:1.55;
  }
  .note { color:var(--muted); font-size:14px; margin:12px 0 0; }
  code.inline { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.88em;
    border:1px solid var(--line); border-radius:5px; padding:1px 5px; }
  @media (prefers-reduced-motion:reduce) { .stage { transition:none; } }
</style>

<main>
  <header>
    <p class="eyebrow">Generic Lottie · hero asset</p>
    <h1>Lineage graph, self-assembling</h1>
    <p class="lede">Three sources feed two transformations, the transformations converge on the
      canonical dataset, the dataset fans out to a dashboard and a report. The graph builds
      itself once, then keeps running for as long as the page is open. Every pipe carries its
      own traffic — the edge to the dashboard runs four times busier than the coldest source —
      and each dot accelerates as it is drawn in. The consumers flinch when data lands; the
      dataset never moves, because it is the only large area of red and holds the eye without
      needing to.</p>
  </header>

  <section>
    <div class="stage" id="stage"><div id="anim"></div></div>
    <div class="controls" style="margin-top:14px">
      <button id="replay">Replay build</button>
      <button id="idle">Idle loop</button>
      <button id="pause">Pause</button>
      <div class="spacer"></div>
      <div class="swatches" role="group" aria-label="Preview background">
        <button data-bg="light" aria-pressed="true">Light</button>
        <button data-bg="dark" aria-pressed="false">Dark</button>
        <button data-bg="checker" aria-pressed="false">Transparent</button>
      </div>
    </div>
    <div class="scrub" style="margin-top:12px">
      <input type="range" id="scrub" min="0" max="479" value="0" aria-label="Scrub frames">
      <span class="frame" id="frameLabel">0 / 479</span>
    </div>
    ${hasDark ? `<p class="note">“Dark” swaps in the dark-variant file, not just the backdrop.
      “Transparent” shows the real checkerboard the asset composites over.</p>` : ''}
  </section>

  <section>
    <h2>Timeline</h2>
    <div class="timeline">
      <div class="build"><strong>Build</strong><span>frames 0–179 · 3.0s</span></div>
      <div class="idle"><strong>Idle loop</strong><span>frames 180–480 · 5.0s, seamless</span></div>
    </div>
    <p class="note">The idle segment is periodic: the frame after 479 is pixel-identical to
      frame 180, so the wrap is invisible. Every dot cadence divides the 300-frame loop, and a
      node's reaction is dropped altogether if its window would straddle the loop point —
      keeping it on one side only is what makes a loop visibly jump. Verified by comparing the
      rendered SVG at both ends.</p>
  </section>

  ${poster ? `<section>
    <h2>Reduced motion</h2>
    <p class="note" style="margin:0 0 14px">A hero that loops forever is exactly what
      <code class="inline">prefers-reduced-motion</code> exists to switch off. This poster is
      exported from frame 199 of the animation itself, so the two can't drift apart — same
      geometry, same palette, no motion. One difference on purpose: <strong>the poster keeps
      arrowheads</strong>. While the animation runs, the travelling dots show which way each
      edge flows and a static head on top of them is one mark too many; with everything
      frozen, that cue is gone and the graph would read in either direction.</p>
    <p class="note" style="margin:0 0 14px">The same file doubles as a loading placeholder —
      put it behind the player and the Lottie covers it once parsed:
      <code class="inline">style={{ backgroundImage: \`url(${'$'}{posterUrl})\`, backgroundSize: "contain" }}</code></p>
    <div class="stage"><img src="${poster}" alt="Data lineage: three sources feed two transformations and the canonical dataset, which feeds a dashboard and a report" style="width:100%;display:block"></div>
  </section>` : ''}

  <section>
    <h2>Specs</h2>
    <dl class="specs">
      <dt>Canvas</dt><dd>${anim.w} × ${anim.h} · 16:9 · scales to any size</dd>
      <dt>Frame rate</dt><dd>${anim.fr} fps</dd>
      <dt>Duration</dt><dd>${(anim.op / anim.fr).toFixed(1)}s total · ${((anim.op - 180) / anim.fr).toFixed(1)}s loop</dd>
      <dt>File</dt><dd>${kb} KB JSON · ${anim.layers.length} layers · no images, no fonts</dd>
      ${poster ? `<dt>Poster</dt><dd>${posterKb} KB SVG · static, reduced-motion fallback</dd>` : ''}
      ${hasDark ? '<dt>Variants</dt><dd>lineage.json · lineage-dark.json</dd>' : ''}
      <dt>Background</dt><dd>transparent</dd>
      <dt>Accent</dt><dd>#E4002B — single source in generate.js</dd>
      <dt>Graph</dt><dd>3 sources → 2 transformations → 1 dataset → 2 consumers</dd>
      <dt>Throughput</dt><dd>8 edges · 4 dot cadences (75 / 100 / 150 / 300 frames)</dd>
    </dl>
  </section>

  <section>
    <h2>Drop-in</h2>
    <pre><code>${SNIPPET}</code></pre>
    <p class="note">To skip the build entirely, drop the ref and use
      <code class="inline">initialSegment={[180, 480]}</code> with <code class="inline">loop</code>.${
      hasDark ? ' On a dark hero, swap in <code class="inline">lineage-dark.json</code>.' : ''}</p>
  </section>
</main>

<script>${player}</script>
<script>
  const VARIANTS = { light: ${data}${hasDark ? ',\n    dark: ' + darkData : ''} };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scrub = document.getElementById('scrub');
  const label = document.getElementById('frameLabel');
  let scrubbing = false;
  let anim = null;

  // Rebuilding the player is how the dark variant gets swapped in: it keeps
  // whatever frame and play state the previous one was on.
  function mount(variant, frame, playing) {
    if (anim) anim.destroy();
    anim = lottie.loadAnimation({
      container: document.getElementById('anim'),
      renderer: 'svg', loop: false, autoplay: false,
      animationData: VARIANTS[variant] || VARIANTS.light,
    });
    window.anim = anim;
    // The idle loop is done by jumping back on 'complete' rather than with
    // playSegments: a pending segment change would overwrite the next
    // goToAndStop, which is what the scrubber uses.
    anim.addEventListener('complete', () => anim.goToAndPlay(180, true));
    anim.addEventListener('enterFrame', () => {
      const f = Math.round(anim.currentFrame + (anim.firstFrame || 0));
      label.textContent = f + ' / 479';
      if (!scrubbing) scrub.value = f;
    });
    if (playing) anim.goToAndPlay(frame, true); else anim.goToAndStop(frame, true);
  }

  // Reduced motion gets the finished graph, held still.
  mount('light', reduced ? 199 : 0, !reduced);

  document.getElementById('replay').onclick = () => anim.goToAndPlay(0, true);
  document.getElementById('idle').onclick = () => anim.goToAndPlay(180, true);
  document.getElementById('pause').onclick = () => anim.pause();

  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  scrub.addEventListener('pointerup', () => { scrubbing = false; });
  scrub.addEventListener('input', () => anim.goToAndStop(Number(scrub.value), true));

  document.querySelectorAll('.swatches button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.swatches button')
        .forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      document.getElementById('stage').dataset.bg = b.dataset.bg;
      const frame = Math.round(anim.currentFrame + (anim.firstFrame || 0));
      const playing = !anim.isPaused;
      mount(b.dataset.bg === 'dark' ? 'dark' : 'light', frame, playing);
    };
  });
</script>
`;

fs.writeFileSync(path.join(here, 'preview.html'), html);
console.log('wrote preview.html (' + (html.length / 1024).toFixed(0) + ' KB)');
