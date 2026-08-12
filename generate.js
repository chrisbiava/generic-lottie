#!/usr/bin/env node
/**
 * Hero lineage animation — a data-lineage graph, generated as Lottie.
 *
 * Emits a Lottie (bodymovin v5) JSON: a data-lineage graph that builds itself
 * over the first 3s, then settles into a 5s seamless idle loop where data
 * flows along the edges.
 *
 * Run: node generate.js            → lineage.json
 *      node generate.js --dark     → lineage-dark.json
 *      node generate.js --arrows   → lineage-arrows.json
 *
 * Arrowheads are off by default: while the animation runs, the travelling dots
 * already show which way each edge flows, and a static head on top of that is
 * one mark too many. They go back on for the poster export, where nothing
 * moves and the direction would otherwise be lost.
 *
 * Everything tunable lives in CONFIG, NODES and EDGES.
 */

const fs = require('fs');
const path = require('path');

const DARK = process.argv.includes('--dark');
const ARROWS = process.argv.includes('--arrows');

const CONFIG = {
  width: 800,
  height: 450,
  fps: 60,
  buildEnd: 180,   // frame where the build phase finishes
  loopEnd: 480,    // last frame; the idle loop is [buildEnd, loopEnd]
  colors: {
    red: '#E4002B',      // brand accent — the only place it is defined
    node: '#5B6478',     // node outline
    nodeFill: '#FFFFFF', // node interior
    edge: '#C3C9D6',     // edge stroke
    arrow: '#98A1B3',    // arrowheads: a step darker so they read at small sizes
    glyph: '#C3C9D6',    // detail inside the nodes
  },
  darkColors: {
    red: '#FF2148',
    node: '#3E4757',
    nodeFill: '#161A20',
    edge: '#39414F',
    arrow: '#5C6678',
    glyph: '#5A6272',
  },
  arrow: { length: 9.5, halfWidth: 5 },
  // How a node reacts when a dot lands on it, keyed by node kind — a kind with
  // no entry here never reacts. The dataset is deliberately left out: it is the
  // only large area of red on the canvas and holds the eye without moving.
  // Rhythm comes from the traffic, never from a timer.
  impact: { consumer: 103, rise: 5, fall: 18, minGap: 10 },
  // Dots ease into their target instead of gliding at constant speed:
  // >1 accelerates towards the end, which reads as being pulled in.
  flowEasing: 1.22,
};

const { width: W, height: H, buildEnd, loopEnd } = CONFIG;
const LOOP_LEN = loopEnd - buildEnd;

// ---------------------------------------------------------------- utilities

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    1,
  ];
}

const palette = DARK ? { ...CONFIG.colors, ...CONFIG.darkColors } : CONFIG.colors;
const C = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, hexToRgb(v)]));

/** Static (non-animated) property. */
const stat = (k) => ({ a: 0, k });

const EASE = {
  out: { i: { x: 0.2, y: 1 }, o: { x: 0.35, y: 0 } },     // decelerate
  inOut: { i: { x: 0.45, y: 1 }, o: { x: 0.55, y: 0 } },  // smooth both ends
  linear: { i: { x: 0.5, y: 0.5 }, o: { x: 0.5, y: 0.5 } },
};

/** Animated property from [frame, value, easeName?] tuples. */
function anim(steps, ease = EASE.inOut) {
  return {
    a: 1,
    k: steps.map(([t, v, named], idx) => {
      const dims = v.length;
      const e = named ? EASE[named] : ease;
      const kf = { t, s: v };
      if (idx < steps.length - 1) {
        kf.i = { x: Array(dims).fill(e.i.x), y: Array(dims).fill(e.i.y) };
        kf.o = { x: Array(dims).fill(e.o.x), y: Array(dims).fill(e.o.y) };
      }
      return kf;
    }),
  };
}

const groupTransform = (extra = {}) => ({
  ty: 'tr',
  p: stat([0, 0]),
  a: stat([0, 0]),
  s: stat([100, 100]),
  r: stat(0),
  o: stat(100),
  sk: stat(0),
  sa: stat(0),
  nm: 'Transform',
  ...extra,
});

const fill = (color) => ({ ty: 'fl', c: stat(color), o: stat(100), r: 1, bm: 0, nm: 'Fill' });
const stroke = (color, w) => ({
  ty: 'st', c: stat(color), o: stat(100), w: stat(w), lc: 2, lj: 2, bm: 0, nm: 'Stroke',
});

let layerIndex = 0;
function layer(props) {
  return { ddd: 0, ind: ++layerIndex, ty: 4, sr: 1, ao: 0, bm: 0, st: 0, op: loopEnd, ...props };
}

const deg = (rad) => (rad * 180) / Math.PI;

// ------------------------------------------------------------------- graph

/**
 * Shape: 3 sources → 2 transformations → 1 canonical dataset → 2 consumers.
 * The middle source feeds both transformations, so each one has a fan-in of 2.
 * The rows are deliberately offset — a real lineage is never a tidy lattice.
 */
const NODES = [
  { id: 'src1', kind: 'source', glyph: 'rows', x: 100, y: 92, pop: 0 },
  { id: 'src2', kind: 'source', glyph: 'rows', x: 106, y: 214, pop: 8 },
  { id: 'src3', kind: 'source', glyph: 'rows', x: 112, y: 352, pop: 16 },
  { id: 'tf1', kind: 'transform', glyph: 'dot', x: 314, y: 142, pop: 58 },
  { id: 'tf2', kind: 'transform', glyph: 'dot', x: 314, y: 288, pop: 66 },
  { id: 'ds', kind: 'dataset', glyph: 'core-rows', x: 520, y: 218, pop: 108 },
  { id: 'dash', kind: 'consumer', glyph: 'bars', x: 696, y: 122, pop: 148 },
  { id: 'rep', kind: 'consumer', glyph: 'lines', x: 696, y: 318, pop: 156 },
];

/**
 * `flow` describes the traffic on an edge:
 *   cycle — frames between two dots. MUST divide LOOP_LEN or the loop jumps.
 *   travel — frames a dot takes to cross.
 *   size — dot radius; busier pipes carry fatter dots.
 * `bow` pushes the curve's control points vertically, to route around nodes.
 */
const EDGES = [
  { from: 'src1', to: 'tf1', draw: 24, flow: { cycle: 150, travel: 96, size: 3.2 } },
  { from: 'src2', to: 'tf1', draw: 30, flow: { cycle: 100, travel: 74, size: 3.6 } },
  { from: 'src2', to: 'tf2', draw: 36, flow: { cycle: 150, travel: 92, size: 3.2 } },
  { from: 'src3', to: 'tf2', draw: 42, flow: { cycle: 300, travel: 150, size: 2.8 } },
  { from: 'tf1', to: 'ds', draw: 74, flow: { cycle: 100, travel: 72, size: 3.8 } },
  { from: 'tf2', to: 'ds', draw: 80, flow: { cycle: 150, travel: 88, size: 3.4 } },
  { from: 'ds', to: 'dash', draw: 120, flow: { cycle: 75, travel: 58, size: 4.2 } },
  { from: 'ds', to: 'rep', draw: 126, flow: { cycle: 150, travel: 86, size: 3.4 } },
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

// A dot pattern only tiles the loop if its period divides the loop length.
for (const e of EDGES) {
  if (LOOP_LEN % e.flow.cycle !== 0) {
    throw new Error(
      `edge ${e.from}->${e.to}: flow cycle ${e.flow.cycle} does not divide loop length ${LOOP_LEN}`);
  }
  if (e.flow.travel > e.flow.cycle) {
    throw new Error(`edge ${e.from}->${e.to}: travel ${e.flow.travel} exceeds cycle ${e.flow.cycle}`);
  }
}

/** Horizontal half-extent, used to start/end edges just outside the shape. */
function halfWidth(kind) {
  return { source: 18, transform: 21, dataset: 27, consumer: 43 }[kind];
}

// -------------------------------------------------------------- node shapes

const bar = (x, y, w, h, color) => ({
  ty: 'gr', nm: 'bar',
  it: [
    { ty: 'rc', p: stat([x, y]), s: stat([w, h]), r: stat(Math.min(w, h) / 2), nm: 'r' },
    fill(color), groupTransform(),
  ],
});

/** Glyphs that read as "table", "chart", "report" at hero size. */
function glyphShapes(glyph) {
  switch (glyph) {
    case 'rows':
      return [bar(0, -5, 15, 2.6, C.glyph), bar(0, 0, 15, 2.6, C.glyph), bar(0, 5, 15, 2.6, C.glyph)];
    case 'bars':
      return [
        bar(-13, 3, 5, 9, C.glyph), bar(-4, 0.5, 5, 14, C.glyph),
        bar(5, 2, 5, 11, C.glyph), bar(14, -1, 5, 17, C.red),
      ];
    case 'lines': // left-aligned at x = -14, ragged right like a block of text
      return [
        bar(-2, -6, 24, 2.6, C.glyph), bar(-5, 0, 18, 2.6, C.glyph),
        bar(0, 6, 28, 2.6, C.glyph),
      ];
    case 'core-rows':
      return [
        bar(0, -7, 20, 3, C.nodeFill), bar(0, 0, 20, 3, C.nodeFill),
        bar(0, 7, 20, 3, C.nodeFill),
      ];
    case 'dot':
      return [{
        ty: 'gr', nm: 'dot',
        it: [
          { ty: 'el', p: stat([0, 0]), s: stat([7, 7]), nm: 'e' },
          fill(C.red), groupTransform(),
        ],
      }];
    default:
      return [];
  }
}

function nodeShapes(kind) {
  switch (kind) {
    case 'source':
      return [{
        ty: 'gr', nm: 'source',
        it: [
          { ty: 'rc', p: stat([0, 0]), s: stat([32, 32]), r: stat(4), nm: 'rect' },
          fill(C.nodeFill), stroke(C.node, 2.5), groupTransform(),
        ],
      }];
    case 'transform':
      // a square rotated 45° reads as a diamond without a custom path
      return [{
        ty: 'gr', nm: 'transform',
        it: [
          { ty: 'rc', p: stat([0, 0]), s: stat([29, 29]), r: stat(2), nm: 'rect' },
          fill(C.nodeFill), stroke(C.node, 2.5), groupTransform({ r: stat(45) }),
        ],
      }];
    case 'dataset': // the hero: a filled disc, the only large area of red
      return [{
        ty: 'gr', nm: 'dataset',
        it: [
          { ty: 'el', p: stat([0, 0]), s: stat([46, 46]), nm: 'disc' },
          fill(C.red), groupTransform(),
        ],
      }];
    case 'consumer':
      return [{
        ty: 'gr', nm: 'consumer',
        it: [
          { ty: 'rc', p: stat([0, 0]), s: stat([84, 34]), r: stat(8), nm: 'rect' },
          fill(C.nodeFill), stroke(C.node, 2.5), groupTransform(),
        ],
      }];
    default:
      throw new Error(`unknown node kind: ${kind}`);
  }
}

/**
 * Scale keyframes for a node: the pop-in, then one small nudge every time a
 * dot lands on it. Each edge's traffic is periodic over the loop, so the
 * rhythm is too — but the periods differ (75/100/150/300), so the nudges
 * never settle into a metronome.
 *
 * The nudges are placed by their phase within the loop, never by absolute
 * frame. A reaction whose window would straddle the loop point is dropped
 * outright, in every cycle: keeping it on one side and not the other is
 * exactly what makes a loop visibly jump.
 */
function nodeScaleSteps(n) {
  const t = n.pop;
  // overshoot then settle — gives the pop-in some weight
  const steps = [[t, [30, 30]], [t + 11, [113, 113]], [t + 22, [100, 100]]];

  const peak = CONFIG.impact[n.kind];
  if (!peak) return steps;

  const { rise, fall, minGap } = CONFIG.impact;
  const phases = [...new Set(
    EDGES
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.to === n.id)
      .flatMap(({ e, i }) => flowArrivals(e, i))
      .map((a) => ((a - buildEnd) % LOOP_LEN + LOOP_LEN) % LOOP_LEN)
  )]
    .filter((p) => p - rise >= 2 && p + fall <= LOOP_LEN - 2)
    .filter((p) => buildEnd + p - rise > t + 26) // clear of the pop-in
    .sort((a, b) => a - b);

  let last = -Infinity;
  for (const p of phases) {
    const a = buildEnd + p;
    if (a - rise <= last + minGap) continue; // already reacting to a closer dot
    steps.push([a - rise, [100, 100]], [a, [peak, peak]], [a + fall, [100, 100]]);
    last = a + fall;
  }
  return steps;
}

function nodeLayer(n) {
  const t = n.pop;
  return layer({
    nm: `node-${n.id}`,
    ip: t,
    ks: {
      o: anim([[t, [0]], [t + 8, [100]]], EASE.out),
      r: stat(0),
      p: stat([n.x, n.y, 0]),
      a: stat([0, 0, 0]),
      s: anim(nodeScaleSteps(n), EASE.out),
    },
    // glyph first: earlier in the array means painted on top
    shapes: [...glyphShapes(n.glyph), ...nodeShapes(n.kind)],
  });
}

// -------------------------------------------------------------------- edges

/**
 * Cubic bezier for an edge. `bow` bends it away from whatever it has to clear.
 *
 * Every edge into a node lands on the same point, just off its left side, so a
 * fan-in reads as streams merging into one inlet rather than as separate wires
 * touching a perimeter.
 */
function edgeGeometry(e) {
  const a = byId[e.from];
  const b = byId[e.to];
  const bow = e.bow || 0;
  const p0 = [a.x + halfWidth(a.kind) + 6, a.y];
  const p3 = [b.x - halfWidth(b.kind) - 10, b.y];
  const dx = (p3[0] - p0[0]) * 0.5;
  return {
    p0,
    p1: [p0[0] + dx, p0[1] + bow],
    p2: [p3[0] - dx, p3[1] + bow],
    p3,
  };
}

function bezierAt(g, t) {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((d) => w[0] * g.p0[d] + w[1] * g.p1[d] + w[2] * g.p2[d] + w[3] * g.p3[d]);
}

/** Polyline length of the curve — used to keep the draw speed constant. */
function bezierLength(g, steps = 40) {
  let len = 0;
  let prev = bezierAt(g, 0);
  for (let i = 1; i <= steps; i++) {
    const pt = bezierAt(g, i / steps);
    len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    prev = pt;
  }
  return len;
}

/** Long edges take longer to draw, so every stroke advances at the same speed. */
function drawDuration(g) {
  return Math.round(Math.min(44, Math.max(18, bezierLength(g) / 9)));
}

function edgeLayer(e, idx) {
  const g = edgeGeometry(e);
  const start = e.draw;
  const end = start + drawDuration(g);

  // The arrowhead points along the curve's tangent at its end.
  const angle = deg(Math.atan2(g.p3[1] - g.p2[1], g.p3[0] - g.p2[0]));
  const { length: aL, halfWidth: aW } = CONFIG.arrow;
  // It lands with the node it points at, not when the stroke arrives.
  const arrowIn = Math.max(end - 4, byId[e.to].pop + 6);
  // Edges sharing a target share an endpoint and a tangent, so their heads
  // would sit exactly on top of each other: only the first one draws it.
  const drawsArrow = ARROWS && EDGES.findIndex((x) => x.to === e.to) === idx;

  return layer({
    nm: `edge-${e.from}-${e.to}`,
    ip: start,
    ks: {
      o: stat(100), r: stat(0), p: stat([0, 0, 0]), a: stat([0, 0, 0]), s: stat([100, 100, 100]),
    },
    shapes: [
      ...(drawsArrow ? [{
        ty: 'gr', nm: 'arrowhead',
        it: [
          {
            ty: 'sh', ind: 0, nm: 'tri',
            ks: stat({
              i: [[0, 0], [0, 0], [0, 0]],
              o: [[0, 0], [0, 0], [0, 0]],
              v: [[0, 0], [-aL, -aW], [-aL, aW]],
              c: true,
            }),
          },
          fill(C.arrow),
          groupTransform({
            p: stat(g.p3),
            r: stat(angle),
            o: anim([[arrowIn, [0]], [arrowIn + 9, [100]]], EASE.out),
          }),
        ],
      }] : []),
      {
        ty: 'gr', nm: `edge${idx}`,
        it: [
          {
            ty: 'sh', ind: 0, nm: 'path',
            ks: stat({
              i: [[0, 0], [g.p2[0] - g.p3[0], g.p2[1] - g.p3[1]]],
              o: [[g.p1[0] - g.p0[0], g.p1[1] - g.p0[1]], [0, 0]],
              v: [g.p0, g.p3],
              c: false,
            }),
          },
          { ty: 'tm', nm: 'draw', s: stat(0), e: anim([[start, [0]], [end, [100]]], EASE.out), o: stat(0), m: 1 },
          stroke(C.edge, 2.5),
          groupTransform(),
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------- particles

/**
 * A dot that repeatedly crosses one edge. The motion is periodic with
 * `flow.cycle` frames, and that divides the loop length, so the state at
 * frame `buildEnd` is identical to the state at `loopEnd` — which is what
 * makes the idle loop seamless. Per-edge cycles make the graph read as
 * pipes with different throughput rather than one metronome.
 */
/** Frames at which this edge launches a dot, across the whole timeline. */
function flowStarts(e, idx) {
  const { cycle } = e.flow;
  const phase = (idx * 43) % cycle;
  const starts = [];
  for (let t0 = phase; t0 <= loopEnd + cycle; t0 += cycle) starts.push(t0);
  return starts;
}

/** Frames at which this edge's dots land on their target node. */
const flowArrivals = (e, idx) => flowStarts(e, idx).map((t0) => t0 + e.flow.travel);

function particleLayer(e, idx) {
  const g = edgeGeometry(e);
  const { travel, size, cycle } = e.flow;
  const SAMPLES = 18;

  const posSteps = [];
  const opaSteps = [];
  for (const t0 of flowStarts(e, idx)) {
    for (let s = 0; s <= SAMPLES; s++) {
      // Position is sampled on an eased parameter, so the dot leaves gently
      // and accelerates into the node it feeds.
      const u = Math.pow(s / SAMPLES, CONFIG.flowEasing);
      const [x, y] = bezierAt(g, u);
      posSteps.push([Math.round(t0 + (s / SAMPLES) * travel), [x, y, 0], 'linear']);
    }
    const fade = Math.min(12, Math.round(travel * 0.16));
    opaSteps.push([t0, [0]]);
    opaSteps.push([t0 + fade, [100]]);
    opaSteps.push([t0 + travel - fade, [100]]);
    opaSteps.push([t0 + travel, [0]]);
    opaSteps.push([t0 + cycle - 1, [0]]); // hold dark until the next dot departs
  }

  return layer({
    nm: `flow-${e.from}-${e.to}`,
    ip: 150,
    ks: {
      o: anim(opaSteps, EASE.linear),
      r: stat(0),
      p: anim(posSteps, EASE.linear),
      a: stat([0, 0, 0]),
      s: stat([100, 100, 100]),
    },
    shapes: [{
      ty: 'gr', nm: 'dot',
      it: [
        { ty: 'el', p: stat([0, 0]), s: stat([size * 2, size * 2]), nm: 'dot' },
        fill(C.red), groupTransform(),
      ],
    }],
  });
}

// ----------------------------------------------------------------- assemble

// Array order is paint order, first = topmost.
const layers = [
  ...NODES.map(nodeLayer),
  ...EDGES.map(particleLayer),
  ...EDGES.map(edgeLayer),
];

const animation = {
  v: '5.9.0',
  fr: CONFIG.fps,
  ip: 0,
  op: loopEnd,
  w: W,
  h: H,
  nm: `Lineage${DARK ? ' (dark)' : ''}`,
  ddd: 0,
  assets: [],
  layers,
  markers: [
    { tm: 0, cm: 'build', dr: buildEnd },
    { tm: buildEnd, cm: 'idle', dr: LOOP_LEN },
  ],
};

const filename = DARK ? 'lineage-dark.json'
  : ARROWS ? 'lineage-arrows.json'
    : 'lineage.json';
const out = path.join(__dirname, filename);
fs.writeFileSync(out, JSON.stringify(animation));
const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`wrote ${path.basename(out)} (${kb} KB, ${layers.length} layers, ${loopEnd} frames @ ${CONFIG.fps}fps)`);
