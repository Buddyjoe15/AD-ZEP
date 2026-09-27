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

  function plant(grid, s){
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

    // 6. Drawing order: dead wood under every tree, small trees under big ones, then north to
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
    const out = { x: [], y: [], r: [], fx: [], fy: [] };
    for (const c of chosen) for (let k = 1; k <= c.n; k++){
      const tx = c.x + c.dx * k, ty = c.y + c.dy * k;
      tiles[ty * W + tx] = STONES;
      // Two rocks per tile along the crossing, nudged off the line a little.
      for (let j = 0; j < 2; j++){
        const along = (k - 1 + (j + 0.5) / 2) * TILE + TILE / 2 + (hash(tx, ty, s + 819 + j) - 0.5) * 8, off = (hash(tx, ty, s + 813 + j) - 0.5) * 16;
        out.x.push(Math.round((c.x + 0.5) * TILE + c.dx * along + c.fx * off)); out.y.push(Math.round((c.y + 0.5) * TILE + c.dy * along + c.fy * off));
        out.r.push(7 + Math.round(hash(tx, ty, s + 817 + j) * 4)); out.fx.push(c.fx); out.fy.push(c.fy);
      }
    }
    grid.touch();
    return {
      count: out.x.length, x: Int32Array.from(out.x), y: Int32Array.from(out.y), r: Uint8Array.from(out.r), fx: Int8Array.from(out.fx), fy: Int8Array.from(out.fy),
      crossings: chosen.map(c => ({ x: c.x, y: c.y, dx: c.dx, dy: c.dy, n: c.n }))   // from bank tile (x, y), n stone tiles along (dx, dy)
    };
  }

  function genesis(seed, opts = {}){
    const grid = G.MapGen.woodlands(seed, opts);
    grid.art.generator = 'genesis';
    grid.art.version = VERSION;
    grid.art.trees = plant(grid, (seed | 0) ^ 0x5eed);
    grid.art.fords = fords(grid, (seed | 0) ^ 0xf0d);
    return grid;
  }

  G.MapGen.genesis = genesis;
  G.MapGen.types.genesis = { name: 'Genesis v' + VERSION, generate: genesis, clearLanding: true };
})();
