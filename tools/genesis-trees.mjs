// Genesis tree props (map type `genesis`): five species in three sizes, straight top-down at
// 4 art px per world px on the map, drawn to the crown diameters in src/data/trees.js (GW.TREES; a test
// checks the two match). Each variant has 3 leaf-rustle frames; a snag has one. Leaning in
// the wind is a shift of the whole crown, done by the engine, so it needs no frames of its
// own. Outline and top-left light come from the pipeline (finish); the engine draws the
// shadow, further out for taller trees.
// Dead wood goes with them: cut and snapped stumps, and fallen trees drawn at 16 angles
// (each rendered at its angle with the light kept top left, never rotated afterwards).
// Frames are stored run-length encoded (see rle), since a fallen tree's frame is mostly empty.
import { C, Grid, rng, finish } from './pixelart.mjs';

// Art px per world px on the map: 4 (192 per tile, art/PIXEL_ART_RULES.md), so trees and props
// hold their detail up close (the renderer reads it from the data as `k`).
const MAP_K = 4, TAU = Math.PI * 2;
// Trees and dead wood stand at TREE_SIZE times the size their shapes are drawn at (in drawn
// world px). They are drawn at MAP_K × TREE_SIZE art px per drawn px, so on the map they still
// have MAP_K art px per world px: bigger, with the full resolution, never stretched.
const TREE_SIZE = 2, SCALED = new Set(['spruce', 'pine', 'birch', 'maple', 'snag', 'stump_cut', 'stump_broken', 'log']);
// Art px per drawn world px for what is being drawn now (set per kind by genesisTrees()).
let K = MAP_K;
export const GENESIS_SIZES = ['small', 'medium', 'large'];
export const GENESIS_CROWN = {
  spruce: [18, 28, 38], pine: [22, 34, 46], birch: [20, 30, 40], maple: [24, 40, 56], snag: [18, 26, 36]
};
export const GENESIS_KINDS = Object.keys(GENESIS_CROWN);
// Engine shadow offset in art px, by size: taller trees throw their shadow further.
export const GENESIS_SHADOW = [[6, 6], [8, 8], [12, 12]];
const VARIANTS = 2, RUSTLES = 3, MARGIN = 3;   // world px around the crown for rustled leaves and the outline
// Dead wood: sizes as in GW.TREES.props (a test checks they match); shadows sit low.
export const GENESIS_PROPS = {
  stump_cut: [{ r: 4 }, { r: 6 }], stump_broken: [{ r: 4 }, { r: 6 }],
  log: [{ length: 72, width: 6 }, { length: 108, width: 9 }],
  // Landscaping: bushes, flower patches, boulders, reeds, mushrooms and ferns.
  bush: [{ r: 7 }, { r: 10 }, { r: 13 }], flowers: [{ r: 8 }], boulder: [{ r: 7 }, { r: 11 }, { r: 15 }, { r: 21 }],
  reeds: [{ r: 9 }], mushrooms: [{ r: 6 }], fern: [{ r: 9 }, { r: 13 }],
  // Everything else a Genesis map shows: tall grass and thickets, the zone features, camp
  // leftovers, and small ground detail.
  tallgrass: [{ r: 11 }, { r: 15 }], thicket: [{ r: 16 }], mound: [{ r: 12 }], vent: [{ r: 12 }], crystal: [{ r: 10 }, { r: 14 }],
  ore: [{ r: 12 }], alien: [{ r: 10 }], logpile: [{ r: 14 }], sawhorse: [{ r: 10 }], burrow: [{ r: 9 }], rubble: [{ r: 9 }, { r: 13 }],
  tuft: [{ r: 5 }], weeds: [{ r: 5 }], pebbles: [{ r: 6 }], leaves: [{ r: 7 }], twigs: [{ r: 8 }], bones: [{ r: 6 }], puddle: [{ r: 9 }],
  // Village life: lamp posts, signposts, benches, barrels, crates, wells, fences, hay and carts.
  lamp: [{ r: 8 }], sign: [{ r: 10 }], bench: [{ r: 12 }], barrel: [{ r: 6 }], crate: [{ r: 7 }], well: [{ r: 18 }],
  fence: [{ r: 13 }], hay: [{ r: 7 }, { r: 12 }], cart: [{ r: 15 }]
};
export const LOG_ANGLES = 16;
export const PROP_SHADOW = {
  stump_cut: [3, 3], stump_broken: [3, 3], log: [4, 4], bush: [5, 5], flowers: [2, 2], boulder: [6, 6], reeds: [3, 3], mushrooms: [2, 2], fern: [3, 3],
  tallgrass: [2, 2], thicket: [5, 5], mound: [7, 7], vent: [2, 2], crystal: [5, 5], ore: [4, 4], alien: [3, 3], logpile: [4, 4], sawhorse: [4, 4],
  burrow: [2, 2], rubble: [3, 3], tuft: [1, 1], weeds: [1, 1], pebbles: [1, 1], leaves: [0, 0], twigs: [1, 1], bones: [1, 1], puddle: [0, 0],
  lamp: [6, 6], sign: [4, 4], bench: [3, 3], barrel: [3, 3], crate: [3, 3], well: [4, 4], fence: [2, 2], hay: [4, 4], cart: [4, 4]
};
const STUMP_VARIANTS = 3, LOG_VARIANTS = 2;
// Variants per landscaping prop: flower patches come in six colours; boulders 4 to 7 are mossy.
export const PROP_VARIANTS = {
  bush: 3, flowers: 6, boulder: 8, reeds: 3, mushrooms: 3, fern: 3, tallgrass: 3, thicket: 3, mound: 2, vent: 2, crystal: 3, ore: 3, alien: 3,
  logpile: 2, sawhorse: 1, burrow: 2, rubble: 3, tuft: 3, weeds: 3, pebbles: 3, leaves: 3, twigs: 3, bones: 2, puddle: 3,
  // Benches, fences and carts: 0 runs east–west, 1 north–south. Signs point 0 west or 1 east.
  lamp: 2, sign: 2, bench: 2, barrel: 3, crate: 2, well: 1, fence: 2, hay: 2, cart: 2
};

// Run-length text: a palette character, then its repeat count when it repeats (the alphabet
// has no digits, so the two never mix). src/render/trees.js expands it.
export function rle(str){
  let o = '';
  for (let i = 0; i < str.length;){ let j = i + 1; while (j < str.length && str[j] === str[i]) j++; o += str[i] + (j - i > 1 ? j - i : ''); i = j; }
  return o;
}
export const unrle = s => s.replace(/(\D)(\d+)/g, (_, ch, n) => ch.repeat(+n));

// Shapes in world px around the frame centre, rasterised only inside their bounding box
// (a tree has hundreds of shapes, so scanning the whole frame for each would be slow).
function brush(g){
  const c0 = (g.w - 1) / 2, E = 1e-6;
  const area = (x0, y0, x1, y1, test, col) => {
    const ax0 = Math.max(0, Math.floor(c0 + x0 * K)), ax1 = Math.min(g.w - 1, Math.ceil(c0 + x1 * K));
    const ay0 = Math.max(0, Math.floor(c0 + y0 * K)), ay1 = Math.min(g.h - 1, Math.ceil(c0 + y1 * K));
    for (let y = ay0; y <= ay1; y++) for (let x = ax0; x <= ax1; x++) if (test((x - c0) / K, (y - c0) / K)) g.set(x, y, C[col]);
  };
  return {
    disc(x, y, r, col){ area(x - r, y - r, x + r, y + r, (lx, ly) => (lx - x) ** 2 + (ly - y) ** 2 <= r * r + E, col); },
    // A stroke from (x0, y0) to (x1, y1) whose width runs from w0 to w1 (round ends).
    taper(x0, y0, x1, y1, w0, w1, col){
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, m = Math.max(w0, w1) / 2;
      area(Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.max(x0, x1) + m, Math.max(y0, y1) + m, (lx, ly) => {
        const t = Math.max(0, Math.min(1, ((lx - x0) * dx + (ly - y0) * dy) / L2)), ex = lx - x0 - t * dx, ey = ly - y0 - t * dy, w = (w0 + (w1 - w0) * t) / 2;
        return ex * ex + ey * ey <= w * w + E;
      }, col);
    },
    line(x0, y0, x1, y1, w, col){ this.taper(x0, y0, x1, y1, w, w, col); },
    // A clump of leaves seen from above: rounded, lit on its upper left, shaded on its lower
    // right, one shade either way of `col` on the foliage ramp.
    clump(x, y, rr, col){
      const t = LEAF_RAMP.indexOf(col), lit = LEAF_RAMP[Math.min(LEAF_RAMP.length - 1, t + 1)], dark = LEAF_RAMP[Math.max(0, t - 1)];
      this.paint(x - rr, y - rr, x + rr, y + rr, (px, py) => {
        const dx = px - x, dy = py - y, d = Math.hypot(dx, dy);
        if (d > rr) return null;
        const l = -(dx + dy) / (rr * 1.41);   // towards the light
        return l > 0.35 && d < rr * 0.8 ? lit : l < -0.45 && d > rr * 0.5 ? dark : col;
      });
    },
    // Any shape: `fn(x, y)` returns a colour name for the point, or nothing.
    paint(x0, y0, x1, y1, fn){
      const ax0 = Math.max(0, Math.floor(c0 + x0 * K)), ax1 = Math.min(g.w - 1, Math.ceil(c0 + x1 * K));
      const ay0 = Math.max(0, Math.floor(c0 + y0 * K)), ay1 = Math.min(g.h - 1, Math.ceil(c0 + y1 * K));
      for (let y = ay0; y <= ay1; y++) for (let x = ax0; x <= ax1; x++){ const col = fn((x - c0) / K, (y - c0) / K); if (col) g.set(x, y, C[col]); }
    }
  };
}
const polar = (a, d) => [Math.cos(a) * d, Math.sin(a) * d];
const LEAF_RAMP = ['leaf0', 'leaf1', 'leaf2', 'grass2', 'grass3'];

// Crowns of radius R (world px). Flat mid-tones; the pipeline adds edge light and outline.
const DRAW = {
  // White spruce: a tight, regular star in tiers, darkest at the outer (lowest) whorl and
  // lighter towards the tip in the middle, which is the highest point.
  spruce(b, r, R){
    b.disc(0, 0, R * 0.6, 'leaf0');
    for (const [f, col] of [[1, 'leaf0'], [0.76, 'leaf1'], [0.52, 'leaf1'], [0.3, 'leaf2']]){
      const n = Math.max(6, Math.round(R * f * 1.25)), turn = r();
      for (let i = 0; i < n; i++){
        const a = ((i + turn) / n) * TAU + (r() - 0.5) * 0.25, len = R * f * (0.86 + r() * 0.14), [ex, ey] = polar(a, len);
        b.taper(0, 0, ex, ey, Math.max(1.6, R * f * 0.34), 0.5, col);
        // Needles along the outer whorl: short side strokes.
        if (f === 1) for (let k = 0.45; k < 0.95; k += 0.16) for (const sd of [-1, 1]){
          const [bx, by] = polar(a, len * k), [nx, ny] = polar(a + sd * 0.8, 1.6 * (1.1 - k));
          b.line(bx, by, bx + nx, by + ny, 0.5, 'leaf0');
        }
      }
    }
    b.disc(0, 0, Math.max(0.8, R * 0.09), 'leaf2');
    b.disc(-0.4, -0.4, 0.5, 'grass3');
  },
  // Jack pine: an open, ragged crown of separate needle tufts on bare branches, with ground
  // showing between them.
  pine(b, r, R){
    const n = Math.round(4 + R / 7), tufts = [[0, 0, R * 0.3]];
    for (let i = 0; i < n; i++){
      const a = (i / n) * TAU + r() * 0.6, tr = R * (0.24 + r() * 0.1), d = Math.min(R - tr * 1.1, R * (0.45 + r() * 0.3));
      tufts.push([...polar(a, d), tr]);
    }
    for (const [x, y] of tufts.slice(1)) b.taper(0, 0, x, y, Math.max(1, R * 0.07), 0.6, 'char1');
    for (const [x, y, tr] of tufts){
      b.disc(x, y, tr * 0.78, 'leaf0');
      const m = 12 + Math.floor(r() * 4), turn = r();
      for (let k = 0; k < m; k++){ const a = ((k + turn) / m) * TAU, [ex, ey] = polar(a, tr * (0.85 + r() * 0.25)); b.line(x, y, x + ex, y + ey, 0.6, 'leaf1'); }
      for (let k = 0; k < 6; k++){ const a = r() * TAU, [ex, ey] = polar(a, tr * 0.5); b.line(x, y, x + ex, y + ey, 0.5, 'leaf2'); }
      b.disc(x - tr * 0.2, y - tr * 0.2, 0.6, 'grass3');
    }
  },
  // Paper birch: small, airy, light leaf clusters on pale twigs.
  birch(b, r, R){
    for (let i = 0; i < 5; i++){ const [ex, ey] = polar(r() * TAU, R * 0.55); b.line(0, 0, ex, ey, 0.6, 'dust5'); }
    const n = Math.round(6 + R / 2.6);
    for (let i = 0; i < n; i++){
      // Two in three clusters make the outer ring, so the crown reaches its full width.
      const a = (i / n) * TAU + r() * 0.5, cr = R * (0.2 + r() * 0.08), d = i % 3 < 2 ? (R - cr) * (0.88 + r() * 0.12) : R * (0.15 + r() * 0.4), [x, y] = polar(a, d);
      b.clump(x, y, cr, 'leaf2');
      b.clump(x - cr * 0.25, y - cr * 0.25, cr * 0.55, 'grass2');
      b.disc(x + cr * 0.45, y + cr * 0.45, cr * 0.3, 'leaf1');
      b.disc(x - cr * 0.4, y - cr * 0.4, 0.6, 'grass3');
      for (let k = 0; k < 3; k++) b.disc(x + (r() - 0.5) * cr * 1.4, y + (r() - 0.5) * cr * 1.4, 0.5, r() < 0.4 ? 'leaf1' : 'grass3');
    }
  },
  // Sugar maple: a big, dense, billowing crown with a scalloped edge, lit leaf clumps and
  // dark gaps.
  maple(b, r, R){
    b.disc(0, 0, R * 0.72, 'leaf1');
    const n = Math.round(7 + R / 6);
    for (let i = 0; i < n; i++){
      const a = (i / n) * TAU + r() * 0.4, lr = R * (0.24 + r() * 0.08), [x, y] = polar(a, Math.min(R - lr, R * (0.56 + r() * 0.12)));
      b.clump(x, y, lr, 'leaf1');
    }
    for (let i = 0; i < Math.round(R * 1.4); i++){ const [x, y] = polar(r() * TAU, r() * R * 0.72); b.clump(x, y, R * (0.08 + r() * 0.07), 'leaf2'); }
    for (let i = 0; i < Math.round(R * 0.9); i++){ const [x, y] = polar(r() * TAU, r() * R * 0.8); b.disc(x, y, Math.max(0.5, R * (0.03 + r() * 0.03)), 'leaf0'); }
    b.disc(-R * 0.26, -R * 0.26, R * 0.2, 'leaf2');
    for (let i = 0; i < Math.round(R * 0.5); i++){ const [x, y] = polar(r() * TAU, r() * R * 0.6); b.disc(x - R * 0.1, y - R * 0.1, 0.5, 'grass3'); }
  },
  // Dead snag: bare grey branches forking out from a broken trunk top.
  snag(b, r, R){
    const m = 5 + Math.floor(r() * 3), w0 = Math.max(1.4, R * 0.1);
    for (let i = 0; i < m; i++){
      const a = (i / m) * TAU + r() * 0.5, len = R * (0.72 + r() * 0.26), [ex, ey] = polar(a, len);
      b.taper(0, 0, ex, ey, w0, 0.6, 'char1');
      for (const sd of [-1, 1]) if (r() < 0.75){
        const t = 0.4 + r() * 0.3, [fx, fy] = polar(a, len * t), [gx, gy] = polar(a + sd * (0.5 + r() * 0.3), len * (1 - t) * 0.8);
        b.taper(fx, fy, fx + gx, fy + gy, w0 * 0.55, 0.5, 'char1');
      }
    }
    b.disc(0, 0, R * 0.17, 'dust1');
    b.disc(0.3, 0.3, R * 0.08, 'dust0');
  }
};

// Fine foliage for art drawn at 4 px per world px: the crown's flat areas broken into small
// leaf clusters (a few art px each), lit on the upper left and shaded on the lower right, so
// a crown has texture up close instead of smooth discs. Edges are left alone (the outline and
// rustle work from them).
const FOLIAGE = { maple: 1, birch: 1, pine: 0.6, spruce: 0.45 };
const RAMP = ['leaf0', 'leaf1', 'leaf2', 'grass2', 'grass3'];
function foliage(g, kind, seed){
  const amt = FOLIAGE[kind];
  if (!amt || K < 4) return;
  const r = rng(seed * 7 + 31), N = g.w, idx = new Map(RAMP.map((k, i) => [C[k], i])), o = g.clone();
  const inside = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!g.get(x + dx, y + dy)) return false; return true; };
  const n = Math.round(N * N * 0.05 * amt);
  for (let i = 0; i < n; i++){
    const x = 2 + Math.floor(r() * (N - 4)), y = 2 + Math.floor(r() * (N - 4)), c = g.get(x, y), t = idx.get(c);
    if (t === undefined || !inside(x, y)) continue;
    // A cluster: 2–3 px across, lighter at its upper left, darker at its lower right.
    const w = 2 + Math.floor(r() * 2), lit = RAMP[Math.min(4, t + 1)], dark = RAMP[Math.max(0, t - 1)];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < w; dx++) if (idx.has(g.get(x + dx, y + dy))) o.set(x + dx, y + dy, C[dy === 0 && dx < w - 1 ? lit : dx === w - 1 && dy === 1 ? dark : RAMP[t]]);
    if (idx.has(g.get(x + w, y + 2))) o.set(x + w, y + 2, C[dark]);   // its shadow
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.set(x, y, o.get(x, y));
}

// Leaf rustle: step 0 is the crown as drawn; steps 1 and 2 drop some edge leaves, grow others
// just outside, in K × K clumps, and catch the light in different places.
function rustle(g, kind, seed, step){
  if (!step) return g;
  const o = g.clone(), r = rng(seed * 13 + step * 977), N = g.w;
  const glint = kind === 'birch' ? C.grass3 : C.leaf2, leaf = kind === 'spruce' ? C.leaf0 : kind === 'birch' ? C.leaf2 : C.leaf1;
  const edge = [], outside = [], isEdge = new Uint8Array(N * N);
  for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++){
    const v = g.get(x, y), near = g.get(x - 1, y) && g.get(x + 1, y) && g.get(x, y - 1) && g.get(x, y + 1);
    if (v && !near){ edge.push(y * N + x); isEdge[y * N + x] = 1; }
    else if (!v && (g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1))) outside.push(y * N + x);
  }
  const pick = list => list[Math.floor(r() * list.length)], moves = Math.max(4, Math.round(edge.length / 30));
  for (let i = 0; i < moves; i++){
    const p = pick(edge), x = p % N, y = (p / N) | 0;
    for (let a = 0; a < K; a++) for (let c = 0; c < K; c++) if (isEdge[(y + c) * N + x + a]) o.set(x + a, y + c, 0);
  }
  for (let i = 0; i < moves; i++){
    const p = pick(outside), x = p % N, y = (p / N) | 0;
    for (let a = 0; a < K; a++) for (let c = 0; c < K; c++) if (!g.get(x + a, y + c) && x + a < N - 2 && y + c < N - 2) o.set(x + a, y + c, leaf);
  }
  for (let i = 0; i < moves; i++){
    const x = Math.floor(N * (0.2 + r() * 0.6)), y = Math.floor(N * (0.2 + r() * 0.6)), v = o.get(x, y);
    if (v && v !== C.leaf0 && v !== C.char1 && v !== C.dust5){ o.set(x, y, glint); if (o.get(x + 1, y) && o.get(x + 1, y) !== C.leaf0) o.set(x + 1, y, glint); }
  }
  return o;
}

export const frameSize = d => 2 * K * Math.ceil(d / 2 + MARGIN);
function variantFrames(kind, z, v){
  const d = GENESIS_CROWN[kind][z], N = frameSize(d), seed = 701 + GENESIS_KINDS.indexOf(kind) * 131 + z * 17 + v * 5;
  const g = new Grid(N, N);
  DRAW[kind](brush(g), rng(seed), d / 2);
  foliage(g, kind, seed);
  const steps = kind === 'snag' ? 1 : RUSTLES;
  return { n: N, frames: Array.from({ length: steps }, (_, s) => {
    const f = rustle(g, kind, seed, s);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (x === 0 || y === 0 || x === N - 1 || y === N - 1) f.set(x, y, 0);
    return finish(f);
  }) };
}

// ---- Dead wood ----
// Roots spreading from a stump's foot, under the bark ring.
function roots(b, r, R, n){
  for (let i = 0; i < n; i++){ const a = (i / n) * TAU + r() * 0.6, [ex, ey] = polar(a, R * (1.2 + r() * 0.35)); b.taper(0, 0, ex, ey, R * 0.95, 1.6, 'dust1'); }
}
// A real-looking rock seen from above at (cx, cy), about R world px across its long axis: an
// irregular outline (7–10 corners at uneven distances, stretched and turned), broken into
// facets that meet at a ridge nudged towards the upper left, each facet shaded by which way
// it faces (lit to the upper left, in shade to the lower right), with a flat top, cracks
// running from the ridge, pits, and moss or lichen on some. `stone` picks the colours:
// 'granite' (grey), 'slate' (blue-grey), 'sand' (brown) or 'ore' (rusty with bright seams).
const STONE = {
  granite: ['steel1', 'steel2', 'plate0', 'plate1', 'plate2'],
  slate: ['steel0', 'steel1', 'steel2', 'plate0', 'plate1'],
  sand: ['dust1', 'dust2', 'dust3', 'dust4', 'dust5'],
  ore: ['rust0', 'rust1', 'rust2', 'dust4', 'dust5']
};
function rock(b, r, cx, cy, R, { stone = 'granite', moss = 0, lichen = 0.3 } = {}){
  const n = 7 + Math.floor(r() * 4), rot = r() * TAU, stretch = 0.62 + r() * 0.38, pts = [];
  for (let i = 0; i < n; i++){
    const a = (i + (r() - 0.5) * 0.6) / n * TAU, d = R * (0.68 + r() * 0.4);
    const x = Math.cos(a) * d, y = Math.sin(a) * d * stretch;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  pts.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
  const rx = cx - R * (0.12 + r() * 0.12), ry = cy - R * (0.12 + r() * 0.12), top = R * (0.18 + r() * 0.2);
  const inside = (x, y) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++){ const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const ramp = STONE[stone], seed = r() * 1000, tones = pts.map(() => (r() - 0.5) * 0.35);
  const cracks = Array.from({ length: 1 + Math.floor(r() * 3) }, () => { const p = pts[Math.floor(r() * n)]; return [p[0] * 0.9 + rx * 0.1, p[1] * 0.9 + ry * 0.1]; });
  b.paint(cx - R * 1.2, cy - R * 1.2, cx + R * 1.2, cy + R * 1.2, (x, y) => {
    if (!inside(x, y)) return null;
    // Which facet: the wedge of the outline this point is in, seen from the ridge.
    const ang = Math.atan2(y - ry, x - rx);
    let k = 0, best = 9;
    for (let i = 0; i < n; i++){ const e0 = pts[i], e1 = pts[(i + 1) % n], mid = Math.atan2((e0[1] + e1[1]) / 2 - ry, (e0[0] + e1[0]) / 2 - rx), dd = Math.abs(Math.atan2(Math.sin(ang - mid), Math.cos(ang - mid))); if (dd < best){ best = dd; k = i; } }
    const e0 = pts[k], e1 = pts[(k + 1) % n], ox = (e0[0] + e1[0]) / 2 - rx, oy = (e0[1] + e1[1]) / 2 - ry, ol = Math.hypot(ox, oy) || 1;
    const dr = Math.hypot(x - rx, y - ry);
    let v = 0.5 - (ox + oy) / ol * 0.42 + tones[k] + Math.max(0, 1 - dr / (top * 2.2)) * 0.14;   // facing the upper left = lit; lighter near the ridge
    const grain = Math.sin((x * 0.7 + y * 0.4) + seed) * Math.sin((x * 0.3 - y * 0.8) + seed * 1.3);
    v += grain * 0.07;
    if (cracks.some(([qx, qy]) => { const vx = qx - rx, vy = qy - ry, l2 = vx * vx + vy * vy, t = Math.max(0, Math.min(1, ((x - rx) * vx + (y - ry) * vy) / l2)); return t > 0.25 && Math.hypot(x - rx - t * vx, y - ry - t * vy) < 0.35; })) return ramp[0];
    const mp = Math.sin(x * 0.38 + seed) * Math.sin(y * 0.45 + seed * 0.7) + Math.sin(x * 0.9 - y * 0.7 + seed) * 0.25;
    if (moss && (y - ry) + (x - rx) > -R * 0.2 && mp > 1 - moss * 1.1) return mp > 1.05 - moss * 0.6 ? 'grass1' : 'leaf1';
    if (lichen && Math.sin(x * 0.55 + seed * 2) * Math.sin(y * 0.5 - seed) + Math.sin(x * 1.3 + y * 1.1) * 0.2 > 1.12 - lichen * 0.3) return stone === 'sand' ? 'dust5' : 'plate1';
    return ramp[Math.max(0, Math.min(4, Math.round(v * 4.2)))];
  });
}
const PROP_DRAW = {
  // Sawn flat: a pale cut face with growth rings inside a dark bark ring.
  stump_cut(b, r, { r: R }){
    roots(b, r, R, 4 + Math.floor(r() * 3));
    b.disc(0, 0, R, 'dust1');
    b.disc(0, 0, R * 0.8, 'dust4');
    const rings = [0.55, 0.3].map(f => f * R * (0.9 + r() * 0.2)), ox = (r() - 0.5) * R * 0.2, oy = (r() - 0.5) * R * 0.2;
    b.paint(-R, -R, R, R, (x, y) => { const d = Math.hypot(x - ox, y - oy); return d < R * 0.78 && rings.some(q => Math.abs(d - q) < 0.3) ? 'dust3' : null; });
    b.disc(ox, oy, 0.5, 'dust2');
    const [cx, cy] = polar(r() * TAU, R * 0.75); b.line(ox, oy, cx, cy, 0.5, 'dust2');   // a drying crack
    if (r() < 0.5){ const [mx, my] = polar(r() * TAU, R * 0.95); b.disc(mx, my, R * 0.25, 'leaf1'); }
  },
  // Snapped by the wind: splinters standing up around a dark, rotten heart.
  stump_broken(b, r, { r: R }){
    roots(b, r, R, 4 + Math.floor(r() * 3));
    b.disc(0, 0, R, 'dust1');
    const n = 7 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++){ const a = (i / n) * TAU + r() * 0.4, [ex, ey] = polar(a, R * (0.2 + r() * 0.75)); b.taper(0, 0, ex, ey, R * 0.45, 0.5, r() < 0.5 ? 'dust4' : 'dust5'); }
    b.disc((r() - 0.5) * R * 0.3, (r() - 0.5) * R * 0.3, R * 0.28, 'char1');
    if (r() < 0.6){ const [mx, my] = polar(r() * TAU, R * 0.9); b.disc(mx, my, R * 0.3, 'grass2'); }
  },
  // A fallen tree lying along angle `a`: the torn-up root plate at one end, a trunk lit on its
  // top-left side and tapering, branch stubs, and the dead crown's bare branches at the other.
  log(b, r, { length: L, width: w }, a){
    const ux = Math.cos(a), uy = Math.sin(a), at = (s, p = 0) => [ux * s - uy * p, uy * s + ux * p];
    const s0 = -L / 2 + w * 1.3, s1 = L * 0.22, lit = (Math.sin(a) - Math.cos(a)) / Math.SQRT2;   // n · (top-left light)
    const E = L / 2 + w;
    // Crown end first, so the trunk lies over its branch bases.
    const [tx, ty] = at(L / 2 - 2);
    b.taper(...at(s1), tx, ty, w * 0.5, 0.8, 'dust1');
    for (let i = 0, n = 7 + Math.floor(r() * 4); i < n; i++){
      const s = s1 - L * 0.1 + r() * (L / 2 - s1 + L * 0.05), side = i % 2 ? 1 : -1, ba = a + side * (0.45 + r() * 0.6), len = w * (1.2 + r() * 1.4);
      const [bx, by] = at(s), ex = bx + Math.cos(ba) * len, ey = by + Math.sin(ba) * len;
      b.taper(bx, by, ex, ey, Math.max(1, w * 0.18), 0.5, 'char1');
      if (r() < 0.35) b.disc(ex, ey, 0.9 + r() * 0.8, 'leaf0');   // needles that still hang on
    }
    // Root plate: soil and roots torn up with the tree.
    const [rx, ry] = at(-L / 2 + w * 1.2);
    for (let i = 0, n = 8; i < n; i++){ const ra = a + Math.PI + (i / (n - 1) - 0.5) * 2.6, [ex, ey] = [rx + Math.cos(ra) * w * (1.2 + r() * 0.7), ry + Math.sin(ra) * w * (1.2 + r() * 0.7)]; b.taper(rx, ry, ex, ey, w * 0.35, 0.6, 'char1'); }
    b.disc(rx, ry, w * 1.05, 'dust0');
    for (let i = 0; i < 5; i++) b.disc(rx + (r() - 0.5) * w * 1.3, ry + (r() - 0.5) * w * 1.3, w * 0.22, r() < 0.5 ? 'dust1' : 'char1');
    // Trunk, shaded across its width: lit top-left side, dark far side.
    b.paint(-E, -E, E, E, (x, y) => {
      const s = x * ux + y * uy, p = -x * uy + y * ux;
      if (s < s0 || s > s1) return null;
      const hw = w / 2 * (1 - 0.35 * (s - s0) / (s1 - s0)), q = p / hw;
      if (Math.abs(q) > 1) return null;
      const l = q * lit;
      return l > 0.35 ? 'dust3' : l < -0.4 ? 'dust0' : 'dust2';
    });
    // Bark grooves along the trunk, moss, and a few snapped branch stubs.
    for (let i = 0; i < Math.round(L / 9); i++){ const s = s0 + r() * (s1 - s0 - 4), p = (r() - 0.5) * w * 0.5; b.line(...at(s, p), ...at(s + 2 + r() * 4, p), 0.5, 'dust1'); }
    for (let i = 0; i < 3; i++){ const s = s0 + r() * (s1 - s0), [mx, my] = at(s, (r() - 0.5) * w * 0.4); b.disc(mx, my, w * (0.15 + r() * 0.1), r() < 0.5 ? 'leaf1' : 'grass2'); }
    for (let i = 0; i < 3; i++){ const s = s0 + (0.3 + r() * 0.6) * (s1 - s0), side = r() < 0.5 ? -1 : 1, [bx, by] = at(s, side * w * 0.45); b.taper(bx, by, ...at(s + w * 0.4, side * w * 0.95), 1.4, 0.8, 'char1'); }
  }
};
// Half a frame, in world px: a fallen tree's branches reach up to 2.6 trunk widths past its tip.
// Flowers: petal colour by variant (existing palette colours only).
const PETALS = ['amber2', 'white', 'red1', 'cyan2', 'gold1', 'plate2'];
Object.assign(PROP_DRAW, {
  // A leafy bush: overlapping leaf clumps, lit on top, some with red berries.
  bush(b, r, { r: R }, a, v){
    const n = 5 + Math.floor(R / 3);
    b.disc(0, 0, R * 0.7, 'leaf1');
    for (let i = 0; i < n; i++){ const [x, y] = polar((i / n) * TAU + r() * 0.5, R * (0.45 + r() * 0.2)); b.disc(x, y, R * (0.3 + r() * 0.12), 'leaf1'); }
    for (let i = 0; i < n + 3; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.6); b.disc(x - R * 0.1, y - R * 0.1, R * (0.14 + r() * 0.08), 'leaf2'); }
    for (let i = 0; i < n; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.7); b.disc(x, y, 0.6, r() < 0.5 ? 'leaf0' : 'grass3'); }
    if (v === 2) for (let i = 0; i < 6; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.7); b.disc(x, y, 0.8, 'red1'); }
  },
  // A patch of wildflowers: blossoms of four petals round a golden eye, among a few leaves.
  flowers(b, r, { r: R }, a, v){
    for (let i = 0; i < 8; i++){ const [x, y] = polar(r() * TAU, r() * R); b.line(x, y, x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, 0.8, r() < 0.5 ? 'grass2' : 'grass3'); }
    const c = PETALS[v % PETALS.length];
    for (let i = 0, n = 5 + Math.floor(r() * 4); i < n; i++){
      const [x, y] = polar(r() * TAU, r() * R * 0.85);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) b.disc(x + dx * 0.9, y + dy * 0.9, 0.7, c);
      b.disc(x, y, 0.5, c === 'amber2' || c === 'gold1' ? 'amber0' : 'amber2');
    }
  },
  // A boulder: a lumpy stone, lit top left, with a crack; mossy ones carry moss on top.
  // Boulders: a main stone and often a smaller one or two beside it, in granite, slate or
  // sandstone; variants 4 and up are mossy.
  boulder(b, r, { r: R }, a, v){
    const stone = ['granite', 'slate', 'granite', 'sand'][v & 3], moss = v >= 4 ? 0.7 : 0.05;
    rock(b, r, 0, 0, R * 0.82, { stone, moss });
    if (r() < 0.7){ const [x, y] = polar(r() * TAU, R * 0.72); rock(b, r, x, y, R * (0.28 + r() * 0.16), { stone, moss }); }
    if (R > 12 && r() < 0.6){ const [x, y] = polar(r() * TAU, R * 0.8); rock(b, r, x, y, R * (0.18 + r() * 0.12), { stone, moss }); }
  },
  // Reeds: a dense clump of upright blades seen from above (short strokes, lighter tips),
  // leaning out a little, with brown cattail heads among them.
  reeds(b, r, { r: R }){
    b.disc(0, 0, R * 0.55, 'grass1');
    for (let i = 0, n = 26; i < n; i++){
      const [x, y] = polar(r() * TAU, Math.sqrt(r()) * R * 0.8), [lx, ly] = polar(Math.atan2(y, x) + (r() - 0.5) * 0.6, 1.5 + r() * 2);
      b.line(x, y, x + lx, y + ly, 0.6, r() < 0.4 ? 'grass3' : 'grass2');
    }
    for (let i = 0, n = 4 + Math.floor(r() * 3); i < n; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.7); b.disc(x, y, 1.1, 'rust1'); b.disc(x - 0.4, y - 0.4, 0.4, 'rust2'); }
  },
  // Mushrooms: a cluster of caps, some red with white spots.
  mushrooms(b, r, { r: R }, a, v){
    for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++){
      const [x, y] = polar(r() * TAU, r() * R * 0.7), cr = 1.2 + r() * 1.3, c = v === 0 ? 'red1' : v === 1 ? 'rust2' : 'plate2';
      b.disc(x, y, cr, c);
      if (v === 0) b.disc(x - 0.4, y - 0.4, 0.45, 'white');
      else b.disc(x - cr * 0.3, y - cr * 0.3, 0.5, v === 1 ? 'amber1' : 'white');
    }
  },
  // A fern: fronds radiating from the middle, leaflets along each.
  fern(b, r, { r: R }){
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++){
      const ang = (i / n) * TAU + r() * 0.4, len = R * (0.75 + r() * 0.25), [ex, ey] = polar(ang, len);
      b.line(0, 0, ex, ey, 0.6, 'leaf1');
      for (let s = 0.2; s < 1; s += 0.14) for (const sd of [-1, 1]){
        const [bx, by] = polar(ang, len * s), [lx, ly] = polar(ang + sd * 1.1, 2.4 * (1.05 - s));
        b.line(bx, by, bx + lx, by + ly, 0.6, s < 0.6 ? 'leaf2' : 'grass3');
      }
    }
  }
});
Object.assign(PROP_DRAW, {
  // Tall grass: a dense clump whose blades spread out from the middle and bend over, lit tips.
  tallgrass(b, r, { r: R }){
    b.disc(0, 0, R * 0.55, 'grass1');
    for (let i = 0, n = Math.round(R * 3.2); i < n; i++){
      const a0 = r() * TAU, d0 = Math.sqrt(r()) * R * 0.45, [x, y] = polar(a0, d0), [lx, ly] = polar(a0 + (r() - 0.5) * 0.9, R * (0.3 + r() * 0.3));
      b.taper(x, y, x + lx, y + ly, 1.1, 0.5, r() < 0.3 ? 'grass3' : 'grass2');
    }
    for (let i = 0; i < 3; i++){ const [x, y] = polar(r() * TAU, R * (0.5 + r() * 0.3)); b.disc(x, y, 0.7, 'dust5'); }
  },
  // A thicket: a tangle of dark leaves and thorny stems, some with berries.
  thicket(b, r, { r: R }, a, v){
    b.disc(0, 0, R * 0.75, 'leaf0');
    for (let i = 0; i < 9; i++){ const [x, y] = polar(r() * TAU, R * (0.3 + r() * 0.35)); b.disc(x, y, R * (0.25 + r() * 0.12), r() < 0.6 ? 'leaf1' : 'leaf0'); }
    for (let i = 0; i < 10; i++){ const [x, y] = polar(r() * TAU, R * 0.85), [ex, ey] = polar(r() * TAU, R * 0.5); b.line(x, y, x * 0.4 + ex * 0.3, y * 0.4 + ey * 0.3, 0.5, 'char1'); }
    for (let i = 0; i < 14; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.7); b.disc(x - 1, y - 1, R * 0.08, 'leaf2'); }
    if (v !== 1) for (let i = 0; i < 7; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.7); b.disc(x, y, 0.7, v ? 'red1' : 'cyan0'); }
  },
  // A termite mound: a tall earthen cone seen from above, lit top left, with vent holes.
  mound(b, r, { r: R }){
    b.disc(0, 0, R, 'dust2');
    b.disc(-R * 0.15, -R * 0.15, R * 0.7, 'dust3');
    b.disc(-R * 0.25, -R * 0.25, R * 0.4, 'dust4');
    for (let i = 0; i < 5; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.8); b.disc(x, y, 0.8, 'dust0'); }
    for (let i = 0; i < 3; i++){ const [x, y] = polar(r() * TAU, R * (0.8 + r() * 0.2)); b.disc(x, y, R * 0.25, 'dust1'); }
  },
  // A steam vent: a ring of pale mineral crust round a dark hole.
  vent(b, r, { r: R }){
    b.disc(0, 0, R, 'dust4');
    for (let i = 0; i < 8; i++){ const [x, y] = polar((i / 8) * TAU + r() * 0.4, R * 0.75); b.disc(x, y, R * 0.3, r() < 0.5 ? 'dust5' : 'plate1'); }
    b.disc(0, 0, R * 0.45, 'char1'); b.disc(0.5, 0.5, R * 0.3, 'char0');
    for (let i = 0; i < 4; i++){ const [x, y] = polar(r() * TAU, R * 0.6); b.disc(x, y, 0.7, 'amber1'); }
  },
  // Crystals: glassy shards pointing out from a cluster, glowing faintly.
  crystal(b, r, { r: R }){
    for (let i = 0, n = 5 + Math.floor(r() * 3); i < n; i++){
      const [ex, ey] = polar(r() * TAU, R * (0.5 + r() * 0.5));
      b.taper(0, 0, ex, ey, R * 0.35, 0.8, 'cyan0');
      b.taper(-0.6, -0.6, ex * 0.8 - 0.6, ey * 0.8 - 0.6, R * 0.15, 0.5, 'cyan1');
    }
    b.disc(0, 0, R * 0.2, 'cyan2');
  },
  // A mineral outcrop: rusty, broken rocks with bright seams.
  ore(b, r, { r: R }){
    rock(b, r, -R * 0.15, 0, R * 0.62, { stone: 'ore', lichen: 0 });
    const [x, y] = polar(r() * TAU, R * 0.5); rock(b, r, x, y, R * 0.38, { stone: 'ore', lichen: 0 });
    for (let i = 0; i < 4; i++){ const [x, y] = polar(r() * TAU, R * 0.45); b.line(x * 0.3, y * 0.3, x, y, 0.6, r() < 0.5 ? 'amber1' : 'gold1'); }
  },
  // Alien plants: dark stems with glowing bulbs.
  alien(b, r, { r: R }){
    for (let i = 0, n = 6; i < n; i++){
      const [ex, ey] = polar((i / n) * TAU + r(), R * (0.6 + r() * 0.4));
      b.taper(0, 0, ex, ey, 1.4, 0.5, 'steel1');
      b.disc(ex, ey, 1.2, 'cyan1'); b.disc(ex - 0.3, ey - 0.3, 0.5, 'cyan2');
    }
    b.disc(0, 0, R * 0.2, 'steel2');
  },
  // A pile of sawn logs, their cut ends showing rings.
  logpile(b, r, { r: R }){
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++){
      const x = (k - (3 - row) / 2) * 5.2, y = (row - 1) * 4.5 - row * 0.5;
      b.line(x - 6, y, x + 6, y, 4, 'dust1'); b.line(x - 6, y - 1, x + 6, y - 1, 1, 'dust3');
      b.disc(x - 6, y, 2.2, 'dust4'); b.disc(x - 6, y, 1, 'dust2');
    }
  },
  // A sawhorse: two crossed legs at each end and a beam.
  sawhorse(b, r, { r: R }){
    b.line(-R * 0.8, 0, R * 0.8, 0, 2.4, 'dust2');
    for (const x of [-R * 0.6, R * 0.6]){ b.line(x - 2, -4, x + 2, 4, 1.2, 'dust1'); b.line(x + 2, -4, x - 2, 4, 1.2, 'dust1'); }
    b.line(-R * 0.8, -0.8, R * 0.8, -0.8, 0.6, 'dust4');
  },
  // An animal burrow: a mound of turned earth round a dark hole.
  burrow(b, r, { r: R }){
    b.disc(0, 0, R * 0.9, 'dust1');
    for (let i = 0; i < 6; i++){ const [x, y] = polar(r() * TAU, R * 0.7); b.disc(x, y, R * 0.25, 'dust2'); }
    b.disc(0, 1, R * 0.4, 'char0');
  },
  // Rubble: broken stone and brick among the grass.
  rubble(b, r, { r: R }){
    for (let i = 0, n = Math.round(R * 0.55); i < n; i++){
      const [x, y] = polar(r() * TAU, r() * R * 0.75), w = 1.2 + r() * 2.4;
      if (r() < 0.3) b.paint(x - w, y - w, x + w, y + w, (px, py) => Math.abs(px - x) < w && Math.abs(py - y) < w * 0.55 ? (py < y - w * 0.3 ? 'rust2' : 'rust1') : null);   // a brick
      else rock(b, r, x, y, w, { stone: r() < 0.6 ? 'granite' : 'sand', lichen: 0 });
    }
  },
  tuft(b, r, { r: R }){ for (let i = 0; i < 9; i++){ const [ex, ey] = polar(-Math.PI / 2 + (r() - 0.5) * 2.4, R * (0.6 + r() * 0.4)); b.line(0, 1, ex, ey + 1, 0.6, r() < 0.4 ? 'grass3' : 'grass2'); } },
  weeds(b, r, { r: R }){ for (let i = 0; i < 5; i++){ const [ex, ey] = polar(r() * TAU, R * 0.8); b.line(0, 0, ex, ey, 0.6, 'leaf2'); b.disc(ex, ey, 1, 'grass3'); } },
  pebbles(b, r, { r: R }){ for (let i = 0; i < 6; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.8), w = 0.9 + r() * 1.3; rock(b, r, x, y, w, { stone: ['granite', 'sand', 'slate'][Math.floor(r() * 3)], lichen: 0 }); } },
  leaves(b, r, { r: R }){ for (let i = 0; i < 9; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.8), [lx, ly] = polar(r() * TAU, 1.2); b.taper(x - lx, y - ly, x + lx, y + ly, 1.3, 0.5, ['amber1', 'rust2', 'gold0', 'amber0'][i % 4]); } },
  twigs(b, r, { r: R }){ for (let i = 0; i < 3; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.4), [lx, ly] = polar(r() * TAU, R * (0.5 + r() * 0.4)); b.line(x - lx, y - ly, x + lx, y + ly, 0.8, 'dust1'); b.line(x, y, x + ly * 0.4, y - lx * 0.4, 0.6, 'dust1'); } },
  bones(b, r, { r: R }){ for (let i = 0; i < 2; i++){ const [lx, ly] = polar(r() * TAU, R * 0.7), ox = (r() - 0.5) * 3, oy = (r() - 0.5) * 3; b.line(ox - lx, oy - ly, ox + lx, oy + ly, 1, 'plate2'); b.disc(ox - lx, oy - ly, 1, 'plate2'); b.disc(ox + lx, oy + ly, 1, 'plate2'); } },
  // A lamp post seen from above: a stone foot, the iron hood and its four lit panes.
  lamp(b, r, spec, a, v){
    b.disc(0, 0, 4.2, 'plate0'); b.disc(-0.8, -0.8, 2, 'plate1');
    b.paint(-3.5, -3.5, 3.5, 3.5, (x, y) => Math.abs(x) < 3.2 && Math.abs(y) < 3.2 ? (Math.abs(x) < 0.8 || Math.abs(y) < 0.8 ? 'steel0' : v ? 'amber1' : 'amber2') : null);
    b.disc(0, 0, 1.1, 'char0');
  },
  // A signpost: a post and a pointed board with lettering.
  sign(b, r, spec, a, v){
    const d = v ? 1 : -1;
    b.paint(-7, -3, 7, 3, (x, y) => { const t = x * d; return Math.abs(y) < 2.4 && t > -6 && t < 6 - Math.abs(y) * 0.9 ? (Math.abs(y) < 0.5 && t > -4.5 && t < 3.5 && (Math.floor(t * 1.2) & 1) ? 'dust1' : y < -1.4 ? 'dust5' : 'dust4') : null; });
    b.disc(-d * 4.2, 3, 1.2, 'dust1');
  },
  // A bench: three planks on two iron legs, a back rail behind.
  bench(b, r, spec, a, v){
    const at = (x, y) => v ? [y, x] : [x, y];
    b.paint(-12, -12, 12, 12, (x, y) => { const [u, w] = v ? [y, x] : [x, y]; if (Math.abs(u) > 10 || w < -3.5 || w > 3) return null; if (w < -2.2) return 'dust1'; return Math.floor((w + 3) / 2) & 1 ? 'dust3' : 'dust4'; });
    for (const u of [-8.5, 8.5]){ const [x, y] = at(u, 3.4); b.line(x - (v ? 0 : 0.6), y - (v ? 0.6 : 0), x + (v ? 0 : 0.6), y + (v ? 0.6 : 0), 1.2, 'char1'); }
  },
  // A barrel from above: staves round a lid, two dark hoops.
  barrel(b, r, spec, a, v){
    b.disc(0, 0, 4.4, 'char1'); b.disc(0, 0, 3.8, v === 2 ? 'rust1' : 'dust2');
    b.paint(-4, -4, 4, 4, (x, y) => { const d = Math.hypot(x, y); return d < 3.2 && d > 2.6 ? 'char1' : d < 2.6 ? (Math.floor(x + 4) % 2 ? (v === 2 ? 'rust2' : 'dust4') : (v === 2 ? 'rust1' : 'dust3')) : null; });
    if (v === 1) b.disc(0, 0, 2.6, 'water1');   // a rain barrel, full
  },
  // A wooden crate: a plank border and a cross brace.
  crate(b, r, spec, a, v){
    b.paint(-5, -5, 5, 5, (x, y) => { if (Math.abs(x) > 4.4 || Math.abs(y) > 4.4) return null; if (Math.abs(x) > 3.4 || Math.abs(y) > 3.4) return 'dust1'; if (Math.abs(x - y) < 0.8 || (v && Math.abs(x + y) < 0.8)) return 'dust2'; return (Math.floor(y + 4) % 3) ? 'dust4' : 'dust3'; });
  },
  // A village well: a ring of stones round dark water, a beam across with the rope and bucket.
  well(b, r, { r: R }){
    const k = R / 13;
    b.disc(0, 0, 9.5 * k, 'plate0');
    b.paint(-R, -R, R, R, (x, y) => { const d = Math.hypot(x, y) / k, ang = Math.atan2(y, x); if (d > 9.3) return null; if (d > 6) return Math.floor(ang / TAU * 18 + (d > 7.8 ? 0.5 : 0)) % 2 ? 'plate1' : 'plate0'; return d > 5.4 ? 'char1' : d < 2.5 && x + y < 0 ? 'water1' : 'water0'; });
    b.line(-11 * k, 0, 11 * k, 0, 2.6, 'dust2'); b.line(-11 * k, -0.8, 11 * k, -0.8, 0.7, 'dust4');
    for (const x of [-10.5 * k, 10.5 * k]) b.disc(x, 0, 2, 'dust1');
    b.line(2, 0, 2, 3.5, 0.6, 'dust4'); b.disc(2, 4.6, 2, 'dust1'); b.disc(2, 4.6, 1.1, 'water1');
  },
  // A length of split-rail fence: posts and two rails.
  fence(b, r, spec, a, v){
    const at = (u, w) => v ? [w, u] : [u, w];
    for (const w of [-1, 1]){ const [x0, y0] = at(-12, w), [x1, y1] = at(12, w); b.line(x0, y0, x1, y1, 1, 'dust2'); }
    for (const u of [-12, 0, 12]){ const [x, y] = at(u, 0); b.disc(x, y, 1.6, 'dust1'); b.disc(x - 0.4, y - 0.4, 0.7, 'dust4'); }
  },
  // Hay: a round bale rolled in a spiral, or a haystack.
  hay(b, r, { r: R }, a, v){
    if (R < 10){
      b.disc(0, 0, R * 0.85, 'gold0');
      b.paint(-R, -R, R, R, (x, y) => { const d = Math.hypot(x, y); if (d > R * 0.8) return null; const sp = (d + Math.atan2(y, x) / TAU * 2.2) % 2.2; return sp < 0.6 ? 'amber1' : x + y < -2 ? 'gold1' : null; });
    } else {
      for (let i = 0; i < 30; i++){ const [x, y] = polar(r() * TAU, r() * R * 0.75); b.taper(x, y, x + (r() - 0.5) * 5, y + (r() - 0.5) * 5, 1.4, 0.4, r() < 0.4 ? 'gold1' : r() < 0.7 ? 'gold0' : 'amber1'); }
      b.disc(-R * 0.15, -R * 0.15, R * 0.35, 'gold1');
      if (v) for (const [x, y] of [[-R * 0.8, R * 0.3], [R * 0.6, R * 0.6]]) b.taper(x, y, x + 3, y - 1, 1, 0.3, 'gold1');   // wisps blown off
    }
  },
  // A hand cart: a plank bed, two wheels on its axle and the shafts.
  cart(b, r, spec, a, v){
    const at = (u, w) => v ? [w, u] : [u, w];
    b.paint(-15, -15, 15, 15, (x, y) => { const [u, w] = v ? [y, x] : [x, y]; if (u < -7 || u > 7 || Math.abs(w) > 5) return null; if (u < -6 || u > 6 || Math.abs(w) > 4) return 'dust1'; return Math.floor(u + 7) % 3 ? 'dust3' : 'dust2'; });
    for (const s of [-1, 1]){ const [x0, y0] = at(-3, s * 6), [x1, y1] = at(3, s * 6); b.line(x0, y0, x1, y1, 1.8, 'char1'); const [sx, sy] = at(7, s * 3), [ex, ey] = at(14, s * 2.5); b.line(sx, sy, ex, ey, 0.9, 'dust2'); }
    for (let i = 0; i < 3; i++){ const [x, y] = at(-4 + i * 3.5, (r() - 0.5) * 4); b.disc(x, y, 1.6, r() < 0.5 ? 'gold0' : 'dust4'); }
  },
  // A puddle: still water with a light rim and a sky reflection.
  puddle(b, r, { r: R }){
    for (let i = 0; i < 3; i++){ const [x, y] = polar(r() * TAU, R * 0.3); b.disc(x, y, R * (0.5 + r() * 0.2), 'water1'); }
    b.disc(-R * 0.2, -R * 0.2, R * 0.2, 'water2'); b.disc(-R * 0.25, -R * 0.3, 0.6, 'water3');
  }
});
const propSize = spec => spec.length ? K * Math.ceil(spec.length / 2 + spec.width * 2.2 + 3) : K * Math.ceil(spec.r * 1.6 + 3);
function propFrame(kind, spec, seed, angle, v = 0){
  const N = propSize(spec), g = new Grid(N, N);
  PROP_DRAW[kind](brush(g), rng(seed), spec, angle, v);
  const clear = f => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (x === 0 || y === 0 || x === N - 1 || y === N - 1) f.set(x, y, 0); return f; };
  return { n: N, g: clear(finish(clear(g))) };
}

// { data, sheets }: data for pixel-data.js (frames as palette text) and one sheet per species
// (rows are sizes, each smaller frame centred in the largest frame's cell).
export function genesisTrees(){
  const art = {}, sheets = {};
  for (const kind of GENESIS_KINDS){
    K = SCALED.has(kind) ? MAP_K * TREE_SIZE : MAP_K;
    const sets = GENESIS_SIZES.map((_, z) => Array.from({ length: VARIANTS }, (_, v) => variantFrames(kind, z, v)));
    art[kind] = sets.map(vs => vs.map(({ n, frames }) => ({ n, frames: frames.map(f => rle(f.encode())) })));
    const cell = Math.max(...sets.flat().map(s => s.n));
    const pad = (f, n) => { const o = new Grid(cell, cell), off = (cell - n) / 2; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) o.set(x + off, y + off, f.get(x, y)); return o; };
    sheets['genesis_tree_' + kind] = {
      meta: {
        name: 'genesis_tree_' + kind, frameWidth: cell, frameHeight: cell, origin: [(cell - 1) / 2, (cell - 1) / 2], worldPxPerArtPx: 1 / MAP_K,
        rows: GENESIS_SIZES, frameSizes: sets.map(vs => vs[0].n), crownWorldPx: GENESIS_CROWN[kind],
        columns: `${VARIANTS} variants × ${kind === 'snag' ? 1 : RUSTLES} rustle frames, each frame centred in its cell`,
        animations: { rustle: { frames: kind === 'snag' ? 1 : RUSTLES, fps: 'set by the weather' }, lean: 'crown shifted downwind by the engine' },
        shadow: { drawnBy: 'engine', offset: GENESIS_SHADOW, by: 'size', elevation: 'prop' }
      },
      rows: sets.map(vs => vs.flatMap(({ n, frames }) => frames.map(f => pad(f, n))))
    };
  }
  // Stumps: per kind and size, STUMP_VARIANTS frames. Fallen trees: per size, every angle
  // (angle × LOG_VARIANTS + variant), crown end pointing along the angle, clockwise from east.
  for (const [kind, specs] of Object.entries(GENESIS_PROPS)){
    K = SCALED.has(kind) ? MAP_K * TREE_SIZE : MAP_K;
    const log = kind === 'log', count = log ? LOG_ANGLES * LOG_VARIANTS : PROP_VARIANTS[kind] || STUMP_VARIANTS;
    const sets = specs.map((spec, z) => Array.from({ length: count }, (_, k) => {
      const angle = log ? Math.floor(k / LOG_VARIANTS) / LOG_ANGLES * TAU : 0, v = log ? k % LOG_VARIANTS : k;
      return propFrame(kind, spec, 1901 + Object.keys(GENESIS_PROPS).indexOf(kind) * 97 + z * 13 + v * 7 + (log ? Math.floor(k / LOG_VARIANTS) * 3 : 0), angle, v);
    }));
    art[kind] = sets.map(fs => fs.map(({ n, g }) => ({ n, frames: [rle(g.encode())] })));
    const cell = Math.max(...sets.flat().map(f => f.n));
    const pad = ({ n, g }) => { const o = new Grid(cell, cell), off = (cell - n) / 2; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) o.set(x + off, y + off, g.get(x, y)); return o; };
    sheets['genesis_' + kind] = {
      meta: {
        name: 'genesis_' + kind, frameWidth: cell, frameHeight: cell, origin: [(cell - 1) / 2, (cell - 1) / 2], worldPxPerArtPx: 1 / MAP_K,
        rows: specs.map(sp => JSON.stringify(sp)), frameSizes: sets.map(fs => fs[0].n),
        columns: log ? `${LOG_ANGLES} angles clockwise from east (crown end) × ${LOG_VARIANTS} variants, each frame centred in its cell` : `${count} variants`,
        shadow: { drawnBy: 'engine', offset: PROP_SHADOW[kind], elevation: 'ground prop' }
      },
      rows: sets.map(fs => fs.map(pad))
    };
  }
  K = MAP_K;
  // Every frame is MAP_K art px per world px on the map, so `scale` (how much bigger than its
  // art a kind is drawn) is 1 for all; the crown and prop sizes in the data are the sizes on
  // the map (a test checks they match GW.TREES).
  const scale = Object.fromEntries([...GENESIS_KINDS, ...Object.keys(GENESIS_PROPS)].map(k => [k, 1]));
  const crown = Object.fromEntries(GENESIS_KINDS.map(k => [k, GENESIS_CROWN[k].map(d => d * TREE_SIZE)]));
  const props = Object.fromEntries(Object.entries(GENESIS_PROPS).map(([k, specs]) => [k, SCALED.has(k) ? specs.map(sp => Object.fromEntries(Object.entries(sp).map(([f, v]) => [f, v * TREE_SIZE]))) : specs]));
  return { data: { encoding: 'rle', k: MAP_K, scale, kinds: GENESIS_KINDS, sizes: GENESIS_SIZES, crown, shadow: GENESIS_SHADOW.map(o => o.map(v => v * TREE_SIZE)), props, propShadow: PROP_SHADOW, logAngles: LOG_ANGLES, art }, sheets };
}
