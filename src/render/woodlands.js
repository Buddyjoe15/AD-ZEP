/* Woodlands terrain art: the new terrain types (ids 12 and up, wherever they are painted)
   and, on a Woodlands map, every tile plus height shading, cliff faces and ground detail
   from grid.art. Drawn as vectors into the terrain chunk canvases (see terrain.js). */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math, TAU = Math.PI * 2;
  const KEYS = {
    GRASS: 'grass', THICK: 'tall_grass', FLOWERS: 'wildflowers', SHRUB: 'bush', THICKET: 'thicket', TREE: 'tree',
    STUMP: 'stump', LOG: 'fallen_tree', MUSHROOM: 'mushrooms', ALIEN: 'alien_flora', BARREN: 'barren', REEDS: 'reeds',
    WATER: 'water', DEEP: 'deep_water', FALLS: 'waterfall', SWAMP: 'swamp', BOG: 'bog', BRIDGE: 'bridge',
    CLIFF: 'cliff', SLOPE: 'slope', STAIRS: 'steps', CAVE: 'cave', ROCKS: 'rock', MOSSROCK: 'mossy_rock',
    CRYSTAL: 'crystal', ORE: 'outcrop', VENT: 'steam_vent', MOUND: 'termite_mound', BURROW: 'burrow', PATH: 'path',
    WALL: 'wall', FLOOR: 'floor', DOOR: 'door', RUBBLE: 'rubble', LOGS: 'log_pile', SAWHORSE: 'sawhorse',
    PAD: 'clearing', LOGWALL: 'log_wall'
  };
  const K = {}, RGB = [];
  for (const [k, key] of Object.entries(KEYS)) K[k] = G.Defs.terrain.get(key).id;
  for (const d of G.Defs.terrain.all()) RGB[d.id] = d.minimap;
  const D = {};
  (G.WOODLANDS_DETAIL || []).forEach((key, i) => { D[key] = i + 1; });

  const hash = G.hashRandom3;
  function vnoise(x, y, s){
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct){ let sum = 0, amp = 1, norm = 0, f = 1; for (let i = 0; i < oct; i++){ sum += vnoise(x * f, y * f, s + i * 101) * amp; norm += amp; amp *= .5; f *= 2; } return sum / norm; }
  const rgb = (c, k = 0) => `rgb(${Math.max(0, Math.min(255, c[0] + k)) | 0},${Math.max(0, Math.min(255, c[1] + k)) | 0},${Math.max(0, Math.min(255, c[2] + k)) | 0})`;

  // The grid being painted, set by each paint call; `pix` is the pixel-art set when on.
  let grid = null, art = null, seed = 0, pix = null;
  const tileAt = (x, y) => grid.inBounds(x, y) ? grid.tiles[y * grid.cols + x] : 255;
  const lvlAt = (x, y) => art && grid.inBounds(x, y) ? art.level[y * grid.cols + x] : -1;
  const dirAt = i => art ? art.dir[i] : 0;
  // Which sides of a cliff tile drop to lower ground: 1 north, 2 east, 4 south, 8 west;
  // 16/32/64/128 for a corner (NE, SE, SW, NW) when no side drops. Without heights (a cliff
  // painted on another map) it shows a south face.
  function maskAt(i){
    if (!art) return 4;
    const cols = grid.cols, x = i % cols, y = (i / cols) | 0, l = art.level[i];
    let m = 0;
    const chk = (dx, dy, bit) => { const nl = lvlAt(x + dx, y + dy); if (nl >= 0 && nl < l) m |= bit; };
    chk(0, -1, 1); chk(1, 0, 2); chk(0, 1, 4); chk(-1, 0, 8);
    if (!m){ chk(1, -1, 16); chk(1, 1, 32); chk(-1, 1, 64); chk(-1, -1, 128); }
    return m || 4;
  }

  const FOREST_FLOOR = [40, 70, 42];
  const FLOWER_COLS = [[238,226,120],[236,238,240],[214,118,178],[140,160,238],[240,158,80]];
  function groundFor(t){
    if (t === K.TREE || t === K.LOG || t === K.THICKET || t === K.MUSHROOM) return FOREST_FLOOR;
    if (t === K.SHRUB || t === K.STUMP || t === K.LOGS || t === K.BURROW || t === K.MOUND || t === K.FLOWERS) return RGB[K.GRASS];
    if (t === K.ROCKS || t === K.MOSSROCK || t === K.CRYSTAL) return [86,98,68];
    if (t === K.ORE || t === K.VENT) return RGB[K.BARREN];
    if (t === K.ALIEN) return [58,46,78];
    if (t === K.REEDS) return [86,100,62];
    return RGB[t];
  }
  function boulder(ctx, cx, cy, r, col, moss){
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(cx + r * .3, cy + r * .45, r, r * .7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(col); ctx.beginPath(); ctx.ellipse(cx, cy, r, r * .82, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(col, 26); ctx.beginPath(); ctx.ellipse(cx - r * .3, cy - r * .3, r * .45, r * .32, -.4, 0, TAU); ctx.fill();
    if (moss){ ctx.fillStyle = '#5f8c4a'; ctx.beginPath(); ctx.ellipse(cx - r * .1, cy - r * .45, r * .75, r * .38, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#7aa85c'; ctx.beginPath(); ctx.ellipse(cx - r * .3, cy - r * .55, r * .3, r * .16, 0, 0, TAU); ctx.fill(); }
  }
  function cliffTile(ctx, i, px, py, S, h, cave){
    const m = maskAt(i), rock = [100, 90, 76], lip = RGB[K.GRASS];
    if ((m & 4) || cave){
      ctx.fillStyle = rgb(lip, 6); ctx.fillRect(px, py, S + .5, S * .24);
      ctx.fillStyle = rgb(rock, Math.round((h[0] - .5) * 10)); ctx.fillRect(px, py + S * .22, S + .5, S * .78 + .5);
      ctx.fillStyle = rgb(rock, 24); ctx.fillRect(px, py + S * .22, S + .5, Math.max(1, S * .06));
      ctx.fillStyle = rgb(rock, -16); ctx.fillRect(px, py + S * .5, S + .5, Math.max(1, S * .05)); ctx.fillRect(px, py + S * .72, S + .5, Math.max(1, S * .05));
      ctx.strokeStyle = rgb(rock, -30); ctx.lineWidth = Math.max(1, S * .05);
      ctx.beginPath(); ctx.moveTo(px + S * h[1], py + S * .3); ctx.lineTo(px + S * (h[1] * .7 + .1), py + S * .7); ctx.moveTo(px + S * h[2], py + S * .55); ctx.lineTo(px + S * h[2], py + S * .95); ctx.stroke();
      ctx.fillStyle = rgb(rock, -38); ctx.fillRect(px, py + S * .9, S + .5, S * .1 + .5);
      if (cave){
        ctx.fillStyle = '#15120f'; ctx.beginPath(); ctx.moveTo(px + S * .2, py + S); ctx.lineTo(px + S * .2, py + S * .62); ctx.quadraticCurveTo(px + S * .5, py + S * .24, px + S * .8, py + S * .62); ctx.lineTo(px + S * .8, py + S); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgb(rock, -44); ctx.lineWidth = Math.max(1, S * .06); ctx.stroke();
      }
      return;
    }
    ctx.fillStyle = rgb(lip, Math.round((h[0] - .5) * 8)); ctx.fillRect(px, py, S + .5, S + .5);
    const w = S * .3;
    ctx.fillStyle = rgb(rock, -8);
    if (m & 1) ctx.fillRect(px, py, S + .5, w * .7);
    if (m & 2) ctx.fillRect(px + S - w, py, w + .5, S + .5);
    if (m & 8) ctx.fillRect(px, py, w, S + .5);
    ctx.fillStyle = rgb(rock, 22);
    if (m & 2) ctx.fillRect(px + S - w, py, Math.max(1, S * .05), S + .5);
    if (m & 8) ctx.fillRect(px + w - Math.max(1, S * .05), py, Math.max(1, S * .05), S + .5);
    if (m >= 16){
      ctx.fillStyle = rgb(rock, -8);
      const cx = (m & (16 | 32)) ? px + S : px, cy = (m & (32 | 64)) ? py + S : py;
      ctx.beginPath(); ctx.arc(cx, cy, S * .42, 0, TAU); ctx.fill();
    }
  }

  // ---- Pixel-art pilot ----
  const WET = new Set([K.WATER, K.DEEP, K.FALLS, K.BOG, K.BRIDGE]);
  const CLIFF_PIECE = { 1: 'N', 2: 'E', 8: 'W', 3: 'NE', 9: 'NW', 10: 'EW', 11: 'NEW', 16: 'cNE', 32: 'cSE', 64: 'cSW', 128: 'cNW' };
  const variant = (set, gx, gy, salt) => set.tiles[G.PixelArt.weighted(set.weights, gx, gy, salt)];
  // The pixel tile for terrain `t`, or null when the pilot has no art for it.
  function pixelTile(i, t, gx, gy){
    if (t === K.GRASS || t === K.TREE) return variant(pix.grass, gx, gy, 11);
    if (t === K.THICK) return variant(pix.tall_grass, gx, gy, 23);
    if (t === K.DEEP) return variant(pix.deep_water, gx, gy, 41);
    if (t === K.WATER){
      let m = 0;
      if (!WET.has(tileAt(gx, gy - 1)) && tileAt(gx, gy - 1) !== 255) m |= 1;
      if (!WET.has(tileAt(gx + 1, gy)) && tileAt(gx + 1, gy) !== 255) m |= 2;
      if (!WET.has(tileAt(gx, gy + 1)) && tileAt(gx, gy + 1) !== 255) m |= 4;
      if (!WET.has(tileAt(gx - 1, gy)) && tileAt(gx - 1, gy) !== 255) m |= 8;
      return m ? pix.shore.tiles[m] : variant(pix.water, gx, gy, 37);
    }
    if (t === K.CLIFF){
      const m = maskAt(i), P = pix.cliff.pieces;
      let key;
      if (m & 4) key = (m & 2) && (m & 8) ? 'SEW' : m & 2 ? 'SE' : m & 8 ? 'SW' : (hash(gx, gy, 53) < .5 ? 'S' : 'S2');
      else key = CLIFF_PIECE[m & 15] || CLIFF_PIECE[m & 16 || m & 32 || m & 64 || m & 128] || 'N';
      return pix.cliff.tiles[P.indexOf(key)];
    }
    return null;
  }
  function blit(ctx, str, px, py, S){
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(G.PixelArt.tileCanvas(str), px, py, S + .5, S + .5);
    ctx.imageSmoothingEnabled = smooth;
  }

  function drawTile(ctx, i, t, gx, gy, px, py, S){
    if (pix){ const str = pixelTile(i, t, gx, gy); if (str){ blit(ctx, str, px, py, S); return; } }
    const s = seed, h = [hash(gx, gy, s + 7), hash(gx, gy, s + 9), hash(gx, gy, s + 13)];
    const jit = Math.round((h[0] - .5) * 10), lw = Math.max(1, S * .08);
    if (t === K.CLIFF || t === K.CAVE){ cliffTile(ctx, i, px, py, S, h, t === K.CAVE); return; }
    const base = groundFor(t);
    ctx.fillStyle = rgb(base, jit); ctx.fillRect(px, py, S + .5, S + .5);
    switch (t){
      case K.GRASS:
        ctx.fillStyle = rgb(base, -14); ctx.fillRect(px + h[1] * S * .8, py + h[2] * S * .8, S * .14, S * .14);
        break;
      case K.PAD:
        ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; ctx.strokeRect(px + .5, py + .5, S - 1, S - 1);
        break;
      case K.THICK: case K.REEDS: {
        const reed = t === K.REEDS;
        ctx.strokeStyle = reed ? '#a6ad6a' : rgb([128,158,76], jit); ctx.lineWidth = Math.max(1, S * (reed ? .06 : .08));
        const n = reed ? 5 : 3;
        for (let k = 0; k < n; k++){
          const bx = px + S * (.14 + (.72 / (n - 1)) * k) + (hash(gx + k, gy, s) - .5) * S * .12, top = py + S * (reed ? .05 + hash(gx, gy + k, s) * .25 : .3);
          ctx.beginPath(); ctx.moveTo(bx, py + S * .95); ctx.lineTo(bx + S * .06, top); ctx.stroke();
          if (reed && k % 2 === 0){ ctx.fillStyle = '#5e3f26'; ctx.beginPath(); ctx.ellipse(bx + S * .06, top + S * .12, S * .05, S * .12, 0, 0, TAU); ctx.fill(); }
        }
        break;
      }
      case K.FLOWERS: {
        const col = FLOWER_COLS[Math.min(4, Math.floor(fbm(gx / 9, gy / 9, s + 301, 1) * 5))];
        for (let k = 0; k < 6; k++){
          const fx = px + S * (.12 + hash(gx, gy, k * 2 + 1) * .76), fy = py + S * (.12 + hash(gx, gy, k * 2 + 2) * .76);
          ctx.fillStyle = '#4f7a3e'; ctx.fillRect(fx - S * .02, fy, Math.max(1, S * .04), S * .12);
          ctx.fillStyle = rgb(col); ctx.beginPath(); ctx.arc(fx, fy, Math.max(1, S * .07), 0, TAU); ctx.fill();
        }
        break;
      }
      case K.SHRUB:
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(px + S * .56, py + S * .6, S * .36, 0, TAU); ctx.fill();
        ctx.fillStyle = rgb([50,88,48], jit); ctx.beginPath(); ctx.arc(px + S * (.45 + h[1] * .1), py + S * (.47 + h[2] * .1), S * .36, 0, TAU); ctx.fill();
        ctx.fillStyle = rgb([80,122,66], jit); ctx.beginPath(); ctx.arc(px + S * .38, py + S * .38, S * .14, 0, TAU); ctx.fill();
        break;
      case K.WATER: case K.DEEP:
        if (dirAt(i) === 5){
          ctx.fillStyle = 'rgba(235,248,250,.55)';
          for (let k = 0; k < 4; k++){ ctx.beginPath(); ctx.arc(px + S * hash(gx, gy, k + 40), py + S * hash(gx, gy, k + 50), S * (.12 + hash(gx, gy, k + 60) * .12), 0, TAU); ctx.fill(); }
        } else if (h[0] < .3){ ctx.strokeStyle = 'rgba(180,220,232,.28)'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(px + S * h[1] * .5, py + S * (.3 + h[2] * .4)); ctx.lineTo(px + S * (h[1] * .5 + .4), py + S * (.3 + h[2] * .4)); ctx.stroke(); }
        break;
      case K.BRIDGE: {
        const w = t2 => t2 === K.WATER || t2 === K.DEEP || t2 === K.BOG || t2 === K.FALLS;
        const spanEW = w(tileAt(gx, gy - 1)) || w(tileAt(gx, gy + 1));
        ctx.strokeStyle = rgb(RGB[t], -34); ctx.lineWidth = Math.max(1, S * .06);
        for (let k = 1; k < 4; k++){
          ctx.beginPath();
          if (spanEW){ ctx.moveTo(px + S * k / 4, py); ctx.lineTo(px + S * k / 4, py + S); } else { ctx.moveTo(px, py + S * k / 4); ctx.lineTo(px + S, py + S * k / 4); }
          ctx.stroke();
        }
        break;
      }
      case K.FALLS: {
        const d = dirAt(i);
        for (let k = 0; k < 4; k++){
          ctx.strokeStyle = k % 2 ? 'rgba(255,255,255,.9)' : 'rgba(120,180,200,.75)'; ctx.lineWidth = Math.max(1, S * .1);
          const o = S * (.12 + .25 * k) + (hash(gx, gy, k) - .5) * S * .1;
          ctx.beginPath();
          if (d === 2 || d === 3){ ctx.moveTo(px, py + o); ctx.lineTo(px + S, py + o); } else { ctx.moveTo(px + o, py); ctx.lineTo(px + o, py + S); }
          ctx.stroke();
        }
        break;
      }
      case K.SLOPE: case K.STAIRS: {
        const m = maskAt(i), ns = (m & 5) || !(m & 10), stairs = t === K.STAIRS, n = stairs ? 5 : 3, th = Math.max(1, S * (stairs ? .07 : .05)), hi = Math.max(1, S * .04);
        for (let k = 1; k < n; k++){
          const q = k / n;
          ctx.fillStyle = stairs ? rgb(RGB[t], -26) : 'rgba(0,0,0,.16)';
          if (ns) ctx.fillRect(px, py + S * q, S + .5, th); else ctx.fillRect(px + S * q, py, th, S + .5);
          if (stairs){ ctx.fillStyle = rgb(RGB[t], 20); if (ns) ctx.fillRect(px, py + S * q - hi, S + .5, hi); else ctx.fillRect(px + S * q - hi, py, hi, S + .5); }
        }
        break;
      }
      case K.PATH:
        ctx.fillStyle = rgb(RGB[t], 16);
        ctx.fillRect(px + h[1] * S * .8, py + h[2] * S * .8, S * .12, S * .1);
        ctx.fillRect(px + h[2] * S * .8, py + h[0] * S * .8, S * .1, S * .1);
        break;
      case K.SWAMP:
        if (h[0] < .55){ ctx.fillStyle = 'rgba(30,38,26,.55)'; ctx.beginPath(); ctx.ellipse(px + S * (.3 + h[1] * .4), py + S * (.3 + h[2] * .4), S * .22, S * .14, 0, 0, TAU); ctx.fill(); }
        break;
      case K.BOG:
        if (h[0] < .28){ const cx = px + S * (.3 + h[1] * .4), cy = py + S * (.3 + h[2] * .4); ctx.fillStyle = '#5d8a4a'; ctx.beginPath(); ctx.arc(cx, cy, S * .18, .5, 6.1); ctx.lineTo(cx, cy); ctx.fill(); }
        break;
      case K.LOGWALL:
        ctx.fillStyle = '#7c5632'; ctx.fillRect(px, py, S + .5, S + .5);
        for (let k = 0; k < 3; k++){ ctx.fillStyle = '#95693c'; ctx.fillRect(px, py + S * (k / 3 + .04), S + .5, S * .2); ctx.fillStyle = '#583b20'; ctx.fillRect(px, py + S * (k / 3 + .26), S + .5, Math.max(1, S * .05)); }
        break;
      case K.WALL:
        ctx.strokeStyle = rgb(RGB[t], -22); ctx.lineWidth = Math.max(1, S * .06);
        ctx.beginPath(); ctx.moveTo(px, py + S / 2); ctx.lineTo(px + S, py + S / 2);
        ctx.moveTo(px + S * .5, py); ctx.lineTo(px + S * .5, py + S / 2); ctx.moveTo(px + S * .2, py + S / 2); ctx.lineTo(px + S * .2, py + S); ctx.stroke();
        ctx.fillStyle = rgb(RGB[t], 14); ctx.fillRect(px, py, S + .5, Math.max(1, S * .1));
        break;
      case K.FLOOR:
        ctx.strokeStyle = rgb(RGB[t], -18); ctx.lineWidth = Math.max(1, S * .05);
        for (let k = 1; k < 4; k++){ ctx.beginPath(); ctx.moveTo(px, py + S * k / 4); ctx.lineTo(px + S, py + S * k / 4); ctx.stroke(); }
        break;
      case K.DOOR:
        ctx.fillStyle = rgb(RGB[t], -40); ctx.fillRect(px + S * .2, py + S * .2, S * .6, S * .6);
        break;
      case K.RUBBLE:
        for (let k = 0; k < 3; k++){
          const r1 = hash(gx, gy, k * 3 + 1), r2 = hash(gx, gy, k * 3 + 2), sz = S * (.18 + r1 * .16);
          ctx.fillStyle = rgb(RGB[t], k === 1 ? -28 : 16); ctx.fillRect(px + r2 * (S - sz), py + r1 * (S - sz), sz, sz);
        }
        break;
      case K.STUMP:
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(px + S * .56, py + S * .6, S * .28, S * .2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#6e5234'; ctx.beginPath(); ctx.arc(px + S / 2, py + S / 2, S * .27, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c29a62'; ctx.beginPath(); ctx.arc(px + S / 2, py + S * .47, S * .19, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#8c6a40'; ctx.lineWidth = Math.max(1, S * .04); ctx.beginPath(); ctx.arc(px + S / 2, py + S * .47, S * .1, 0, TAU); ctx.stroke();
        break;
      case K.LOG: {
        const o = dirAt(i) & 7, th = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4][o], len = S * (o > 1 ? 1.42 : 1) + 1;
        ctx.save(); ctx.translate(px + S / 2, py + S / 2); ctx.rotate(th);
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-len / 2, -S * .12, len, S * .44);
        ctx.fillStyle = '#76552f'; ctx.fillRect(-len / 2, -S * .2, len, S * .4);
        ctx.fillStyle = '#5a3f22'; ctx.fillRect(-len / 2, S * .06, len, S * .08);
        ctx.fillStyle = '#93704a'; ctx.fillRect(-len / 2, -S * .16, len, S * .06);
        const rootFirst = !!(dirAt(i) & 32), sgn = f => (rootFirst ? -1 : 1) * f;
        if (dirAt(i) & 8){
          const ex = sgn(S * .46);
          ctx.fillStyle = '#4a3a28'; ctx.beginPath(); ctx.ellipse(ex, 0, S * .14, S * .42, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#5d4630'; ctx.lineWidth = Math.max(1, S * .05);
          ctx.beginPath(); for (let k = -2; k <= 2; k++){ ctx.moveTo(ex, 0); ctx.lineTo(ex + sgn(S * .12), k * S * .16); } ctx.stroke();
        }
        if (dirAt(i) & 16){
          const ex = -sgn(S * .4);
          ctx.strokeStyle = '#6b4c2a'; ctx.lineWidth = Math.max(1, S * .06);
          ctx.beginPath(); ctx.moveTo(ex, 0); ctx.lineTo(ex - sgn(S * .25), -S * .28); ctx.moveTo(ex * .6, 0); ctx.lineTo(ex * .6 - sgn(S * .2), S * .3); ctx.stroke();
          ctx.fillStyle = '#b07c3c'; ctx.beginPath(); ctx.arc(ex - sgn(S * .25), -S * .28, S * .06, 0, TAU); ctx.fill();
        }
        ctx.restore();
        break;
      }
      case K.MUSHROOM:
        for (let k = 0; k < 3; k++){
          const mx = px + S * (.2 + hash(gx, gy, k + 70) * .6), my = py + S * (.3 + hash(gx, gy, k + 80) * .55), r = S * (.08 + hash(gx, gy, k + 90) * .07);
          const red = h[1] < .35;
          ctx.fillStyle = '#e8dfc8'; ctx.fillRect(mx - r * .3, my - r * .2, r * .6, r * 1.2);
          ctx.fillStyle = red ? '#c4423a' : '#b89468'; ctx.beginPath(); ctx.arc(mx, my, r, Math.PI, 0); ctx.closePath(); ctx.fill();
          if (red){ ctx.fillStyle = '#f4eee2'; ctx.fillRect(mx - r * .4, my - r * .6, Math.max(1, r * .25), Math.max(1, r * .25)); ctx.fillRect(mx + r * .2, my - r * .45, Math.max(1, r * .2), Math.max(1, r * .2)); }
        }
        break;
      case K.ALIEN:
        for (let k = 0; k < 2; k++){
          const bx = px + S * (.25 + k * .45 + (hash(gx, gy, k + 100) - .5) * .15), top = py + S * (.1 + hash(gx, gy, k + 110) * .3);
          ctx.strokeStyle = '#9a5fd0'; ctx.lineWidth = Math.max(1, S * .07);
          ctx.beginPath(); ctx.moveTo(bx, py + S * .95); ctx.quadraticCurveTo(bx + S * .25 * (k ? -1 : 1), py + S * .55, bx, top); ctx.stroke();
          const glow = ctx.createRadialGradient(bx, top, 0, bx, top, S * .3);
          glow.addColorStop(0, 'rgba(120,255,225,.6)'); glow.addColorStop(1, 'rgba(120,255,225,0)');
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(bx, top, S * .3, 0, TAU); ctx.fill();
          ctx.fillStyle = k ? '#7ff2dc' : '#f07ce0'; ctx.beginPath(); ctx.arc(bx, top, S * .09, 0, TAU); ctx.fill();
        }
        break;
      case K.BARREN:
        ctx.strokeStyle = rgb(RGB[t], -22); ctx.lineWidth = Math.max(1, S * .04);
        ctx.beginPath(); ctx.moveTo(px + S * h[1], py); ctx.lineTo(px + S * .5, py + S * .5); ctx.lineTo(px + S, py + S * h[2]); ctx.moveTo(px + S * .5, py + S * .5); ctx.lineTo(px + S * h[0], py + S); ctx.stroke();
        break;
      case K.ROCKS: case K.MOSSROCK:
        for (let k = 0; k < 3; k++){
          const r = S * (.16 + hash(gx, gy, k + 120) * .16);
          boulder(ctx, px + S * (.25 + hash(gx, gy, k + 130) * .5), py + S * (.25 + hash(gx, gy, k + 140) * .5), r, [116 + k * 6, 114 + k * 4, 106], t === K.MOSSROCK);
        }
        break;
      case K.ORE:
        boulder(ctx, px + S * .5, py + S * .52, S * .38, [96, 80, 70], false);
        ctx.strokeStyle = '#c67a3c'; ctx.lineWidth = Math.max(1, S * .06);
        ctx.beginPath(); ctx.moveTo(px + S * .25, py + S * (.4 + h[1] * .2)); ctx.lineTo(px + S * .7, py + S * (.5 + h[2] * .15)); ctx.stroke();
        ctx.fillStyle = '#f0c070';
        for (let k = 0; k < 3; k++) ctx.fillRect(px + S * (.3 + hash(gx, gy, k + 150) * .4), py + S * (.35 + hash(gx, gy, k + 160) * .35), Math.max(1, S * .06), Math.max(1, S * .06));
        break;
      case K.CRYSTAL: {
        const glow = ctx.createRadialGradient(px + S / 2, py + S * .6, 0, px + S / 2, py + S * .6, S * .6);
        glow.addColorStop(0, 'rgba(140,230,250,.35)'); glow.addColorStop(1, 'rgba(140,230,250,0)');
        ctx.fillStyle = glow; ctx.fillRect(px - S * .1, py - S * .1, S * 1.2, S * 1.2);
        for (let k = 0; k < 3; k++){
          const bx = px + S * (.22 + k * .28), bw = S * (.1 + hash(gx, gy, k + 170) * .06), top = py + S * (.05 + hash(gx, gy, k + 180) * .35), lean = (hash(gx, gy, k + 190) - .5) * S * .2;
          ctx.fillStyle = '#5fb4c8'; ctx.beginPath(); ctx.moveTo(bx - bw, py + S * .9); ctx.lineTo(bx - bw + lean, top + bw); ctx.lineTo(bx + lean, top); ctx.lineTo(bx + bw + lean, top + bw); ctx.lineTo(bx + bw, py + S * .9); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#c4f2fb'; ctx.beginPath(); ctx.moveTo(bx - bw, py + S * .9); ctx.lineTo(bx - bw + lean, top + bw); ctx.lineTo(bx + lean, top); ctx.lineTo(bx + lean * .6, py + S * .9); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case K.VENT:
        ctx.fillStyle = '#d6c060';
        for (let k = 0; k < 4; k++) ctx.fillRect(px + S * hash(gx, gy, k + 200), py + S * hash(gx, gy, k + 210), Math.max(1, S * .07), Math.max(1, S * .07));
        ctx.fillStyle = '#4a4540'; ctx.beginPath(); ctx.ellipse(px + S / 2, py + S * .55, S * .38, S * .3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#6a625a'; ctx.beginPath(); ctx.ellipse(px + S / 2, py + S * .5, S * .32, S * .24, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#16130f'; ctx.beginPath(); ctx.ellipse(px + S / 2, py + S * .5, S * .15, S * .1, 0, 0, TAU); ctx.fill();
        break;
      case K.BURROW:
        ctx.fillStyle = '#7e6644'; ctx.beginPath(); ctx.ellipse(px + S * .5, py + S * .55, S * .38, S * .26, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9b8058'; ctx.beginPath(); ctx.ellipse(px + S * .45, py + S * .5, S * .26, S * .15, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1f1811'; ctx.beginPath(); ctx.ellipse(px + S * .52, py + S * .44, S * .15, S * .1, 0, 0, TAU); ctx.fill();
        break;
      case K.SAWHORSE:
        ctx.fillStyle = '#d8bf86';
        for (let k = 0; k < 6; k++) ctx.fillRect(px + S * hash(gx, gy, k + 250), py + S * (.5 + hash(gx, gy, k + 260) * .45), Math.max(1, S * .05), Math.max(1, S * .05));
        ctx.strokeStyle = '#4a3220'; ctx.lineWidth = Math.max(1, S * .07);
        ctx.beginPath();
        for (const lx of [.25, .75]){ ctx.moveTo(px + S * (lx - .12), py + S * .85); ctx.lineTo(px + S * (lx + .12), py + S * .35); ctx.moveTo(px + S * (lx + .12), py + S * .85); ctx.lineTo(px + S * (lx - .12), py + S * .35); }
        ctx.stroke();
        ctx.fillStyle = '#8a6036'; ctx.fillRect(px + S * .05, py + S * .3, S * .9, S * .18);
        ctx.fillStyle = '#d0a96c'; ctx.beginPath(); ctx.arc(px + S * .08, py + S * .39, S * .09, 0, TAU); ctx.fill();
        break;
      case K.LOGS:
        for (const oy of [.3, .62]){
          ctx.fillStyle = '#7a5530'; ctx.fillRect(px, py + S * (oy - .12), S + .5, S * .24);
          ctx.fillStyle = '#5d3f22'; ctx.fillRect(px, py + S * (oy + .06), S + .5, S * .06);
          if (tileAt(gx - 1, gy) !== K.LOGS){ ctx.fillStyle = '#d0a96c'; ctx.beginPath(); ctx.arc(px + S * .12, py + S * oy, S * .12, 0, TAU); ctx.fill(); }
        }
        break;
    }
  }

  // Ground detail marks. `a` is the travel direction for tracks, in radians.
  function drawDecal(ctx, d, gx, gy, px, py, S, a, s){
    const r = k => hash(gx, gy, s + 400 + k), lw = Math.max(1, S * .05);
    const cx = px + S * (.3 + r(0) * .4), cy = py + S * (.3 + r(1) * .4);
    switch (d){
      case D.PEBBLES:
        for (let k = 0; k < 4; k++){ ctx.fillStyle = k % 2 ? '#9c978a' : '#7d786c'; ctx.beginPath(); ctx.ellipse(px + S * (.15 + r(k + 2) * .7), py + S * (.15 + r(k + 8) * .7), S * (.04 + r(k + 14) * .04), S * .035, 0, 0, TAU); ctx.fill(); }
        break;
      case D.TWIGS: case D.BRANCH: {
        const big = d === D.BRANCH;
        ctx.strokeStyle = big ? '#5e4428' : '#6f5535'; ctx.lineWidth = Math.max(1, S * (big ? .07 : .035));
        const th = r(3) * Math.PI, L = S * (big ? .42 : .22);
        for (let k = 0; k < (big ? 1 : 2); k++){
          const x0 = cx + (k ? S * .15 : 0), y0 = cy + (k ? S * .1 : 0), t2 = th + k * 1.1;
          ctx.beginPath(); ctx.moveTo(x0 - Math.cos(t2) * L, y0 - Math.sin(t2) * L); ctx.lineTo(x0 + Math.cos(t2) * L, y0 + Math.sin(t2) * L); ctx.stroke();
          if (big){
            ctx.lineWidth = Math.max(1, S * .04);
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(t2 - .8) * L * .6, y0 + Math.sin(t2 - .8) * L * .6); ctx.moveTo(x0 + Math.cos(t2) * L * .5, y0 + Math.sin(t2) * L * .5); ctx.lineTo(x0 + Math.cos(t2 + .9) * L * .9, y0 + Math.sin(t2 + .9) * L * .9); ctx.stroke();
            ctx.fillStyle = '#6f8f3e'; ctx.beginPath(); ctx.arc(x0 + Math.cos(t2 + .9) * L * .9, y0 + Math.sin(t2 + .9) * L * .9, S * .06, 0, TAU); ctx.fill();
          }
        }
        break;
      }
      case D.LEAVES: {
        const cols = ['#b5732e', '#caa13c', '#8d4f27', '#a8913a'];
        for (let k = 0; k < 5; k++){ ctx.fillStyle = cols[k % 4]; ctx.beginPath(); ctx.ellipse(px + S * (.1 + r(k + 2) * .8), py + S * (.1 + r(k + 9) * .8), S * .06, S * .035, r(k + 20) * 3, 0, TAU); ctx.fill(); }
        break;
      }
      case D.TUFT:
        ctx.strokeStyle = '#8fbf5a'; ctx.lineWidth = lw;
        ctx.beginPath(); for (let k = -2; k <= 2; k++){ ctx.moveTo(cx, cy + S * .12); ctx.lineTo(cx + k * S * .07, cy - S * .14 + Math.abs(k) * S * .04); } ctx.stroke();
        break;
      case D.WEEDS:
        ctx.strokeStyle = '#4c6d33'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(cx, cy + S * .12); ctx.lineTo(cx, cy - S * .1); ctx.moveTo(cx + S * .12, cy + S * .12); ctx.lineTo(cx + S * .1, cy - S * .04); ctx.stroke();
        ctx.fillStyle = '#5c8540'; ctx.beginPath(); ctx.ellipse(cx - S * .05, cy - S * .03, S * .06, S * .03, -.6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + S * .05, cy - S * .07, S * .06, S * .03, .6, 0, TAU); ctx.fill();
        break;
      case D.FLOWER: {
        const col = FLOWER_COLS[Math.floor(r(5) * 5)];
        for (let k = 0; k < 3; k++){ const fx = cx + (r(k + 6) - .5) * S * .3, fy = cy + (r(k + 9) - .5) * S * .3; ctx.fillStyle = rgb(col); ctx.beginPath(); ctx.arc(fx, fy, Math.max(1, S * .055), 0, TAU); ctx.fill(); ctx.fillStyle = '#f7e27a'; ctx.fillRect(fx - .5, fy - .5, 1, 1); }
        break;
      }
      case D.MUD: case D.DIRT: case D.ASH: {
        const col = { [D.MUD]: 'rgba(58,44,30,.62)', [D.DIRT]: 'rgba(122,96,64,.5)', [D.ASH]: 'rgba(62,60,58,.62)' }[d];
        ctx.fillStyle = col;
        const big = 1;
        for (let k = 0; k < 3; k++){ ctx.beginPath(); ctx.ellipse(cx + (r(k + 2) - .5) * S * .35 * big, cy + (r(k + 5) - .5) * S * .3 * big, S * (.14 + r(k + 8) * .1) * big, S * (.1 + r(k + 11) * .06) * big, r(k) * 2, 0, TAU); ctx.fill(); }
        if (d === D.ASH){ ctx.fillStyle = '#b4aea5'; for (let k = 0; k < 3; k++) ctx.fillRect(cx + (r(k + 20) - .5) * S * .4, cy + (r(k + 23) - .5) * S * .3, 1, 1); }
        break;
      }
      case D.CRACKED:
        ctx.strokeStyle = 'rgba(52,40,26,.6)'; ctx.lineWidth = Math.max(1, S * .03);
        ctx.beginPath(); ctx.moveTo(cx - S * .25, cy - S * .05); ctx.lineTo(cx, cy); ctx.lineTo(cx + S * .08, cy - S * .22); ctx.moveTo(cx, cy); ctx.lineTo(cx + S * .22, cy + S * .12); ctx.moveTo(cx, cy); ctx.lineTo(cx - S * .06, cy + S * .24); ctx.stroke();
        break;
      case D.PUDDLE:
        ctx.fillStyle = 'rgba(82,120,136,.8)'; ctx.beginPath(); ctx.ellipse(cx, cy, S * .22, S * .13, r(3), 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(200,230,240,.5)'; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(cx - S * .04, cy - S * .03, S * .12, S * .06, r(3), 3.6, 5.2); ctx.stroke();
        break;
      case D.BONES:
        ctx.strokeStyle = '#e4ddcb'; ctx.lineWidth = Math.max(1, S * .045); ctx.fillStyle = '#e4ddcb';
        for (let k = 0; k < 2; k++){
          const th = r(k + 3) * Math.PI, L = S * .15, x1 = cx - Math.cos(th) * L, y1 = cy - Math.sin(th) * L, x2 = cx + Math.cos(th) * L, y2 = cy + Math.sin(th) * L;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.beginPath(); ctx.arc(x1, y1, S * .04, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x2, y2, S * .04, 0, TAU); ctx.fill();
        }
        break;
      case D.FEATHER: {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(r(3) * TAU);
        ctx.fillStyle = r(4) < .5 ? '#e8e6e0' : '#6f7a88'; ctx.beginPath(); ctx.ellipse(0, 0, S * .15, S * .045, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#3a3a36'; ctx.lineWidth = Math.max(.6, S * .02); ctx.beginPath(); ctx.moveTo(-S * .18, 0); ctx.lineTo(S * .15, 0); ctx.stroke();
        ctx.restore();
        break;
      }
      case D.SHELLS:
        for (let k = 0; k < 2; k++){ const sx = cx + (k ? S * .14 : 0), sy = cy + (k ? S * .08 : 0); ctx.fillStyle = k ? '#e9dcc4' : '#d9b9a0'; ctx.beginPath(); ctx.arc(sx, sy, S * .07, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(120,90,70,.6)'; ctx.lineWidth = Math.max(.6, S * .015); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - S * .07); ctx.stroke(); }
        break;
      case D.FOOT: case D.ANIMAL: {
        ctx.save(); ctx.translate(px + S / 2, py + S / 2); ctx.rotate(a);
        if (d === D.FOOT){
          ctx.fillStyle = 'rgba(52,40,28,.55)';
          ctx.beginPath(); ctx.ellipse(-S * .2, -S * .09, S * .09, S * .045, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(S * .15, S * .09, S * .09, S * .045, 0, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(46,36,24,.6)';
          for (let k = -1; k <= 1; k++){
            const x = k * S * .3, y = (k % 2 ? 1 : -1) * S * .08;
            ctx.beginPath(); ctx.arc(x, y, S * .035, 0, TAU); ctx.fill();
            for (let q = -1; q <= 1; q++){ ctx.beginPath(); ctx.arc(x + S * .05, y + q * S * .03, S * .015, 0, TAU); ctx.fill(); }
          }
        }
        ctx.restore();
        break;
      }
      case D.TIRE: case D.DRAG: {
        ctx.save(); ctx.translate(px + S / 2, py + S / 2); ctx.rotate(a);
        const L = S * .75;
        if (d === D.TIRE){
          ctx.fillStyle = 'rgba(48,38,26,.42)';
          ctx.fillRect(-L, -S * .3, L * 2, S * .12); ctx.fillRect(-L, S * .18, L * 2, S * .12);
          ctx.fillStyle = 'rgba(30,24,16,.45)';
          for (let x = -L; x < L; x += S * .16){ ctx.fillRect(x, -S * .3, Math.max(1, S * .04), S * .12); ctx.fillRect(x, S * .18, Math.max(1, S * .04), S * .12); }
        } else {
          ctx.fillStyle = 'rgba(70,52,32,.35)'; ctx.fillRect(-L, -S * .14, L * 2, S * .28);
          ctx.strokeStyle = 'rgba(40,30,18,.4)'; ctx.lineWidth = Math.max(1, S * .025);
          ctx.beginPath(); for (const o of [-.08, 0, .08]){ ctx.moveTo(-L, S * o); ctx.lineTo(L, S * o); } ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case D.SCORCH: {
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * .42);
        gr.addColorStop(0, 'rgba(18,14,10,.7)'); gr.addColorStop(.6, 'rgba(30,24,18,.35)'); gr.addColorStop(1, 'rgba(30,24,18,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, S * .42, 0, TAU); ctx.fill();
        break;
      }
    }
  }

  const fenAt = (gx, gy) => [tileAt(gx + 1, gy), tileAt(gx - 1, gy), tileAt(gx, gy + 1), tileAt(gx, gy - 1)].some(q => q === K.SWAMP || q === K.BOG || q === K.REEDS);
  // Tall things drawn after the ground, row by row, so nearer objects overlap farther ones.
  function drawTop(ctx, t, gx, gy, px, py, S){
    const s = seed, h0 = hash(gx, gy, s + 7), h1 = hash(gx, gy, s + 9), h2 = hash(gx, gy, s + 17);
    if (t === K.TREE && pix && !fenAt(gx, gy)){
      const set = pix.tree;
      G.PixelArt.prop(ctx, set.tiles[Math.floor(hash(gx, gy, 61) * set.tiles.length)], px, py, S);
      return;
    }
    if (t === K.TREE){
      const fen = [tileAt(gx + 1, gy), tileAt(gx - 1, gy), tileAt(gx, gy + 1), tileAt(gx, gy - 1)].some(q => q === K.SWAMP || q === K.BOG || q === K.REEDS);
      const cx = px + S / 2 + (h0 - .5) * S * .3, cy = py + S / 2 + (h1 - .5) * S * .3, r = S * (.55 + h2 * .15);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(cx + S * .14, cy + S * .2, r, 0, TAU); ctx.fill();
      if (fen){
        ctx.strokeStyle = '#5a5140'; ctx.lineWidth = Math.max(1, S * .1);
        ctx.beginPath(); ctx.moveTo(cx - r * .7, cy - r * .2); ctx.lineTo(cx + r * .6, cy + r * .3); ctx.moveTo(cx, cy - r * .7); ctx.lineTo(cx - r * .1, cy + r * .6); ctx.moveTo(cx + r * .5, cy - r * .5); ctx.lineTo(cx - r * .3, cy + r * .2); ctx.stroke();
        return;
      }
      const k = Math.round((h2 - .5) * 16);
      ctx.fillStyle = rgb([30, 64, 36], k); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb([46, 88, 48], k); ctx.beginPath(); ctx.arc(cx - r * .25, cy - r * .25, r * .55, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb([70, 116, 62], k); ctx.beginPath(); ctx.arc(cx - r * .38, cy - r * .38, r * .22, 0, TAU); ctx.fill();
    } else if (t === K.THICKET){
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(px + S * .6, py + S * .62, S * .5, 0, TAU); ctx.fill();
      for (let k = 0; k < 4; k++){
        const bx = px + S * (.28 + (k % 2) * .44) + (hash(gx, gy, k + 30) - .5) * S * .12, by = py + S * (.28 + (k >> 1) * .44) + (hash(gx, gy, k + 34) - .5) * S * .12;
        ctx.fillStyle = rgb([36, 70, 38], k * 3); ctx.beginPath(); ctx.arc(bx, by, S * .32, 0, TAU); ctx.fill();
        ctx.fillStyle = rgb([62, 102, 54], k * 2); ctx.beginPath(); ctx.arc(bx - S * .08, by - S * .09, S * .12, 0, TAU); ctx.fill();
      }
      if (h0 < .4){ ctx.fillStyle = '#9b2f3a'; for (let k = 0; k < 3; k++) ctx.fillRect(px + S * hash(gx, gy, k + 38), py + S * hash(gx, gy, k + 42), Math.max(1, S * .06), Math.max(1, S * .06)); }
    } else if (t === K.MOUND){
      const cx = px + S / 2, base = py + S * .85, top = py - S * .55;
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(cx + S * .35, base, S * .5, S * .16, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#a8784a'; ctx.beginPath(); ctx.moveTo(cx - S * .36, base); ctx.quadraticCurveTo(cx - S * .3, py + S * .1, cx - S * .06, top); ctx.lineTo(cx + S * .08, top + S * .12); ctx.quadraticCurveTo(cx + S * .34, py + S * .2, cx + S * .38, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a5f38'; ctx.beginPath(); ctx.moveTo(cx + S * .05, top + S * .1); ctx.quadraticCurveTo(cx + S * .34, py + S * .2, cx + S * .38, base); ctx.lineTo(cx + S * .05, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c2925e'; ctx.beginPath(); ctx.ellipse(cx - S * .2, py + S * .05, S * .08, S * .14, 0, 0, TAU); ctx.fill();
    } else if (t === K.VENT){
      for (let k = 0; k < 3; k++){
        const rr = S * (.22 + k * .12), yy = py + S * (.3 - k * .42), xx = px + S * (.5 + (hash(gx, gy, k + 220) - .5) * .3);
        ctx.fillStyle = `rgba(236,240,238,${.42 - k * .1})`; ctx.beginPath(); ctx.arc(xx, yy, rr, 0, TAU); ctx.fill();
      }
    }
  }
  const TOP = new Set([K.TREE, K.THICKET, K.MOUND, K.VENT]);

  // Brighter high ground and a soft shadow at the foot of higher ground. Cliff faces stay
  // inside their own tile, so a cliff is exactly one tile tall.
  function heightShade(ctx, gx, gy, px, py, S){
    const l = lvlAt(gx, gy);
    if (l < 0) return;
    const tint = [-.18, -.09, 0, .06, .12][l];
    if (tint){ ctx.fillStyle = tint < 0 ? `rgba(0,0,0,${-tint})` : `rgba(255,255,240,${tint})`; ctx.fillRect(px, py, S + .5, S + .5); }
    const nl = lvlAt(gx, gy - 1), wl = lvlAt(gx - 1, gy), here = tileAt(gx, gy);
    if (nl > l && here !== K.CLIFF && here !== K.CAVE){
      const gr = ctx.createLinearGradient(0, py, 0, py + S * .4);
      gr.addColorStop(0, `rgba(0,0,0,${.2 + (nl - l) * .06})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(px, py, S + .5, S * .4);
    }
    if (wl > l){
      const gr = ctx.createLinearGradient(px, 0, px + S * .3, 0);
      gr.addColorStop(0, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(px, py, S * .3, S + .5);
    }
  }

  const bind = grd => { grid = grd; art = grd.art || null; seed = (art && art.seed != null ? art.seed : G.State.seed) | 0; pix = G.PixelArt ? G.PixelArt.woodlands() : null; };

  G.WoodlandsArt = {
    FIRST_ID: 12,          // terrain ids below this keep the classic art on other maps
    isWoodlands: grd => !!(grd && grd.art && grd.art.kind === 'woodlands'),
    // A whole chunk of a Woodlands map: tiles, ground detail, height, then tall things,
    // which may overhang the chunk edge (the neighbouring chunk draws the other part).
    paintChunk(ctx, grd, x0, y0, ct, S){
      bind(grd);
      const cols = grd.cols, rows = grd.rows;
      for (let ly = 0; ly < ct; ly++) for (let lx = 0; lx < ct; lx++){
        const gx = x0 + lx, gy = y0 + ly;
        if (gx >= cols || gy >= rows) continue;
        const i = gy * cols + gx, px = lx * S, py = ly * S;
        drawTile(ctx, i, grd.tiles[i], gx, gy, px, py, S);
        const d = art.detail[i];
        if (d) drawDecal(ctx, d, gx, gy, px, py, S, art.angle[i] / 256 * TAU, seed);
      }
      for (let ly = 0; ly < ct; ly++) for (let lx = 0; lx < ct; lx++){
        const gx = x0 + lx, gy = y0 + ly;
        if (gx < cols && gy < rows) heightShade(ctx, gx, gy, lx * S, ly * S, S);
      }
      this.paintTops(ctx, grd, x0, y0, ct, S, true);
    },
    // One tile of a new terrain type on any other map.
    paintTile(ctx, grd, t, gx, gy, px, py, S){
      bind(grd);
      drawTile(ctx, gy * grd.cols + gx, t, gx, gy, px, py, S);
    },
    // Tall things (tree canopies on Woodlands; thickets, mounds and vents everywhere).
    paintTops(ctx, grd, x0, y0, ct, S, all){
      bind(grd);
      for (let ly = -1; ly <= ct + 1; ly++) for (let lx = -1; lx <= ct; lx++){
        const gx = x0 + lx, gy = y0 + ly, t = tileAt(gx, gy);
        if (TOP.has(t) && (all || t >= this.FIRST_ID)) drawTop(ctx, t, gx, gy, lx * S, ly * S, S);
      }
    },
    // A ground-detail mark drawn alone, for a legend icon.
    detailIcon(ctx, d, S){ drawDecal(ctx, d, 3, 5, 0, 0, S, 0, 1); },
    // Minimap shading: brighter high ground, darker ground just below a cliff.
    overviewShade(grd, i){
      const a = grd.art, l = a.level[i], cols = grd.cols;
      let k = .82 + l * .075;
      if (i >= cols && a.level[i - cols] > l) k *= .78;
      return k;
    }
  };
})();
