/* Genesis landscape: water, shorelines, cliffs and waterfalls drawn along smooth contours
   instead of tile by tile. Presentation only: movement still follows the tiles.

   Water and ground height are fields interpolated between tile centres (the dual grid), so an
   edge that steps one tile becomes a 45° diagonal, corners are chamfered, and a little noise
   makes the lines natural. Every art px near water or a change of level is shaded from them:
   - water by depth (shallows, open water, deep channels), a foam line at the edge and a wet
     mud bank on the land;
   - cliffs along each rim: the face hangs down from the rim one tile, so it covers the cliff
     tiles that block, facing the viewer on south-facing drops (stone with strata, cracks, moss
     and a dark foot) and showing only a lit lip and a shadow line elsewhere; diagonal rims give
     slanted faces;
   - waterfalls where a river crosses a rim: the face is falling water.
   The rest of the tile (grass, detail, decorations) is drawn by src/render/woodlands.js first.
   Waterfalls (streaks, foam and spray) and glints on open water are animated each frame up
   close (drawLive). Colours come from the pixel-art palette, dithered, never blended. */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math;
  const T = () => G.CONFIG.TILE;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = {
    dust0: '#5e4f3d', dust1: '#6f5e48', dust2: '#7f6c53', dust3: '#8e7a5e', dust4: '#9e896b', dust5: '#b09c7e',
    char0: '#231f1c', char1: '#433a33', grass0: '#3f5a3a', grass1: '#4d6946', grass3: '#739158', leaf1: '#28502d',
    water0: '#1f4a5c', water1: '#2e6578', water2: '#4f8c9e', water3: '#9fcfd8', white: '#ffffff',
    steel0: '#1f2c34', steel1: '#34495a', steel2: '#557184', plate0: '#7f8b86', plate1: '#b3bdb5'
  };
  // Palette colours as indices (P) into opaque 32-bit pixels (PX, as ImageData stores them).
  const P = {}, PX = new Uint32Array(Object.keys(C).length);
  const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  Object.entries(C).forEach(([k, v], idx) => { const [r, g, b] = hex(v); P[k] = idx; PX[idx] = LE ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0; });
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const FACE = 48;   // world px a cliff face hangs below its rim: one tile

  // Tileable value noise, 128 × 128, sampled at 2 per world px (one per art px).
  const NS = 128, NOISE = (() => {
    const n = new Float32Array(NS * NS), h = (x, y, s) => G.hashRandom3(x & 15, y & 15, s);
    for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++){
      let v = 0, a = 1, norm = 0;
      for (const [cell, s] of [[16, 1], [8, 2], [4, 3]]){
        const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, m = NS / cell;
        const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
        const c = (i, j) => h(((x0 + i) % m + m) % m, ((y0 + j) % m + m) % m, s);
        v += a * (c(0, 0) + (c(1, 0) - c(0, 0)) * u + (c(0, 1) - c(0, 0)) * w + (c(0, 0) - c(1, 0) - c(0, 1) + c(1, 1)) * u * w); norm += a; a *= 0.5;
      }
      n[y * NS + x] = v / norm;
    }
    return n;
  })();
  const noise = (ax, ay) => NOISE[(ay & (NS - 1)) * NS + (ax & (NS - 1))];
  // Fractured rock, 128 × 128 art px, repeating: irregular slabs (wider than tall) from a
  // jittered Voronoi pattern. ROCK_SHADE is each slab's tone (0–1); ROCK_EDGE is 2 on a crack
  // between slabs, 1 on a slab's lit top edge, 0 inside.
  const ROCK_SHADE = new Float32Array(NS * NS), ROCK_EDGE = new Uint8Array(NS * NS);
  (() => {
    const CW = 26, CH = 12, nx = NS / CW | 0, ny = NS / CH | 0, pts = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push([(i + 0.15 + G.hashRandom3(i, j, 801) * 0.7) * NS / nx, (j + 0.15 + G.hashRandom3(i, j, 803) * 0.7) * NS / ny, G.hashRandom3(i, j, 805)]);
    const id = new Int32Array(NS * NS);
    for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++){
      let b1 = 1e9, b2 = 1e9, bi = 0;
      for (let k = 0; k < pts.length; k++){
        let dx = Math.abs(x - pts[k][0]), dy = Math.abs(y - pts[k][1]);
        dx = Math.min(dx, NS - dx); dy = Math.min(dy, NS - dy) * 1.7;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < b1){ b2 = b1; b1 = d; bi = k; } else if (d < b2) b2 = d;
      }
      id[y * NS + x] = bi; ROCK_SHADE[y * NS + x] = pts[bi][2];
      ROCK_EDGE[y * NS + x] = b2 - b1 < 1.4 ? 2 : 0;
    }
    for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++){
      const i = y * NS + x, up = ((y + NS - 1) % NS) * NS + x;
      if (!ROCK_EDGE[i] && ROCK_EDGE[up] === 2 && id[up] !== id[i]) ROCK_EDGE[i] = 1;
      else if (!ROCK_EDGE[i] && id[up] !== id[i]) ROCK_EDGE[i] = 1;
    }
  })();

  // Per-tile fields for a Genesis grid: effective height E (a cliff tile dropping to the south
  // counts as the low side, so its face hangs over it), water W (1 water), depth D (1 deep),
  // noFace (slopes, steps: level changes with no rock face) and the tiles that need shading.
  let K = null;
  function ids(){
    if (K) return K;
    const id = k => G.Defs.terrain.get(k).id;
    K = { WATER: id('water'), DEEP: id('deep_water'), FALLS: id('waterfall'), CLIFF: id('cliff'), CAVE: id('cave'), SLOPE: id('slope'), STAIRS: id('steps'), BRIDGE: id('bridge'), PATH: id('path'), STONES: id('stepping_stones'), BOG: id('bog'), VENT: id('steam_vent'), BARREN: id('barren'), ORE: id('outcrop'), SWAMP: id('swamp') };
    return K;
  }
  function fields(grd){
    const a = grd.art;
    if (a.land) return a.land;
    const n = grd.size;
    a.land = { E: new Float32Array(n), W: new Float32Array(n), D: new Float32Array(n), noFace: new Uint8Array(n), near: new Uint8Array(n), P: new Float32Array(n), B: new Uint8Array(n), PK: new Uint8Array(n), S: new Float32Array(n), stones: new Map() };
    // Stepping stones (grid.art.fords) listed by every tile they or their wake reach.
    const f = a.fords, t = T();
    if (f) for (let s = 0; s < f.count; s++){
      const reach = f.land[s] ? f.r[s] + 2 : f.r[s] * 4;
      for (let y = Math.floor((f.y[s] - reach) / t); y <= Math.floor((f.y[s] + reach) / t); y++) for (let x = Math.floor((f.x[s] - reach) / t); x <= Math.floor((f.x[s] + reach) / t); x++){
        if (!grd.inBounds(x, y)) continue;
        const i = y * grd.cols + x;
        let list = a.land.stones.get(i);
        if (!list) a.land.stones.set(i, list = []);
        list.push(s);
      }
    }
    update(grd, 0, 0, grd.cols, grd.rows);
    return a.land;
  }
  // Recomputes the fields in tiles (x, y, w, h), and which tiles need shading around them.
  function update(grd, x0, y0, w, h){
    const L = grd.art.land, k = ids(), cols = grd.cols, rows = grd.rows, lvl = grd.art.level, tiles = grd.tiles;
    const inb = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
    const lv = (x, y) => inb(x, y) ? lvl[y * cols + x] : -1;
    for (let y = Math.max(0, y0 - 1); y < Math.min(rows, y0 + h + 1); y++) for (let x = Math.max(0, x0 - 1); x < Math.min(cols, x0 + w + 1); x++){
      const i = y * cols + x, t = tiles[i], l = lvl[i];
      const wet = t === k.WATER || t === k.DEEP || t === k.FALLS || t === k.STONES || t === k.BOG;
      L.B[i] = t === k.BOG ? 1 : 0;
      L.W[i] = wet ? 1 : 0;
      // Bare ground along contours: 1 a trail, 2 barren or sodden ground (drawn by kind, below).
      L.P[i] = t === k.PATH || t === k.BARREN || t === k.ORE || t === k.VENT ? 1 : 0;
      L.PK[i] = t === k.BARREN || t === k.ORE || t === k.VENT ? 1 : 0;
      L.S[i] = t === k.SWAMP ? 1 : 0;   // sodden fen ground, its own field so it blends into grass, not dirt
      L.D[i] = t === k.DEEP ? 1 : 0;
      L.noFace[i] = t === k.SLOPE ? 1 : t === k.STAIRS ? 2 : 0;   // a grassy ramp or carved steps instead of rock
      let e = l;
      if (t === k.CLIFF || t === k.CAVE){
        const low = Math.min(...[[0, 1], [-1, 1], [1, 1]].map(([dx, dy]) => { const v = lv(x + dx, y + dy); return v < 0 ? l : v; }));
        if (low < l) e = low;
      }
      L.E[i] = e;
    }
    // Tiles to shade (bits of `near`): 1 water or a shore, 2 a change of height within reach (two
    // rows up, for faces hanging from a rim above, one tile elsewhere), 4 a path or its edge.
    for (let y = Math.max(0, y0 - 3); y < Math.min(rows, y0 + h + 3); y++) for (let x = Math.max(0, x0 - 2); x < Math.min(cols, x0 + w + 2); x++){
      const i = y * cols + x;
      let near = (L.W[i] || L.stones.has(i) ? 1 : 0) | (L.P[i] || L.S[i] ? 4 : 0);
      for (let dy = -2; dy <= 1 && near < 7; dy++) for (let dx = -1; dx <= 1; dx++){
        if (!inb(x + dx, y + dy)) continue;
        const j = (y + dy) * cols + x + dx;
        if (L.E[j] !== L.E[i]) near |= 2;
        if (dy >= -1 && L.W[j] !== L.W[i]) near |= 1;
        if (dy >= -1 && (L.P[j] !== L.P[i] || L.PK[j] !== L.PK[i] || L.S[j] !== L.S[i])) near |= 4;
      }
      L.near[i] = near;
    }
  }
  // Bilinear sample of per-tile field F between tile centres at world px (x, y).
  function bil(grd, F, x, y){
    const t = T(), u = x / t - 0.5, v = y / t - 0.5, cols = grd.cols, rows = grd.rows;
    let i0 = Math.floor(u), j0 = Math.floor(v);
    const fx = u - i0, fy = v - j0;
    const i1 = Math.min(cols - 1, Math.max(0, i0 + 1)), j1 = Math.min(rows - 1, Math.max(0, j0 + 1));
    i0 = Math.min(cols - 1, Math.max(0, i0)); j0 = Math.min(rows - 1, Math.max(0, j0));
    const a = F[j0 * cols + i0], b = F[j0 * cols + i1], c = F[j1 * cols + i0], d = F[j1 * cols + i1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  // Level of the ground at a world point (the rims wobble a little), and whether it is water.
  const levelAt = (grd, L, x, y) => Math.floor(bil(grd, L.E, x, y) + 0.5 + (noise(Math.floor(x * 2), Math.floor(y * 2)) - 0.5) * 0.2);
  const waterAt = (grd, L, x, y) => bil(grd, L.W, x, y) + (noise(Math.floor(x * 2) + 57, Math.floor(y * 2) + 31) - 0.5) * 0.14;
  const TINT = [-0.18, -0.09, 0, 0.06, 0.12];

  // Scratch image for one chunk's shading, per canvas size. Only the rectangle last written
  // (`used`) is cleared, uploaded and drawn.
  const scratch = new Map();
  function image(w, h){
    const key = w + 'x' + h;
    let s = scratch.get(key);
    if (!s){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; s = { cv, g: cv.getContext('2d'), img: new ImageData(w, h), used: null }; scratch.set(key, s); if (scratch.size > 4) scratch.delete(scratch.keys().next().value); }
    if (s.used){ const [x0, y0, x1, y1] = s.used, d = s.img.data; for (let y = y0; y < y1; y++) d.fill(0, (y * w + x0) * 4, (y * w + x1) * 4); }
    s.used = null;
    return s;
  }

  const RAMP = [P.water2, P.water1, P.water0];
  // Open water, well away from any shore, cliff or change of depth: its shading only depends on
  // where the (repeating) noise falls, so tiles are cached (openCache) and copied.
  const openCache = new Map();
  function openWater(L, grd, gx, gy){
    const cols = grd.cols, d0 = L.D[gy * cols + gx];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
      const x = gx + dx, y = gy + dy;
      if (!grd.inBounds(x, y)) return false;
      const j = y * cols + x;
      if (L.W[j] !== 1 || L.D[j] !== d0 || L.B[j] !== L.B[gy * cols + gx] || L.near[j] & 2 || L.stones.has(j)) return false;
    }
    return true;
  }

  // Mist and spray, drawn from time alone (no particles to keep): puff `seed` of a source at
  // (x, y) rolls up and drifts, growing and fading; droplets arc out and fall back.
  function mist(g, x, y, ts, seed, n, spread, rise, size){
    const h = G.hashRandom3;
    for (let s = 0; s < n; s++){
      const f = (ts * (0.22 + h(seed, s, 1) * 0.12) + h(seed, s, 2)) % 1, a = Math.sin(Math.PI * f) * 0.32;
      if (a < 0.02) continue;
      const px = x + (h(seed, s, 3) - 0.5) * spread + Math.sin(ts * 0.7 + s) * 4 + f * 10, py = y - f * rise, r = Math.round(size * (0.5 + f));
      g.globalAlpha = a; g.fillStyle = C.white;
      g.fillRect(Math.round(px - r), Math.round(py - r * 0.7), r * 2, Math.round(r * 1.4));
      g.globalAlpha = a * 0.6; g.fillRect(Math.round(px - r * 0.6), Math.round(py - r * 1.1), Math.round(r * 1.2), Math.round(r * 2.2));
    }
    g.globalAlpha = 1;
  }
  function spray(g, x, y, ts, seed, n, spread, up){
    const h = G.hashRandom3;
    for (let s = 0; s < n; s++){
      const f = (ts * (0.9 + h(seed, s, 4) * 0.8) + h(seed, s, 5)) % 1, dir = (h(seed, s, 6) - 0.5) * 2;
      const px = x + (h(seed, s, 7) - 0.5) * spread + dir * f * 14, py = y - (4 * f * (1 - f)) * up + f * 4;
      g.globalAlpha = 0.9 * (1 - f); g.fillStyle = f < 0.4 ? C.white : C.water3;
      g.fillRect(Math.round(px), Math.round(py), 1.5, 1.5);
    }
    g.globalAlpha = 1;
  }

  G.Landscape = {
    // True for grids drawn with contours (Genesis).
    on: grd => !!(grd && grd.art && grd.art.generator === 'genesis'),
    fields,
    // True when tile i is shaded here (woodlands.js then skips its flat height tint).
    shaded(grd, i){ return fields(grd).near[i] > 0; },
    level(grd, x, y){ return levelAt(grd, fields(grd), x, y); },
    water(grd, x, y){ return waterAt(grd, fields(grd), x, y) >= 0.5; },

    // Shades the chunk of ct × ct tiles at tile (x0, y0) into ctx (chunk-local world px,
    // scaled by the canvas resolution).
    paintChunk(ctx, grd, x0, y0, ct){
      const L = fields(grd), t = T(), res = Math.abs(ctx.getTransform().a), cols = grd.cols, rows = grd.rows;
      const W = Math.round(ct * t * res), s = image(W, W), d = s.img.data, lvl = grd.art.level, k = ids();
      const step = 1 / res, F = Math.round(FACE * res), ox = x0 * t, oy = y0 * t, fx7 = 7 * res;
      // Rows of one tile's column: which tile-centre row each canvas row falls between, and
      // how far (so a column's value is one lerp per pixel once interpolated across x).
      const rowJ = new Int32Array(Math.ceil((t + FACE) * res) + 4), rowF = new Float32Array(rowJ.length), rowA = new Int32Array(rowJ.length);
      const colA = new Float32Array(8), colW = new Float32Array(8), colD = new Float32Array(8), colP = new Float32Array(8), colS = new Float32Array(8);
      // A field interpolated across x at column u (tile units) for tile rows j0..j0+7.
      const across = (Fd, u, j0, out) => {
        let i0 = Math.floor(u); const fx = u - i0;
        let i1 = Math.min(cols - 1, Math.max(0, i0 + 1)); i0 = Math.min(cols - 1, Math.max(0, i0));
        for (let r = 0; r < 8; r++){ const j = Math.min(rows - 1, Math.max(0, j0 + r)); out[r] = Fd[j * cols + i0] + (Fd[j * cols + i1] - Fd[j * cols + i0]) * fx; }
      };
      let any = false, Lbuf = null, bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
      const openTiles = [], open = [];
      // Shades tile (gx, gy) — canvas px [px0, px1) × [py0, py1) of this chunk — into `buf`, an
      // image BW px wide whose pixel (0, 0) is canvas px (bx, by).
      // `carry` (optional) holds each column's rim state from the tile above, when that tile
      // was just shaded; then there is no need to look a face's height above this one.
      const wy0 = cy => oy + (cy + 0.5) * step;
      const shadeTile = (gx, gy, i, near, px0, px1, py0, py1, buf, BW, bx, by, carry) => {
        const d32 = new Uint32Array(buf.buffer, buf.byteOffset, buf.length >> 2);
        const cliffs = near & 2, wet = near & 1, trail = near & 4, tintBase = TINT[lvl[i]] || 0, carried = !!(cliffs && carry && carry.ok);
        const yStart = cliffs && !carried ? py0 - F : cliffs ? py0 - 1 : py0, nRows = py1 - yStart, j0 = Math.floor((oy + (yStart + 0.5) * step) / t - 0.5);
        const rowAY = rowA;
        for (let r = 0; r < nRows; r++){ const wy = oy + (yStart + r + 0.5) * step, v = wy / t - 0.5, j = Math.floor(v); rowJ[r] = j - j0; rowF[r] = v - j; rowAY[r] = Math.floor(wy * 2); }
        // Levels of every pixel in the tile (and a column either side, and a face's height
        // above), for faces, lips and shadows.
        const cw = px1 - px0 + 2;
        if (cliffs){
          if (!Lbuf || Lbuf.length < cw * nRows) Lbuf = new Int8Array(cw * nRows * 2);
          for (let c = 0; c < cw; c++){
            const wx = ox + (px0 - 1 + c + 0.5) * step, ax = Math.floor(wx * 2) & (NS - 1);
            across(L.E, wx / t - 0.5, j0, colA);
            for (let r = 0; r < nRows; r++){
              const q = rowJ[r], a0 = colA[q], h = a0 + (colA[q + 1] - a0) * rowF[r];
              Lbuf[c * nRows + r] = Math.floor(h + 0.5 + (NOISE[(rowAY[r] & (NS - 1)) * NS + ax] - 0.5) * 0.2);
            }
          }
        }
        const lvlI = lvl[i], Wi = L.W[i], Di = L.D[i], fd = grd.art.fords;
        // Bog colours here: a bog tile, or dry land whose water comes from a bog beside it.
        let bog = L.B[i] === 1;
        if (!bog && !Wi) for (let dy = -1; dy <= 1 && !bog; dy++) for (let dx = -1; dx <= 1; dx++){ const x = gx + dx, y = gy + dy; if (x >= 0 && y >= 0 && x < cols && y < rows && L.B[y * cols + x]){ bog = true; break; } }
        // Stepping stones here: only those still standing in their crossing (not painted over).
        let stones = L.stones.get(i) || null;
        if (stones){ stones = stones.filter(q => grd.tiles[fd.crossings[fd.c[q]].mid] === k.STONES); if (!stones.length) stones = null; }
        for (let cx = px0; cx < px1; cx++){
          const wx = ox + (cx + 0.5) * step, ax = Math.floor(wx * 2), axm = ax & (NS - 1), c = cx - px0 + 1, cb = c * nRows;
          if (wet){ across(L.W, wx / t - 0.5, j0, colW); across(L.D, wx / t - 0.5, j0, colD); }
          if (trail){ across(L.P, wx / t - 0.5, j0, colP); across(L.S, wx / t - 0.5, j0, colS); }
          const nx7 = NOISE[7 * NS + axm] + NOISE[3 * NS + ((ax >> 1) & (NS - 1))] * 0.5;   // waterfall streak strength of this column
          // A ragged foot (faces vary in height), grass hanging over the lip, water stains.
          const Fc = F + Math.round((NOISE[23 * NS + ((ax >> 2) & (NS - 1))] - 0.5) * 10 * res), overhang = Math.max(0, (NOISE[41 * NS + ((ax >> 1) & (NS - 1))] - 0.55) * 12 * res);
          const stain = NOISE[5 * NS + ((ax >> 1) & (NS - 1))];
          // Walk down the column from a face's height above the tile (or from where the tile
          // above left off), tracking the last rim.
          let prev = -128, rimY = -1e9, rimL = -128;
          if (carried){ const k0 = cx - px0; rimY = carry.rimY[k0]; rimL = carry.rimL[k0]; }
          for (let r = 0; r < nRows; r++){
            const cy = yStart + r, lp = cliffs ? Lbuf[cb + r] : lvlI;
            if (carried && r === 0){ prev = lp; continue; }   // the tile above's last row: only its level
            if (r > 0 && lp < prev){ if (!(cy - rimY < F && rimL > prev)) rimL = prev; rimY = cy; }
            else if (r > 0 && lp > prev && lp >= rimL) rimL = -128;
            const above = r > 0 ? prev : -128;
            prev = lp;
            if (cy < py0) continue;
            const ay = rowAY[r], aym = ay & (NS - 1), n = NOISE[aym * NS + axm], dith = BAYER[(ay & 3) * 4 + (ax & 3)];
            let col = -1, alpha = 255;
            const ft = cy - rimY;
            const face = cliffs && ft < Fc && rimL > lp;
            // A slope or carved steps sit on either side of the rim (the rim wobbles across the tile
            // edge), so check both.
            let ramp = 0;
            if (face){ const ry = oy + rimY * step, a1 = Math.min(rows - 1, Math.max(0, Math.floor((ry - 3) / t))), b1 = Math.min(rows - 1, Math.max(0, Math.floor((ry + 3) / t))); ramp = Math.max(L.noFace[a1 * cols + gx], L.noFace[b1 * cols + gx]); }
            let w = Wi;
            if (wet){ const q = rowJ[r], a0 = colW[q]; w = a0 + (colW[q + 1] - a0) * rowF[r] + (NOISE[((ay + 31) & (NS - 1)) * NS + ((ax + 57) & (NS - 1))] - 0.5) * 0.14; }
            // Stepping stones: wet rock lit from the top left, a ring of foam, a bow wave upstream
            // and a wake trailing downstream.
            if (stones && !face){
              const wy = oy + (cy + 0.5) * step;
              let best = 1e9, bq = -1, wake = 0;
              for (const q of stones){
                const dx = wx - fd.x[q], dy = wy - fd.y[q], rr = fd.r[q], dd = Math.sqrt(dx * dx + dy * dy) - rr;
                if (dd < best){ best = dd; bq = q; }
                if (fd.land[q]) continue;
                const along = dx * fd.fx[q] + dy * fd.fy[q], perp = Math.abs(dx * fd.fy[q] - dy * fd.fx[q]);
                if (along > 0 && along < rr * 3.5 && perp < rr * (0.95 - along / (rr * 5))) wake = Math.max(wake, 1 - along / (rr * 3.5));
              }
              if (best < 0){
                const dx = wx - fd.x[bq], dy = wy - fd.y[bq], rr = fd.r[bq], lit = -(dx + dy) / (rr * 1.4);
                if (fd.land[bq]){
                  // A flat slab set in the bank: pale, weathered stone, a dark edge, lichen.
                  const tone = 0.5 + lit * 0.35 + (n - 0.5) * 0.35 + dith * 0.12;
                  col = best > -0.9 ? P.char1 : n > 0.82 ? P.grass1 : tone > 0.72 ? P.dust5 : tone > 0.48 ? P.dust4 : tone > 0.25 ? P.plate0 : P.dust3;
                } else {
                  const tone = 0.5 + lit * 0.45 + (n - 0.5) * 0.3 + dith * 0.12;
                  if (best > -Math.min(1.2, rr * 0.3)) col = P.steel1;             // its dark wet edge
                  else if (lit > 0.1 && n > 0.8) col = P.leaf1;                    // moss on top
                  else col = tone > 0.78 ? P.plate1 : tone > 0.52 ? P.plate0 : tone > 0.3 ? P.steel2 : P.steel1;
                }
              } else if (w >= 0.5 && !fd.land[bq] && best < Math.min(1.8, fd.r[bq] * 0.3 + 0.6)){
                const up = (wx - fd.x[bq]) * fd.fx[bq] + (wy - fd.y[bq]) * fd.fy[bq] < 0;
                col = up && dith < 0.7 ? P.white : P.water3;                      // a thin foam ring, brightest upstream
              } else if (w >= 0.5 && wake > 0 && dith < wake * 0.5) col = wake > 0.7 && n > 0.6 ? P.white : P.water3;
              else if (w < 0.5 && fd.land[bq] && best < 1.2 && dith < 0.5) col = P.dust1;   // worn earth round a slab
            }
            if (col >= 0){ /* stone or foam */ }
            else if (face && ramp){
              // Where a slope or carved steps cross the rim: a grassy ramp, darker toward its foot,
              // or steps cut into the rock, in the same band a rock face would take.
              const f = ft / Fc;
              if (ramp === 2) col = (Math.floor(ft / (7 * res)) & 1) ? (f > 0.5 ? P.dust1 : P.dust2) : (ft % (7 * res) < res ? P.dust4 : P.dust3);
              else if (f < 0.06 && dith < 0.5) col = P.grass3;                          // the lit brow
              else { col = P.char0; alpha = (18 + f * 55 + dith * 12) | 0; }            // the grass darkening down the ramp
            }
            else if (face){
              const f = ft / Fc;
              if (w >= 0.5){
                // Falling water: streaks down the face, foam at the foot.
                col = f > 0.84 ? (n + dith * 0.4 > 0.7 ? P.white : P.water3) : nx7 > 0.95 ? P.white : nx7 > 0.72 ? P.water3 : nx7 > 0.45 ? P.water2 : P.water1;
              } else {
                // Natural rock: fractured slabs of different tones, each catching the light on
                // its top edge, dark cracks between them, water stains running down, moss on the
                // upper ledges, grass hanging over the lip, and a dark foot.
                const ri = aym * NS + axm, edge = ROCK_EDGE[ri], shade = ROCK_SHADE[ri], crackOn = NOISE[((ay >> 2) & (NS - 1)) * NS + ((ax >> 2) + 17 & (NS - 1))];
                if (ft < overhang) col = n + dith * 0.4 > 0.7 ? P.grass1 : P.grass0;
                else if (f < 0.04) col = P.dust4;
                else if (f > 0.9) col = dith < 0.6 ? P.char1 : P.dust0;
                else if (edge === 2 && crackOn > 0.32) col = f > 0.5 || n > 0.7 ? P.char1 : P.dust0;
                else if (f > 0.8) col = dith < 0.4 ? P.dust0 : P.dust1;
                else if (edge === 1 && crackOn > 0.32) col = f < 0.5 ? P.dust5 : P.dust4;
                else if (f < 0.36 && shade > 0.55 && n > 0.62) col = n > 0.7 ? P.leaf1 : P.grass1;
                else {
                  let tone = shade + (n - 0.5) * 0.5 + dith * 0.2 - f * 0.55 - (stain > 0.78 && f > 0.25 ? 0.35 : 0);
                  col = tone > 0.72 ? P.dust4 : tone > 0.42 ? P.dust3 : tone > 0.12 ? P.dust2 : P.dust1;
                }
              }
            } else if (w >= 0.5){
              // Shallows along the edge, open water, and dark where the channel runs deep.
              const q = rowJ[r], dd = wet ? colD[q] + (colD[q + 1] - colD[q]) * rowF[r] : Di;
              const depth = Math.min(1, (w - 0.5) * 1.6) * 0.55 + dd * 0.45 + (n - 0.5) * 0.12;
              if (bog){
                // Bog: dark, still, peaty water with duckweed and lily pads.
                const lily = NOISE[((ay >> 1) & (NS - 1)) * NS + (((ax >> 1) + 40) & (NS - 1))];
                col = lily > 0.8 ? (lily > 0.86 ? P.leaf2 : P.leaf1) : depth < 0.1 ? (dith < 0.5 ? P.grass0 : P.leaf1) : n + dith * 0.3 > 0.75 ? P.leaf1 : n > 0.35 ? P.leaf0 : P.water0;
              }
              else if (depth < 0.08) col = n + dith * 0.5 > 0.62 ? P.water3 : P.water2;
              else {
                const band = depth < 0.3 ? 0 : depth < 0.66 ? 1 : 2, frac = depth < 0.3 ? depth / 0.3 : depth < 0.66 ? (depth - 0.3) / 0.36 : 0;
                col = RAMP[Math.min(2, band + (band < 2 && frac > 0.7 && dith < (frac - 0.7) / 0.3 ? 1 : 0))];
                // Ripples: short lit dashes across the water.
                if (band < 2 && ((ay + (ax >> 3)) & 7) === 0 && NOISE[((ay * 3) & (NS - 1)) * NS + ((ax + 91) & (NS - 1))] > 0.8) col = band ? P.water2 : P.water3;
              }
            } else if (wet && w > 0.4){
              col = w > 0.465 ? (dith < 0.7 ? P.dust0 : P.dust1) : dith < 0.55 ? P.dust1 : -1;   // wet mud bank
            } else if (wet && w > 0.33 && dith < 0.35){
              col = P.grass0;   // damp grass
            }
            if (col < 0 && trail && !face){
              // Trails: packed dirt along the contour, with pebbles and a darker worn line down
              // the middle, fraying into grass at the edges. Barren ground is the same bare
              // earth, cracked and without the worn line; sodden fen ground is darker grass
              // with water standing in the hollows.
              const q = rowJ[r], a0 = colP[q], pv = a0 + (colP[q + 1] - a0) * rowF[r] + (NOISE[((ay + 77) & (NS - 1)) * NS + ((ax + 13) & (NS - 1))] - 0.5) * 0.28;
              const pk = L.PK[i], sv = colS[q] + (colS[q + 1] - colS[q]) * rowF[r] + (NOISE[((ay + 21) & (NS - 1)) * NS + ((ax + 70) & (NS - 1))] - 0.5) * 0.3;
              if (sv > 0.4 && pv < 0.5){
                if (sv >= 0.5){
                  const pool = NOISE[(((ay >> 1) + 60) & (NS - 1)) * NS + (((ax >> 1) + 20) & (NS - 1))];
                  if (pool > 0.78) col = pool > 0.83 ? P.water1 : P.leaf0;
                  else { col = P.leaf0; alpha = 70 + ((dith * 40) | 0); }
                } else if (dith < (sv - 0.4) * 6){ col = P.leaf0; alpha = 60; }
              } else if (pv >= 0.5){
                const pb = NOISE[((ay * 5) & (NS - 1)) * NS + ((ax * 5 + 3) & (NS - 1))];
                if (pb > 0.86) col = P.dust4;                                 // pebble
                else if (pb > 0.83) col = P.char1;                            // its shadow
                else if (pk === 1 && NOISE[((ay * 2 + 9) & (NS - 1)) * NS + ((ax * 2) & (NS - 1))] > 0.84) col = P.dust0;   // cracks in the dry earth
                else if (!pk && pv > 0.78 && n + dith * 0.3 < 0.45) col = P.dust1;   // the worn middle
                else col = n + dith * 0.35 > 0.72 ? P.dust3 : n > 0.3 ? P.dust2 : P.dust1;
              } else if (pv > 0.4){
                const k2 = (pv - 0.4) / 0.1;
                if (dith < k2 * 0.8) col = n > 0.55 ? P.dust2 : P.dust1;     // bare patches in the grass
                else if (dith > 0.9 && n > 0.6) col = P.grass3;              // tufts at the edge
              }
            }
            if (col < 0 && cliffs){
              // The face's shadow on the ground at its foot.
              if (rimL > lp && ft >= Fc && ft < Fc + fx7 && dith < 0.75 - (ft - Fc) / fx7 * 0.6){
                // Scree fallen from the face lies in its shadow.
                const sc = NOISE[((ay * 3 + 5) & (NS - 1)) * NS + ((ax * 3) & (NS - 1))];
                if (sc > 0.8 && ft < Fc + fx7 * 0.7){ col = sc > 0.86 ? P.dust4 : P.dust2; }
                else { col = P.char0; alpha = 110; }
              }
              else {
                // Where no rock face shows: a lit lip on the high side of a rim, a shadow line below it.
                const lx1 = Lbuf[cb - nRows + r], rx1 = Lbuf[cb + nRows + r];
                if (lp > lx1 || lp > rx1 || (above > -128 && lp > above)) col = P.dust4;
                else if (lp < lx1 || lp < rx1 || (lp < above && !face)){ col = P.char0; alpha = 170; }
              }
            }
            const o = (cy - by) * BW + cx - bx;
            if (col >= 0) d32[o] = alpha === 255 ? PX[col] : (PX[col] & 0x00ffffff) | (alpha << 24) >>> 0;
            else {
              // Plain ground: its level's tint (per pixel, so it changes at the rim).
              const tint = cliffs ? (TINT[lp] || 0) : tintBase;
              if (tint > 0) d32[o] = (((tint * 255) | 0) << 24 | 0xf0ffff) >>> 0;
              else if (tint < 0) d32[o] = (((-tint * 255) | 0) << 24) >>> 0;
            }
          }
          if (carry){ const k0 = cx - px0; carry.rimY[k0] = rimY; carry.rimL[k0] = rimL; }
        }
        if (carry) carry.ok = !!cliffs;
      };
      const tw0 = Math.round(t * res) + 1, carry = { ok: false, rimY: new Float64Array(tw0), rimL: new Int16Array(tw0) };
      for (let lx = 0; lx < ct; lx++){ carry.ok = false; for (let ly = 0; ly < ct; ly++){
        const gx = x0 + lx, gy = y0 + ly;
        if (gx >= cols || gy >= rows){ carry.ok = false; continue; }
        const i = gy * cols + gx, near = L.near[i];
        if (!near){ carry.ok = false; continue; }
        const px0 = Math.round(lx * t * res), px1 = Math.round((lx + 1) * t * res), py0 = Math.round(ly * t * res), py1 = Math.round((ly + 1) * t * res);
        if (!any){ any = true; bx0 = px0; by0 = py0; bx1 = px1; by1 = py1; }
        else { bx0 = Math.min(bx0, px0); by0 = Math.min(by0, py0); bx1 = Math.max(bx1, px1); by1 = Math.max(by1, py1); }
        // Open water, away from shores and cliffs, is the same every four tiles (the noise repeats):
        // shaded once per position and depth, then copied.
        if (near === 1 && openWater(L, grd, gx, gy)){ openTiles.push([gx, gy, px0, py0, px1 - px0, py1 - py0]); carry.ok = false; continue; }
        shadeTile(gx, gy, i, near, px0, px1, py0, py1, d, W, 0, 0, carry);
      } }
      if (!any) return;
      // Open water from the cache (shaded the first time each position and depth is seen).
      for (const [gx, gy, px0, py0, tw, th] of openTiles){
        const i = gy * cols + gx, key = res + '|' + L.D[i] + '|' + L.B[i] + '|' + (gx & 3) + '|' + (gy & 3) + '|' + tw + 'x' + th;
        let cv = openCache.get(key);
        if (!cv){
          const img = new ImageData(tw, th);
          shadeTile(gx, gy, i, 1, px0, px0 + tw, py0, py0 + th, img.data, tw, px0, py0);
          cv = document.createElement('canvas'); cv.width = tw; cv.height = th; cv.getContext('2d').putImageData(img, 0, 0);
          openCache.set(key, cv);
        }
        open.push(cv, px0, py0);
      }
      s.used = [bx0, by0, bx1, by1];
      s.g.clearRect(bx0, by0, bx1 - bx0, by1 - by0);
      s.g.putImageData(s.img, 0, 0, bx0, by0, bx1 - bx0, by1 - by0);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(s.cv, bx0, by0, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0);
      for (let q = 0; q < open.length; q += 3) ctx.drawImage(open[q], open[q + 1], open[q + 2]);
      ctx.imageSmoothingEnabled = smooth; ctx.restore();
      // Cave mouths open in their faces.
      for (let ly = 0; ly < ct; ly++) for (let lx = 0; lx < ct; lx++){
        const gx = x0 + lx, gy = y0 + ly;
        if (gx < cols && gy < rows && grd.tiles[gy * cols + gx] === k.CAVE){
          const cx = lx * t + t / 2, cy = ly * t + t * 0.62;
          ctx.fillStyle = C.char0; ctx.beginPath(); ctx.ellipse(cx, cy, t * 0.26, t * 0.24, 0, Math.PI, 0); ctx.lineTo(cx + t * 0.26, cy + t * 0.3); ctx.lineTo(cx - t * 0.26, cy + t * 0.3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#12100e'; ctx.beginPath(); ctx.ellipse(cx, cy + t * 0.06, t * 0.17, t * 0.16, 0, Math.PI, 0); ctx.lineTo(cx + t * 0.17, cy + t * 0.3); ctx.lineTo(cx - t * 0.17, cy + t * 0.3); ctx.closePath(); ctx.fill();
        }
      }
    },

    // Waterfalls and glints on open water in the visible rectangle `v`, at game time `ts`.
    drawLive(g, grd, v, ts, z){
      if (!this.on(grd) || z < 0.45) return;
      const L = fields(grd), t = T(), cols = grd.cols, k = ids(), dir = grd.art.dir, tiles = grd.tiles;
      const x0 = Math.max(0, Math.floor(v.x0 / t) - 1), x1 = Math.min(cols - 1, Math.ceil(v.x1 / t) + 1);
      const y0 = Math.max(0, Math.floor(v.y0 / t) - 1), y1 = Math.min(grd.rows - 1, Math.ceil(v.y1 / t) + 1);
      const h = G.hashRandom3, fd = grd.art.fords;
      // Stepping stones: ripples spreading downstream in chevrons, spray where the water hits
      // them and a little mist.
      if (fd) for (let q = 0; q < fd.count; q++){
        if (fd.land[q] || fd.r[q] < 4) continue;   // ripples and spray round the bigger stones only
        const x = fd.x[q], y = fd.y[q], rr = fd.r[q], fx = fd.fx[q], fy = fd.fy[q];
        if (x < v.x0 - 60 || x > v.x1 + 60 || y < v.y0 - 60 || y > v.y1 + 60) continue;
        if (tiles[fd.crossings[fd.c[q]].mid] !== k.STONES) continue;
        if (waterAt(grd, L, x, y) < 0.5) continue;
        g.strokeStyle = C.water3; g.lineWidth = 1;
        for (let s = 0; s < 2; s++){
          const f = (ts * 0.8 + s / 2 + h(q, s, 31)) % 1, along = rr + f * rr * 3, half = rr * 0.7 + f * 4, back = 2 + f * 2;
          const cx = x + fx * along, cy = y + fy * along;
          g.globalAlpha = 0.6 * (1 - f);
          g.beginPath();
          g.moveTo(cx + fy * half - fx * back, cy - fx * half - fy * back); g.lineTo(cx, cy); g.lineTo(cx - fy * half - fx * back, cy + fx * half - fy * back);
          g.stroke();
        }
        g.globalAlpha = 1;
        if (q % 2 === 0) spray(g, x - fx * rr, y - fy * rr, ts, q * 7 + 3, 2, rr, 6);
        if (q % 5 === 0) mist(g, x, y, ts, q * 7 + 5, 1, rr * 2, 12, 4);
      }
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++){
        const i = gy * cols + gx, tl = tiles[i];
        if (tl === k.FALLS){
          const d = dir[i], px = gx * t, py = gy * t;
          if (d === 1){
            // Falling south, toward the viewer: bright streaks sliding down the face, only
            // where the face is (found by walking down each streak's column to the rim).
            for (let s = 0; s < 12; s++){
              const sx = px + (s + 0.5) * t / 12 + (h(gx, gy, s) - 0.5) * 3;
              let rim = null;
              for (let yy = py - t; yy < py + t; yy += 2){ if (levelAt(grd, L, sx, yy + 2) < levelAt(grd, L, sx, yy)){ rim = yy + 2; break; } }
              if (rim === null || waterAt(grd, L, sx, rim + 4) < 0.5) continue;
              for (const o of [0, 0.5]){
                const f = ((ts * (1.4 + h(gx, s, 3) * 0.6) + h(gx, gy, s + 20) + o) % 1), y = rim + f * f * FACE;
                g.globalAlpha = 0.85 * (1 - f * 0.5); g.fillStyle = f > 0.7 ? C.white : C.water3;
                g.fillRect(Math.round(sx), Math.round(y), 1.5, 3 + f * 6);
              }
              // Foam boiling at the foot, spray thrown up and mist rolling off it.
              const foam = rim + FACE + Math.sin(ts * 6 + s) * 2;
              g.globalAlpha = 0.55 + 0.35 * Math.sin(ts * 5 + s * 1.7); g.fillStyle = C.white;
              g.fillRect(Math.round(sx - 2), Math.round(foam - 2), 4, 3);
              g.globalAlpha = 1;
              if (s % 3 === 0) spray(g, sx, rim + FACE, ts, i * 16 + s, 5, 10, 14);
              if (s % 4 === 1) mist(g, sx, rim + FACE + 4, ts, i * 16 + s, 3, 16, 30, 5);
            }
            g.globalAlpha = 1;
          } else if (d === 2 || d === 3){
            // Spilling sideways: streaks sliding along the flow.
            const sgn = d === 3 ? 1 : -1;
            for (let s = 0; s < 10; s++){
              const sy = py + (s + 0.5) * t / 10, f = (ts * 1.3 + h(gx, gy, s)) % 1, x = px + (sgn > 0 ? f : 1 - f) * t;
              if (waterAt(grd, L, x, sy) < 0.5) continue;
              g.globalAlpha = 0.7; g.fillStyle = f > 0.6 ? C.white : C.water3; g.fillRect(Math.round(x), Math.round(sy), 5, 1.5);
            }
            g.globalAlpha = 1;
            const ex = sgn > 0 ? px + t : px;   // the foot, downstream
            spray(g, ex, py + t / 2, ts, i, 6, t * 0.8, 10);
            mist(g, ex, py + t / 2, ts, i, 3, t * 0.7, 24, 5);
          } else if (d === 4){
            // Falling away north: only the foot shows, in spray and mist.
            spray(g, px + t / 2, py, ts, i, 6, t * 0.8, 10);
            mist(g, px + t / 2, py, ts, i, 3, t * 0.7, 24, 5);
          }
        } else if (tl === k.VENT){
          // Steam rising from a vent, now and then in a stronger burst.
          const burst = ((ts * 0.15 + h(gx, gy, 51)) % 1) < 0.18 ? 2 : 1;
          mist(g, gx * t + t / 2, gy * t + t / 2, ts, i, 4 * burst, 10, 40 * burst, 5);
        } else if ((tl === k.WATER || tl === k.DEEP) && dir[i] === 5){
          // The plunge pool: rings of foam spreading and fading.
          for (let s = 0; s < 3; s++){
            const f = (ts * 0.8 + s / 3 + h(gx, gy, 9)) % 1;
            g.globalAlpha = 0.5 * (1 - f); g.strokeStyle = C.water3; g.lineWidth = 1.5;
            g.beginPath(); g.ellipse(gx * t + t / 2 + (h(gx, gy, s) - 0.5) * 16, gy * t + t * 0.4, 4 + f * 18, 2 + f * 8, 0, 0, Math.PI * 2); g.stroke();
          }
          g.globalAlpha = 1;
          mist(g, gx * t + t / 2, gy * t + t * 0.3, ts, i + 7, 2, t, 18, 6);   // a low haze over the pool
        } else if (z >= 0.7 && tl === k.WATER && L.near[i] === 1){
          // Sunlight glinting on open water.
          for (let s = 0; s < 2; s++){
            const ph = (ts * 0.35 + h(gx, gy, s + 40)) % 1;
            if (ph > 0.35) continue;
            const x = gx * t + h(gx, gy, s + 50) * t, y = gy * t + h(gx, gy, s + 60) * t;
            if (waterAt(grd, L, x, y) < 0.62) continue;
            g.globalAlpha = Math.sin(ph / 0.35 * Math.PI) * 0.8; g.fillStyle = C.white; g.fillRect(Math.round(x), Math.round(y), 2 + ph * 6, 1);
          }
          g.globalAlpha = 1;
        }
      }
    }
  };
  // Painted terrain changes the fields around it.
  G.Events.on('terrain:changed', r => {
    const grd = G.State.grid;
    if (!grd || !grd.art || !grd.art.land) return;
    if (!r) grd.art.land = null; else update(grd, r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  });
})();
