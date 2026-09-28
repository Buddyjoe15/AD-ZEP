/* Ground texture on Genesis maps (presentation only): a layer over the tile art that breaks up
   the ground by what grows there, blended smoothly between tiles:
   - meadow grass: broad patches lighter and yellower or darker and lusher, clover and short
     tufts, a few tiny white and yellow flowers;
   - forest undergrowth (forest floor, under trees and fallen trees): dark, mossy ground with
     fallen leaves, needles and twigs, and patches of moss;
   - brush (bushes, thickets, tall grass): darker, rougher grass with seed heads;
   - wildflower meadows: dense flecks of colour, each meadow its own mix;
   - bare trodden earth fraying round the edges of trails (the trail itself: G.Landscape).
   Drawn per chunk, one texel per two world px (the tile art's grain), the kinds of ground
   blending between tile centres. */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math;
  const HEX = {
    grass0: '#3f5a3a', grass1: '#4d6946', grass2: '#5d7a4f', grass3: '#739158', leaf0: '#1b3a21', leaf1: '#28502d', leaf2: '#3f6f3e',
    dust0: '#5e4f3d', dust1: '#6f5e48', dust2: '#7f6c53', dust3: '#8e7a5e', amber0: '#7a4f1c', amber1: '#c98a2e', amber2: '#f2c66a',
    rust1: '#7d4630', rust2: '#a8653f', gold0: '#9a7a3e', gold1: '#e1bd76', white: '#ffffff', red1: '#e85e55', cyan2: '#aef4ff', plate2: '#e3eae2', char0: '#231f1c'
  };
  const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const px32 = (h, a) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return LE ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0; };
  const C = {}; for (const [k, v] of Object.entries(HEX)) C[k] = a => px32(v, a | 0);
  // Fast noise: a tileable table of smooth value noise, sampled bilinearly at any scale, and an
  // integer hash per texel for the scattered flecks.
  const NS = 256, NT = (() => {
    const t = new Float32Array(NS * NS), h = (x, y, s) => G.hashRandom3(x, y, s);
    for (const [cell, amp] of [[32, 0.55], [16, 0.3], [8, 0.15]]){
      const m = NS / cell;
      for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++){
        const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        const c = (i, j) => h((x0 + i) % m, (y0 + j) % m, cell);
        t[y * NS + x] += amp * (c(0, 0) + (c(1, 0) - c(0, 0)) * u + (c(0, 1) - c(0, 0)) * v + (c(0, 0) - c(1, 0) - c(0, 1) + c(1, 1)) * u * v);
      }
    }
    return t;
  })();
  // Smooth noise at world px (x, y) with features about `cell` px across; `s` shifts it.
  const vn = (x, y, cell, s) => {
    const u = x / cell * 8 + s * 37.3, v = y / cell * 8 + s * 19.7, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
    const i0 = i & (NS - 1), i1 = (i + 1) & (NS - 1), j0 = (j & (NS - 1)) * NS, j1 = ((j + 1) & (NS - 1)) * NS;
    const a = NT[j0 + i0], b = NT[j0 + i1], c = NT[j1 + i0], d = NT[j1 + i1];
    return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
  };
  const hx = (x, y, s) => {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const FLOWER = ['white', 'amber2', 'red1', 'cyan2', 'gold1', 'plate2'];

  let K = null, KIND = null;
  // Per terrain id: 0 plain grass, 1 forest floor, 2 brush, 3 wildflowers, 4 trail, 5 nothing (water, rock, buildings…).
  function kinds(){
    if (KIND) return KIND;
    const id = k => G.Defs.terrain.get(k).id;
    KIND = new Uint8Array(256).fill(5);
    for (const k of ['grass', 'clearing', 'mushrooms', 'burrow', 'rubble', 'slope', 'swamp']) KIND[id(k)] = 0;
    for (const k of ['forest', 'tree', 'fallen_tree', 'stump', 'log_pile', 'sawhorse']) KIND[id(k)] = 1;
    for (const k of ['bush', 'thicket', 'tall_grass', 'reeds', 'alien_flora']) KIND[id(k)] = 2;
    KIND[id('wildflowers')] = 3;
    for (const k of ['path', 'steps', 'barren']) KIND[id(k)] = 4;
    return KIND;
  }

  const scratch = new Map();
  function image(n){
    let s = scratch.get(n);
    if (!s){ const cv = document.createElement('canvas'); cv.width = cv.height = n; s = { cv, g: cv.getContext('2d'), img: new ImageData(n, n) }; scratch.set(n, s); }
    return s;
  }

  // Colours by name at every alpha, looked up per texel.
  const LUT = {};
  for (const k of Object.keys(HEX)){ const t = new Uint32Array(256); for (let a = 0; a < 256; a++) t[a] = C[k](a); LUT[k] = t; }
  const mk = (k, a) => LUT[k][a < 0 ? 0 : a > 255 ? 255 : a | 0];
  const FL = FLOWER.map(k => LUT[k][235]);

  G.Ground = {
    // Textures the chunk of ct × ct tiles at tile (x0, y0), drawn into ctx in chunk space. One
    // texel covers two world px (four when the chunk is painted smaller).
    paintChunk(ctx, grd, x0, y0, ct, r0 = 0, r1 = ct){
      const T = G.CONFIG.TILE, cols = grd.cols, rows = grd.rows, tiles = grd.tiles, KD = kinds();
      const sc = Math.abs(ctx.getTransform().a), tex = sc >= 2 ? 1 : sc >= 0.75 ? 2 : 4, per = T / tex, N = ct * per;
      const s = image(N), d = new Uint32Array(s.img.data.buffer);
      d.fill(0, r0 * per * N, r1 * per * N);
      const kindAt = (gx, gy) => KD[tiles[Math.min(rows - 1, Math.max(0, gy)) * cols + Math.min(cols - 1, Math.max(0, gx))]];
      const w = new Float32Array(6);
      for (let ly = r0; ly < r1; ly++) for (let lx = 0; lx < ct; lx++){
        const gx = x0 + lx, gy = y0 + ly, k0 = kindAt(gx, gy);
        let uniform = true;
        for (let dy = -1; dy <= 1 && uniform; dy++) for (let dx = -1; dx <= 1; dx++) if (kindAt(gx + dx, gy + dy) !== k0){ uniform = false; break; }
        if (uniform && k0 === 5) continue;
        const X0 = gx * per, Y0 = gy * per;
        for (let ty = 0; ty < per; ty++) for (let tx = 0; tx < per; tx++){
          const wx = gx * T + (tx + 0.5) * tex, wy = gy * T + (ty + 0.5) * tex;
          let k = k0;
          if (!uniform){
            // Blend the kinds of the four nearest tile centres; the edge wobbles with noise.
            const u = wx / T - 0.5, v = wy / T - 0.5, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
            w.fill(0);
            w[kindAt(i, j)] += (1 - fx) * (1 - fy); w[kindAt(i + 1, j)] += fx * (1 - fy); w[kindAt(i, j + 1)] += (1 - fx) * fy; w[kindAt(i + 1, j + 1)] += fx * fy;
            const jit = (vn(wx, wy, 22, 80) - 0.5) * 0.9 + (vn(wx, wy, 6, 81) - 0.5) * 0.35;
            let best = -9;
            for (let q = 0; q < 6; q++){ if (!w[q]) continue; const s2 = w[q] + (q === k0 ? 0 : jit); if (s2 > best){ best = s2; k = q; } }
            // Thin at its edge: brush, flowers and undergrowth fray out into the grass round them.
            if (k !== 0 && k !== 5 && w[0] > 0 && w[k] < 0.8 && hx(X0 + tx, Y0 + ty, 91) > w[k] / 0.8) k = 0;
          }
          if (k === 5) continue;
          const X = Math.floor(wx / tex), Y = Math.floor(wy / tex), r1 = hx(X, Y, 71), n = vn(wx, wy, 13, 73);
          let c = 0;
          if (k === 0){
            // Meadow grass: broad lighter and darker patches, clover, tufts, tiny flowers.
            const m = vn(wx, wy, 110, 75);
            if (r1 > 0.994 && vn(wx, wy, 70, 74) > 0.62) c = hx(X, Y, 77) < 0.5 ? LUT.white[220] : LUT.amber2[220];   // tiny flowers, here and there
            else if (n > 0.66 && r1 > 0.82) c = LUT.grass3[150];                              // clover
            else if (r1 < 0.025) c = LUT.leaf1[120];                                            // tuft shadow
            else if (m > 0.58) c = mk('grass3', (m - 0.58) * 300);
            else if (m < 0.42) c = mk('leaf1', (0.42 - m) * 300);
          } else if (k === 1){
            // Forest undergrowth: dark mossy ground, fallen leaves and needles, moss patches.
            const moss = vn(wx, wy, 30, 78);
            const litter = vn(wx, wy, 40, 82);   // fallen leaves drift into patches
            if (r1 > 0.985 - litter * 0.06) c = (r1 > 0.995 ? LUT.amber1 : r1 > 0.985 ? LUT.rust1 : r1 > 0.97 ? LUT.gold0 : LUT.dust2)[litter > 0.5 ? 200 : 140];
            else if (r1 < 0.04) c = LUT.dust1[160];                                             // needles and twigs
            else if (moss > 0.62) c = mk('leaf2', (moss - 0.62) * 400);
            else c = mk('leaf0', 60 + n * 60);
          } else if (k === 2){
            // Brush: rough, darker grass with seed heads.
            if (r1 > 0.965) c = (r1 > 0.99 ? LUT.gold1 : LUT.grass3)[200];
            else if (r1 < 0.1) c = LUT.leaf0[130];
            else c = mk('leaf1', 40 + n * 60);
          } else if (k === 3){
            // Wildflowers: dense flecks, each meadow its own mix of two colours.
            const mix = Math.floor(vn(wx, wy, 260, 79) * 6) % 6;
            if (r1 > 0.9) c = FL[r1 > 0.95 ? mix : (mix + 2) % 6];
            else if (r1 > 0.86) c = LUT.grass3[180];
            else if (n > 0.6) c = mk('grass3', (n - 0.6) * 250);
          } else {
            // Round a trail: grass worn thin, bare earth showing through.
            if (n > 0.55 && r1 > 0.4) c = LUT.dust2[90];
            else if (r1 > 0.9) c = LUT.dust1[150];
          }
          if (c) d[(ly * per + ty) * N + lx * per + tx] = c;
        }
      }
      s.g.putImageData(s.img, 0, 0, 0, r0 * per, N, (r1 - r0) * per);
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(s.cv, 0, r0 * per, N, (r1 - r0) * per, 0, r0 * T, ct * T, (r1 - r0) * T);
      ctx.imageSmoothingEnabled = smooth;
    }
  };
})();
