// Genesis tree props (map type `genesis`): five species in three sizes, straight top-down at
// 2 art px per world px, drawn to the crown diameters in src/data/trees.js (GW.TREES; a test
// checks the two match). Each variant has 3 leaf-rustle frames; a snag has one. Leaning in
// the wind is a shift of the whole crown, done by the engine, so it needs no frames of its
// own. Outline and top-left light come from the pipeline (finish); the engine draws the
// shadow, further out for taller trees.
import { C, Grid, rng, finish } from './pixelart.mjs';

const K = 2, TAU = Math.PI * 2;
export const GENESIS_SIZES = ['small', 'medium', 'large'];
export const GENESIS_CROWN = {
  spruce: [18, 28, 38], pine: [22, 34, 46], birch: [20, 30, 40], maple: [24, 40, 56], snag: [18, 26, 36]
};
export const GENESIS_KINDS = Object.keys(GENESIS_CROWN);
// Engine shadow offset in art px, by size: taller trees throw their shadow further.
export const GENESIS_SHADOW = [[6, 6], [8, 8], [12, 12]];
const VARIANTS = 2, RUSTLES = 3, MARGIN = 3;   // world px around the crown for rustled leaves and the outline

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
    line(x0, y0, x1, y1, w, col){ this.taper(x0, y0, x1, y1, w, w, col); }
  };
}
const polar = (a, d) => [Math.cos(a) * d, Math.sin(a) * d];

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
      b.disc(x, y, cr, 'leaf2');
      b.disc(x - cr * 0.25, y - cr * 0.25, cr * 0.55, 'grass2');
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
      b.disc(x, y, lr, 'leaf1');
    }
    for (let i = 0; i < Math.round(R * 1.4); i++){ const [x, y] = polar(r() * TAU, r() * R * 0.72); b.disc(x, y, R * (0.08 + r() * 0.07), 'leaf2'); }
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
  const steps = kind === 'snag' ? 1 : RUSTLES;
  return { n: N, frames: Array.from({ length: steps }, (_, s) => {
    const f = rustle(g, kind, seed, s);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (x === 0 || y === 0 || x === N - 1 || y === N - 1) f.set(x, y, 0);
    return finish(f);
  }) };
}

// { data, sheets }: data for pixel-data.js (frames as palette text) and one sheet per species
// (rows are sizes, each smaller frame centred in the largest frame's cell).
export function genesisTrees(){
  const art = {}, sheets = {};
  for (const kind of GENESIS_KINDS){
    const sets = GENESIS_SIZES.map((_, z) => Array.from({ length: VARIANTS }, (_, v) => variantFrames(kind, z, v)));
    art[kind] = sets.map(vs => vs.map(({ n, frames }) => ({ n, frames: frames.map(f => f.encode()) })));
    const cell = Math.max(...sets.flat().map(s => s.n));
    const pad = (f, n) => { const o = new Grid(cell, cell), off = (cell - n) / 2; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) o.set(x + off, y + off, f.get(x, y)); return o; };
    sheets['genesis_tree_' + kind] = {
      meta: {
        name: 'genesis_tree_' + kind, frameWidth: cell, frameHeight: cell, origin: [(cell - 1) / 2, (cell - 1) / 2], worldPxPerArtPx: 1 / K,
        rows: GENESIS_SIZES, frameSizes: sets.map(vs => vs[0].n), crownWorldPx: GENESIS_CROWN[kind],
        columns: `${VARIANTS} variants × ${kind === 'snag' ? 1 : RUSTLES} rustle frames, each frame centred in its cell`,
        animations: { rustle: { frames: kind === 'snag' ? 1 : RUSTLES, fps: 'set by the weather' }, lean: 'crown shifted downwind by the engine' },
        shadow: { drawnBy: 'engine', offset: GENESIS_SHADOW, by: 'size', elevation: 'prop' }
      },
      rows: sets.map(vs => vs.flatMap(({ n, frames }) => frames.map(f => pad(f, n))))
    };
  }
  return { data: { kinds: GENESIS_KINDS, sizes: GENESIS_SIZES, crown: GENESIS_CROWN, shadow: GENESIS_SHADOW, art }, sheets };
}
