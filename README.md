# Generic Lottie — hero lineage animation

A Lottie animation for a page hero: a data-lineage graph drawn complete and still, with
data flowing along its edges on a seamless 5s loop. The graph itself never animates —
only the dots move, and the nodes they land on.

3 sources → 2 transformations → 1 canonical dataset → 2 consumers. 800×450, 60fps,
transparent background, no images and no fonts embedded.

## What to ship

| File | Size | Ship it? |
| --- | --- | --- |
| `lineage.json` | 99 KB · 6 KB gzip | **Yes** — the animation |
| `lineage-poster.svg` | 28 KB · 2.8 KB gzip | **Yes** — the `prefers-reduced-motion` fallback |
| `lineage-dark.json` | 100 KB · 6 KB gzip | Only if the hero sits on a dark background |
| `lineage-arrows.json` | 101 KB | **No** — it only exists to export the poster from |

Everything else in this repo is source: it regenerates the files above and proves they
are correct. None of it belongs in an app bundle.

## Using it

```bash
npm i lottie-react
```

```tsx
import { useSyncExternalStore } from "react";
import Lottie from "lottie-react";
import lineage from "@/assets/lineage/lineage.json";
import posterUrl from "@/assets/lineage/lineage-poster.svg";

const query = window.matchMedia("(prefers-reduced-motion: reduce)");

function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      query.addEventListener("change", cb);
      return () => query.removeEventListener("change", cb);
    },
    () => query.matches,
  );
}

export function LineageHero() {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <img
        src={posterUrl}
        alt="Data lineage: three sources feed two transformations, which feed the canonical dataset, which feeds a dashboard and a report."
        style={{ width: "100%", maxWidth: 800 }}
      />
    );
  }

  return (
    <Lottie
      animationData={lineage}
      loop
      autoplay
      rendererSettings={{ progressiveLoad: true }}
      style={{ width: "100%", maxWidth: 800 }}
      aria-hidden="true"
    />
  );
}
```

The file is a single 300-frame loop, so `loop` plays it: no ref, no segments, no
completion handler.

**Avoid `playSegments()`** if you ever add one. A pending segment change silently
overwrites the next `goToAndStop()`, so anything that later wants to address a frame — a
scrubber, a scroll-linked hero — breaks in a way that is hard to trace.

## Performance

`npm run perf` measures parse, construction and per-frame cost. With the CPU throttled 6×
to stand in for a slow laptop:

| Renderer | Build + first paint | Per frame | DOM nodes |
| --- | --- | --- | --- |
| `svg` | 140–224 ms | 0.52 ms | 126 |
| `svg` + `progressiveLoad` | 46–55 ms | 0.23 ms | 126 |
| `canvas` | 50–77 ms | 1.06 ms | 1 |

One frame at 60fps is 16.7 ms, so nothing here is close to struggling once running — the
whole cost is construction. Hence `progressiveLoad: true` in the snippet above: same
renderer, same output, a third of the setup.

**If the hero stutters, it is the victim, not the cause.** A large `JSON.parse`, a big
React commit, anything that blocks the main thread will starve rAF, and the player catches
up afterwards by jumping — which is exactly what a stutter looks like. Fixes, in order:

1. Mount the animation once the payload has landed, or defer it past first paint with
   `requestIdleCallback`, so its ~50 ms of construction is not competing with data.
2. Pause it while it is off screen, with an `IntersectionObserver`.
3. Move the blocking parse off the main thread — that fixes every animation on the page,
   not just this one.

Making the animation lighter does not fix a block it did not cause.

### Integration traps

- **Vite with `vite-plugin-svgr`**: the SVG import returns a component, not a URL. Use
  `"...lineage-poster.svg?url"`.
- **Next.js**: put the SVG in `public/`, mark the component `"use client"`.
- **SSR**: `window.matchMedia` at module scope crashes on the server. Move it inside the
  component behind a `typeof window !== "undefined"` check.
- **TypeScript**: JSON imports need `"resolveJsonModule": true`.

## Regenerating

```bash
npm install
npm run build     # all four assets + preview.html
npm run verify    # loop seam, node reactions, preview controls
```

`npm run build:preview` writes `preview.html`, a self-contained page (player inlined) for
reviewing the animation: replay, idle-only, frame scrubber, and light / dark / transparent
backgrounds. It is gitignored — build it when you need it.

Everything is driven by `generate.js`: `CONFIG` at the top, then the `NODES` and `EDGES`
tables. The accent red lives in `CONFIG.colors.red` and nowhere else.

Verification needs a Chromium for `playwright-core`. If the machine has one already, point
at it: `PW_EXEC=/path/to/headless_shell npm run verify`. Otherwise `npx playwright install
chromium` once.

## How the loop stays seamless

The whole file is periodic: the render at frame 300 is identical to frame 0, so the wrap is
invisible. Four rules keep it that way, and `generate.js` throws if the first is broken:

1. Every edge's dot cadence must divide the 300-frame loop (75 / 100 / 150 / 300).
2. A dot's travel time never exceeds its cadence.
3. Dot cycles are emitted starting one period *before* frame 0, so a dot already in flight
   when the loop begins is drawn mid-flight instead of popping in.
4. Node reactions are placed by phase within the loop, and any reaction whose window would
   straddle the loop point is dropped in *every* cycle — keeping it on one side only is
   exactly what makes a loop visibly jump.

`npm run verify:seam` renders frame 0 and frame 300 and fails loudly if they differ. Frame
300 is one past the end of the shipped file, so the check loads a copy with `op` extended;
the keyframes run a full cycle beyond the loop precisely so that frame is well defined. Run
it after any change to timing or geometry.

## Design notes

- **Arrowheads only in the poster.** While the animation runs, the travelling dots already
  show which way each edge flows. In the static poster nothing moves, so the direction
  would otherwise be lost. Edges into the same node share an endpoint, so only the first
  one draws a head.
- **Per-edge throughput.** Cadence, speed and dot size differ per edge — the edge to the
  dashboard runs four times busier than the coldest source. Uniform dots read as a
  conveyor belt; uneven ones read as traffic.
- **The dataset never moves.** It is the only large area of red on the canvas and holds
  the eye without animating. The consumers flinch when data lands on them.
- **Nothing is sequenced.** The graph does not assemble itself on load: it is simply there,
  and only the data moves. A build sequence reads as an intro — fine once, tiresome on a
  page people return to, and it doubles the keyframe count for something seen once.
