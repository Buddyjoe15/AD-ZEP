/* Genesis map generator (v0.1): the landscaping test bed. For now it builds the Woodlands
   landscape for the seed (heights, rivers, waterfalls, lake, fen, villages, camps, trails)
   and then replants every forest as free-standing trees (species in src/data/trees.js), with
   stumps and fallen trees among them in place of the tile-sized ones.

   Trees are not one per tile. Each has its own trunk position in world px, anywhere in its
   tile, and is spaced from its neighbours by a local density: thick stands where the crowns
   close over, thin open woodland, glades, saplings at the edges and big lone trees out in
   the meadows. Medium and large trees block the tile their trunk stands on; the rest of the
   forest becomes forest floor, which slows units but lets them through.

   The trees live in `grid.art.trees` (typed arrays, sorted in drawing order), which only the
   renderer reads. Like the rest of grid.art it is rebuilt from the seed and never saved.
   Output depends only on the seed, the world size and the landing site. Never change what a
   released version generates: give the new behaviour a new map type (or version) instead,
   since saves regenerate their terrain from it. */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math;
  const VERSION = '0.1';
  const hash = G.hashRandom3;
  function vnoise(x, y, s){
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct){ let sum = 0, amp = 1, norm = 0, f = 1; for (let i = 0; i < oct; i++){ sum += vnoise(x * f, y * f, s + i * 101) * amp; norm += amp; amp *= .5; f *= 2; } return sum / norm; }
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const pick = (h, table) => { let total = 0; for (const [, w] of table) total += w; h *= total; for (const [k, w] of table){ if (h < w) return k; h -= w; } return table[table.length - 1][0]; };

  // Spacing between trunks, in world px, from the thickest stand to the most open woodland.
  const SPACING_THICK = 18, SPACING_THIN = 64;
  // Tiles with at least this much forest cover (share of tree tiles nearby) grow woodland.
  const WOODED = 0.08;
  // Candidate trunks are tried in PASSES rounds, each in a hashed share of the candidates, so
  // the scan order doesn't leave a direction in the pattern.
  const PASSES = 8;

  function plant(grid, s, extra = []){
    const W = grid.cols, H = grid.rows, N = W * H, TILE = G.CONFIG.TILE, tiles = grid.tiles, art = grid.art;
    const TR = G.TREES, ALL = TR.ALL, id = k => G.Defs.terrain.get(k).id;
    const TREE = id('tree'), FLOOR = id('forest'), GRASS = id('grass'), BUSH = id('bush'), STUMP = id('stump'), LOG = id('fallen_tree');
    const SOIL = new Uint8Array(256), WET = new Uint8Array(256), FEN = new Uint8Array(256);
    for (const k of ['tree', 'forest', 'bush', 'tall_grass', 'grass', 'wildflowers', 'mushrooms', 'swamp']) SOIL[id(k)] = 1;
    for (const k of ['water', 'deep_water', 'waterfall', 'bog', 'swamp', 'reeds']) WET[id(k)] = 1;
    for (const k of ['swamp', 'bog']) FEN[id(k)] = 1;
    const L = art.landing;

    // 1. Forest cover: the share of tree tiles within 2 tiles, from a summed-area table.
    const W1 = W + 1, sat = new Int32Array(W1 * (H + 1));
    for (let y = 0; y < H; y++){
      let row = 0;
      for (let x = 0; x < W; x++){ row += tiles[y * W + x] === TREE ? 1 : 0; sat[(y + 1) * W1 + x + 1] = sat[y * W1 + x + 1] + row; }
    }
    const box = (x0, y0, x1, y1) => {
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
      return sat[(y1 + 1) * W1 + x1 + 1] - sat[y0 * W1 + x1 + 1] - sat[(y1 + 1) * W1 + x0] + sat[y0 * W1 + x0];
    };
    const cover = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cover[y * W + x] = clamp01(box(x - 2, y - 2, x + 2, y + 2) / 25 / 0.7);

    // 2. Clear the Woodlands dead wood and brush off the grid: old tree tiles, the brush between
    // them (the saplings stand in for it now), and the tile-sized stumps and fallen trees, whose
    // places are kept for the new ones. All become forest floor, or grass out in the open.
    const D = key => (G.WOODLANDS_DETAIL || []).indexOf(key) + 1;
    const LEAVES = D('LEAVES'), TWIGS = D('TWIGS'), BRANCH = D('BRANCH'), PEBBLES = D('PEBBLES');
    const oldStumps = [], lone = new Uint8Array(N);
    for (let i = 0; i < N; i++){
      const t = tiles[i], x = i % W, y = (i / W) | 0;
      if (t === STUMP) oldStumps.push(i);
      if (t === TREE && cover[i] < WOODED && Math.hypot(x - L.x, y - L.y) > 36) lone[i] = 1;
      if (t !== TREE && t !== STUMP && t !== LOG && !(t === BUSH && cover[i] >= WOODED)) continue;
      if (cover[i] < WOODED){ tiles[i] = GRASS; continue; }
      tiles[i] = FLOOR;
      const h = hash(x, y, s + 641);
      art.detail[i] = h < 0.14 ? LEAVES : h < 0.21 ? TWIGS : h < 0.24 ? BRANCH : h < 0.25 ? PEBBLES : 0;
      art.angle[i] = Math.floor(hash(x, y, s + 643) * 256);
    }
    // How thick the woodland is: whole stands (thick or open), clumps and glades.
    const thick = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const i = y * W + x, f = cover[i];
      if (f < WOODED || !SOIL[tiles[i]]) continue;
      const stand = clamp01((fbm(x / 30, y / 30, s + 601, 3) - 0.3) / 0.34), clump = fbm(x / 7, y / 7, s + 607, 2);
      let t = f ** 1.2 * (0.3 + 0.7 * stand) + (clump - 0.5) * 0.6 * f;
      if (clump < 0.26) t *= 0.5;
      thick[i] = clamp01(t);
    }

    // Everything planted: position (world px), spacing radius, kind (GW.TREES.ALL), size, variant.
    const cap = 1 << 16;
    let n = 0, X = new Int32Array(cap), Y = new Int32Array(cap), R = new Float32Array(cap);
    let K = new Uint8Array(cap), Z = new Uint8Array(cap), V = new Uint8Array(cap), NX = new Int32Array(cap);
    const grow = () => {
      const m = X.length * 2, g = (A, T) => { const B = new T(m); B.set(A); return B; };
      X = g(X, Int32Array); Y = g(Y, Int32Array); R = g(R, Float32Array); K = g(K, Uint8Array); Z = g(Z, Uint8Array); V = g(V, Uint8Array); NX = g(NX, Int32Array);
    };
    const head = new Int32Array(N).fill(-1);
    const add = (px, py, r, kind, z, v) => {
      if (n === X.length) grow();
      const i = Math.floor(py / TILE) * W + Math.floor(px / TILE);
      X[n] = px; Y[n] = py; R[n] = r; K[n] = ALL.indexOf(kind); Z[n] = z; V[n] = v; NX[n] = head[i]; head[i] = n;
      return n++;
    };
    const tileAt = (px, py) => { const x = Math.floor(px / TILE), y = Math.floor(py / TILE); return x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1; };

    // 3. Fallen trees first, so the living ones grow around them: windthrow, often a few
    // together lying roughly the same way, on level wooded ground. Each blocks the tiles along
    // its trunk (GW.TREES.logTiles).
    const logs = [], logHead = new Int32Array(N).fill(-1), logNext = [];
    const LOG_SIZES = TR.props.log.sizes, ANG = TR.LOG_ANGLES;
    const axis = lg => { const d = LOG_SIZES[lg.z], th = lg.a / ANG * Math.PI * 2, ux = Math.cos(th), uy = Math.sin(th); return { ax: lg.x - ux * d.length / 2, ay: lg.y - uy * d.length / 2, bx: lg.x + ux * d.length * 0.3, by: lg.y + uy * d.length * 0.3, w: d.width }; };
    const segDist = (px, py, s) => { const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / l2)); return Math.hypot(px - s.ax - t * dx, py - s.ay - t * dy); };
    // Distance from (px, py) to the nearest fallen tree's trunk, minus its half-width.
    const nearLog = (px, py) => {
      const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
      let best = Infinity;
      for (let yy = Math.max(0, y - 3); yy <= Math.min(H - 1, y + 3); yy++) for (let xx = Math.max(0, x - 3); xx <= Math.min(W - 1, x + 3); xx++)
        for (let q = logHead[yy * W + xx]; q >= 0; q = logNext[q]){ const sg = logs[q].seg; best = Math.min(best, segDist(px, py, sg) - sg.w); }
      return best;
    };
    const wanted = Math.round(cover.reduce((a, f) => a + (f >= 0.35 ? 1 : 0), 0) / 420);
    for (let tries = 0; tries < 20000 && logs.length < wanted; tries++){
      const x0 = Math.floor(hash(tries, 1, s + 701) * W), y0 = Math.floor(hash(tries, 2, s + 701) * H), i0 = y0 * W + x0;
      if (cover[i0] < 0.35 || !SOIL[tiles[i0]] || Math.hypot(x0 - L.x, y0 - L.y) < 40) continue;
      const a0 = Math.floor(hash(tries, 3, s + 701) * ANG), g = hash(tries, 4, s + 701), members = 1 + Math.floor(g * g * 4), lvl = art.level[i0];
      for (let m = 0; m < members; m++){
        const off = m ? (hash(tries, 10 + m, s + 703) - 0.5) * 70 : 0, along = m ? (hash(tries, 20 + m, s + 703) - 0.5) * 40 : 0;
        const a = (a0 + (m ? Math.floor(hash(tries, 30 + m, s + 703) * 3) - 1 : 0) + ANG) % ANG, th = a / ANG * Math.PI * 2;
        const px = Math.floor(x0 * TILE + TILE / 2 + Math.cos(th) * along - Math.sin(th) * off), py = Math.floor(y0 * TILE + TILE / 2 + Math.sin(th) * along + Math.cos(th) * off);
        const lg = { x: px, y: py, z: thick[i0] > 0.45 || hash(tries, 40 + m, s + 703) < 0.4 ? 1 : 0, a };
        lg.seg = axis(lg);
        let ok = true;
        TR.logTiles(px, py, lg.z, a, TILE, (tx, ty) => { const i = ty * W + tx; if (!(tx >= 0 && ty >= 0 && tx < W && ty < H) || !SOIL[tiles[i]] || art.level[i] !== lvl || cover[i] < WOODED) ok = false; });
        if (!ok) continue;
        // Keep clear of other fallen trees (they may lie side by side, not across each other).
        for (let k = 0; k <= 10 && ok; k++){ const t = k / 10; if (nearLog(lg.seg.ax + (lg.seg.bx - lg.seg.ax) * t, lg.seg.ay + (lg.seg.by - lg.seg.ay) * t) < lg.seg.w + 4) ok = false; }
        if (!ok) continue;
        const ci = tileAt(px, py);
        logNext.push(logHead[ci]); logHead[ci] = logs.length; logs.push(lg);
        add(px, py, 0, 'log', lg.z, a * 2 + Math.floor(hash(px, py, s + 707) * 2));
      }
    }

    // 4. Trunks by dart throwing with a spacing that follows the local thickness. A trunk is
    // kept only if it is at least the mean of both trees' spacings from every other trunk, so
    // thick and thin woodland meet without a seam, and off every fallen tree. Now and then the
    // tree is only a snapped stump, more often in open woodland.
    const wetNear = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){ const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && WET[tiles[yy * W + xx]]) return true; } return false; };
    const fenNear = (x, y) => { let c = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){ const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && FEN[tiles[yy * W + xx]]) c++; } return c >= 3; };
    // Species by habitat: black spruce and dead snags in the fen, spruce and pine on high
    // ground, birches by water, otherwise groves of birch, of conifers, or mixed maple woods.
    function species(x, y, px, py, i){
      const h = hash(px, py, s + 617), lvl = art.level[i];
      if (FEN[tiles[i]] || fenNear(x, y)) return pick(h, [['spruce', 5], ['snag', 3], ['birch', 2]]);
      if (lvl >= 3) return pick(h, [['spruce', 50], ['pine', 32], ['birch', 10], ['snag', 8]]);
      if (wetNear(x, y)) return pick(h, [['birch', 50], ['maple', 20], ['spruce', 20], ['pine', 4], ['snag', 6]]);
      const grove = vnoise(px / TILE / 9, py / TILE / 9, s + 613);
      if (grove < 0.33) return pick(h, [['birch', 60], ['maple', 25], ['pine', 10], ['snag', 5]]);
      if (grove > 0.66) return pick(h, [['spruce', 50], ['pine', 40], ['birch', 6], ['snag', 4]]);
      return pick(h, [['maple', 50], ['birch', 20], ['pine', 15], ['spruce', 12], ['snag', 3]]);
    }
    // Size: thick stands grow tall, thin edges hold saplings, lone meadow trees spread wide.
    function size(kind, t, isLone, px, py){
      const h = hash(px, py, s + 619);
      if (isLone) return h < 0.65 ? 2 : 1;
      const pS = kind === 'snag' ? 0 : 0.35 - 0.25 * t, pL = 0.15 + 0.45 * t;
      return h < pS ? 0 : h > 1 - pL ? 2 : 1;
    }
    const spaced = (px, py, r) => {
      const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
      for (let yy = Math.max(0, y - 2); yy <= Math.min(H - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(W - 1, x + 2); xx++)
        for (let q = head[yy * W + xx]; q >= 0; q = NX[q]){
          if (!R[q]) continue;   // fallen trees are checked by nearLog
          const need = (r + R[q]) / 2, dx = X[q] - px, dy = Y[q] - py;
          if (dx * dx + dy * dy < need * need) return false;
        }
      return true;
    };
    for (let pass = 0; pass < PASSES; pass++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const i = y * W + x, isLone = lone[i] === 1;
      if (!isLone && !(cover[i] >= WOODED && SOIL[tiles[i]])) continue;
      const t = isLone ? 0 : thick[i], spacing = SPACING_THIN - (SPACING_THIN - SPACING_THICK) * t;
      const tries = isLone ? 1 : Math.min(16, Math.ceil(2.6 * (TILE / spacing) ** 2));
      for (let j = 0; j < tries; j++){
        if (Math.floor(hash(i, j, s + 621) * PASSES) !== pass) continue;
        // Lone trees keep near the middle of their tile; forest trunks go anywhere in it.
        const spread = isLone ? 0.5 : 1, px = Math.floor(x * TILE + TILE * (0.5 + (hash(i, j, s + 623) - 0.5) * spread)), py = Math.floor(y * TILE + TILE * (0.5 + (hash(i, j, s + 627) - 0.5) * spread));
        const kind = species(x, y, px, py, i), z = size(kind, t, isLone, px, py), r = Math.max(spacing, TR.species[kind].crown[z] * 0.5);
        if (!spaced(px, py, r) || nearLog(px, py) < 5) continue;
        const v = Math.floor(hash(px, py, s + 631) * 256);
        if (!isLone && hash(px, py, s + 633) < 0.02 + 0.05 * (1 - t)) add(px, py, r, 'stump_broken', z === 2 ? 1 : 0, v);
        else add(px, py, r, kind, z, v);
      }
    }
    // Cut stumps where Woodlands felled trees (along the trails and in the logging camps),
    // now anywhere in their tile, sometimes two, clear of trunks and fallen trees.
    for (const i of oldStumps){
      const x = i % W, y = (i / W) | 0;
      for (let j = 0; j < 2; j++){
        if (hash(x, y, s + 651 + j) > (j ? 0.3 : 0.8)) continue;
        const px = Math.floor(x * TILE + TILE * (0.1 + hash(x, y, s + 653 + j) * 0.8)), py = Math.floor(y * TILE + TILE * (0.1 + hash(x, y, s + 657 + j) * 0.8));
        if (!spaced(px, py, 14) || nearLog(px, py) < 6) continue;
        add(px, py, 14, 'stump_cut', hash(x, y, s + 659 + j) < 0.5 ? 0 : 1, Math.floor(hash(px, py, s + 661) * 256));
      }
    }

    // 5. Blocking: fallen trees along their trunks, then every medium or large trunk. The
    // ground as it was before is kept (art.treeBase), for when they are destroyed.
    art.treeBase = tiles.slice();
    const tileOf = q => Math.floor(Y[q] / TILE) * W + Math.floor(X[q] / TILE);
    const logK = ALL.indexOf('log');
    for (let q = 0; q < n; q++) if (K[q] === logK) TR.logTiles(X[q], Y[q], Z[q], V[q] >> 1, TILE, (tx, ty) => { const i = ty * W + tx; tiles[i] = LOG; art.detail[i] = 0; });
    for (let q = 0; q < n; q++) if (K[q] < TR.KINDS.length && Z[q] >= TR.BLOCKS_FROM){ const i = tileOf(q); tiles[i] = TREE; art.detail[i] = 0; }
    grid.touch();

    // 6. Landscaping, at its own places on the tiles that call for it (the tiles keep their
    // terrain): bushes on brush, flower patches on wildflowers (their colour changes from one
    // meadow to the next), mushrooms, boulders on rock (often with a small one beside), reeds,
    // and ferns on the forest floor.
    {
      const ids = k => G.Defs.terrain.get(k).id;
      const SHRUB = ids('bush'), FLOWERS = ids('wildflowers'), MUSH = ids('mushrooms'), ROCK = ids('rock'), MOSS = ids('mossy_rock'), REEDS = ids('reeds');
      const THICK = ids('tall_grass'), THICKET = ids('thicket'), MOUND = ids('termite_mound'), VENT = ids('steam_vent'), CRYSTAL = ids('crystal'), ORE = ids('outcrop');
      const ALIEN = ids('alien_flora'), LOGS = ids('log_pile'), SAWHORSE = ids('sawhorse'), BURROW = ids('burrow'), RUBBLE = ids('rubble');
      // Ground detail marks that become props (the rest, stains and tracks, stay marks).
      const DK = key => (G.WOODLANDS_DETAIL || []).indexOf(key) + 1;
      const MARKS = new Map([[DK('TUFT'), 'tuft'], [DK('WEEDS'), 'weeds'], [DK('FLOWER'), 'flowers'], [DK('PEBBLES'), 'pebbles'], [DK('LEAVES'), 'leaves'],
        [DK('TWIGS'), 'twigs'], [DK('BRANCH'), 'twigs'], [DK('BONES'), 'bones'], [DK('PUDDLE'), 'puddle']]);
      const at = (x, y, j, spread) => [Math.floor(x * TILE + TILE / 2 + (hash(x, y, s + 901 + j) - 0.5) * spread), Math.floor(y * TILE + TILE / 2 + (hash(x, y, s + 903 + j) - 0.5) * spread)];
      const v8 = (x, y, j) => Math.floor(hash(x, y, s + 907 + j) * 256);
      for (let i = 0; i < N; i++){
        const tl = tiles[i], x = i % W, y = (i / W) | 0, h1 = hash(x, y, s + 911);
        if (tl === SHRUB){ for (let j = 0; j < (h1 < 0.4 ? 2 : 1); j++){ const z = hash(x, y, s + 913 + j), [px, py] = at(x, y, j, 34); add(px, py, 0, 'bush', z < 0.3 ? 0 : z < 0.75 ? 1 : 2, v8(x, y, j)); } }
        else if (tl === FLOWERS){ const colour = Math.floor(vnoise(x / 6, y / 6, s + 917) * 6) % 6; for (let j = 0; j < 2; j++){ const [px, py] = at(x, y, j, 36); add(px, py, 0, 'flowers', 0, colour); } }
        else if (tl === MUSH){ const [px, py] = at(x, y, 0, 30); add(px, py, 0, 'mushrooms', 0, v8(x, y, 0)); }
        else if (tl === ROCK || tl === MOSS){
          const mossy = tl === MOSS ? 2 : 0, [px, py] = at(x, y, 0, 12);
          add(px, py, 0, 'boulder', h1 < 0.2 ? 3 : h1 < 0.6 ? 1 : 2, mossy + (v8(x, y, 1) & 1));   // now and then a big one
          if (hash(x, y, s + 919) < 0.35){ const [qx, qy] = at(x, y, 2, 30); add(qx, qy, 0, 'boulder', 0, mossy + (v8(x, y, 3) & 1)); }
        }
        else if (tl === REEDS){ for (let j = 0; j < 2; j++){ const [px, py] = at(x, y, j, 32); add(px, py, 0, 'reeds', 0, v8(x, y, j)); } }
        else if (tl === FLOOR && h1 < 0.1){ const [px, py] = at(x, y, 0, 36); add(px, py, 0, 'fern', hash(x, y, s + 921) < 0.6 ? 0 : 1, v8(x, y, 0)); }
        else if (tl === THICK){ for (let j = 0; j < 3; j++){ const [px, py] = at(x, y, j, 46); add(px, py, 0, 'tallgrass', hash(x, y, s + 923 + j) < 0.5 ? 0 : 1, v8(x, y, j)); } }
        else if (tl === THICKET){ for (let j = 0; j < 2; j++){ const [px, py] = at(x, y, j, 30); add(px, py, 0, 'thicket', 0, v8(x, y, j)); } }
        else if (tl === MOUND){ const [px, py] = at(x, y, 0, 14); add(px, py, 0, 'mound', 0, v8(x, y, 0)); }
        else if (tl === VENT){ add(x * TILE + TILE / 2, y * TILE + TILE / 2, 0, 'vent', 0, v8(x, y, 0)); }
        else if (tl === CRYSTAL){ const [px, py] = at(x, y, 0, 16); add(px, py, 0, 'crystal', h1 < 0.5 ? 0 : 1, v8(x, y, 0)); }
        else if (tl === ORE){ const [px, py] = at(x, y, 0, 14); add(px, py, 0, 'ore', 0, v8(x, y, 0)); }
        else if (tl === ALIEN){ for (let j = 0; j < 2; j++){ const [px, py] = at(x, y, j, 36); add(px, py, 0, 'alien', 0, v8(x, y, j)); } }
        else if (tl === LOGS){ add(x * TILE + TILE / 2, y * TILE + TILE / 2, 0, 'logpile', 0, v8(x, y, 0)); }
        else if (tl === SAWHORSE){ add(x * TILE + TILE / 2, y * TILE + TILE / 2, 0, 'sawhorse', 0, 0); }
        else if (tl === BURROW){ const [px, py] = at(x, y, 0, 20); add(px, py, 0, 'burrow', 0, v8(x, y, 0)); }
        else if (tl === RUBBLE){ const [px, py] = at(x, y, 0, 26); add(px, py, 0, 'rubble', h1 < 0.5 ? 0 : 1, v8(x, y, 0)); }
        const mk = MARKS.get(art.detail[i]);
        if (mk){ const [px, py] = at(x, y, 5, 30); add(px, py, 0, mk, 0, mk === 'flowers' ? Math.floor(vnoise(x / 6, y / 6, s + 917) * 6) % 6 : v8(x, y, 5)); art.detail[i] = 0; }
      }
    }

    // Village life (towns()), at the places given.
    for (const q of extra) add(q.x, q.y, 0, q.kind, q.z, q.v);

    // 7. Drawing order: dead wood under every tree, small trees under big ones, then north to
    // south, then west to east.
    const layer = q => K[q] >= TR.KINDS.length ? 0 : 1;
    const order = Array.from({ length: n }, (_, q) => q).sort((a, b) => layer(a) - layer(b) || Z[a] - Z[b] || Y[a] - Y[b] || X[a] - X[b]);
    const out = {
      count: n, x: new Int32Array(n), y: new Int32Array(n), kind: new Uint8Array(n), size: new Uint8Array(n),
      variant: new Uint8Array(n), tile: new Int32Array(n), on: new Uint8Array(n), kinds: ALL.slice()
    };
    order.forEach((q, k) => {
      out.x[k] = X[q]; out.y[k] = Y[q]; out.kind[k] = K[q]; out.size[k] = Z[q]; out.variant[k] = V[q];
      const i = tileOf(q); out.tile[k] = i; out.on[k] = tiles[i];
    });
    return out;
  }

  // Stepping stones: a few narrow places on the rivers and creek, with level, walkable banks on
  // both sides and well away from bridges, falls and each other, get a line of rocks across
  // (terrain 'stepping_stones', passable but slow). grid.art.fords lists the rocks (world px
  // centre, radius) and which way the water flows past them, for the renderer.
  function fords(grid, s){
    const W = grid.cols, H = grid.rows, TILE = G.CONFIG.TILE, tiles = grid.tiles, lvl = grid.art.level, id = k => G.Defs.terrain.get(k).id;
    const WATER = id('water'), DEEP = id('deep_water'), STONES = id('stepping_stones'), BRIDGE = id('bridge'), FALLS = id('waterfall');
    const wet = i => (tiles[i] === WATER || tiles[i] === DEEP) && grid.art.dir[i] !== 5;
    const bank = (i, l) => grid.solidTerrain[tiles[i]] === 0 && tiles[i] !== BRIDGE && lvl[i] === l && !wet(i);
    const clearOf = (x, y, r, ts) => { for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if (ts.includes(tiles[yy * W + xx])) return false; return true; };
    const cands = [];
    for (const [dx, dy, fx, fy] of [[1, 0, 0, 1], [0, 1, -1, 0]])   // across a river flowing south, then one flowing west
      for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++){
        const i0 = y * W + x;
        if (wet(i0) || !wet((y + dy) * W + x + dx)) continue;
        const l = lvl[(y + dy) * W + x + dx];
        if (!bank(i0, l)) continue;
        let n = 1;
        while (n < 9 && wet((y + dy * n) * W + x + dx * n) && lvl[(y + dy * n) * W + x + dx * n] === l) n++;
        const end = (y + dy * n) * W + x + dx * n;
        if (n - 1 < 3 || n - 1 > 7 || !bank(end, l)) continue;
        // Only where the river runs straight across the grid here, so the crossing sits square
        // in it: the same banks two tiles up and down the stream.
        let square = true;
        for (const o of [-2, -1, 1, 2]){
          const bx = x + (dy ? o : 0), by = y + (dx ? o : 0);
          if (!bank(by * W + bx, l)) { square = false; break; }
          for (let k = 1; k < n; k++) if (!wet((by + dy * k) * W + bx + dx * k)) { square = false; break; }
          if (square && !bank((by + dy * n) * W + bx + dx * n, l)) square = false;
          if (!square) break;
        }
        if (!square) continue;
        cands.push({ x, y, dx, dy, n: n - 1, fx, fy, key: hash(x, y, s + 811) });
      }
    cands.sort((a, b) => a.key - b.key);
    const L = grid.art.landing, chosen = [];
    for (const c of cands){
      if (chosen.length >= 6) break;
      const mx = c.x + c.dx * (c.n + 1) / 2, my = c.y + c.dy * (c.n + 1) / 2;
      if (chosen.some(o => Math.hypot(o.mx - mx, o.my - my) < 45) || Math.hypot(mx - L.x, my - L.y) < 30) continue;
      if (!clearOf(Math.round(mx), Math.round(my), 14, [BRIDGE, FALLS])) continue;
      chosen.push({ ...c, mx, my });
    }
    // Each crossing is rows of small rocks across the flow: four or five abreast mid-stream,
    // widening to eight or nine at the banks, where a worn dirt apron (path) meets it.
    const PATH = id('path'), GROUNDABLE = new Set(['grass', 'tall_grass', 'wildflowers', 'forest', 'bush', 'reeds', 'mushrooms', 'clearing', 'swamp'].map(id));
    const out = { x: [], y: [], r: [], fx: [], fy: [], land: [], c: [] };
    chosen.forEach((c, ci) => {
      for (let k = 1; k <= c.n; k++) tiles[(c.y + c.dy * k) * W + c.x + c.dx * k] = STONES;
      for (const k of [0, -1, c.n + 1, c.n + 2]){
        const x = c.x + c.dx * k, y = c.y + c.dy * k, i = y * W + x;
        if (x >= 0 && y >= 0 && x < W && y < H && GROUNDABLE.has(tiles[i])) tiles[i] = PATH;
      }
      const px = c.dy ? 1 : 0, py = c.dx ? 1 : 0;           // across the crossing
      const w0 = 0.5, w1 = c.n + 0.5, mid = (w0 + w1) / 2, half = (w1 - w0) / 2 + 1.5;
      const ox = (c.x + 0.5) * TILE, oy = (c.y + 0.5) * TILE;
      // Rocks in six sizes, mostly small: pebble-sized stones round a few bigger ones.
      const SIZES = [2, 3, 4, 5, 6, 7], WEIGHTS = [30, 25, 18, 12, 9, 6];
      // The line wanders across the river, rows vary in how many stones they hold and how far
      // apart, and now and then a stone is missing, so no two crossings look alike.
      const phase = hash(ci, 1, s + 841) * 6.28, drift = 4 + hash(ci, 2, s + 841) * 5;
      let row = 0;
      for (let sT = w0 + 0.05; sT <= w1 - 0.05; row++){
        const hrow = q => hash(ci * 997 + row, 99, s + q);
        const u = Math.min(1, Math.abs(sT - mid) / (half - 1.5)), count = Math.max(4, Math.round(4.5 + 4.5 * u ** 1.4 + (hrow(843) - 0.5) * 2));
        const step = 5.5 + 3 * u + hrow(845) * 3;   // rows closer together mid-stream, where they are narrow
        const centre = Math.sin(sT * 1.7 + phase) * drift * (0.4 + u);
        sT += step / TILE;
        for (let j = 0; j < count; j++){
          const hr = q => hash(ci * 997 + row, j, s + q);
          if (u > 0.3 && hr(847) < 0.1) continue;
          const along = (sT - step / TILE) * TILE + (hr(823) - 0.5) * 5, off = centre + (j - (count - 1) / 2) * (8.5 + hr(849) * 2.5) + (hr(827) - 0.5) * 5;
          const rx = Math.round(ox + c.dx * along + px * off), ry = Math.round(oy + c.dy * along + py * off), tr = tiles[Math.floor(ry / TILE) * W + Math.floor(rx / TILE)];
          if (tr !== WATER && tr !== DEEP && tr !== STONES) continue;   // only in the river, never on the bank
          let pick = hr(829) * 100, z = 0;
          while (z < SIZES.length - 1 && pick >= WEIGHTS[z]){ pick -= WEIGHTS[z]; z++; }
          if (u < 0.35 && z < 2) z += 1;   // mid-stream, where only three stand abreast, no pebbles: the way stays unbroken
          out.x.push(rx); out.y.push(ry); out.r.push(SIZES[z]);
          out.fx.push(c.fx); out.fy.push(c.fy); out.land.push(0); out.c.push(ci);
          // A pebble or two tucked beside the bigger stones.
          if (z >= 3 && hr(831) < 0.6){
            const [qx, qy] = [rx + Math.round((hr(833) - 0.5) * 12), ry + Math.round((hr(837) - 0.5) * 12)], tq = tiles[Math.floor(qy / TILE) * W + Math.floor(qx / TILE)];
            if (tq === WATER || tq === DEEP || tq === STONES){ out.x.push(qx); out.y.push(qy); out.r.push(2); out.fx.push(c.fx); out.fy.push(c.fy); out.land.push(0); out.c.push(ci); }
          }
        }
      }
    });
    grid.touch();
    return {
      count: out.x.length, x: Int32Array.from(out.x), y: Int32Array.from(out.y), r: Uint8Array.from(out.r), fx: Int8Array.from(out.fx), fy: Int8Array.from(out.fy),
      land: Uint8Array.from(out.land), c: Uint8Array.from(out.c),
      // From bank tile (x, y), n stone tiles along (dx, dy); `mid` is the middle stone tile.
      crossings: chosen.map(c => ({ x: c.x, y: c.y, dx: c.dx, dy: c.dy, n: c.n, mid: (c.y + c.dy * Math.ceil(c.n / 2)) * W + c.x + c.dx * Math.ceil(c.n / 2) }))
    };
  }



  // One-level banks: Woodlands mixes grassy slopes and short pieces of cliff along the same
  // edge, which reads as grass growing down a rock face. A piece of cliff between slopes
  // becomes slope too, and a lone slope in a run of cliff becomes cliff, so each stretch of
  // bank is one or the other.
  function banks(grid){
    const W = grid.cols, H = grid.rows, tiles = grid.tiles, lvl = grid.art.level, id = k => G.Defs.terrain.get(k).id;
    const CLIFF = id('cliff'), SLOPE = id('slope');
    for (let pass = 0; pass < 2; pass++){
      const flip = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++){
        const i = y * W + x, t = tiles[i];
        if (t !== CLIFF && t !== SLOPE) continue;
        let low = lvl[i], nS = 0, nC = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
          if (!dx && !dy) continue;
          const j = (y + dy) * W + x + dx;
          low = Math.min(low, lvl[j]);
          if (tiles[j] === SLOPE) nS++; else if (tiles[j] === CLIFF) nC++;
        }
        if (lvl[i] - low !== 1) continue;
        if (t === CLIFF && nS >= 2) flip.push([i, SLOPE]);
        else if (t === SLOPE && nS === 0 && nC >= 2) flip.push([i, CLIFF]);
      }
      for (const [i, t] of flip) tiles[i] = t;
    }
    grid.touch();
  }

  // Bridges run square across the water. Woodlands trails cross rivers on the diagonal, which
  // leaves L-shaped and stepped bridges; here each bridge becomes a straight deck two tiles wide
  // running east–west or north–south (whichever way it mostly crossed), the river runs straight
  // under it for a few tiles either side, and the trail meets each end head on.
  function bridges(grid, s){
    const W = grid.cols, H = grid.rows, N = W * H, tiles = grid.tiles, lvl = grid.art.level, id = k => G.Defs.terrain.get(k).id;
    const BRIDGE = id('bridge'), WATER = id('water'), DEEP = id('deep_water'), BOG = id('bog'), PATH = id('path'), GRASS = id('grass'), FALLS = id('waterfall'), STAIRS = id('steps');
    const NATURAL = new Set(['grass', 'tall_grass', 'wildflowers', 'forest', 'bush', 'reeds', 'mushrooms', 'swamp', 'path', 'thicket', 'tree'].map(id));
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const at = (x, y) => inb(x, y) ? tiles[y * W + x] : -1;
    const wetT = t => t === WATER || t === DEEP || t === BOG;
    const seen = new Uint8Array(N), out = [];
    for (let s0 = 0; s0 < N; s0++){
      if (tiles[s0] !== BRIDGE || seen[s0]) continue;
      const st = [s0], cells = [];
      seen[s0] = 1;
      let sEW = 0, sNS = 0, nearFalls = false;
      const under = new Map();
      while (st.length){
        const i = st.pop(), x = i % W, y = (i / W) | 0;
        cells.push(i);
        // Pieces of deck a tile apart are one bridge (overlapping trails leave ragged ones).
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){ const j = (y + dy) * W + x + dx; if (at(x + dx, y + dy) === BRIDGE && !seen[j]){ seen[j] = 1; st.push(j); } }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
          const t = at(x + dx, y + dy);
          if (t === BRIDGE || t < 0) continue;
          if (t === FALLS) nearFalls = true;
          if (wetT(t)) under.set(t, (under.get(t) || 0) + 1);
          const land = !wetT(t);
          if (dx){ if (land) sEW++; else sNS++; } else { if (land) sNS++; else sEW++; }
        }
      }
      if (nearFalls) continue;
      const ew = sEW >= sNS, water = [...under].sort((a, b) => b[1] - a[1])[0]?.[0] ?? WATER;
      // In (u, v): u along the way over, v across it.
      const X = (u, v) => ew ? u : v, Y = (u, v) => ew ? v : u;
      const U = i => ew ? i % W : (i / W) | 0, V = i => ew ? (i / W) | 0 : i % W;
      const v0 = Math.round(cells.reduce((a, i) => a + V(i), 0) / cells.length - 0.5);
      let u0 = Math.min(...cells.map(U)), u1 = Math.max(...cells.map(U));
      const crossable = (u) => [v0, v0 + 1].some(v => { const t = at(X(u, v), Y(u, v)); return t === BRIDGE || wetT(t); });
      while (crossable(u0 - 1) && u0 > 1) u0--;
      while (crossable(u1 + 1) && u1 < (ew ? W : H) - 2) u1++;
      // Long causeways (a trail along a lake shore or over the fen) stay as they are.
      if (u1 - u0 > 12 || cells.length > 40) continue;
      // Where trails meet out on the water (another bridge beside the new deck), leave it be.
      const own = new Set(cells);
      let joined = false;
      for (let u = u0 - 1; u <= u1 + 1 && !joined; u++) for (let v = v0 - 1; v <= v0 + 2; v++){ const x = X(u, v), y = Y(u, v); if (at(x, y) === BRIDGE && !own.has(y * W + x)){ joined = true; break; } }
      if (joined) continue;
      const L = lvl[s0];
      // Where the trails came onto the old deck, to reconnect them.
      const oldEnds = [];
      for (const i of cells){ const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const t = at(x + dx, y + dy); if (t === PATH || t === STAIRS) oldEnds.push((y + dy) * W + x + dx); } }
      const saved = new Map(), put = (i, t) => { if (!saved.has(i)) saved.set(i, tiles[i]); tiles[i] = t; };
      // The old deck goes back to water, the new one goes down.
      for (const i of cells) put(i, water);
      for (let u = u0; u <= u1; u++) for (const v of [v0, v0 + 1]){ const x = X(u, v), y = Y(u, v); if (inb(x, y)){ put(y * W + x, BRIDGE); seen[y * W + x] = 1; } }
      // The river runs square under the deck and bends gently back into its own course over
      // the next few tiles either side (so a diagonal river doesn't become a square pool): in
      // the row beside the deck the water spans the deck exactly, and each row further out
      // moves a third of the way back towards where the river really runs.
      const cU = Math.round((u0 + u1) / 2), wetAt = (u, v) => { const x = X(u, v), y = Y(u, v); return inb(x, y) && wetT(tiles[y * W + x]) && lvl[y * W + x] === L; };
      const runAt = v => {
        for (let d = 0; d <= 10; d++) for (const u of [cU - d, cU + d]){
          if (!wetAt(u, v)) continue;
          let a = u, b = u;
          while (a > u - 20 && wetAt(a - 1, v)) a--;
          while (b < u + 20 && wetAt(b + 1, v)) b++;
          return [a, b];
        }
        return null;
      };
      for (const side of [-1, 1]) for (let k = 1; k <= 3; k++){
        const v = side < 0 ? v0 - k : v0 + 1 + k, run = runAt(v), t = (k - 1) / 3;
        const a = run ? Math.round(u0 + (run[0] - u0) * t) : u0, b = run ? Math.round(u1 + (run[1] - u1) * t) : u1;
        if (!run && k > 1) continue;
        for (let u = a; u <= b; u++){ const x = X(u, v), y = Y(u, v), i = y * W + x; if (inb(x, y) && NATURAL.has(tiles[i]) && lvl[i] === L) put(i, water); }
        const lo = Math.min(a, run ? run[0] : a) - 2, hi = Math.max(b, run ? run[1] : b) + 2;
        for (let u = lo; u <= hi; u++){ if (u >= a && u <= b) continue; const x = X(u, v), y = Y(u, v), i = y * W + x; if (inb(x, y) && wetT(tiles[i]) && lvl[i] === L) put(i, GRASS); }
      }
      // The trail meets it head on.
      const approach = new Set();
      for (const u of [u0 - 1, u0 - 2, u0 - 3, u1 + 1, u1 + 2, u1 + 3]) for (const v of [v0, v0 + 1]){
        const x = X(u, v), y = Y(u, v), i = y * W + x;
        if (inb(x, y) && (NATURAL.has(tiles[i]) || wetT(tiles[i])) && lvl[i] === L){ put(i, PATH); approach.add(i); }
      }
      // Every trail that came onto the old bridge must reach the new one over land (paved
      // straight to it); if one can't, the bridge stays as it was.
      const walk = (i, j) => { const t = tiles[j]; return !grid.solidTerrain[t] && !wetT(t) && t !== BRIDGE && Math.abs(lvl[j] - lvl[i]) <= 1; };
      const links = [];
      let ok = approach.size > 0;
      for (const e of oldEnds){
        if (!ok) break;
        if (approach.has(e) || tiles[e] === BRIDGE) continue;
        if (wetT(tiles[e])) continue;   // under the new water: the approach replaces it
        const p = route(W, H, [e], i => approach.has(i), walk, 40);
        if (p) links.push(p); else ok = false;
      }
      if (!ok){ for (const [i, t] of saved) tiles[i] = t; continue; }
      for (const i of saved.keys()) grid.art.detail[i] = 0;
      for (const p of links) for (const i of p) if (NATURAL.has(tiles[i])){ tiles[i] = PATH; grid.art.detail[i] = 0; }
      out.push({ ew, u0, u1, v0, ends: [[X(u0 - 3, v0), Y(u0 - 3, v0)], [X(u1 + 3, v0), Y(u1 + 3, v0)]] });
    }
    grid.touch();
    return out;
  }

  // Paves the cheapest way (4 directions, turns cost extra, so paths run straight along the
  // grid) from the tiles in `from` to the nearest tile `goal(i)` accepts, over tiles `ok(i, j)`
  // lets a path step between. Returns the tiles walked, or null.
  function route(W, H, from, goal, ok, maxCost){
    const N = W * H, cost = new Float32Array(N * 4).fill(Infinity), came = new Int32Array(N * 4).fill(-1), heap = [];
    const push = (k, c) => { heap.push([c, k]); let i = heap.length - 1; while (i > 0){ const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length){ heap[0] = last; let i = 0; for (;;){ const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const i of from) for (let d = 0; d < 4; d++){ cost[i * 4 + d] = 0; push(i * 4 + d, 0); }
    while (heap.length){
      const [c, k] = pop();
      if (c > cost[k] || c > maxCost) continue;
      const i = k >> 2, d0 = k & 3;
      if (c > 0 && goal(i)){ const path = []; for (let q = k; q >= 0; q = came[q]) path.push(q >> 2); return path.reverse(); }
      const x = i % W, y = (i / W) | 0;
      for (let d = 0; d < 4; d++){
        const nx = x + D[d][0], ny = y + D[d][1], j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || (!goal(j) && !ok(i, j))) continue;
        const nc = c + 1 + (d === d0 ? 0 : 0.6), nk = j * 4 + d;
        if (nc < cost[nk]){ cost[nk] = nc; came[nk] = k; push(nk, nc); }
      }
    }
    return null;
  }

  // Villages and camps: buildings that ended up against a cliff, in the water or across a
  // change of level are moved to open, level ground nearby; every house door gets a path to
  // the road; each village gets a barn with a fenced paddock and hay, and the lived-in things
  // round the houses (a well on the green, lamp posts along the lanes, benches, a signpost,
  // barrels and crates by the walls, a cart). Returns the props to plant and the barns.
  function towns(grid, s){
    const W = grid.cols, H = grid.rows, N = W * H, TILE = G.CONFIG.TILE, tiles = grid.tiles, lvl = grid.art.level, id = k => G.Defs.terrain.get(k).id;
    const WALL = id('wall'), FLOOR = id('floor'), DOOR = id('door'), LOGW = id('log_wall'), PATH = id('path'), GRASS = id('grass'), STAIRS = id('steps'), BRIDGE = id('bridge');
    const PART = new Set([WALL, FLOOR, DOOR, LOGW]);
    const BAD = new Set(['cliff', 'slope', 'steps', 'water', 'deep_water', 'waterfall', 'bog', 'bridge', 'cave', 'stepping_stones', 'clearing'].map(id));
    const OPEN = new Set(['grass', 'tall_grass', 'wildflowers', 'bush', 'forest', 'mushrooms', 'burrow', 'rubble'].map(id));
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const at = (x, y) => inb(x, y) ? tiles[y * W + x] : -1;
    const places = (grid.art.places || []).filter(p => p.kind === 'settlement' || p.kind === 'camp');
    const nearestPlace = (x, y) => places.reduce((b, p) => !b || Math.hypot(p.x - x, p.y - y) < Math.hypot(b.x - x, b.y - y) ? p : b, null);
    // Buildings: joined wall, floor, door and log-wall tiles.
    const comps = [], of = new Int32Array(N).fill(-1);
    for (let s0 = 0; s0 < N; s0++){
      if (of[s0] >= 0 || !PART.has(tiles[s0])) continue;
      const st = [s0], cells = [];
      of[s0] = comps.length;
      while (st.length){
        const i = st.pop(), x = i % W, y = (i / W) | 0; cells.push(i);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const j = (y + dy) * W + x + dx; if (inb(x + dx, y + dy) && of[j] < 0 && PART.has(tiles[j])){ of[j] = comps.length; st.push(j); } }
      }
      const xs = cells.map(i => i % W), ys = cells.map(i => (i / W) | 0), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 + 1, h = Math.max(...ys) - y0 + 1;
      const log = cells.some(i => tiles[i] === LOGW), intact = cells.length === w * h && w >= 3 && h >= 3;
      comps.push({ x: x0, y: y0, w, h, cells, log, intact, L: lvl[cells[0]] });
    }
    // Whether a building stands clear: nothing it touches (or its ring of ground) is cliff,
    // water or another feature, and all of it is on one level.
    const clear = c => {
      for (const i of c.cells){
        const x = i % W, y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const t = at(x + dx, y + dy), j = (y + dy) * W + x + dx; if (t < 0 || BAD.has(t) || lvl[j] !== c.L) return false; }
      }
      return true;
    };
    // Open, level ground for a w × h building with `m` tiles round it.
    const fits = (x0, y0, w, h, m, L) => {
      for (let y = y0 - m; y < y0 + h + m; y++) for (let x = x0 - m; x < x0 + w + m; x++){
        const t = at(x, y), inner = x >= x0 && y >= y0 && x < x0 + w && y < y0 + h;
        if (t < 0 || lvl[y * W + x] !== L || !(OPEN.has(t) || (!inner && t === PATH))) return false;
      }
      return true;
    };
    const houses = [];
    const stamp = (x0, y0, w, h, log, face) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++){ const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1; tiles[y * W + x] = edge ? (log ? LOGW : WALL) : FLOOR; grid.art.detail[y * W + x] = 0; }
      const dx = face.x - (x0 + w / 2), dy = face.y - (y0 + h / 2);
      let door;
      if (Math.abs(dx) > Math.abs(dy)) door = { x: dx > 0 ? x0 + w - 1 : x0, y: y0 + Math.floor(h / 2), ox: dx > 0 ? 1 : -1, oy: 0 };
      else door = { x: x0 + Math.floor(w / 2), y: dy > 0 ? y0 + h - 1 : y0, ox: 0, oy: dy > 0 ? 1 : -1 };
      tiles[door.y * W + door.x] = DOOR;
      tiles[(door.y + door.oy) * W + door.x + door.ox] = PATH;
      const H0 = { x: x0, y: y0, w, h, log, door };
      houses.push(H0);
      return H0;
    };
    const doorOf = c => {
      const i = c.cells.find(q => tiles[q] === DOOR);
      if (i === undefined) return null;
      const x = i % W, y = (i / W) | 0;
      return { x, y, ox: x === c.x ? -1 : x === c.x + c.w - 1 ? 1 : 0, oy: y === c.y ? -1 : y === c.y + c.h - 1 ? 1 : 0 };
    };
    const place = (c, m) => {
      const home = nearestPlace(c.x + c.w / 2, c.y + c.h / 2), cx = c.x, cy = c.y;
      for (let r = 1; r <= 18; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (!inb(x, y) || !fits(x, y, c.w, c.h, m, c.L)) continue;
        if (home && Math.hypot(x + c.w / 2 - home.x, y + c.h / 2 - home.y) > 24) continue;
        return stamp(x, y, c.w, c.h, c.log, home || { x: x + c.w / 2, y: y + c.h + 5 });
      }
      return null;
    };
    for (const c of comps){
      if (clear(c)){
        if (c.intact){ const d = doorOf(c); houses.push({ x: c.x, y: c.y, w: c.w, h: c.h, log: c.log, door: d }); }
        continue;
      }
      // Take it down; an intact house is rebuilt on open ground nearby, a ruin just goes.
      for (const i of c.cells){ tiles[i] = BAD.has(tiles[i]) ? tiles[i] : GRASS; grid.art.detail[i] = 0; }
      if (c.intact) place(c, 2);
    }

    // Villages are kept: most of the long grass and brush between the houses is cut.
    const THICK = id('tall_grass'), SHRUB = id('bush');
    for (const p of places.filter(q => q.kind === 'settlement')) for (let y = p.y - 20; y <= p.y + 20; y++) for (let x = p.x - 20; x <= p.x + 20; x++){
      const i = y * W + x, d = Math.hypot(x - p.x, y - p.y);
      if (!inb(x, y) || d > 20 || !(tiles[i] === THICK || tiles[i] === SHRUB)) continue;
      if (hash(x, y, s + 999) < (tiles[i] === THICK ? 0.85 : 0.5) * Math.min(1, (22 - d) / 8)){ tiles[i] = GRASS; grid.art.detail[i] = 0; }
    }
    // Barns: one per village, at its edge, with room for a paddock.
    const barns = [], props = [];
    const prop = (px, py, kind, z, v) => props.push({ x: Math.round(px), y: Math.round(py), kind, z, v });
    const h8 = (a, b, q) => Math.floor(hash(a, b, s + q) * 256);
    for (const p of places.filter(q => q.kind === 'settlement')){
      const L = lvl[p.y * W + p.x];
      let done = false;
      for (let tryN = 0; tryN < 4 && !done; tryN++) for (let r = 10; r <= 28 && !done; r++) for (let k = 0; k < 24 && !done; k++){
        const th = (k / 24 + hash(p.x, p.y, s + 1001)) * Math.PI * 2, bw = tryN < 2 ? 6 : 5, bh = 4, horiz = (hash(p.x, p.y, s + 1003) < 0.5) !== (tryN & 1) > 0;
        const w = horiz ? bw : bh, h = horiz ? bh : bw, x = Math.round(p.x + Math.cos(th) * r - w / 2), y = Math.round(p.y + Math.sin(th) * r - h / 2);
        if (!fits(x, y, w, h, tryN < 2 ? 2 : 1, L)) continue;
        // The paddock beside it, away from the green.
        const side = Math.abs(Math.cos(th)) > Math.abs(Math.sin(th)) ? [Math.sign(Math.cos(th)), 0] : [0, Math.sign(Math.sin(th))];
        const pw = side[0] ? 4 : w, ph = side[1] ? 4 : h, px0 = side[0] > 0 ? x + w + 1 : side[0] < 0 ? x - 5 : x, py0 = side[1] > 0 ? y + h + 1 : side[1] < 0 ? y - 5 : y;
        const H0 = stamp(x, y, w, h, false, p);
        barns.push({ x, y, w, h });
        done = true;
        if (fits(px0, py0, pw, ph, 0, L)){
          // Fence round it, rails between posts at every half tile, a gap for the gate.
          const X0 = px0 * TILE, Y0 = py0 * TILE, X1 = (px0 + pw) * TILE, Y1 = (py0 + ph) * TILE;
          for (let fx = X0 + 12; fx < X1; fx += 24){ prop(fx, Y0, 'fence', 0, 0); if (Math.abs(fx - (X0 + X1) / 2) > 20) prop(fx, Y1, 'fence', 0, 0); }
          for (let fy = Y0 + 12; fy < Y1; fy += 24){ prop(X0, fy, 'fence', 0, 1); prop(X1, fy, 'fence', 0, 1); }
          for (let j = 0; j < 4; j++) prop(X0 + TILE * (0.6 + hash(x, j, s + 1005) * (pw - 1.2)), Y0 + TILE * (0.6 + hash(y, j, s + 1007) * (ph - 1.2)), 'hay', 0, j & 1);
        }
        const d = H0.door, sx = (d.x + d.ox * 2 + 0.5) * TILE, sy = (d.y + d.oy * 2 + 0.5) * TILE;
        prop(sx + d.oy * 30, sy + d.ox * 30, 'hay', 1, 0);
        prop(sx - d.oy * 34, sy - d.ox * 34, 'cart', 0, d.ox ? 1 : 0);
      }
    }

    // Paths from every door to the road (the trails and the green, not another door step).
    const road = new Uint8Array(N);
    {
      const seen = new Uint8Array(N);
      for (let s0 = 0; s0 < N; s0++){
        if (seen[s0] || (tiles[s0] !== PATH && tiles[s0] !== STAIRS && tiles[s0] !== BRIDGE)) continue;
        const st = [s0], cells = []; seen[s0] = 1;
        while (st.length){ const i = st.pop(), x = i % W, y = (i / W) | 0; cells.push(i); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const t = at(x + dx, y + dy), j = (y + dy) * W + x + dx; if ((t === PATH || t === STAIRS || t === BRIDGE) && !seen[j]){ seen[j] = 1; st.push(j); } } }
        if (cells.length >= 12) for (const i of cells) road[i] = 1;
      }
    }
    for (const Hs of houses){
      const d = Hs.door;
      if (!d) continue;
      const st = (d.y + d.oy) * W + d.x + d.ox, L = lvl[st];
      if (road[st]) continue;
      const p = route(W, H, [st], i => road[i] === 1 && lvl[i] === L, (i, j) => lvl[j] === L && (OPEN.has(tiles[j]) || tiles[j] === PATH), 50);
      if (p) for (const i of p) if (OPEN.has(tiles[i])){ tiles[i] = PATH; grid.art.detail[i] = 0; }
      if (p) for (const i of p) road[i] = 1;
    }

    // The lived-in village.
    for (const p of places){
      const L = lvl[p.y * W + p.x], T2 = TILE / 2;
      if (p.kind === 'settlement'){
        prop(p.x * TILE + T2, p.y * TILE + T2, 'well', 0, 0);
        // Benches facing the well, a signpost at the corner of the green.
        for (const [dx, dy] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) if (hash(p.x + dx, p.y + dy, s + 1011) < 0.6 && OPEN.has(at(p.x + dx, p.y + dy))) prop((p.x + dx) * TILE + T2 - dx * 6, (p.y + dy) * TILE + T2 - dy * 6, 'bench', 0, dx ? 1 : 0);
        prop((p.x + 2) * TILE + TILE - 6, (p.y - 2) * TILE + 8, 'sign', 0, hash(p.x, p.y, s + 1013) < 0.5 ? 0 : 1);
        // Lamp posts along the lanes, at the edge of the path, no two close together.
        const lamps = [];
        for (let y = p.y - 20; y <= p.y + 20; y++) for (let x = p.x - 20; x <= p.x + 20; x++){
          const i = y * W + x;
          if (!inb(x, y) || tiles[i] !== PATH || lvl[i] !== L || Math.hypot(x - p.x, y - p.y) > 20 || Math.hypot(x - p.x, y - p.y) < 3) continue;
          if (hash(x, y, s + 1015) > 0.5 || lamps.some(q => Math.hypot(q[0] - x, q[1] - y) < 6)) continue;
          const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => OPEN.has(at(x + dx, y + dy)));
          if (!side) continue;
          lamps.push([x, y]);
          prop(x * TILE + T2 + side[0] * 20, y * TILE + T2 + side[1] * 20, 'lamp', 0, h8(x, y, 1017) & 1);
        }
      }
    }
    // Barrels, crates and rain barrels against the house walls (not across the door).
    for (const Hs of houses){
      const home = nearestPlace(Hs.x, Hs.y);
      if (!home || barns.some(b => b.x === Hs.x && b.y === Hs.y)) continue;
      const n = 1 + Math.floor(hash(Hs.x, Hs.y, s + 1021) * 3);
      for (let j = 0; j < n; j++){
        const side = Math.floor(hash(Hs.x, Hs.y, s + 1023 + j) * 4), f = 0.15 + hash(Hs.x, Hs.y, s + 1025 + j) * 0.7;
        const [ox, oy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
        if (Hs.door && ox === Hs.door.ox && oy === Hs.door.oy) continue;
        let px = (Hs.x + (ox > 0 ? Hs.w : ox < 0 ? 0 : Hs.w * f)) * TILE + ox * 12, py = (Hs.y + (oy > 0 ? Hs.h : oy < 0 ? 0 : Hs.h * f)) * TILE + oy * 12;
        const t = at(Math.floor(px / TILE), Math.floor(py / TILE));
        if (!OPEN.has(t) && t !== PATH) continue;
        const k = hash(px, py, s + 1027);
        if (k < 0.55){ prop(px, py, 'barrel', 0, k < 0.12 ? 1 : k < 0.2 ? 2 : 0); if (k < 0.3) prop(px + (oy ? 9 : 0), py + (ox ? 9 : 0), 'barrel', 0, 0); }
        else { prop(px, py, 'crate', 0, k < 0.8 ? 0 : 1); if (k > 0.85) prop(px + (oy ? 10 : 0), py + (ox ? 10 : 0), 'barrel', 0, 0); }
      }
    }
    // Flower beds along the front of some houses, either side of the door.
    for (const Hs of houses){
      const d = Hs.door;
      if (!d || Hs.log || barns.some(b => b.x === Hs.x && b.y === Hs.y) || hash(Hs.x, Hs.y, s + 1031) > 0.5) continue;
      const colour = Math.floor(hash(Hs.x, Hs.y, s + 1033) * 6);
      const along = d.ox ? [0, 1] : [1, 0], len = d.ox ? Hs.h : Hs.w, start = d.ox ? Hs.y : Hs.x;
      for (let k = 0; k < len; k++){
        const t = start + k, px = d.ox ? (d.x + (d.ox > 0 ? 1 : 0)) * TILE + d.ox * 9 : (t + 0.5) * TILE, py = d.ox ? (t + 0.5) * TILE : (d.y + (d.oy > 0 ? 1 : 0)) * TILE + d.oy * 9;
        if (t === (d.ox ? d.y : d.x)) continue;   // not across the door
        const tt = at(Math.floor(px / TILE), Math.floor(py / TILE));
        if (OPEN.has(tt)) prop(px, py, 'flowers', 0, colour);
      }
    }
    grid.touch();
    return { props, barns };
  }


  // Caves: behind every cave mouth a cavern is cut into the high ground, a short passage
  // opening into a small chamber or a medium one with a side pocket. Its floor ('cave_floor')
  // lies a level below the rock round it, which becomes cliff, so the walls are drawn as rock
  // faces; the mouth itself becomes floor, the way in. grid.art.caverns lists each cavern and
  // where its contents go (placed when a game starts, G.Caves): a chest (some rare), and in
  // some a hostile nest or a recording. Crystals and glowing fungi grow inside (props).
  function caverns(grid, s){
    const W = grid.cols, H = grid.rows, N = W * H, TILE = G.CONFIG.TILE, tiles = grid.tiles, lvl = grid.art.level, id = k => G.Defs.terrain.get(k).id;
    const CAVE = id('cave'), FLOOR = id('cave_floor'), CLIFF = id('cliff');
    // What the rock round a cavern may be: any dry, natural ground (not water, paths, bridges,
    // buildings or another feature's tiles).
    const NOT = new Set(['water', 'deep_water', 'waterfall', 'bog', 'swamp', 'reeds', 'path', 'bridge', 'steps', 'slope', 'wall', 'floor', 'door', 'log_wall', 'cave', 'cave_floor', 'stepping_stones', 'clearing', 'log_pile', 'sawhorse', 'fallen_tree', 'steam_vent', 'termite_mound'].map(id));
    const SOLID = { has: t => !NOT.has(t) };
    const inb = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1;
    const taken = new Uint8Array(N), out = [], props = [];
    const prop = (px, py, kind, z, v) => props.push({ x: Math.round(px), y: Math.round(py), kind, z, v });
    for (let m = 0; m < N; m++){
      if (tiles[m] !== CAVE) continue;
      const mx = m % W, my = (m / W) | 0, L = lvl[m], below = m + W;
      if (!inb(mx, my + 1) || NOT.has(tiles[below]) && tiles[below] !== id('path') || lvl[below] >= L) continue;
      const h = q => hash(mx, my, s + q);
      // Try the size it was dealt, then smaller, until the rock has room for it.
      const tries = [];
      for (let size = h(1) < 0.45 ? 1 : 0; size >= 0; size--) for (const shift of [0, -3, 3, -6, 6]) for (const shorter of [0, 1]) tries.push([size, shift, shorter]);
      for (const [size, shift, shorter] of tries){
        const R = (size ? 5 + h(3) * 1.8 : 2.8 + h(3) * 0.9) - shorter * 0.6, tl = Math.max(1, 2 + Math.floor(h(5) * 2) + size - shorter);
        const cx = mx + Math.round((h(7) - 0.5) * 4) + shift, cy = my - tl - Math.ceil(R);
        const cells = new Set(), add = (x, y) => { if (inb(x, y)) cells.add(y * W + x); else cells.add(-1); };
        // The passage in, wider in a medium cave, bending towards the chamber.
        // (Each row joins the one below side by side, so the way through never goes corner to corner.)
        for (let k = 1, px = mx; k <= tl + 1; k++){
          const x = Math.round(mx + (cx - mx) * k / (tl + 1));
          for (let xx = Math.min(px, x); xx <= Math.max(px, x); xx++) add(xx, my - k);
          if (size) add(x + (h(9) < 0.5 ? 1 : -1), my - k);
          px = x;
        }
        const blob = (bx, by, r, q) => {
          for (let y = Math.floor(by - r - 2); y <= by + r + 2; y++) for (let x = Math.floor(bx - r - 2); x <= bx + r + 2; x++){
            const a = Math.atan2(y - by, x - bx), wob = 0.78 + 0.44 * vnoise(Math.cos(a) * 1.6 + q, Math.sin(a) * 1.6 + q, s + 1101);
            if (Math.hypot(x - bx, (y - by) * 1.15) < r * wob) add(x, y);
          }
        };
        blob(cx, cy, R, mx * 0.37);
        if (size){ const a = h(11) * Math.PI * 2, d = R * 0.95; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, R * 0.55, my * 0.41); }
        if (cells.has(-1)) continue;
        // The rock must be whole: every cell and the ring round it on the high ground, clear of
        // water, paths, buildings and other caves (the passage's first step joins the mouth).
        let ok = true;
        for (const i of cells){
          const x = i % W, y = (i / W) | 0;
          for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++){
            const j = (y + dy) * W + x + dx;
            if (j === m || j === below || cells.has(j)) continue;
            if (j === m - 1 || j === m + 1) continue;   // the cliff either side of the mouth
            if (!SOLID.has(tiles[j]) || lvl[j] < L || taken[j]){ ok = false; break; }
          }
          if (!ok) break;
        }
        if (!ok) continue;
        cells.add(m);
        // A worn way in: path outside the mouth, so nothing grows across it.
        for (const j of [below, below + W]) if (j < N && !NOT.has(tiles[j]) && lvl[j] === lvl[below]){ tiles[j] = id('path'); grid.art.detail[j] = 0; }
        for (const i of cells){ tiles[i] = FLOOR; lvl[i] = L - 1; taken[i] = 1; grid.art.detail[i] = 0; }
        for (const i of cells){
          const x = i % W, y = (i / W) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const j = (y + dy) * W + x + dx; if (!cells.has(j) && lvl[j] >= L){ tiles[j] = CLIFF; taken[j] = 1; grid.art.detail[j] = 0; } }
        }
        // What is in it: the chest in the deepest spot, a nest in the chamber (on a 2 × 2 of
        // floor), a recording somewhere between. Distances by walking from the mouth.
        const dist = new Map([[m, 0]]), q = [m];
        while (q.length){ const i = q.shift(), x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const j = (y + dy) * W + x + dx; if (cells.has(j) && !dist.has(j)){ dist.set(j, dist.get(i) + 1); q.push(j); } } }
        const inner = [...cells].filter(i => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => cells.has(i + dy * W + dx)));
        const deepest = inner.reduce((b, i) => dist.get(i) > dist.get(b) ? i : b, inner[0] ?? m);
        const at = i => ({ x: i % W, y: (i / W) | 0 });
        const cave = { x: mx, y: my, size: size ? 'medium' : 'small', cells: cells.size, chest: { ...at(deepest), rare: h(13) < (size ? 0.6 : 0.25) }, nest: null, recording: null };
        const block = i => [0, 1, W, W + 1].every(o => cells.has(i + o) && i + o !== deepest) && [-1, 2, -W, 2 * W, -W + 1, 2 * W + 1, W - 1, W + 2].every(o => cells.has(i + o));
        if (h(15) < (size ? 0.7 : 0.3)){
          const spots = inner.filter(block).sort((a, b) => Math.abs(dist.get(a) - dist.get(deepest) * 0.6) - Math.abs(dist.get(b) - dist.get(deepest) * 0.6));
          if (spots.length) cave.nest = at(spots[0]);
        }
        if (h(17) < 0.5){
          const spots = inner.filter(i => i !== deepest && (!cave.nest || Math.hypot(i % W - cave.nest.x, ((i / W) | 0) - cave.nest.y) > 3) && dist.get(i) > 3);
          if (spots.length) cave.recording = at(spots[Math.floor(h(19) * spots.length)]);
        }
        out.push(cave);
        // Crystals and glowing fungi on the floor by the walls, pebbles and bones here and there.
        for (const i of cells){
          const x = i % W, y = (i / W) | 0, r = hash(x, y, s + 1121), wall = !inner.includes(i);
          if (i === deepest || (cave.nest && Math.abs(x - cave.nest.x - 0.5) < 2 && Math.abs(y - cave.nest.y - 0.5) < 2)) continue;
          const px = x * TILE + TILE * (0.2 + hash(x, y, s + 1123) * 0.6), py = y * TILE + TILE * (0.2 + hash(x, y, s + 1127) * 0.6);
          if (wall && r < 0.28) prop(px, py, 'crystal', r < 0.08 ? 1 : 0, Math.floor(hash(x, y, s + 1129) * 256));
          else if (r < 0.4) prop(px, py, 'mushrooms', 0, Math.floor(hash(x, y, s + 1131) * 256));
          else if (r < 0.52) prop(px, py, 'pebbles', 0, Math.floor(hash(x, y, s + 1133) * 256));
          else if (r < 0.56) prop(px, py, 'bones', 0, Math.floor(hash(x, y, s + 1137) * 256));
        }
        break;
      }
    }
    grid.touch();
    return { caves: out, props };
  }

  function genesis(seed, opts = {}){
    const grid = G.MapGen.woodlands(seed, opts);
    grid.art.generator = 'genesis';
    grid.art.version = VERSION;
    banks(grid);
    grid.art.bridges = bridges(grid, (seed | 0) ^ 0xb1d);
    const town = towns(grid, (seed | 0) ^ 0x70e);
    grid.art.barns = town.barns;
    const underground = caverns(grid, (seed | 0) ^ 0xca7e);
    grid.art.caverns = underground.caves;
    grid.art.trees = plant(grid, (seed | 0) ^ 0x5eed, [...town.props, ...underground.props]);
    grid.art.fords = fords(grid, (seed | 0) ^ 0xf0d);
    return grid;
  }

  G.MapGen.genesis = genesis;
  G.MapGen.types.genesis = { name: 'Genesis v' + VERSION, generate: genesis, clearLanding: true };
})();
