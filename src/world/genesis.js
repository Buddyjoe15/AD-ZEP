/* Genesis map generator (v0.1): the landscaping test bed. For now it builds the Woodlands
   landscape for the seed (heights, rivers, waterfalls, lake, fen, villages, camps, trails)
   and then replants every forest as free-standing trees (species in src/data/trees.js).

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
  const SPACING_THICK = 22, SPACING_THIN = 86;
  // Candidate trunks are tried in PASSES rounds, each in a hashed share of the candidates, so
  // the scan order doesn't leave a direction in the pattern.
  const PASSES = 8;

  function plant(grid, s){
    const W = grid.cols, H = grid.rows, N = W * H, TILE = G.CONFIG.TILE, tiles = grid.tiles, art = grid.art;
    const TR = G.TREES, KINDS = TR.KINDS, id = k => G.Defs.terrain.get(k).id;
    const TREE = id('tree'), FLOOR = id('forest'), GRASS = id('grass'), BUSH = id('bush'), STUMP = id('stump');
    const SOIL = new Uint8Array(256), WET = new Uint8Array(256), FEN = new Uint8Array(256);
    for (const k of ['tree', 'bush', 'tall_grass', 'grass', 'wildflowers', 'mushrooms', 'swamp']) SOIL[id(k)] = 1;
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
    const cover = new Float32Array(N), thick = new Float32Array(N), lone = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const i = y * W + x, f = clamp01(box(x - 2, y - 2, x + 2, y + 2) / 25 / 0.7);
      cover[i] = f;
      if (!SOIL[tiles[i]]) continue;
      if (f < 0.12){ if (tiles[i] === TREE && Math.hypot(x - L.x, y - L.y) > 36) lone[i] = 1; continue; }
      // 2. How thick the woodland is here: whole stands (thick or open), clumps and glades.
      const stand = clamp01((fbm(x / 30, y / 30, s + 601, 3) - 0.32) / 0.36), clump = fbm(x / 7, y / 7, s + 607, 2);
      let t = f ** 1.5 * (0.15 + 0.85 * stand) + (clump - 0.5) * 0.7 * f;
      if (clump < 0.3) t *= 0.35;
      thick[i] = clamp01(t);
    }

    // 3. Trunks by dart throwing with a spacing that follows the local thickness. A trunk is
    // kept only if it is at least the mean of both trees' spacings from every other trunk, so
    // thick and thin woodland meet without a seam. Neighbours are found in a per-tile grid.
    const cap = 1 << 16;
    let n = 0, X = new Int32Array(cap), Y = new Int32Array(cap), R = new Float32Array(cap);
    let K = new Uint8Array(cap), Z = new Uint8Array(cap), V = new Uint8Array(cap), NX = new Int32Array(cap);
    const grow = () => {
      const m = X.length * 2, g = (A, T) => { const B = new T(m); B.set(A); return B; };
      X = g(X, Int32Array); Y = g(Y, Int32Array); R = g(R, Float32Array); K = g(K, Uint8Array); Z = g(Z, Uint8Array); V = g(V, Uint8Array); NX = g(NX, Int32Array);
    };
    const head = new Int32Array(N).fill(-1);
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
    for (let pass = 0; pass < PASSES; pass++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const i = y * W + x, isLone = lone[i] === 1;
      if (!isLone && !(cover[i] >= 0.12 && SOIL[tiles[i]])) continue;
      const t = isLone ? 0 : thick[i], spacing = SPACING_THIN - (SPACING_THIN - SPACING_THICK) * t;
      const tries = isLone ? 1 : Math.min(12, Math.ceil(2.2 * (TILE / spacing) ** 2));
      for (let j = 0; j < tries; j++){
        if (Math.floor(hash(i, j, s + 621) * PASSES) !== pass) continue;
        // Lone trees keep near the middle of their tile; forest trunks go anywhere in it.
        const spread = isLone ? 0.5 : 1, px = Math.floor(x * TILE + TILE * (0.5 + (hash(i, j, s + 623) - 0.5) * spread)), py = Math.floor(y * TILE + TILE * (0.5 + (hash(i, j, s + 627) - 0.5) * spread));
        const kind = species(x, y, px, py, i), z = size(kind, t, isLone, px, py), r = Math.max(spacing, TR.species[kind].crown[z] * 0.5);
        let ok = true;
        for (let yy = Math.max(0, y - 2); yy <= Math.min(H - 1, y + 2) && ok; yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(W - 1, x + 2) && ok; xx++)
          for (let q = head[yy * W + xx]; q >= 0; q = NX[q]){
            const need = (r + R[q]) / 2, dx = X[q] - px, dy = Y[q] - py;
            if (dx * dx + dy * dy < need * need){ ok = false; break; }
          }
        if (!ok) continue;
        if (n === X.length) grow();
        X[n] = px; Y[n] = py; R[n] = r; K[n] = KINDS.indexOf(kind); Z[n] = z; V[n] = Math.floor(hash(px, py, s + 631) * 256); NX[n] = head[i]; head[i] = n;
        n++;
      }
    }

    // 4. Terrain under the trees: old tree tiles, and the brush between them (the saplings
    // stand in for it now), become forest floor (grass out in the open); then every trunk of
    // a medium or large tree blocks its tile.
    const D = key => (G.WOODLANDS_DETAIL || []).indexOf(key) + 1;
    const LEAVES = D('LEAVES'), TWIGS = D('TWIGS'), BRANCH = D('BRANCH'), PEBBLES = D('PEBBLES');
    // Stumps stay only at the logging camps; the lines of them Woodlands leaves along trails
    // go back to forest floor.
    const camps = art.places.filter(p => p.kind === 'camp');
    for (let i = 0; i < N; i++){
      if (tiles[i] === STUMP){
        const x = i % W, y = (i / W) | 0;
        if (!camps.some(c => Math.abs(c.x - x) <= 16 && Math.abs(c.y - y) <= 16)) tiles[i] = cover[i] < 0.12 ? GRASS : FLOOR;
        continue;
      }
      if (tiles[i] !== TREE && !(tiles[i] === BUSH && cover[i] >= 0.12)) continue;
      const x = i % W, y = (i / W) | 0;
      if (cover[i] < 0.12){ tiles[i] = GRASS; continue; }
      tiles[i] = FLOOR;
      const h = hash(x, y, s + 641);
      art.detail[i] = h < 0.14 ? LEAVES : h < 0.21 ? TWIGS : h < 0.24 ? BRANCH : h < 0.25 ? PEBBLES : 0;
      art.angle[i] = Math.floor(hash(x, y, s + 643) * 256);
    }
    const tileOf = q => Math.floor(Y[q] / TILE) * W + Math.floor(X[q] / TILE);
    for (let q = 0; q < n; q++) if (Z[q] >= TR.BLOCKS_FROM){ const i = tileOf(q); tiles[i] = TREE; art.detail[i] = 0; }
    grid.touch();

    // 5. Drawing order: small trees under big ones, then north to south, then west to east.
    const order = Array.from({ length: n }, (_, q) => q).sort((a, b) => Z[a] - Z[b] || Y[a] - Y[b] || X[a] - X[b]);
    const out = {
      count: n, x: new Int32Array(n), y: new Int32Array(n), kind: new Uint8Array(n), size: new Uint8Array(n),
      variant: new Uint8Array(n), tile: new Int32Array(n), on: new Uint8Array(n), kinds: KINDS.slice()
    };
    order.forEach((q, k) => {
      out.x[k] = X[q]; out.y[k] = Y[q]; out.kind[k] = K[q]; out.size[k] = Z[q]; out.variant[k] = V[q];
      const i = tileOf(q); out.tile[k] = i; out.on[k] = tiles[i];
    });
    return out;
  }

  function genesis(seed, opts = {}){
    const grid = G.MapGen.woodlands(seed, opts);
    grid.art.generator = 'genesis';
    grid.art.version = VERSION;
    grid.art.trees = plant(grid, (seed | 0) ^ 0x5eed);
    return grid;
  }

  G.MapGen.genesis = genesis;
  G.MapGen.types.genesis = { name: 'Genesis v' + VERSION, generate: genesis, clearLanding: true };
})();
