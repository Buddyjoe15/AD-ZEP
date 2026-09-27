/* Free-standing trees (Genesis maps, grid.art.trees): pixel-art crowns at their own trunk
   positions, drawn in order (small trees under big ones, then north to south) over one merged
   engine shadow, so overlapping shadows don't stack. Up close (LIVE_ZOOM and in) every tree in
   view is drawn each frame so it can rustle and lean in the wind; further out the trees are
   drawn at rest into the terrain chunks. Leaning shifts the whole crown downwind (east).
   Dead wood (stumps and fallen trees) comes in the same list, drawn under every crown.
   Presentation only: nothing here is saved or read by the simulation. */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math, TAU = Math.PI * 2;
  // World px a tree or fallen tree can reach past its position: half the largest frame
  // (a large fallen tree), plus lean and shadow.
  const REACH = 80;
  // Frames are stored run-length encoded (tools/genesis-trees.mjs); expanded once each.
  const plain = new Map();
  const expand = s => { let o = plain.get(s); if (o === undefined){ o = s.replace(/(\D)(\d+)/g, (_, ch, n) => ch.repeat(+n)); plain.set(s, o); } return o; };
  // Drawing layer: dead wood (0) under every tree (1).
  const layer = kd => kd >= G.TREES.KINDS.length ? 0 : 1;

  const pixelArt = () => { const P = G.PixelArt; return P && P.enabled && P.data && P.data.genesis ? P.data.genesis.trees : null; };
  let treeId = -1;

  // The trees to draw, by terrain chunk. Generated trees are kept while their trunk tile still
  // has the terrain they were planted on (the Map Editor can paint them away), and every tree
  // tile painted in without a trunk gets a tree of its own. Each chunk lists every tree that
  // reaches into it, in drawing order. Rebuilt after the terrain changes.
  function index(grd){
    const a = grd.art;
    if (a.treeIndex) return a.treeIndex;
    if (treeId < 0) treeId = G.Defs.terrain.get('tree').id;
    const tr = a.trees, T = G.CONFIG.TILE, tiles = grd.tiles, cols = grd.cols, KINDS = G.TREES.KINDS, LOG = G.TREES.ALL.indexOf('log');
    const keep = [], trunk = new Uint8Array(grd.size), logs = new Uint8Array(grd.size);
    for (let k = 0; k < tr.count; k++){
      if (tiles[tr.tile[k]] !== tr.on[k]) continue;
      keep.push(k);
      if (tr.kind[k] === LOG) G.TREES.logTiles(tr.x[k], tr.y[k], tr.size[k], tr.variant[k] >> 1, T, (x, y) => { if (grd.inBounds(x, y)) logs[y * cols + x] = 1; });
      else if (layer(tr.kind[k])) trunk[tr.tile[k]] = 1;
    }
    const extra = [];
    for (let i = 0; i < grd.size; i++) if (tiles[i] === treeId && !trunk[i]) extra.push(i);
    const n = keep.length + extra.length;
    const X = new Int32Array(n), Y = new Int32Array(n), KD = new Uint8Array(n), SZ = new Uint8Array(n), VR = new Uint8Array(n);
    keep.forEach((k, j) => { X[j] = tr.x[k]; Y[j] = tr.y[k]; KD[j] = tr.kind[k]; SZ[j] = tr.size[k]; VR[j] = tr.variant[k]; });
    const h = G.hashRandom3, painted = ['spruce', 'pine', 'birch', 'maple'].map(k => KINDS.indexOf(k));
    extra.forEach((i, e) => {
      const j = keep.length + e, gx = i % cols, gy = (i / cols) | 0;
      X[j] = Math.floor(gx * T + T / 2 + (h(gx, gy, 811) - 0.5) * 20); Y[j] = Math.floor(gy * T + T / 2 + (h(gx, gy, 813) - 0.5) * 20);
      KD[j] = painted[Math.floor(h(gx, gy, 817) * painted.length)]; SZ[j] = 1; VR[j] = Math.floor(h(gx, gy, 819) * 256);
    });
    let order = null;
    if (extra.length){
      order = Array.from({ length: n }, (_, j) => j).sort((p, q) => layer(KD[p]) - layer(KD[q]) || SZ[p] - SZ[q] || Y[p] - Y[q] || X[p] - X[q]);
      const re = A => { const B = A.slice(); order.forEach((p, j) => { A[j] = B[p]; }); };
      [X, Y, KD, SZ, VR].forEach(re);
    }
    // Chunk buckets (compressed rows): start[c]..start[c + 1] in `list`.
    const CS = G.CONFIG.CHUNK_TILES * T, ncx = Math.ceil(cols * T / CS), ncy = Math.ceil(grd.rows * T / CS);
    const span = (v, max) => [Math.max(0, Math.floor((v - REACH) / CS)), Math.min(max - 1, Math.floor((v + REACH) / CS))];
    const start = new Int32Array(ncx * ncy + 1);
    const each = fn => { for (let j = 0; j < n; j++){ const [x0, x1] = span(X[j], ncx), [y0, y1] = span(Y[j], ncy); for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) fn(cy * ncx + cx, j); } };
    each(c => { start[c + 1]++; });
    for (let c = 0; c < ncx * ncy; c++) start[c + 1] += start[c];
    const list = new Int32Array(start[ncx * ncy]), fill = start.slice(0, -1);
    each((c, j) => { list[fill[c]++] = j; });
    return (a.treeIndex = { n, X, Y, KD, SZ, VR, logs, start, list, ncx, ncy, CS, seen: new Uint32Array(n), stamp: 0, ids: new Int32Array(n), dx: new Float32Array(n), step: new Uint8Array(n) });
  }
  G.Events.on('terrain:changed', () => { const grd = G.State.grid; if (grd && grd.art) grd.art.treeIndex = null; });

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
  function drawPixel(g, I, count, A){
    const ALL = G.TREES.ALL, smooth = g.imageSmoothingEnabled;
    const perArt = Math.abs(g.getTransform().a) / 2;   // device px per art px
    const level = perArt >= 1 ? 0 : perArt >= 0.5 ? 1 : 2;
    const shrink = perArt * (1 << level) < 1 - 1e-6;   // still fewer device px than art px: average, don't sample
    const frame = j => { const set = A.art[ALL[I.KD[j]]][I.SZ[j]], v = set[I.VR[j] % set.length]; return v; };
    const shadow = j => layer(I.KD[j]) ? A.shadow[I.SZ[j]] : A.propShadow[ALL[I.KD[j]]];
    const m = mask(g);
    m.imageSmoothingEnabled = shrink;
    for (let k = 0; k < count; k++){
      const j = I.ids[k], v = frame(j), str = expand(v.frames[I.step[j] % v.frames.length]), w = v.n / 2, off = shadow(j);
      m.drawImage(mip(str, v.n, level, true), I.X[j] - w / 2 + I.dx[j] + off[0] / 2, I.Y[j] - w / 2 + off[1] / 2, w, w);
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = G.PixelArt.SHADOW_ALPHA; g.drawImage(m.canvas, 0, 0); g.restore();
    g.imageSmoothingEnabled = shrink;
    for (let k = 0; k < count; k++){
      const j = I.ids[k], v = frame(j), str = expand(v.frames[I.step[j] % v.frames.length]), w = v.n / 2;
      g.drawImage(mip(str, v.n, level, false), I.X[j] - w / 2 + I.dx[j], I.Y[j] - w / 2, w, w);
    }
    g.imageSmoothingEnabled = smooth;
  }
  // Without pixel art: plain round crowns, like the classic trees.
  const CLASSIC = { spruce: [24, 58, 34], pine: [34, 70, 40], birch: [80, 118, 66], maple: [44, 88, 46], snag: [92, 82, 70] };
  function drawClassic(g, I, count){
    const KINDS = G.TREES.KINDS, SP = G.TREES.species, PR = G.TREES.props;
    for (let k = 0; k < count; k++){
      const j = I.ids[k], kind = G.TREES.ALL[I.KD[j]];
      if (kind === 'log'){
        const d = PR.log.sizes[I.SZ[j]], a = (I.VR[j] >> 1) / G.TREES.LOG_ANGLES * TAU, ux = Math.cos(a) * d.length / 2, uy = Math.sin(a) * d.length / 2;
        g.strokeStyle = '#6f5e48'; g.lineWidth = d.width; g.lineCap = 'round'; g.beginPath(); g.moveTo(I.X[j] - ux, I.Y[j] - uy); g.lineTo(I.X[j] + ux * 0.5, I.Y[j] + uy * 0.5); g.stroke(); g.lineCap = 'butt';
      } else if (!layer(I.KD[j])){ g.fillStyle = '#9e896b'; g.beginPath(); g.arc(I.X[j], I.Y[j], PR[kind].sizes[I.SZ[j]].r, 0, TAU); g.fill(); }
    }
    g.fillStyle = 'rgba(0,0,0,.3)';
    for (let k = 0; k < count; k++){ const j = I.ids[k]; if (!layer(I.KD[j])) continue; const r = SP[KINDS[I.KD[j]]].crown[I.SZ[j]] / 2; g.beginPath(); g.arc(I.X[j] + 3 + I.SZ[j], I.Y[j] + 3 + I.SZ[j], r, 0, TAU); g.fill(); }
    for (let k = 0; k < count; k++){
      const j = I.ids[k];
      if (!layer(I.KD[j])) continue;
      const kind = KINDS[I.KD[j]], r = SP[kind].crown[I.SZ[j]] / 2, c = CLASSIC[kind], x = I.X[j], y = I.Y[j];
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
    // Every tree reaching into chunk (cx, cy), at rest, into a chunk canvas (world px).
    paintChunk(ctx, grd, cx, cy){
      const I = index(grd), A = pixelArt(), c = cy * I.ncx + cx;
      if (cx < 0 || cy < 0 || cx >= I.ncx || cy >= I.ncy) return;
      let count = 0;
      for (let p = I.start[c]; p < I.start[c + 1]; p++){ const j = I.list[p]; I.ids[count++] = j; I.dx[j] = 0; I.step[j] = 0; }
      if (!count) return;
      ctx.save(); ctx.translate(-cx * I.CS, -cy * I.CS);   // the chunk canvas starts at its own corner
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
      const stamp = ++I.stamp;
      let count = 0;
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++){
        if (live && !live(cx, cy)) continue;
        const c = cy * I.ncx + cx;
        for (let p = I.start[c]; p < I.start[c + 1]; p++){
          const j = I.list[p];
          if (I.seen[j] === stamp) continue;
          I.seen[j] = stamp;
          const x = I.X[j], y = I.Y[j];
          if (x < v.x0 - REACH || x > v.x1 + REACH || y < v.y0 - REACH || y > v.y1 + REACH) continue;
          I.ids[count++] = j;
        }
      }
      if (!count) return;
      I.ids.subarray(0, count).sort();
      for (let k = 0; k < count; k++){
        const j = I.ids[k];
        if (!layer(I.KD[j])){ I.dx[j] = 0; I.step[j] = 0; continue; }   // dead wood doesn't move
        const pose = W.treePose(I.X[j], I.Y[j], t, SP[KINDS[I.KD[j]]]);
        I.dx[j] = pose.lean * LEAN[I.SZ[j]]; I.step[j] = pose.rustle;
      }
      drawPixel(g, I, count, A);
    },
    // True when a fallen tree drawn here lies across tile i (its tile art is left out).
    logOn(grd, i){ return this.has(grd) && index(grd).logs[i] === 1; },
    // The tree whose trunk stands on tile (gx, gy), as 'large spruce', or null.
    at(grd, gx, gy){
      if (!this.has(grd) || !grd.inBounds(gx, gy)) return null;
      const I = index(grd), T = G.CONFIG.TILE, c = Math.floor(gy * T / I.CS) * I.ncx + Math.floor(gx * T / I.CS);
      for (let p = I.start[c + 1] - 1; p >= I.start[c]; p--){
        const j = I.list[p];
        if (layer(I.KD[j]) && Math.floor(I.X[j] / T) === gx && Math.floor(I.Y[j] / T) === gy) return G.TREES.SIZES[I.SZ[j]] + ' ' + G.TREES.species[G.TREES.KINDS[I.KD[j]]].name.toLowerCase();
      }
      return null;
    }
  };
})();
