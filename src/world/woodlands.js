/* Woodlands map generator: forest, meadows and a sunken fen over five height levels,
   with rivers that only fall downhill (a waterfall wherever they drop a level), a lake and
   creek, villages, logging camps, caves, and scattered features and ground detail.
   Output depends only on the seed and world size, like the forest generator, so saves
   store the seed instead of the terrain. Keep the RNG call order stable: reordering any
   step changes every existing Woodlands map.

   Besides terrain ids, the grid carries `grid.art`, which the renderer reads and nothing
   saves (it is rebuilt with the terrain): per-tile height `level` (0–4), `dir` (waterfall
   and fallen-tree direction, foam), ground `detail` marks with their `angle`, and named
   `places`. Height is drawn only; movement stays flat, and cliffs simply block it. */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math;   // a local binding: global lookups are slow in the headless test sandbox
  let W = 512, MID = 256, N = W * W;
  const INF = Infinity, TAU = Math.PI * 2;

  // Generator-internal tile kinds. `game` is the terrain key each becomes in the grid.
  // `cost` steers the trail finder only (Infinity = never walk through); it is not movement cost in the game.
  const T = {}, KINDS = [];
  function kind(key, game, cost){ T[key] = KINDS.length; KINDS.push({ key, game, cost }); }
  kind('GRASS', 'grass', 1);            kind('THICK', 'tall_grass', 1.3);      kind('FLOWERS', 'wildflowers', 1);
  kind('SHRUB', 'bush', 1.8);           kind('THICKET', 'thicket', 6);         kind('TREE', 'tree', 3.5);
  kind('STUMP', 'stump', 1.1);          kind('LOG', 'fallen_tree', INF);       kind('MUSHROOM', 'mushrooms', 1.2);
  kind('ALIEN', 'alien_flora', 2);      kind('BARREN', 'barren', 1);           kind('REEDS', 'reeds', 2);
  kind('WATER', 'water', 12);           kind('DEEP', 'deep_water', 22);        kind('FALLS', 'waterfall', INF);
  kind('SWAMP', 'swamp', 2.6);          kind('BOG', 'bog', 7);                 kind('BRIDGE', 'bridge', .6);
  kind('CLIFF', 'cliff', 40);           kind('SLOPE', 'slope', 1.6);           kind('STAIRS', 'steps', .8);
  kind('CAVE', 'cave', INF);            kind('ROCKS', 'rock', INF);            kind('MOSSROCK', 'mossy_rock', INF);
  kind('CRYSTAL', 'crystal', INF);      kind('ORE', 'outcrop', INF);           kind('VENT', 'steam_vent', INF);
  kind('MOUND', 'termite_mound', INF);  kind('BURROW', 'burrow', 1.5);         kind('PATH', 'path', .6);
  kind('WALL', 'wall', INF);            kind('FLOOR', 'floor', INF);           kind('DOOR', 'door', INF);
  kind('RUBBLE', 'rubble', 2.5);        kind('LOGS', 'log_pile', INF);         kind('SAWHORSE', 'sawhorse', INF);
  kind('PAD', 'clearing', 1);
  const COST = new Float32Array(64).fill(INF);
  KINDS.forEach((d, i) => COST[i] = d.cost);

  // Ground detail marks (grid.art.detail). 0 is none.
  const D = {}, DECALS = [null];
  ['PEBBLES:Pebbles','TWIGS:Twigs','LEAVES:Leaves','TUFT:Grass tufts','WEEDS:Small weeds','FLOWER:Flowers','MUD:Mud patches','CRACKED:Cracked soil',
   'DIRT:Dirt patches','ASH:Ash','PUDDLE:Puddles','BONES:Bones','FEATHER:Feathers','SHELLS:Shells','FOOT:Footprints',
   'ANIMAL:Animal tracks','TIRE:Tyre tracks','DRAG:Drag marks','SCORCH:Scorch marks','BRANCH:Fallen branches']
    .forEach(s => { const [k, n] = s.split(':'); D[k] = DECALS.length; DECALS.push({ key: k, name: n }); });

  // Seeded value noise.
  const hash2 = G.hashRandom3;
  function vnoise(x, y, s){
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct){ let sum = 0, amp = 1, norm = 0, f = 1; for (let i = 0; i < oct; i++){ sum += vnoise(x * f, y * f, s + i * 101) * amp; norm += amp; amp *= .5; f *= 2; } return sum / norm; }
  const clampI = v => Math.max(0, Math.min(W - 1, Math.round(v)));
  function segDist(px, py, ax, ay, bx, by){ const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }

  const NAMES = ['Ashford','Mossgate','Wren Hollow','Old Barrow','Thornwick','Larkspur','Hearthmoor','Greywater','Fallowmere','Kestrel Row','Brackenhurst','Elderholm'];
  const FALLS_NAMES = ['Veil Falls','Hollow Falls','Kestrel Falls','Silverdrop','Moss Falls','Heron Falls'];
  const FENS = ['Blackwater Fen','The Sunken Fen','Mirewood','Greymarsh'];
  const LAKES = ['Stillwater','Lake Orrin','Glass Mere','Tarn Hollow'];
  const ANOMALIES = ['Violet Anomaly','Glasswood','The Bloom','Lumen Grove'];

  // A* buffers, reused between searches and reallocated when the world size changes.
  let gsc = null, came = null, shut = null;
  const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.4142],[1,-1,1.4142],[-1,1,1.4142],[-1,-1,1.4142]];

  function woodlands(seed){
    W = G.CONFIG.COLS; MID = Math.floor(W / 2); N = W * W;
    if (G.CONFIG.ROWS !== W) throw new Error('Woodlands needs a square world');
    if (!gsc || gsc.length !== N){ gsc = new Float32Array(N); came = new Int32Array(N); shut = new Uint8Array(N); }
    const R = G.RNG((seed ^ 0x9e3779b9) >>> 0), s = seed | 0;
    const ri = (a, b) => { a = Math.round(a); b = Math.round(b); return a + Math.floor(R() * (b - a + 1)); };
    const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const g = new Uint8Array(N), lvl = new Uint8Array(N), mask = new Uint8Array(N), dir = new Uint8Array(N);
    const dec = new Uint8Array(N), ang = new Uint8Array(N), reserved = new Uint8Array(N);
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < W;
    const get = (x, y) => inb(x, y) ? g[y * W + x] : 255;
    const set = (x, y, t) => { if (inb(x, y)) g[y * W + x] = t; };
    const getL = (x, y) => inb(x, y) ? lvl[y * W + x] : -1;
    const disc = (cx, cy, r, fn) => {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++){
        if (!inb(x, y)) continue; const d = Math.hypot(x - cx, y - cy); if (d <= r) fn(x, y, d);
      }
    };
    const anyNear = (x, y, r, pred) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (pred(get(x + dx, y + dy))) return true; return false; };
    const isWater = t => t === T.WATER || t === T.DEEP || t === T.FALLS;
    const isWet = t => isWater(t) || t === T.BOG;
    const quant = (arr, p) => { const sm = []; for (let i = 0; i < arr.length; i += 7) sm.push(arr[i]); sm.sort((a, b) => a - b); return sm[Math.floor(p * (sm.length - 1))]; };
    const feats = { sites:[], camps:[], falls:[], caves:[], zones:[], swamp:null, lake:null, lone:0, huts:0, streams:0, fallen:0, rings:0 };

    // 1. Woodland cover.
    const dens = new Float32Array(N), moist = new Float32Array(N);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++){
      const i = y * W + x;
      dens[i] = fbm(x / 64, y / 64, s + 11, 4) * .72 + fbm(x / 13, y / 13, s + 23, 2) * .28;
      moist[i] = fbm(x / 48, y / 48, s + 37, 3);
    }
    const forestT = quant(dens, .52), edgeT = quant(dens, .44), meadowT = quant(moist, .55), dryT = quant(moist, .3);
    for (let i = 0; i < N; i++){
      const r = R(), d = dens[i];
      let t;
      if (d > forestT) t = r < .74 ? T.TREE : r < .88 ? T.SHRUB : T.THICK;
      else if (d > edgeT) t = r < .18 ? T.TREE : r < .42 ? T.SHRUB : T.THICK;
      else if (moist[i] > meadowT) t = r < .035 ? T.SHRUB : T.THICK;
      else t = r < .006 ? T.TREE : r < .025 ? T.SHRUB : T.GRASS;
      g[i] = t;
    }

    // 2. Height: noise plus a north-to-south fall, cut into five levels and smoothed.
    const H = new Float32Array(N);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++)
      H[y * W + x] = fbm(x / 120, y / 120, s + 3, 4) * .7 + fbm(x / 36, y / 36, s + 5, 3) * .3 + (.5 - y / W) * .45;
    const qs = [.2, .44, .68, .87].map(p => quant(H, p));
    for (let i = 0; i < N; i++){ let l = 0; for (const q of qs) if (H[i] > q) l++; lvl[i] = l; }
    for (let pass = 0; pass < 2; pass++){
      const tmp = lvl.slice();
      for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++){
        let sum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += tmp[(y + dy) * W + x + dx];
        lvl[y * W + x] = Math.round(sum / 9);
      }
    }

    // 3. Rivers. Their levels only ever fall downstream, and the valleys around them are cut in terraces.
    const rA = new Float32Array(W), ax = W * (.2 + R() * .06), p1 = R() * 6, p2 = R() * 6;
    for (let y = 0; y < W; y++) rA[y] = ax + 32 * Math.sin(y / 67 + p1) + 12 * Math.sin(y / 21 + p2) + 40 * (fbm(.5, y / 60, s + 61, 2) - .5);
    const rB = new Float32Array(W), by = W * (.66 + R() * .06), p3 = R() * 6, p4 = R() * 6;
    for (let x = 0; x < W; x++) rB[x] = by + 20 * Math.sin(x / 58 + p3) + 8 * Math.sin(x / 17 + p4);
    let jx = 0;
    for (let x = W - 1; x >= 0; x--) if (x < rA[clampI(rB[x])]){ jx = x + 1; break; }
    const rlA = new Int8Array(W), rlB = new Int8Array(W);
    let cur = 9;
    for (let y = 0; y < W; y++){ cur = Math.min(cur, lvl[y * W + clampI(rA[y])]); rlA[y] = cur; }
    const jy = clampI(rB[jx]);
    cur = 9;
    for (let x = W - 1; x >= jx; x--){ cur = Math.min(cur, lvl[clampI(rB[x]) * W + x]); rlB[x] = Math.max(cur, rlA[jy]); }
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++){
      const i = y * W + x, nz = (fbm(x / 18, y / 18, s + 141, 2) - .5) * 18;
      const dA = Math.abs(x - rA[y]) + nz, dB = x >= jx ? Math.abs(y - rB[x]) + nz : 1e9;
      let v = lvl[i];
      if (dA < 9 || dB < 9){ v = 99; if (dA < 9) v = rlA[y]; if (dB < 9) v = Math.min(v, rlB[x]); }
      else { v = Math.min(v, rlA[y] + 1 + Math.floor((dA - 9) / 16)); if (x >= jx) v = Math.min(v, rlB[x] + 1 + Math.floor((dB - 9) / 16)); }
      lvl[i] = v;
    }
    const water = (x, y, l, deep) => { if (!inb(x, y)) return; g[y * W + x] = deep ? T.DEEP : T.WATER; lvl[y * W + x] = l; };
    for (let y = 0; y < W; y++){
      const cx = rA[y], half = y > W * .6 ? 3.2 : 2.4;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) water(x, y, rlA[y], half > 3 && Math.abs(x - cx) < half - 1.6);
    }
    for (let y = 1; y < W - 4; y++) if (rlA[y] < rlA[y - 1]){
      const half = y > W * .6 ? 3.2 : 2.4, py = y + 4;
      disc(rA[py], py, half + 2.6, (x, yy, d) => { if (yy >= y) water(x, yy, rlA[y], d < 2.6); });
    }
    for (let x = W - 1; x >= jx; x--){
      for (let y = Math.round(rB[x] - 2.2); y <= Math.round(rB[x] + 2.2); y++) water(x, y, rlB[x], false);
      if (x < W - 1 && rlB[x] < rlB[x + 1] && x - 4 >= jx){
        const px = x - 4; disc(px, rB[px], 5, (xx, yy, d) => { if (xx <= x) water(xx, yy, rlB[x], d < 2.4); });
      }
    }

    // 4. A lake in the north-east, drained south by a creek.
    const lk = { x: W * (.66 + R() * .1), y: W * (.3 + R() * .07), r: 16 + R() * 7, name: LAKES[Math.floor(R() * LAKES.length)] };
    feats.lake = lk;
    const Llk = lvl[clampI(lk.y) * W + clampI(lk.x)];
    disc(lk.x, lk.y, lk.r * 1.9, (x, y, d) => {
      const v = 1 - d / lk.r + (fbm(x / 14, y / 14, s + 71, 2) - .5) * .8, i = y * W + x;
      if (v > 0) water(x, y, Llk, v > .45);
      else if (v > -.45 && !isWater(g[i])) lvl[i] = Llk;
    });
    const cp = R() * 6, creekX = y => lk.x + 7 * Math.sin(y / 13 + cp) + 3 * Math.sin(y / 5 + cp);
    let joinY = W - 1;
    for (let y = Math.round(lk.y + lk.r); y < W; y++){
      const cx = clampI(creekX(y));
      if ((cx >= jx && Math.abs(y - rB[cx]) <= 2) || (cx < jx && Math.abs(cx - rA[y]) <= 2)){ joinY = y; break; }
    }
    const cxJ = clampI(creekX(joinY)), baseL = cxJ >= jx ? rlB[cxJ] : rlA[joinY];
    cur = Llk;
    let lastCx = creekX(Math.round(lk.y));
    for (let y = Math.round(lk.y); y <= joinY; y++){
      const cx = creekX(y), i0 = y * W + clampI(cx);
      if (!isWater(g[i0])) cur = Math.min(cur, lvl[i0]);
      const cl = Math.max(cur, baseL);
      const lo = Math.round(Math.min(cx, lastCx)), hi = Math.round(Math.max(cx, lastCx)) + 1;
      for (let x = lo - 2; x <= hi + 2; x++){
        if (!inb(x, y) || isWater(g[y * W + x])) continue;
        if (x >= lo && x <= hi) water(x, y, cl, false); else lvl[y * W + x] = cl;
      }
      lastCx = cx;
    }

    // 5. Small streams run off the high ground into the rivers, dropping over small falls.
    for (let tries = 0; tries < 400 && feats.streams < 5; tries++){
      const x0 = ri(20, W - 20), y0 = ri(20, W - 20), i0 = y0 * W + x0;
      if (lvl[i0] < 3 || isWet(g[i0])) continue;
      let tgt = { x: rA[y0], y: y0 };
      if (x0 >= jx && Math.abs(rB[x0] - y0) < Math.abs(rA[y0] - x0)) tgt = { x: x0, y: rB[x0] };
      const len = Math.hypot(tgt.x - x0, tgt.y - y0);
      if (len < 40 || len > 170) continue;
      if (segDist(MID, MID, x0, y0, tgt.x, tgt.y) < 60 || segDist(lk.x, lk.y, x0, y0, tgt.x, tgt.y) < lk.r * 2) continue;
      const ph = R() * 6, nx = -(tgt.y - y0) / len, ny = (tgt.x - x0) / len, pts = [];
      let last = -1, hit = false;
      for (let k = 0; k <= len * 1.5; k++){
        const t = k / (len * 1.5), w = 7 * Math.sin(t * Math.PI * 3 + ph) * Math.sin(t * Math.PI);
        const x = clampI(x0 + (tgt.x - x0) * t + nx * w), y = clampI(y0 + (tgt.y - y0) * t + ny * w), key = y * W + x;
        if (key === last) continue;
        if (last >= 0){ const lx = last % W, ly = (last / W) | 0; if (lx !== x && ly !== y) pts.push(ly * W + x); }
        pts.push(key); last = key;
        if (k > 3 && isWater(g[key])){ hit = true; break; }
      }
      if (!hit) continue;
      const endL = lvl[pts[pts.length - 1]];
      cur = lvl[pts[0]];
      for (const p of pts){
        if (isWater(g[p])) break;
        cur = Math.min(cur, lvl[p]);
        const cl = Math.max(cur, endL), x = p % W, y = (p / W) | 0;
        g[p] = T.WATER; lvl[p] = cl;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const q = (y + dy) * W + x + dx; if (inb(x + dx, y + dy) && !isWater(g[q])) lvl[q] = cl; }
      }
      feats.streams++;
    }

    // 6. A sunken fen in the south-west.
    const sw = { x: W * (.14 + R() * .1), y: W * (.74 + R() * .08), r: 58 + R() * 18, name: FENS[Math.floor(R() * FENS.length)] };
    feats.swamp = sw;
    const Lsw = lvl[clampI(sw.y) * W + clampI(sw.x)];
    disc(sw.x, sw.y, sw.r * 1.5, (x, y, d) => {
      const i = y * W + x;
      if (isWater(g[i])) return;
      const v = 1 - d / sw.r + (fbm(x / 22, y / 22, s + 41, 3) - .5) * 1.1;
      if (v < .3) return;
      lvl[i] = Lsw;
      const b = fbm(x / 8, y / 8, s + 43, 2), r = R();
      if (v < .42 && r < .45) return;
      g[i] = b > .6 ? T.BOG : r < .07 ? T.TREE : r < .32 ? T.THICK : r < .36 ? T.SHRUB : T.SWAMP;
    });

    // 7. Landing zone: a flat clearing at the centre.
    const Lc = lvl[MID * W + MID];
    disc(MID, MID, 44, (x, y, d) => {
      const i = y * W + x; lvl[i] = Lc; reserved[i] = 1;
      if (d <= 24) g[i] = T.PAD; else if (d <= 34) g[i] = R() < .55 ? T.GRASS : T.THICK;
    });

    // 8. Settlements sit on flattened ground.
    const BLOCK = new Set([T.WATER, T.DEEP, T.FALLS, T.CLIFF, T.SWAMP, T.BOG, T.PAD, T.WALL, T.FLOOR, T.DOOR, 255]);
    const okArea = (cx, cy, r, block = BLOCK) => { let ok = inb(cx - r, cy - r) && inb(cx + r, cy + r); if (ok) disc(cx, cy, r, (x, y) => { if (ok && block.has(get(x, y))) ok = false; }); return ok; };
    const names = shuffle(NAMES);
    const buildings = [];
    function building(bx, by, bw, bh, intact, faceX, faceY){
      if (intact){
        for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++){
          const edge = x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1;
          set(x, y, edge ? T.WALL : T.FLOOR);
        }
        const dx = faceX - (bx + bw / 2), dy = faceY - (by + bh / 2);
        let doorX, doorY, stepX, stepY;
        if (Math.abs(dx) > Math.abs(dy)){ doorX = dx > 0 ? bx + bw - 1 : bx; doorY = by + Math.floor(bh / 2); stepX = doorX + (dx > 0 ? 1 : -1); stepY = doorY; }
        else { doorY = dy > 0 ? by + bh - 1 : by; doorX = bx + Math.floor(bw / 2); stepX = doorX; stepY = doorY + (dy > 0 ? 1 : -1); }
        set(doorX, doorY, T.DOOR); set(stepX, stepY, T.PATH);
        buildings.push({ x: bx, y: by, w: bw, h: bh, intact });
        return { doorX, doorY, stepX, stepY };
      } else {
        for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++){
          const edge = x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1, r = R();
          if (edge) set(x, y, r < .5 ? T.WALL : r < .82 ? T.RUBBLE : T.THICK);
          else set(x, y, r < .35 ? T.FLOOR : r < .66 ? T.RUBBLE : r < .74 ? T.SHRUB : r < .77 ? T.TREE : T.THICK);
        }
        for (let k = ri(5, 12); k > 0; k--){
          const x = bx - 2 + ri(0, bw + 3), y = by - 2 + ri(0, bh + 3), t = get(x, y);
          if (t === T.GRASS || t === T.THICK || t === T.SHRUB) set(x, y, T.RUBBLE);
        }
      }
      buildings.push({ x: bx, y: by, w: bw, h: bh, intact });
    }
    for (let tries = 0; tries < 900 && feats.sites.length < 5; tries++){
      const cx = ri(40, W - 40), cy = ri(40, W - 40);
      if (Math.hypot(cx - MID, cy - MID) < 90) continue;
      if (feats.sites.some(o => Math.hypot(o.x - cx, o.y - cy) < 105)) continue;
      if (!okArea(cx, cy, 23)) continue;
      const Ls = lvl[cy * W + cx];
      disc(cx, cy, 22, (x, y) => { lvl[y * W + x] = Ls; reserved[y * W + x] = 1; });
      const bias = feats.sites.length === 0 ? .8 : .12 + R() * .2;
      const site = { x: cx, y: cy, name: names[feats.sites.length], intact: 0, ruined: 0 };
      disc(cx, cy, 22, (x, y, d) => {
        if (d + (fbm(x / 6, y / 6, s + 91, 2) - .5) * 10 > 18) return;
        const t = get(x, y), r = R();
        if (t === T.TREE) set(x, y, r < .5 ? T.THICK : T.GRASS);
        else if (t === T.SHRUB && r < .5) set(x, y, T.GRASS);
      });
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) set(x, y, T.PATH);
      const rects = [], want = ri(5, 9);
      for (let a = 0; a < 120 && rects.length < want; a++){
        const bw = ri(4, 8), bh = ri(4, 7), bx = cx + ri(-15, 15) - (bw >> 1), by2 = cy + ri(-15, 15) - (bh >> 1);
        if (bx < cx + 4 && bx + bw > cx - 4 && by2 < cy + 4 && by2 + bh > cy - 4) continue;
        if (rects.some(q => bx < q.x + q.w + 2 && bx + bw + 2 > q.x && by2 < q.y + q.h + 2 && by2 + bh + 2 > q.y)) continue;
        let ok = true;
        for (let y = by2 - 1; y <= by2 + bh && ok; y++) for (let x = bx - 1; x <= bx + bw; x++) if (BLOCK.has(get(x, y))){ ok = false; break; }
        if (!ok) continue;
        const intact = R() < bias;
        rects.push({ x: bx, y: by2, w: bw, h: bh });
        building(bx, by2, bw, bh, intact, cx, cy);
        intact ? site.intact++ : site.ruined++;
      }
      feats.sites.push(site);
    }

    // 9. Cliffs: every land tile beside lower ground. Some one-level steps become grassy slopes.
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++){
      const i = y * W + x;
      if (isWet(g[i])) continue;
      const l = lvl[i];
      let m = 0, low = l;
      const chk = (dx, dy, bit) => { const nl = getL(x + dx, y + dy); if (nl >= 0 && nl < l){ m |= bit; low = Math.min(low, nl); } };
      chk(0, -1, 1); chk(1, 0, 2); chk(0, 1, 4); chk(-1, 0, 8);
      if (!m){ chk(1, -1, 16); chk(1, 1, 32); chk(-1, 1, 64); chk(-1, -1, 128); }
      if (!m) continue;
      mask[i] = m;
      g[i] = (l - low === 1 && m < 16 && fbm(x / 11, y / 11, s + 131, 2) > .6) ? T.SLOPE : T.CLIFF;
    }
    // Waterfalls: water beside lower water spills over the edge.
    const spills = [];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++){
      const i = y * W + x;
      if (g[i] !== T.WATER && g[i] !== T.DEEP) continue;
      for (const [dx, dy, d] of [[0,1,1],[-1,0,2],[1,0,3],[0,-1,4]]){
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const j = ny * W + nx;
        if (isWater(g[j]) && lvl[j] < lvl[i]){ spills.push([i, j, d, nx + dx, ny + dy]); break; }
      }
    }
    for (const [i, j, d, fx, fy] of spills){
      g[i] = T.FALLS; dir[i] = d; g[j] = T.FALLS; dir[j] = d;
      if (inb(fx, fy)){ const k = fy * W + fx; if (g[k] === T.WATER || g[k] === T.DEEP) dir[k] = 5; }
    }
    {
      const seen = new Uint8Array(N), clusters = [];
      for (let i = 0; i < N; i++){
        if (g[i] !== T.FALLS || seen[i]) continue;
        const st = [i]; seen[i] = 1; let n = 0, sx = 0, sy = 0;
        while (st.length){
          const q = st.pop(), x = q % W, y = (q / W) | 0; n++; sx += x; sy += y;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx = x + dx, ny = y + dy, m = ny * W + nx; if (inb(nx, ny) && !seen[m] && g[m] === T.FALLS){ seen[m] = 1; st.push(m); } }
        }
        clusters.push({ x: Math.round(sx / n), y: Math.round(sy / n), size: n });
      }
      clusters.sort((a, b) => b.size - a.size);
      const fn = shuffle(FALLS_NAMES);
      clusters.forEach((c, k) => { if (k < 3 && c.size >= 8) c.name = fn[k]; });
      feats.falls = clusters;
    }

    // 10. Lone ruins and logging camps.
    const flat = (x, y, w, h) => { const l = getL(x, y); for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (getL(xx, yy) !== l) return false; return true; };
    const LONE_BLOCK = new Set([T.WATER, T.DEEP, T.FALLS, T.CLIFF, T.SLOPE, T.BOG, T.PAD, T.WALL, T.FLOOR, T.DOOR, T.PATH, 255]);
    for (let tries = 0; tries < 500 && feats.lone < 28; tries++){
      const x = ri(12, W - 12), y = ri(12, W - 12), bw = ri(3, 6), bh = ri(3, 6);
      if (reserved[y * W + x] || feats.sites.some(o => Math.hypot(o.x - x, o.y - y) < 30)) continue;
      if (!okArea(x + bw / 2, y + bh / 2, Math.max(bw, bh) / 2 + 2, LONE_BLOCK) || !flat(x - 1, y - 1, bw + 2, bh + 2)) continue;
      for (let yy = y - 1; yy <= y + bh; yy++) for (let xx = x - 1; xx <= x + bw; xx++) if (get(xx, yy) === T.TREE) set(xx, yy, T.THICK);
      building(x, y, bw, bh, R() < .12, x + ri(-5, 5), y + 20);
      feats.lone++;
    }
    const CAMP_BLOCK = new Set([T.WATER, T.DEEP, T.FALLS, T.CLIFF, T.SLOPE, T.BOG, T.SWAMP, T.PAD, T.WALL, T.FLOOR, T.DOOR, 255]);
    for (let tries = 0; tries < 900 && feats.camps.length < 5; tries++){
      const cx = ri(25, W - 25), cy = ri(25, W - 25);
      if (reserved[cy * W + cx] || feats.camps.some(o => Math.hypot(o.x - cx, o.y - cy) < 60)) continue;
      if (!okArea(cx, cy, 10, CAMP_BLOCK)) continue;
      let trees = 0, all = 0;
      disc(cx, cy, 9, (x, y) => { all++; if (get(x, y) === T.TREE) trees++; });
      if (trees / all < .45) continue;
      const cr = 9 + R() * 4;
      disc(cx, cy, cr + 3, (x, y, d) => {
        if (d + (fbm(x / 5, y / 5, s + 97, 2) - .5) * 7 > cr) return;
        reserved[y * W + x] = 1;
        const t = get(x, y), r = R();
        if (t === T.TREE) set(x, y, r < .8 ? T.STUMP : T.GRASS);
        else if (t === T.SHRUB && r < .5) set(x, y, T.THICK);
      });
      // Every camp gets a log-walled logging hut with its door facing the middle of the clearing and a sawhorse outside.
      const l0 = getL(cx, cy);
      for (let a = 0; a < 80; a++){
        const bw = ri(4, 6), bh = ri(4, 5), th = R() * TAU, dist = 4 + R() * 3;
        const bx = Math.round(cx + Math.cos(th) * dist - bw / 2), by = Math.round(cy + Math.sin(th) * dist - bh / 2);
        if (bx < cx + 2 && bx + bw > cx - 1 && by < cy + 2 && by + bh > cy - 1) continue;
        let ok = true;
        for (let yy = by - 1; yy <= by + bh && ok; yy++) for (let xx = bx - 1; xx <= bx + bw; xx++) if (CAMP_BLOCK.has(get(xx, yy)) || getL(xx, yy) !== l0){ ok = false; break; }
        if (!ok) continue;
        for (let yy = by - 1; yy <= by + bh; yy++) for (let xx = bx - 1; xx <= bx + bw; xx++){ const t = get(xx, yy); if (t === T.TREE || t === T.STUMP || t === T.SHRUB) set(xx, yy, T.GRASS); }
        const door = building(bx, by, bw, bh, true, cx, cy);
        for (let yy = by; yy < by + bh; yy++) for (let xx = bx; xx < bx + bw; xx++) dir[yy * W + xx] = 1;
        const side = door.stepX === door.doorX ? [2, 0] : [0, 2];
        for (const sg of [1, -1]){
          const sx = door.stepX + side[0] * sg, sy = door.stepY + side[1] * sg, t = get(sx, sy);
          if (t === T.GRASS || t === T.THICK || t === T.FLOWERS || t === T.STUMP){ set(sx, sy, T.SAWHORSE); break; }
        }
        feats.huts++;
        break;
      }
      for (let k = ri(2, 4); k > 0; k--){
        const lx = cx + ri(-5, 5), ly = cy + ri(-5, 5), horiz = R() < .6, len = ri(2, 3);
        for (let j = 0; j < len; j++){ const x = horiz ? lx + j : lx, y = horiz ? ly : ly + j; if (!CAMP_BLOCK.has(get(x, y))) set(x, y, T.LOGS); }
      }
      set(cx, cy, T.PATH);
      feats.camps.push({ x: cx, y: cy });
    }

    // 11. Medium-sized features.
    const OPEN = new Set([T.GRASS, T.THICK, T.FLOWERS, T.SHRUB, T.TREE]);
    const canPlace = (x, y) => inb(x, y) && !reserved[y * W + x] && OPEN.has(g[y * W + x]);
    const isCliff = t => t === T.CLIFF;
    // Fallen trees, 3–5 tiles long.
    const ORI = [[1,0],[0,1],[1,1],[1,-1]];
    for (let tries = 0; tries < 3000 && feats.fallen < 80; tries++){
      const x = ri(5, W - 6), y = ri(5, W - 6);
      if (get(x, y) !== T.TREE || reserved[y * W + x]) continue;
      const o = ri(0, 3), len = ri(3, 5), [dx, dy] = ORI[o], l0 = getL(x, y);
      let ok = true;
      for (let k = 0; k < len && ok; k++) if (!canPlace(x + dx * k, y + dy * k) || getL(x + dx * k, y + dy * k) !== l0) ok = false;
      if (!ok) continue;
      const rootFirst = R() < .5;
      for (let k = 0; k < len; k++){
        const i = (y + dy * k) * W + x + dx * k, first = k === 0, lastK = k === len - 1;
        g[i] = T.LOG; dir[i] = o | ((rootFirst ? first : lastK) ? 8 : 0) | ((rootFirst ? lastK : first) ? 16 : 0) | (rootFirst ? 32 : 0);
      }
      feats.fallen++;
    }
    // Boulder groups, mostly at the foot of cliffs. Damp or shaded ones are mossy.
    for (let n = 0, tries = 0; n < 75 && tries < 4000; tries++){
      const x = ri(6, W - 7), y = ri(6, W - 7);
      if (!canPlace(x, y)) continue;
      if (!anyNear(x, y, 4, isCliff) && R() < .6) continue;
      const rr = 1.5 + R() * 2.5, l0 = getL(x, y), i0 = y * W + x;
      const mossy = moist[i0] > meadowT || anyNear(x, y, 2, t => t === T.TREE);
      disc(x, y, rr, (xx, yy, d) => {
        if (canPlace(xx, yy) && getL(xx, yy) === l0 && hash2(xx, yy, s + 151) < .6 - d * .09)
          set(xx, yy, mossy && hash2(xx, yy, s + 153) < .75 ? T.MOSSROCK : T.ROCKS);
      });
      n++;
    }
    // Dense thickets along forest edges.
    for (let n = 0, tries = 0; n < 45 && tries < 3000; tries++){
      const x = ri(6, W - 7), y = ri(6, W - 7), i0 = y * W + x;
      if (!canPlace(x, y) || dens[i0] < edgeT - .02 || dens[i0] > forestT + .04) continue;
      const rr = 2 + R() * 2.5;
      disc(x, y, rr, (xx, yy, d) => { if (canPlace(xx, yy) && fbm(xx / 3, yy / 3, s + 161, 1) > .25 + d / rr * .35) set(xx, yy, T.THICKET); });
      n++;
    }
    // Tall grass patches and wildflower meadows.
    for (let n = 0, tries = 0; n < 30 && tries < 2000; tries++){
      const x = ri(6, W - 7), y = ri(6, W - 7);
      if (get(x, y) !== T.GRASS || reserved[y * W + x]) continue;
      const rr = 3 + R() * 4;
      disc(x, y, rr, (xx, yy, d) => { if (get(xx, yy) === T.GRASS && !reserved[yy * W + xx] && hash2(xx, yy, s + 171) < .95 - d / rr * .5) set(xx, yy, T.THICK); });
      n++;
    }
    for (let n = 0, tries = 0; n < 55 && tries < 3000; tries++){
      const x = ri(6, W - 7), y = ri(6, W - 7), t0 = get(x, y);
      if ((t0 !== T.GRASS && t0 !== T.THICK) || reserved[y * W + x]) continue;
      const rr = 2 + R() * 3.5;
      disc(x, y, rr, (xx, yy, d) => { const t = get(xx, yy); if ((t === T.GRASS || t === T.THICK) && !reserved[yy * W + xx] && hash2(xx, yy, s + 181) < .8 - d / rr * .45) set(xx, yy, T.FLOWERS); });
      n++;
    }
    // Mushrooms: clusters under trees, plus a few fairy rings in the open.
    for (let n = 0, tries = 0; n < 45 && tries < 3000; tries++){
      const x = ri(6, W - 7), y = ri(6, W - 7);
      if (get(x, y) !== T.TREE || reserved[y * W + x]) continue;
      disc(x, y, 2.6, (xx, yy) => { const t = get(xx, yy); if (t !== T.TREE && canPlace(xx, yy) && hash2(xx, yy, s + 191) < .5) set(xx, yy, T.MUSHROOM); });
      n++;
    }
    for (let tries = 0; tries < 2000 && feats.rings < 6; tries++){
      const x = ri(8, W - 9), y = ri(8, W - 9);
      if (get(x, y) !== T.GRASS || reserved[y * W + x]) continue;
      const rr = 2.4 + R() * 1.1;
      disc(x, y, rr + 1, (xx, yy, d) => { if (Math.abs(d - rr) < .6 && canPlace(xx, yy) && get(xx, yy) !== T.TREE) set(xx, yy, T.MUSHROOM); });
      feats.rings++;
    }
    // Caves open in wide south-facing cliff faces on the high ground.
    {
      const cands = [];
      for (let y = 2; y < W - 2; y++) for (let x = 2; x < W - 2; x++){
        const i = y * W + x;
        if (g[i] !== T.CLIFF || !(mask[i] & 4) || lvl[i] < 2 || reserved[i]) continue;
        if (g[i - 1] !== T.CLIFF || g[i + 1] !== T.CLIFF || !(mask[i - 1] & 4) || !(mask[i + 1] & 4)) continue;
        if (!OPEN.has(g[i + W])) continue;
        cands.push(i);
      }
      const caveCap = R() < .06 ? ri(7, 8) : ri(2, 4);
      for (const i of shuffle(cands)){
        if (feats.caves.length >= caveCap) break;
        const x = i % W, y = (i / W) | 0;
        if (feats.caves.some(c => Math.hypot(c.x - x, c.y - y) < 45)) continue;
        g[i] = T.CAVE; feats.caves.push({ x, y });
      }
    }
    // Animal burrows in the meadows.
    const burrows = [];
    for (let tries = 0; tries < 3000 && burrows.length < 35; tries++){
      const x = ri(4, W - 5), y = ri(4, W - 5), t = get(x, y);
      if ((t !== T.GRASS && t !== T.THICK && t !== T.FLOWERS) || reserved[y * W + x] || anyNear(x, y, 3, isWet)) continue;
      set(x, y, T.BURROW); burrows.push({ x, y });
    }
    // Termite mounds in small groups on dry grassland.
    for (let n = 0, tries = 0; n < 14 && tries < 3000; tries++){
      const x = ri(6, W - 7), y = ri(6, W - 7), t = get(x, y);
      if ((t !== T.GRASS && t !== T.THICK) || reserved[y * W + x] || moist[y * W + x] > dryT) continue;
      for (let k = ri(2, 5); k > 0; k--){ const mx = x + ri(-3, 3), my = y + ri(-3, 3); if (canPlace(mx, my) && get(mx, my) !== T.TREE) set(mx, my, T.MOUND); }
      n++;
    }
    // Zones: alien groves with crystals, and one geothermal field with steam vents.
    const ZONE_BLOCK = new Set([T.WATER, T.DEEP, T.FALLS, T.BOG, T.PAD, T.WALL, T.FLOOR, T.DOOR, 255]);
    const pickZone = r => {
      for (let tries = 0; tries < 800; tries++){
        const x = ri(r + 12, W - r - 12), y = ri(r + 12, W - r - 12);
        if (Math.hypot(x - MID, y - MID) < 90 || reserved[y * W + x]) continue;
        if (feats.sites.some(o => Math.hypot(o.x - x, o.y - y) < r + 32) || feats.zones.some(z => Math.hypot(z.x - x, z.y - y) < 95)) continue;
        if (okArea(x, y, r, ZONE_BLOCK)) return { x, y, r };
      }
      return null;
    };
    const anomalyNames = shuffle(ANOMALIES);
    for (let k = 0; k < 2; k++){
      const z = pickZone(ri(13, 18));
      if (!z) continue;
      z.kind = 'alien'; z.name = anomalyNames[k]; feats.zones.push(z);
      disc(z.x, z.y, z.r * 1.3, (x, y, d) => {
        const v = 1 - d / z.r + (fbm(x / 7, y / 7, s + 221, 2) - .5) * .8, t = get(x, y);
        if (v > 0 && (OPEN.has(t) || t === T.MUSHROOM || t === T.THICKET || t === T.FLOWERS) && hash2(x, y, s + 223) < .35 + v * .6) set(x, y, T.ALIEN);
      });
      for (let c = ri(4, 7); c > 0; c--){
        const a = R() * TAU, rr = R() * z.r * .75, cx = z.x + Math.cos(a) * rr, cy = z.y + Math.sin(a) * rr;
        disc(cx, cy, 1.4, (x, y) => { const t = get(x, y); if ((OPEN.has(t) || t === T.ALIEN) && hash2(x, y, s + 227) < .7) set(x, y, T.CRYSTAL); });
      }
    }
    {
      const z = pickZone(ri(15, 19));
      if (z){
        z.kind = 'geo'; z.name = 'Geothermal field'; feats.zones.push(z);
        disc(z.x, z.y, z.r * 1.3, (x, y, d) => {
          const v = 1 - d / z.r + (fbm(x / 6, y / 6, s + 231, 2) - .5) * .7, t = get(x, y);
          if (v > 0 && (OPEN.has(t) || t === T.MUSHROOM || t === T.THICKET || t === T.FLOWERS)) set(x, y, v > .25 && hash2(x, y, s + 233) < .85 ? T.BARREN : T.GRASS);
        });
        for (let k = 0, tries = 0; k < 10 && tries < 200; tries++){
          const a = R() * TAU, rr = R() * z.r * .8, x = Math.round(z.x + Math.cos(a) * rr), y = Math.round(z.y + Math.sin(a) * rr);
          if ((get(x, y) !== T.BARREN && get(x, y) !== T.GRASS) || anyNear(x, y, 2, t => t === T.VENT)) continue;
          set(x, y, T.VENT); k++;
        }
        for (let c = 0; c < 3; c++){
          const a = R() * TAU, rr = R() * z.r * .7;
          disc(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, 1.6, (x, y) => { if (get(x, y) === T.BARREN && hash2(x, y, s + 237) < .6) set(x, y, T.ORE); });
        }
      }
    }
    // Crystal formations and mineral outcrops at the foot of cliffs.
    const cliffFoot = (minL) => {
      for (let tries = 0; tries < 400; tries++){
        const x = ri(4, W - 5), y = ri(4, W - 5), i = y * W + x;
        if (g[i] !== T.CLIFF || lvl[i] < minL || !(mask[i] & 4)) continue;
        if (canPlace(x, y + 1)) return { x, y: y + 1 };
      }
      return null;
    };
    for (let n = 0; n < 10; n++){
      const p = cliffFoot(3); if (!p) break;
      disc(p.x, p.y + .5, 1.6, (x, y) => { if (canPlace(x, y) && hash2(x, y, s + 241) < .65) set(x, y, T.CRYSTAL); });
    }
    for (let n = 0; n < 18; n++){
      const p = cliffFoot(1); if (!p) break;
      const rr = 1.5 + R();
      disc(p.x, p.y + .5, rr, (x, y) => { if (!canPlace(x, y)) return; const h = hash2(x, y, s + 243); if (h < .5) set(x, y, T.ORE); else if (h < .65) set(x, y, T.ROCKS); });
    }
    // Reeds along the water's edge.
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++){
      const i = y * W + x, t = g[i];
      if ((t !== T.GRASS && t !== T.THICK && t !== T.SWAMP && t !== T.SHRUB && t !== T.FLOWERS) || reserved[i]) continue;
      const l = lvl[i];
      const adj = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => { const j = (y + dy) * W + x + dx; return isWet(g[j]) && lvl[j] === l; });
      const h = hash2(x, y, s + 251);
      if (adj ? h < (t === T.SWAMP ? .8 : .62) : (h < .18 && anyNear(x, y, 2, isWet))) g[i] = T.REEDS;
    }

    // 12. Walking paths. A* routes around obstacles; crossing a cliff carves steps, crossing water builds a bridge.
    const wig = new Float32Array(N);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) wig[y * W + x] = fbm(x / 10, y / 10, s + 101, 2) * .6;
    function findPath(sx, sy, tx, ty){
      gsc.fill(INF); came.fill(-1); shut.fill(0);
      const hn = [], hf = [];
      const push = (n, f) => {
        hn.push(n); hf.push(f); let i = hn.length - 1;
        while (i > 0){ const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; let t = hn[p]; hn[p] = hn[i]; hn[i] = t; t = hf[p]; hf[p] = hf[i]; hf[i] = t; i = p; }
      };
      const pop = () => {
        const top = hn[0], ln = hn.pop(), lf = hf.pop();
        if (hn.length){
          hn[0] = ln; hf[0] = lf; let i = 0;
          for (;;){ const l = 2 * i + 1, r = l + 1; let m = i; if (l < hn.length && hf[l] < hf[m]) m = l; if (r < hn.length && hf[r] < hf[m]) m = r; if (m === i) break; let t = hn[m]; hn[m] = hn[i]; hn[i] = t; t = hf[m]; hf[m] = hf[i]; hf[i] = t; i = m; }
        }
        return top;
      };
      const h = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return (Math.max(dx, dy) + .4142 * Math.min(dx, dy)) * .8; };
      const start = sy * W + sx, goal = ty * W + tx;
      gsc[start] = 0; push(start, h(sx, sy));
      while (hn.length){
        const n = pop();
        if (n === goal) break;
        if (shut[n]) continue;
        shut[n] = 1;
        const x = n % W, y = (n / W) | 0;
        for (const [dx, dy, dc] of DIRS){
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
          const m = ny * W + nx;
          if (shut[m]) continue;
          const c = COST[g[m]];
          if (c === INF) continue;
          if (dc > 1 && (COST[g[y * W + nx]] === INF || COST[g[ny * W + x]] === INF)) continue;
          const ng = gsc[n] + (c + wig[m]) * dc;
          if (ng < gsc[m]){ gsc[m] = ng; came[m] = n; push(m, ng + h(nx, ny)); }
        }
      }
      if (came[goal] < 0) return null;
      const out = []; for (let n = goal; n !== -1; n = came[n]) out.push(n);
      return out.reverse();
    }
    const PAVE = new Set([T.GRASS, T.THICK, T.FLOWERS, T.TREE, T.SHRUB, T.THICKET, T.SWAMP, T.STUMP, T.RUBBLE, T.PATH, T.REEDS, T.MUSHROOM, T.ALIEN, T.BURROW, T.BARREN]);
    const trails = [];
    function trail(a, b, kind){
      const p = findPath(a.x, a.y, b.x, b.y);
      if (!p) return;
      for (const n of p){
        const x = n % W, y = (n / W) | 0;
        for (const [ox, oy] of [[0,0],[1,0],[0,1],[1,1]]){
          const t = get(x + ox, y + oy);
          if (t === T.WATER || t === T.DEEP || t === T.BOG) set(x + ox, y + oy, T.BRIDGE);
          else if (t === T.CLIFF || t === T.SLOPE) set(x + ox, y + oy, T.STAIRS);
          else if (PAVE.has(t)) set(x + ox, y + oy, T.PATH);
        }
      }
      trails.push({ nodes: p, kind });
    }
    const home = { x: MID, y: MID };
    const hubs = [home, ...feats.sites];
    const nearest = (p, list) => list.reduce((best, q) => q !== p && (!best || Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) ? q : best, null);
    feats.sites.slice().sort((a, b) => Math.hypot(a.x - MID, a.y - MID) - Math.hypot(b.x - MID, b.y - MID)).forEach((site, k) => trail(home, site, k === 0 ? 'rover' : 'road'));
    const linked = new Set();
    for (const site of feats.sites){
      const other = nearest(site, feats.sites);
      if (!other) continue;
      const key = [site.name, other.name].sort().join('|');
      if (!linked.has(key)){ linked.add(key); trail(site, other, 'foot'); }
    }
    for (const camp of feats.camps) trail(camp, nearest(camp, hubs), 'drag');
    for (const exit of [{ x: ri(W * .35, W * .65), y: 0 }, { x: W - 1, y: ri(W * .3, W * .5) }, { x: ri(W * .4, W * .7), y: W - 1 }, { x: 0, y: ri(W * .3, W * .55) }])
      trail(nearest(exit, hubs), exit, 'foot');
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++){
      if (g[y * W + x] !== T.TREE) continue;
      if (anyNear(x, y, 2, t => t === T.PATH) && hash2(x, y, s + 111) < .22) g[y * W + x] = T.STUMP;
    }

    // 13. Ground detail, scattered lightly and chosen by surroundings.
    const DETAILED = new Set([T.GRASS, T.THICK, T.FLOWERS, T.SHRUB, T.PATH, T.PAD, T.SWAMP, T.BARREN, T.STUMP, T.RUBBLE, T.SLOPE, T.MUSHROOM, T.REEDS, T.ALIEN, T.STAIRS, T.BURROW]);
    const isTreeish = t => t === T.TREE || t === T.LOG || t === T.STUMP || t === T.THICKET;
    const isRuin = t => t === T.RUBBLE || t === T.WALL;
    const geo = feats.zones.find(z => z.kind === 'geo');
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++){
      const i = y * W + x, t = g[i];
      if (!DETAILED.has(t)) continue;
      const r = hash2(x, y, s + 201);
      let d = 0;
      if (geo && Math.hypot(x - geo.x, y - geo.y) < geo.r + 3) d = r < .28 ? D.ASH : r < .46 ? D.CRACKED : r < .56 ? D.SCORCH : r < .6 ? D.PEBBLES : 0;
      else if (t === T.PAD){ const dc = Math.hypot(x - MID, y - MID); d = dc > 4 && dc < 12 && r < .22 ? D.SCORCH : 0; }
      else if (t === T.PATH || t === T.STAIRS) d = r < .06 ? D.PEBBLES : r < .09 ? (moist[i] > meadowT ? D.PUDDLE : D.CRACKED) : r < .11 ? D.MUD : 0;
      else if (t === T.SWAMP || t === T.REEDS) d = r < .12 ? D.MUD : r < .18 ? D.PUDDLE : r < .185 ? D.BONES : 0;
      else if (anyNear(x, y, 1, isWet)) d = r < .08 ? D.MUD : r < .13 ? D.SHELLS : r < .17 ? D.PUDDLE : r < .19 ? D.PEBBLES : 0;
      else if (anyNear(x, y, 2, isRuin)) d = r < .08 ? D.SCORCH : r < .13 ? D.PEBBLES : r < .145 ? D.BONES : 0;
      else if (anyNear(x, y, 1, isTreeish)) d = r < .07 ? D.LEAVES : r < .11 ? D.TWIGS : r < .135 ? D.BRANCH : r < .145 ? D.PEBBLES : r < .15 ? D.FEATHER : 0;
      else if (t === T.BURROW) d = D.BONES;
      else {
        const dry = moist[i] < dryT;
        d = r < .035 ? D.TUFT : r < .055 ? D.WEEDS : r < .07 ? D.FLOWER : r < .082 ? (dry ? D.CRACKED : D.DIRT) : r < .09 ? D.PEBBLES : r < .093 ? D.FEATHER : r < .095 ? D.BONES : 0;
      }
      dec[i] = d;
    }
    // Tracks follow the trails: tyre tracks from the ship, drag marks from the logging camps, boot prints elsewhere.
    const trackAlong = (nodes, d, every, limit) => {
      for (let k = 0; k < Math.min(nodes.length, limit); k++){
        if (k % every) continue;
        const n = nodes[k], a = nodes[Math.max(0, k - 1)], b = nodes[Math.min(nodes.length - 1, k + 1)];
        const th = Math.atan2(((b / W) | 0) - ((a / W) | 0), (b % W) - (a % W));
        if (!DETAILED.has(g[n])) continue;
        dec[n] = d; ang[n] = Math.round(((th + TAU) % TAU) / TAU * 256) & 255;
      }
    };
    for (const tr of trails){
      if (tr.kind === 'rover') trackAlong(tr.nodes, D.TIRE, 1, 160);
      else if (tr.kind === 'drag') trackAlong(tr.nodes, D.DRAG, 1, 70);
      else trackAlong(tr.nodes, D.FOOT, 3, 1e9);
    }
    // Animal tracks wander out from burrows and caves.
    for (const src of [...burrows, ...feats.caves.map(c => ({ x: c.x, y: c.y + 1 }))]){
      let x = src.x + .5, y = src.y + .5, th = R() * TAU;
      for (let k = 0, steps = ri(10, 26); k < steps; k++){
        th += (R() - .5) * .9; x += Math.cos(th) * 1.3; y += Math.sin(th) * 1.3;
        const xi = Math.floor(x), yi = Math.floor(y);
        if (!inb(xi, yi)) break;
        const i = yi * W + xi;
        if (!DETAILED.has(g[i]) || g[i] === T.PATH) continue;
        dec[i] = D.ANIMAL; ang[i] = Math.round(((th % TAU + TAU) % TAU) / TAU * 256) & 255;
      }
    }

    // Hand the result to the game: terrain ids in the grid, everything else in grid.art.
    const lut = KINDS.map(k => { const d = G.Defs.terrain.get(k.game); if (!d) throw new Error('Woodlands: no terrain ' + k.game); return d.id; });
    const logWall = G.Defs.terrain.get('log_wall').id;
    const grid = new G.Grid(W, W);
    for (let i = 0; i < N; i++) grid.tiles[i] = g[i] === T.WALL && dir[i] === 1 ? logWall : lut[g[i]];
    for (let i = 0; i < N; i++) if (g[i] !== T.FALLS && g[i] !== T.LOG && !(isWater(g[i]) && dir[i] === 5)) dir[i] = 0;
    grid.touch();
    const places = [
      ...feats.sites.map(p => ({ kind: 'settlement', name: p.name, x: p.x, y: p.y })),
      ...feats.falls.filter(c => c.name).map(c => ({ kind: 'waterfall', name: c.name, x: c.x, y: c.y })),
      ...feats.zones.map(z => ({ kind: z.kind === 'alien' ? 'anomaly' : 'geothermal', name: z.name, x: z.x, y: z.y })),
      { kind: 'lake', name: feats.lake.name, x: Math.round(feats.lake.x), y: Math.round(feats.lake.y) },
      { kind: 'swamp', name: feats.swamp.name, x: Math.round(feats.swamp.x), y: Math.round(feats.swamp.y) },
      ...feats.caves.map(c => ({ kind: 'cave', name: 'Cave', x: c.x, y: c.y })),
      ...feats.camps.map(c => ({ kind: 'camp', name: 'Logging camp', x: c.x, y: c.y }))
    ];
    grid.art = { kind: 'woodlands', level: lvl, dir, detail: dec, angle: ang, places };
    return grid;
  }

  G.MapGen.woodlands = woodlands;
  G.MapGen.types.woodlands = { name: 'Woodlands', generate: woodlands, clearLanding: true };
  G.WOODLANDS_DETAIL = DECALS.slice(1).map(d => d.key);
})();
