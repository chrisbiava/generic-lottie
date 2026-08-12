# Generic Lottie — hero lineage animation

A Lottie animation for a page hero: a data-lineage graph that builds itself over 3s, then
runs a seamless 5s idle loop with data flowing along the edges.

3 sources → 2 transformations → 1 canonical dataset → 2 consumers. 800×450, 60fps,
transparent background, no images and no fonts embedded.

## What to ship

| File | Size | Ship it? |
| --- | --- | --- |
| `lineage.json` | 144 KB · 8 KB gzip | **Yes** — the animation |
| `lineage-poster.svg` | 27 KB · 2.8 KB gzip | **Yes** — the `prefers-reduced-motion` fallback |
| `lineage-dark.json` | 144 KB · 8.1 KB gzip | Only if the hero sits on a dark background |
| `lineage-arrows.json` | 146 KB | **No** — it only exists to export the poster from |

Everything else in this repo is source: it regenerates the files above and proves they
are correct. None of it belongs in an app bundle.

## Using it

```bash
npm i lottie-react
```

```tsx
import { useRef, useSyncExternalStore } from "react";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
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
  const ref = useRef<LottieRefCurrentProps>(null);
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
      lottieRef={ref}
      animationData={lineage}
      loop={false}
      autoplay
      onComplete={() => ref.current?.goToAndPlay(180, true)}
      style={{ width: "100%", maxWidth: 800 }}
      aria-hidden="true"
    />
  );
}
```

Frames 0–179 are the build, 180–479 the idle loop. `onComplete` jumps back to 180 so the
graph never rebuilds itself. To skip the build entirely, drop the ref and pass
`initialSegment={[180, 480]}` with `loop`.

**Not `playSegments()`.** A pending segment change silently overwrites the next
`goToAndStop()`, so anything that later wants to address a frame — a scrubber, a
scroll-linked hero — breaks in a way that is hard to trace.

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

The idle segment is periodic: the render at frame 479 + 1 is identical to frame 180, so the
wrap is invisible. Three rules keep it that way, and `generate.js` throws if the first is
broken:

1. Every edge's dot cadence must divide the 300-frame loop (75 / 100 / 150 / 300).
2. A dot's travel time never exceeds its cadence.
3. Node reactions are placed by phase within the loop, and any reaction whose window would
   straddle the loop point is dropped in *every* cycle — keeping it on one side only is
   exactly what makes a loop visibly jump.

`npm run verify:seam` compares the rendered SVG at frames 179 and 479 and fails loudly if
they differ. Run it after any change to timing or geometry.

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
