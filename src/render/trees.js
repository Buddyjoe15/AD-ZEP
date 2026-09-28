/* Free-standing trees (Genesis maps, grid.art.trees): pixel-art crowns at their own trunk
   positions, drawn in order (small trees under big ones, then north to south) over one merged
   engine shadow, so overlapping shadows don't stack. Up close (LIVE_ZOOM and in) every tree in
   view is drawn each frame so it can rustle and lean in the wind; further out the trees are
   drawn at rest into the terrain chunks. Leaning shifts the whole crown downwind (east).
   Dead wood (stumps and fallen trees) comes in the same list, drawn under every crown. Trees
   destroyed in play (G.Trees, src/sim/trees.js) are drawn as the stump they left, or not at all.
   Presentation only: nothing here is saved or read by the simulation. */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math, TAU = Math.PI * 2;
  // World px a tree or fallen tree can reach past its position: half the largest frame
  // (a large fallen tree), plus lean and shadow.
  const REACH = 160;
  // Frames are stored run-length encoded (tools/genesis-trees.mjs); expanded once each.
  const plain = new Map();
  const expand = s => { let o = plain.get(s); if (o === undefined){ o = s.replace(/(\D)(\d+)/g, (_, ch, n) => ch.repeat(+n)); plain.set(s, o); } return o; };
  // Drawing layer: dead wood (0) under every tree (1).
  const layer = kd => kd >= G.TREES.KINDS.length ? 0 : 1;

  const pixelArt = () => { const P = G.PixelArt; return P && P.enabled && P.data && P.data.genesis ? P.data.genesis.trees : null; };
  let treeId = -1, stumpCut = -1, stumpBroken = -1;

  // What to draw, by terrain chunk. Entry j < n0 is generated tree j (grid.art.trees, in
  // drawing order); it is drawn as itself while alive and its trunk tile still has the terrain
  // it was planted on (the Map Editor can paint it away), as the stump it left once destroyed
  // (G.Trees), and not at all once gone. Entries from n0 on are trees for tree tiles painted
  // in without a trunk; they are kept up to date as the terrain changes. Each chunk lists the
  // generated entries that reach into it; painted ones are few and checked directly.
  function index(grd){
    const a = grd.art;
    if (a.treeIndex) return a.treeIndex;
    if (treeId < 0){ treeId = G.Defs.terrain.get('tree').id; stumpCut = G.TREES.ALL.indexOf('stump_cut'); stumpBroken = G.TREES.ALL.indexOf('stump_broken'); }
    const tr = a.trees, T = G.CONFIG.TILE, cols = grd.cols, n0 = tr.count, LOG = G.TREES.ALL.indexOf('log');
    const logs = new Uint8Array(grd.size), head = new Int32Array(grd.size).fill(-1), next = new Int32Array(n0);
    for (let k = 0; k < n0; k++){
      if (tr.kind[k] === LOG) G.TREES.logTiles(tr.x[k], tr.y[k], tr.size[k], tr.variant[k] >> 1, T, (x, y) => { if (grd.inBounds(x, y)) logs[y * cols + x] = 1; });
      next[k] = head[tr.tile[k]]; head[tr.tile[k]] = k;
    }
    // Chunk buckets (compressed rows): start[c]..start[c + 1] in `list`.
    const CS = G.CONFIG.CHUNK_TILES * T, ncx = Math.ceil(cols * T / CS), ncy = Math.ceil(grd.rows * T / CS);
    const span = (v, max) => [Math.max(0, Math.floor((v - REACH) / CS)), Math.min(max - 1, Math.floor((v + REACH) / CS))];
    const start = new Int32Array(ncx * ncy + 1);
    const each = fn => { for (let j = 0; j < n0; j++){ const [x0, x1] = span(tr.x[j], ncx), [y0, y1] = span(tr.y[j], ncy); for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) fn(cy * ncx + cx, j); } };
    each(c => { start[c + 1]++; });
    for (let c = 0; c < ncx * ncy; c++) start[c + 1] += start[c];
    const list = new Int32Array(start[ncx * ncy]), fill = start.slice(0, -1);
    each((c, j) => { list[fill[c]++] = j; });
    const I = a.treeIndex = { grd, n0, n: n0, tr, head, next, logs, start, list, ncx, ncy, CS, extraAt: new Map(), free: [], stamp: 0 };
    alloc(I, n0 + 256);
    for (let j = 0; j < n0; j++){ I.X[j] = tr.x[j]; I.Y[j] = tr.y[j]; I.KD[j] = tr.kind[j]; I.SZ[j] = tr.size[j]; I.VR[j] = tr.variant[j]; I.TL[j] = tr.tile[j]; }
    painted(I, 0, 0, cols, grd.rows);
    return I;
  }
  // (Re)allocates the per-entry arrays for `cap` entries, keeping what they hold.
  function alloc(I, cap){
    const grow = (A, Type) => { const B = new Type(cap); if (A) B.set(A.subarray(0, Math.min(A.length, cap))); return B; };
    I.X = grow(I.X, Int32Array); I.Y = grow(I.Y, Int32Array); I.KD = grow(I.KD, Uint8Array); I.SZ = grow(I.SZ, Uint8Array); I.VR = grow(I.VR, Uint8Array); I.TL = grow(I.TL, Int32Array);
    I.live = grow(I.live, Uint8Array); I.seen = grow(I.seen, Uint32Array); I.ids = grow(I.ids, Int32Array); I.dx = grow(I.dx, Float32Array); I.step = grow(I.step, Uint8Array);
    I.EK = grow(I.EK, Uint8Array); I.ES = grow(I.ES, Uint8Array);
    I.cap = cap;
  }
  // Brings the painted trees in tiles (x, y, w, h) up to date: one for each tree tile without
  // a generated trunk still standing on it.
  function painted(I, x0, y0, w, h){
    const grd = I.grd, tiles = grd.tiles, cols = grd.cols, T = G.CONFIG.TILE, st = states(grd), hr = G.hashRandom3;
    const kinds = ['spruce', 'pine', 'birch', 'maple'].map(k => G.TREES.KINDS.indexOf(k));
    for (let y = Math.max(0, y0); y < Math.min(grd.rows, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(cols, x0 + w); x++){
      const i = y * cols + x;
      let want = tiles[i] === treeId;
      if (want) for (let k = I.head[i]; k >= 0; k = I.next[k]) if (layer(I.tr.kind[k]) && I.tr.size[k] >= G.TREES.BLOCKS_FROM && (!st || st[k] === 0) && tiles[i] === I.tr.on[k]){ want = false; break; }
      const j = I.extraAt.get(i);
      if (want === (j !== undefined)) continue;
      if (!want){ I.live[j] = 0; I.extraAt.delete(i); I.free.push(j); continue; }
      let e = I.free.pop();
      if (e === undefined){ e = I.n++; if (I.n > I.cap) alloc(I, I.cap * 2); }
      I.X[e] = Math.floor(x * T + T / 2 + (hr(x, y, 811) - 0.5) * 20); I.Y[e] = Math.floor(y * T + T / 2 + (hr(x, y, 813) - 0.5) * 20);
      I.KD[e] = kinds[Math.floor(hr(x, y, 817) * kinds.length)]; I.SZ[e] = 1; I.VR[e] = Math.floor(hr(x, y, 819) * 256); I.TL[e] = i; I.live[e] = 1;
      I.extraAt.set(i, e);
    }
  }
  // The game's tree states (G.Trees) when `grd` is the game's grid; null for other grids (the preview).
  const states = grd => grd === G.State.grid && G.Trees ? G.Trees.states() : null;
  // Whether entry j is drawn, and as what: fills I.EK (kind) and I.ES (size) for it.
  function visible(I, j, st, tiles){
    if (j >= I.n0){ if (!I.live[j] || tiles[I.TL[j]] !== treeId) return false; I.EK[j] = I.KD[j]; I.ES[j] = I.SZ[j]; return true; }
    const s = st ? st[j] : 0;
    if (s === 3) return false;
    if (s === 0){ if (tiles[I.TL[j]] !== I.tr.on[j]) return false; I.EK[j] = I.KD[j]; I.ES[j] = I.SZ[j]; return true; }
    I.EK[j] = s === 1 ? stumpCut : stumpBroken; I.ES[j] = I.SZ[j] >= 2 ? 1 : 0;
    return true;
  }
  // Painted-in trees (extras) sort in among generated ones by the generator's drawing order.
  const orderKey = (I, j) => ((layer(I.KD[j]) * 4 + I.SZ[j]) * 65536 + I.Y[j]) * 65536 + I.X[j];
  function sortIds(I, count, extras){
    const ids = I.ids.subarray(0, count);
    if (extras) ids.sort((p, q) => orderKey(I, p) - orderKey(I, q)); else ids.sort();
  }
  G.Events.on('terrain:changed', r => {
    const grd = G.State.grid, I = grd && grd.art && grd.art.treeIndex;
    if (!I) return;
    if (!r){ grd.art.treeIndex = null; return; }   // the whole map changed
    painted(I, r.x - 1, r.y - 1, r.w + 2, r.h + 2);
  });
  // A tree destroyed (or a stump or fallen tree cleared): repaint the chunks it reaches into.
  G.Events.on('tree:changed', e => {
    const T = G.CONFIG.TILE, r = Math.ceil(REACH / T);
    if (G.TerrainCache) G.TerrainCache.invalidate({ x: Math.floor(e.x / T) - r, y: Math.floor(e.y / T) - r, w: 2 * r, h: 2 * r });
  });

  // Scratch canvases for the merged shadow, one per canvas size.
  const masks = new Map();
  function mask(g){
    const c = g.canvas, key = c.width + 'x' + c.height;
    let m = masks.get(key);
    if (!m){ m = document.createElement('canvas'); m.width = c.width; m.height = c.height; masks.set(key, m); if (masks.size > 6) masks.delete(masks.keys().next().value); }
    const mg = m.getContext('2d');
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, m.width, m.height);
    mg.setTransform(g.getTransform()); mg.imageSmoothingEnabled = g.imageSmoothingEnabled;
    return mg;
  }

  // A frame, or its silhouette, averaged down to 1/2^level of its art px. Drawing art with
  // fewer device px than art px then needs little or no scaling, which is much faster than
  // shrinking the full frame on every draw (and averages instead of sampling, like terrain).
  const mips = new Map();
  function mip(str, n, level, silhouette){
    const P = G.PixelArt, full = silhouette ? P.canvas(str, n, n, null, true) : P.canvas(str, n, n, 'neutral');
    if (!level) return full;
    const key = str + (silhouette ? '|s' : '|c') + level;
    let c = mips.get(key);
    if (!c){
      const src = mip(str, n, level - 1, silhouette), m = Math.ceil(n / (1 << level));
      c = document.createElement('canvas'); c.width = m; c.height = m;
      const cg = c.getContext('2d'); cg.imageSmoothingEnabled = true; cg.imageSmoothingQuality = 'medium';
      cg.drawImage(src, 0, 0, m, m);
      mips.set(key, c);
    }
    return c;
  }
  // Draws trees ids[0..count) of index I: one merged shadow, then the crowns. Pose (lean
  // shift `I.dx` in world px, rustle step `I.step`) must be filled in for each.
  // The mip level to draw at in `g`, and whether it still needs averaging (fewer device px
  // than art px) rather than sampling.
  // Art px per world px of the tree art (4 since the art went up in resolution; 2 before).
  const AK = A => A.k || 2;
  const artScale = () => { const A = pixelArt(); return A ? AK(A) : 2; };
  // How much bigger than drawn a kind stands on the map (trees and dead wood: 2).
  const SC = (A, kind) => (A && A.scale && A.scale[kind]) || 1;
  function levelFor(g, sc = 1){
    const perArt = Math.abs(g.getTransform().a) * sc / artScale();   // device px per art px
    const level = perArt >= 1 ? 0 : perArt >= 0.5 ? 1 : perArt >= 0.25 ? 2 : 3;
    return { level, shrink: perArt * (1 << level) < 1 - 1e-6 };
  }
  let DECOR = null;
  const decorKinds = () => DECOR || (DECOR = Uint8Array.from(G.TREES.ALL, k => G.TREES.props[k] && G.TREES.props[k].decor ? 1 : 0));
  function drawPixel(g, I, count, A){
    const ALL = G.TREES.ALL, smooth = g.imageSmoothingEnabled, L1 = levelFor(g, 1), L2 = levelFor(g, 2);
    const lv = j => SC(A, ALL[I.EK[j]]) > 1 ? L2 : L1, size = (j, v) => v.n / AK(A) * SC(A, ALL[I.EK[j]]);
    const frame = j => { const set = A.art[ALL[I.EK[j]]][I.ES[j]], v = set[I.VR[j] % set.length]; return v; };
    const shadow = j => layer(I.EK[j]) ? A.shadow[I.ES[j]] : A.propShadow[ALL[I.EK[j]]];
    const m = mask(g);
    for (let k = 0; k < count; k++){
      const j = I.ids[k], v = frame(j), str = expand(v.frames[I.step[j] % v.frames.length]), w = size(j, v), off = shadow(j), L = lv(j);
      m.imageSmoothingEnabled = L.shrink;
      m.drawImage(mip(str, v.n, L.level, true), I.X[j] - w / 2 + I.dx[j] + off[0] / 2, I.Y[j] - w / 2 + off[1] / 2, w, w);
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = G.PixelArt.SHADOW_ALPHA; g.drawImage(m.canvas, 0, 0); g.restore();
    for (let k = 0; k < count; k++){
      const j = I.ids[k], v = frame(j), str = expand(v.frames[I.step[j] % v.frames.length]), w = size(j, v), L = lv(j);
      g.imageSmoothingEnabled = L.shrink;
      g.drawImage(mip(str, v.n, L.level, false), I.X[j] - w / 2 + I.dx[j], I.Y[j] - w / 2, w, w);
    }
    g.imageSmoothingEnabled = smooth;
  }
  // Without pixel art: plain round crowns, like the classic trees.
  const CLASSIC = { spruce: [24, 58, 34], pine: [34, 70, 40], birch: [80, 118, 66], maple: [44, 88, 46], snag: [92, 82, 70] };
  const PROP_CLASSIC = { bush: '#3f6a3c', flowers: '#d8c060', boulder: '#8a918c', reeds: '#8ea05c', mushrooms: '#b0503c', fern: '#35603a' };
  function drawClassic(g, I, count){
    const KINDS = G.TREES.KINDS, SP = G.TREES.species, PR = G.TREES.props;
    for (let k = 0; k < count; k++){
      const j = I.ids[k], kind = G.TREES.ALL[I.EK[j]];
      if (kind === 'log'){
        const d = PR.log.sizes[I.ES[j]], a = (I.VR[j] >> 1) / G.TREES.LOG_ANGLES * TAU, ux = Math.cos(a) * d.length / 2, uy = Math.sin(a) * d.length / 2;
        g.strokeStyle = '#6f5e48'; g.lineWidth = d.width; g.lineCap = 'round'; g.beginPath(); g.moveTo(I.X[j] - ux, I.Y[j] - uy); g.lineTo(I.X[j] + ux * 0.5, I.Y[j] + uy * 0.5); g.stroke(); g.lineCap = 'butt';
      } else if (!layer(I.EK[j])){ g.fillStyle = PROP_CLASSIC[kind] || '#9e896b'; g.beginPath(); g.arc(I.X[j], I.Y[j], PR[kind].sizes[I.ES[j]].r, 0, TAU); g.fill(); }
    }
    g.fillStyle = 'rgba(0,0,0,.3)';
    for (let k = 0; k < count; k++){ const j = I.ids[k]; if (!layer(I.EK[j])) continue; const r = SP[KINDS[I.EK[j]]].crown[I.ES[j]] / 2; g.beginPath(); g.arc(I.X[j] + 3 + I.ES[j], I.Y[j] + 3 + I.ES[j], r, 0, TAU); g.fill(); }
    for (let k = 0; k < count; k++){
      const j = I.ids[k];
      if (!layer(I.EK[j])) continue;
      const kind = KINDS[I.EK[j]], r = SP[kind].crown[I.ES[j]] / 2, c = CLASSIC[kind], x = I.X[j], y = I.Y[j];
      g.fillStyle = `rgb(${c})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.fillStyle = `rgb(${c.map(v => Math.min(255, v + 22))})`; g.beginPath(); g.arc(x - r * .25, y - r * .25, r * .5, 0, TAU); g.fill();
    }
  }

  G.TreeArt = {
    LIVE_ZOOM: 0.7,
    // True when the grid has free-standing trees.
    has: grd => !!(grd && grd.art && grd.art.trees),
    // True when trees are drawn every frame at zoom z (pixel art on, close enough to see them move).
    live(grd, z){ return this.has(grd) && !!pixelArt() && z >= this.LIVE_ZOOM; },
    // Every tree reaching into the chunk of ct × ct tiles at tile (tx, ty), at rest, into a
    // chunk canvas (world px from its corner). `groundOnly`: just the ground layer (the trees
    // are drawn live).
    paintChunk(ctx, grd, tx, ty, ct, groundOnly = false){
      const I = index(grd), A = pixelArt(), st = states(grd), tiles = grd.tiles, T = G.CONFIG.TILE;
      const X0 = tx * T, Y0 = ty * T, X1 = (tx + ct) * T, Y1 = (ty + ct) * T;
      const cx0 = Math.max(0, Math.floor(X0 / I.CS)), cy0 = Math.max(0, Math.floor(Y0 / I.CS)), cx1 = Math.min(I.ncx - 1, Math.floor((X1 - 1) / I.CS)), cy1 = Math.min(I.ncy - 1, Math.floor((Y1 - 1) / I.CS));
      if (cx0 > cx1 || cy0 > cy1) return;
      let count = 0, extras = false;
      // Painted below full size (middle zoom), small ground detail is under a pixel: left out.
      const DEC = decorKinds(), small = Math.abs(ctx.getTransform().a) < 0.75, stamp = ++I.stamp;
      const near = j => I.X[j] >= X0 - REACH && I.X[j] <= X1 + REACH && I.Y[j] >= Y0 - REACH && I.Y[j] <= Y1 + REACH;
      const take = j => { if (visible(I, j, st, tiles) && !(groundOnly && layer(I.EK[j])) && !(small && DEC[I.EK[j]])){ I.ids[count++] = j; I.dx[j] = 0; I.step[j] = 0; } };
      // (Index cells list everything reaching into them, so a tree can be in several.)
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++){
        const c = cy * I.ncx + cx;
        for (let p = I.start[c]; p < I.start[c + 1]; p++){ const j = I.list[p]; if (I.seen[j] === stamp) continue; I.seen[j] = stamp; if (near(j)) take(j); }
      }
      for (const j of I.extraAt.values()) if (near(j)){ extras = true; take(j); }
      if (!count) return;
      sortIds(I, count, extras);
      ctx.save(); ctx.translate(-X0, -Y0);   // the chunk canvas starts at its own corner
      if (A) drawPixel(ctx, I, count, A); else drawClassic(ctx, I, count);
      ctx.restore();
    },
    // Trees in the visible world rectangle `v` at time t, posed by the weather. `live(cx, cy)`
    // says which chunks were drawn without their trees (all of them, normally).
    drawLive(g, grd, v, t, live){
      const A = pixelArt();
      if (!A || !this.has(grd)) return;
      const I = index(grd), W = G.Weather, SP = G.TREES.species, KINDS = G.TREES.KINDS, LEAN = G.TREES.LEAN_PX;
      const x0 = Math.max(0, Math.floor((v.x0 - REACH) / I.CS)), x1 = Math.min(I.ncx - 1, Math.floor((v.x1 + REACH) / I.CS));
      const y0 = Math.max(0, Math.floor((v.y0 - REACH) / I.CS)), y1 = Math.min(I.ncy - 1, Math.floor((v.y1 + REACH) / I.CS));
      const stamp = ++I.stamp, st = states(grd), tiles = grd.tiles;
      const inView = j => !(I.X[j] < v.x0 - REACH || I.X[j] > v.x1 + REACH || I.Y[j] < v.y0 - REACH || I.Y[j] > v.y1 + REACH);
      let count = 0, extras = false;
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++){
        if (live && !live(cx, cy)) continue;
        const c = cy * I.ncx + cx;
        for (let p = I.start[c]; p < I.start[c + 1]; p++){
          const j = I.list[p];
          if (I.seen[j] === stamp) continue;
          I.seen[j] = stamp;
          if (inView(j) && visible(I, j, st, tiles) && layer(I.EK[j])) I.ids[count++] = j;   // the ground layer is in the chunks
        }
      }
      for (const j of I.extraAt.values()){
        const cx = Math.floor(I.X[j] / I.CS), cy = Math.floor(I.Y[j] / I.CS);
        if (inView(j) && (!live || live(cx, cy)) && visible(I, j, st, tiles)){ I.ids[count++] = j; extras = true; }
      }
      if (!count) return;
      sortIds(I, count, extras);
      // Trees stand still (no lean or rustle): drawn live only so crowns go over units.
      for (let k = 0; k < count; k++){ const j = I.ids[k]; I.dx[j] = 0; I.step[j] = 0; }
      drawPixel(g, I, count, A);
    },
    // The crowns of trees standing over ground units in `units`, drawn again above them
    // (CANOPY_ALPHA, so a unit still shows through), as a tree's top is higher than any
    // crew machine. Flying units stay above the trees.
    CANOPY_ALPHA: 0.78,
    drawOverUnits(g, grd, units, t, z){
      if (!this.has(grd) || z < G.CONFIG.LOD_ZOOM) return;
      const I = index(grd), A = pixelArt(), st = states(grd), tiles = grd.tiles, T = G.CONFIG.TILE, cols = grd.cols, SP = G.TREES.species, KINDS = G.TREES.KINDS;
      const stamp = ++I.stamp;
      let count = 0, extras = false, n = 0;
      const test = (j, u) => {
        if (I.seen[j] === stamp || !layer(I.KD[j]) || !visible(I, j, st, tiles) || !layer(I.EK[j])) return;
        const r = SP[KINDS[I.EK[j]]].crown[I.ES[j]] / 2;
        if (Math.hypot(I.X[j] - u.x, I.Y[j] - u.y) < r + u.radius * 0.8){ I.seen[j] = stamp; I.ids[count++] = j; return true; }
      };
      for (const u of units){
        if (u.isShip || u.hp <= 0 || ++n > 4000) continue;
        if (G.Defs.units.get(u.type)?.flying) continue;
        const gx = Math.floor(u.x / T), gy = Math.floor(u.y / T);
        for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++){
          if (!grd.inBounds(x, y)) continue;
          const i = y * cols + x;
          for (let k = I.head[i]; k >= 0; k = I.next[k]) test(k, u);
          const e = I.extraAt.get(i);
          if (e !== undefined && test(e, u)) extras = true;
        }
      }
      if (!count) return;
      sortIds(I, count, extras);
      const live = this.live(grd, z), LEAN = G.TREES.LEAN_PX;
      g.save(); g.globalAlpha = this.CANOPY_ALPHA;
      for (let k = 0; k < count; k++){
        const j = I.ids[k], pose = { lean: 0, rustle: 0 };   // (trees stand still)
        this.drawCrown(g, KINDS[I.EK[j]], I.ES[j], I.VR[j], I.X[j] + pose.lean * LEAN[I.ES[j]], I.Y[j], 1, pose.rustle, A);
      }
      g.restore();
    },
    // One crown (no shadow) of `kind` at world point (x, y): pixel art, or a plain circle.
    drawCrown(g, kind, size, variant, x, y, alpha = 1, step = 0, A = pixelArt()){
      const a0 = g.globalAlpha;
      g.globalAlpha = a0 * alpha;
      if (A){
        const set = A.art[kind][size], v = set[variant % set.length], str = expand(v.frames[step % v.frames.length]), w = v.n / AK(A) * SC(A, kind), { level, shrink } = levelFor(g, SC(A, kind)), smooth = g.imageSmoothingEnabled;
        g.imageSmoothingEnabled = shrink;
        g.drawImage(mip(str, v.n, level, false), x - w / 2, y - w / 2, w, w);
        g.imageSmoothingEnabled = smooth;
      } else {
        const r = G.TREES.species[kind].crown[size] / 2, c = CLASSIC[kind];
        g.fillStyle = `rgb(${c})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      g.globalAlpha = a0;
    },
    // True when a fallen tree drawn here lies across tile i (its tile art is left out).
    logOn(grd, i){ return this.has(grd) && index(grd).logs[i] === 1; },
    // The tree whose trunk stands on tile (gx, gy), as 'large spruce' (or 'sawn stump'), or null.
    at(grd, gx, gy){
      if (!this.has(grd) || !grd.inBounds(gx, gy)) return null;
      const I = index(grd), i = gy * grd.cols + gx, st = states(grd);
      for (let k = I.head[i]; k >= 0; k = I.next[k]){
        if (!layer(I.KD[k]) || !visible(I, k, st, grd.tiles)) continue;
        if (!layer(I.EK[k])) return I.EK[k] === stumpCut ? 'sawn stump' : 'snapped stump';
        return G.TREES.SIZES[I.SZ[k]] + ' ' + G.TREES.species[G.TREES.KINDS[I.KD[k]]].name.toLowerCase();
      }
      const e = I.extraAt.get(i);
      return e !== undefined ? 'medium ' + G.TREES.species[G.TREES.KINDS[I.KD[e]]].name.toLowerCase() : null;
    }
  };
})();
