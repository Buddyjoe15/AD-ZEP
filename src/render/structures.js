/* Genesis buildings and structures, drawn as pixel art over the terrain (presentation only):
   - houses: intact buildings (walls all round, a floor, a door) get a pitched roof of slate,
     wooden shingles or planks (log huts), with a ridge cap, eaves, a chimney on some, a step at
     the door and a shadow; ruins show broken masonry or log walls round plank floors with
     boards missing, where the walls still stand;
   - bridges: a plank deck over the flowing water, with log rails and posts along open sides;
   - cave mouths: a dark arch in the cliff face with a rocky rim, teeth hanging from its roof and
     scree spilling out below.
   Houses are found from the tiles (walls, floors, doors and log walls joined together), so the
   Map Editor can paint them away; each is drawn once into its own canvas at 2 art px per world
   px and copied into the terrain chunks. Colours come from the pixel-art palette. */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math;
  const HEX = {
    char0: '#231f1c', char1: '#433a33', dust0: '#5e4f3d', dust1: '#6f5e48', dust2: '#7f6c53', dust3: '#8e7a5e', dust4: '#9e896b', dust5: '#b09c7e',
    steel0: '#1f2c34', steel1: '#34495a', steel2: '#557184', plate0: '#7f8b86', plate1: '#b3bdb5', rust0: '#4a2a1e', rust1: '#7d4630', rust2: '#a8653f',
    leaf1: '#28502d', grass1: '#4d6946', grass2: '#5d7a4f', amber1: '#c98a2e', amber2: '#f2c66a', outline: '#0d1419'
  };
  const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const px32 = (h, a = 255) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return LE ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0; };
  const PX = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, px32(v)]));
  const SHADOW = px32('#000000', 110);
  const h3 = (a, b, c) => G.hashRandom3(a, b, c);
  // Smooth value noise in art px (cell 8), for wear, moss and missing boards.
  const vn = (x, y, s) => {
    const gx = x / 8, gy = y / 8, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = h3(x0, y0, s), b = h3(x0 + 1, y0, s), c = h3(x0, y0 + 1, s), d = h3(x0 + 1, y0 + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const dith = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  // A pixel buffer w × h art px; `canvas()` turns it into a canvas.
  function buffer(w, h){
    const img = new ImageData(w, h), d = new Uint32Array(img.data.buffer);
    return {
      w, h, d,
      set(x, y, c){ if (x >= 0 && y >= 0 && x < w && y < h) d[y * w + x] = c; },
      get(x, y){ return x >= 0 && y >= 0 && x < w && y < h ? d[y * w + x] : 0; },
      canvas(){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').putImageData(img, 0, 0); return cv; }
    };
  }

  let K = null;
  const ids = () => K || (K = Object.fromEntries(['wall', 'floor', 'door', 'log_wall', 'bridge', 'cave', 'water', 'deep_water', 'waterfall', 'bog', 'stepping_stones'].map(k => [k, G.Defs.terrain.get(k).id])));

  // Houses on the grid: joined wall, floor, door and log-wall tiles, with their bounding box and
  // whether they stand intact. Rebuilt after the terrain changes.
  function houses(grd){
    const a = grd.art;
    if (a.houses) return a.houses;
    const k = ids(), cols = grd.cols, rows = grd.rows, tiles = grd.tiles, PART = new Set([k.wall, k.floor, k.door, k.log_wall]);
    const of = new Int32Array(grd.size).fill(-1), list = [];
    for (let s = 0; s < grd.size; s++){
      if (of[s] >= 0 || !PART.has(tiles[s])) continue;
      const id = list.length, st = [s], cells = [];
      of[s] = id;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, log = false, door = null;
      while (st.length){
        const i = st.pop(), x = i % cols, y = (i / cols) | 0;
        cells.push(i); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        if (tiles[i] === k.log_wall) log = true;
        if (tiles[i] === k.door) door = { x, y };
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
          const nx = x + dx, ny = y + dy, j = ny * cols + nx;
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && of[j] < 0 && PART.has(tiles[j])){ of[j] = id; st.push(j); }
        }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      let intact = w >= 3 && h >= 3 && cells.length === w * h;
      if (intact) for (let y = y0; y <= y1 && intact; y++) for (let x = x0; x <= x1; x++){
        const t = tiles[y * cols + x], edge = x === x0 || y === y0 || x === x1 || y === y1;
        if (edge ? !(t === k.wall || t === k.log_wall || t === k.door) : t !== k.floor){ intact = false; break; }
      }
      list.push({ id, x: x0, y: y0, w, h, intact, log, door, cells, cv: null });
    }
    return (a.houses = { list, of });
  }
  G.Events.on('terrain:changed', () => { const grd = G.State.grid; if (grd && grd.art){ grd.art.houses = null; grd.art.bridges = null; } });

  const PAD = 12;   // world px round a house canvas, for the eaves and shadow
  // An intact house: a roof over the whole building, hipped on stone houses (four slopes, the
  // ends sloping too) and gabled on log huts. The light comes from the upper left, so the north
  // and west slopes are lit and the south and east ones in shade; each slope is laid in courses
  // of slates, shingles or boards, lighter towards the ridge, each course shading the one below.
  function roof(H, grd){
    const T = G.CONFIG.TILE, W = (H.w * T + PAD * 2) * 2, Hh = (H.h * T + PAD * 2) * 2, b = buffer(W, Hh), O = PAD * 2, OV = 6;
    const rx0 = O - OV, ry0 = O - OV, rx1 = O + H.w * T * 2 + OV, ry1 = O + H.h * T * 2 + OV, seed = H.x * 7919 + H.y;
    const horiz = H.w >= H.h, mat = H.log ? 'plank' : h3(H.x, H.y, 71) < 0.5 ? 'slate' : 'shingle', hipped = !H.log;
    const RAMP = {
      slate: [PX.steel0, PX.steel1, PX.steel2, PX.plate0, PX.plate1],
      shingle: [PX.rust0, PX.rust1, PX.rust2, PX.dust4, PX.dust5],
      plank: [PX.dust0, PX.dust1, PX.dust2, PX.dust3, PX.dust4]
    }[mat];
    const CW = mat === 'slate' ? 12 : mat === 'shingle' ? 9 : 10, CH = mat === 'plank' ? 1e9 : 7;   // tile width, course height
    const inRoof = (x, y) => x >= rx0 && y >= ry0 && x < rx1 && y < ry1;
    // Shadow first, down and right.
    for (let y = ry0 + 16; y < ry1 + 16; y++) for (let x = rx0 + 16; x < rx1 + 16; x++) if (!inRoof(x, y)) b.set(x, y, SHADOW);
    const len = horiz ? rx1 - rx0 : ry1 - ry0, half = (horiz ? ry1 - ry0 : rx1 - rx0) / 2;
    for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++){
      const along = (horiz ? x - rx0 : y - ry0) + 0.5, acr = (horiz ? y - ry0 : x - rx0) + 0.5 - half, dist = Math.abs(acr);
      const end = Math.min(along, len - along), onEnd = hipped && end < half - dist;
      // q: distance up the slope from the eave; e: position along the eave.
      const q = onEnd ? end : half - dist, e = onEnd ? acr + half : along;
      // Facets: 3 the lit side, 2 the lit end, 1 the shaded side, 0.6 the shaded end.
      const base = onEnd ? (along < len / 2 ? 2 : 0.6) : acr < 0 ? 3 : 1;
      const row = Math.floor(q / Math.min(CH, 1e6)), inRow = q - row * CH, tile = Math.floor((e + (row & 1) * CW / 2 + h3(row, 3, seed) * 3) / CW);
      const n = vn(x, y, seed), dt = dith(x, y), sh = h3(row, tile, seed + 5);
      let v = base - 0.35 + (q / half) * 0.7 + (sh - 0.5) * 0.5 + (dt - 0.5) * 0.35;
      let c;
      const ridge = hipped ? Math.abs((half - dist) - end) < 1.2 && end <= half || (!onEnd && dist < 1.5 && end >= half - 1) : dist < 2;
      if (ridge) c = RAMP[4];                                                     // ridge and hip caps
      else if (q < 2.5) c = RAMP[0];                                              // eaves
      else if (mat === 'plank'){
        // Boards run down the slope, a dark seam between them, battens across now and then.
        const bd = Math.floor(e / 10), seam = Math.floor(e) % 10 === 0, batten = Math.abs(q - half * 0.5) < 1.5;
        v = base - 0.3 + (h3(bd, 1, seed) - 0.5) * 0.9 + (dt - 0.5) * 0.3 + (q / half) * 0.3;
        c = seam || batten ? RAMP[0] : RAMP[Math.max(0, Math.min(4, Math.round(v)))];
      } else {
        const joint = Math.floor(e + (row & 1) * CW / 2 + h3(row, 3, seed) * 3) % CW === 0;
        if (inRow < 1.2) v -= 1.3;                                                 // the lip of the course above
        else if (joint) v -= 0.9;
        c = RAMP[Math.max(0, Math.min(4, Math.round(v)))];
        if (base < 2 && n > 0.74 && h3(x >> 1, y >> 1, seed) < 0.55 && inRow >= 1.2) c = n > 0.8 ? PX.grass1 : PX.leaf1;   // moss in the shade
      }
      b.set(x, y, c);
    }
    // Outline round the roof.
    for (let y = ry0 - 1; y <= ry1; y++) for (let x = rx0 - 1; x <= rx1; x++) if (!inRoof(x, y) && (inRoof(x + 1, y) || inRoof(x - 1, y) || inRoof(x, y + 1) || inRoof(x, y - 1))) b.set(x, y, PX.outline);
    // A stone chimney on the lit slope of some houses, with its shadow down the roof.
    if (!H.log && h3(H.x, H.y, 73) < 0.65){
      const f = 0.3 + h3(H.x, H.y, 75) * 0.4, ax = horiz ? rx0 + len * f : (rx0 + rx1) / 2 - 12, ay = horiz ? (ry0 + ry1) / 2 - 12 : ry0 + len * f;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 12; x++) b.set(Math.round(ax + 7 + x), Math.round(ay + 7 + y), SHADOW);
      for (let y = -7; y < 7; y++) for (let x = -7; x < 7; x++){
        const edge = x === -7 || y === -7 || x === 6 || y === 6, lit = x < -4 || y < -4, dark = x > 3 || y > 3;
        const course = (y + 7) % 4 === 0 || (x + 7 + (((y + 7) >> 2) & 1) * 3) % 6 === 0;
        b.set(Math.round(ax + x), Math.round(ay + y), edge ? PX.outline : Math.abs(x) < 3 && Math.abs(y) < 3 ? PX.char0 : lit ? PX.plate1 : dark ? PX.dust2 : course ? PX.dust2 : PX.plate0);
      }
    }
    // A step at the door, out from under the eaves.
    if (H.door){
      const dx = (H.door.x - H.x) * T * 2 + O + T, dy = (H.door.y - H.y) * T * 2 + O + T;
      const out = H.door.y === H.y + H.h - 1 ? [0, 1] : H.door.y === H.y ? [0, -1] : H.door.x === H.x ? [-1, 0] : [1, 0];
      const cx = dx + out[0] * (T + OV + 5), cy = dy + out[1] * (T + OV + 5), sw = out[0] ? 6 : 14, sh = out[0] ? 14 : 6;
      for (let y = -sh; y <= sh; y++) for (let x = -sw; x <= sw; x++){
        const edge = Math.abs(x) === sw || Math.abs(y) === sh;
        b.set(cx + x, cy + y, edge ? PX.dust0 : (out[0] ? x : y) % 4 === 0 ? PX.dust2 : x + y < 0 ? PX.dust4 : PX.dust3);
      }
      // A lamp by the door on some.
      if (h3(H.x, H.y, 77) < 0.4){ const lx = cx + (out[0] ? 0 : sw + 4), ly = cy + (out[0] ? sh + 4 : 0); for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) b.set(lx + x, ly + y, PX.amber2); b.set(lx - 1, ly, PX.amber1); }
    }
    return b.canvas();
  }

  // A ruin: walls standing in places round plank floors. `of` maps tiles to houses.
  function ruin(H, grd, of){
    const T = G.CONFIG.TILE, k = ids(), cols = grd.cols, tiles = grd.tiles, W = (H.w * T + PAD * 2) * 2, Hh = (H.h * T + PAD * 2) * 2, b = buffer(W, Hh), O = PAD * 2, seed = H.x * 131 + H.y * 17;
    const part = (x, y) => x >= 0 && y >= 0 && x < cols && y < grd.rows && of[y * cols + x] === H.id;
    const TH = 20;   // wall thickness, art px
    const mask = new Uint8Array(b.w * b.h);   // standing wall pixels
    for (const i of H.cells){
      const tx = i % cols, ty = (i / cols) | 0, t = tiles[i], ox = O + (tx - H.x) * T * 2, oy = O + (ty - H.y) * T * 2;
      const wall = t === k.wall || t === k.log_wall, log = t === k.log_wall;
      // Which sides face out of the building (walls stand along those).
      const out = [!part(tx, ty - 1), !part(tx + 1, ty), !part(tx, ty + 1), !part(tx - 1, ty)];
      // How far into the wall band a pixel is (0 = its outer face), or -1 outside it.
      const band = (x, y) => { let d = 1e9; if (out[0]) d = Math.min(d, y); if (out[1]) d = Math.min(d, 95 - x); if (out[2]) d = Math.min(d, 95 - y); if (out[3]) d = Math.min(d, x); return wall && d < TH ? d : -1; };
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++){
        const X = ox + x, Y = oy + y, n = vn(X, Y, seed), dt = dith(X, Y), d = band(x, y);
        if (d >= 0){
          const fallen = vn(X * 0.4, Y * 0.4, seed + 9);
          if (fallen > 0.66){
            // Tumbled down here: a spill of loose blocks or logs, grass between.
            const r = h3(X >> 2, Y >> 2, seed + 13);
            if (r < (0.78 - fallen) * 3 + 0.25) b.set(X, Y, log ? (r < 0.12 ? PX.dust1 : PX.dust2) : (X & 3) === 0 || (Y & 3) === 0 ? PX.char1 : r < 0.2 ? PX.plate0 : PX.dust3);
            continue;
          }
          mask[Y * b.w + X] = 1;
          if (d === 0 || d === TH - 1) { b.set(X, Y, PX.outline); continue; }
          if (log){
            // Logs laid along the wall, a dark seam between them, lit along their tops.
            const across = out[0] && d === y || out[2] && d === 95 - y ? y : x, ring = (across + 3) % 7;
            b.set(X, Y, ring === 0 ? PX.dust0 : ring === 1 ? PX.dust4 : ring === 2 ? PX.dust3 : n > 0.6 ? PX.dust2 : PX.dust1);
          } else {
            // Masonry seen from above: the wall top in blocks with mortar, lit on its outer
            // edge, its inner face in shadow; moss creeping over.
            const row = Math.floor(Y / 6), joint = (X + row * 7 + Math.floor(h3(row, 5, seed) * 9)) % 11 === 0, mortar = Y % 6 === 0 || joint;
            b.set(X, Y, d < 3 ? PX.plate1 : d > TH - 5 ? PX.char1 : n > 0.78 && dt < 0.6 ? PX.leaf1 : mortar ? PX.dust1 : n + dt * 0.3 > 0.72 ? PX.plate0 : h3(X >> 3, row, seed) > 0.5 ? PX.dust4 : PX.dust3);
          }
        } else if (t === k.floor || t === k.door || wall){
          // Floorboards, rotted through in places to the ground, dark where a wall shades them.
          const hole = vn(X * 0.3, Y * 0.3, seed + 3) * 0.7 + vn(X, Y, seed + 4) * 0.3;
          if (hole > 0.72) continue;
          const board = Math.floor(Y / 8), seam = Y % 8 === 0, off = Math.floor(h3(board, 7, seed) * 40), end = (X + off) % 44 === 0;
          const shade = h3(board, Math.floor((X + off) / 44), seed + 11);
          let c = hole > 0.69 || seam || end ? PX.dust0 : shade > 0.7 ? PX.dust4 : shade > 0.3 ? PX.dust3 : PX.dust2;
          if (!seam && !end && ((X + Y * 3) % 17 === 0)) c = PX.dust1;   // grain
          if (n > 0.82 && dt < 0.5) c = PX.grass1;                       // moss in the cracks
          b.set(X, Y, c);
        }
      }
    }
    // Shadows the standing walls cast down and to the right, over the floor and the grass.
    for (let y = b.h - 1; y >= 6; y--) for (let x = b.w - 1; x >= 6; x--){
      if (mask[y * b.w + x] || !mask[(y - 6) * b.w + x - 6]) continue;
      const c = b.get(x, y);
      b.set(x, y, c ? (c === PX.dust0 ? PX.char1 : PX.dust0) : SHADOW);
    }
    return b.canvas();
  }

  // One bridge tile's deck, its planks laid across the way over (`ew`: the way runs east–west,
  // so the planks run north–south), with a log rail along each open side (bits 1 north/west,
  // 2 south/east) and posts at the rail ends (bits 4 start, 8 end).
  const deckCache = new Map();
  function deck(ew, rails, v){
    const key = ew + '|' + rails + '|' + v;
    let cv = deckCache.get(key);
    if (cv) return cv;
    const b = buffer(96, 96);
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++){
      const along = ew ? x : y, acr = ew ? y : x, board = Math.floor(along / 10), sh = h3(board, v, 91), dt = dith(x, y);
      // Grain along each plank, a knot here and there, the ends worn lighter.
      const grain = h3(board, Math.floor(acr / 5), v + 93) < 0.25, knot = h3(board, Math.floor(acr / 6), v + 95) < 0.03;
      let c;
      if ((rails & 1) && acr < 8) c = acr < 2 ? PX.dust4 : acr > 6 ? PX.char1 : acr < 4 ? PX.dust3 : PX.dust2;          // rail log
      else if ((rails & 2) && acr >= 88) c = acr < 90 ? PX.dust4 : acr > 94 ? PX.char1 : acr < 92 ? PX.dust3 : PX.dust2;
      else if (along % 10 === 0) c = PX.char1;                                                                         // gap between planks
      else if (along % 10 === 9) c = PX.dust1;                                                                         // its shaded edge
      else if (knot) c = PX.dust0;
      else { const l = sh * 1.6 + dt * 0.5 - (grain ? 0.5 : 0); c = l > 1.5 ? PX.dust4 : l > 0.9 ? PX.dust3 : l > 0.4 ? PX.dust2 : PX.dust1; }
      if ((rails & 1) && acr === 8 || (rails & 2) && acr === 87) c = PX.char1;                                           // rail shadow
      if (((rails & 1) && acr >= 9 && acr < 11 || (rails & 2) && acr >= 85 && acr < 87) && along % 10 === 5) c = PX.char0; // nails by the rails
      b.set(x, y, c);
    }
    // Posts at the ends of the rails.
    for (const side of [1, 2]) if (rails & side) for (const [bit, a0] of [[4, 0], [8, 88]]) if (rails & bit) for (let i = 0; i < 8; i++) for (let j = 0; j < 10; j++){
      const acr = side === 1 ? j - 1 : 87 + j, along = a0 + i;
      b.set(ew ? along : acr, ew ? acr : along, i === 0 || j === 0 ? PX.dust4 : i === 7 || j === 9 ? PX.char0 : (i + j) % 3 ? PX.dust2 : PX.dust3);
    }
    cv = b.canvas(); deckCache.set(key, cv);
    return cv;
  }

  // Bridges on the grid: each joined group of bridge tiles runs one way, across the water (the
  // way with more land at its ends and water at its sides). Tile index -> true for east–west.
  function bridges(grd){
    const a = grd.art;
    if (a.bridges) return a.bridges;
    const k = ids(), cols = grd.cols, tiles = grd.tiles, ew = new Map();
    const wet = t => t === k.water || t === k.deep_water || t === k.waterfall || t === k.bog || t === k.stepping_stones;
    const at = (x, y) => x >= 0 && y >= 0 && x < cols && y < grd.rows ? tiles[y * cols + x] : -1;
    for (let s = 0; s < grd.size; s++){
      if (tiles[s] !== k.bridge || ew.has(s)) continue;
      const st = [s], cells = [];
      ew.set(s, false);
      let sEW = 0, sNS = 0;
      while (st.length){
        const i = st.pop(), x = i % cols, y = (i / cols) | 0;
        cells.push(i);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
          const t = at(x + dx, y + dy), j = (y + dy) * cols + x + dx;
          if (t === k.bridge){ if (!ew.has(j)){ ew.set(j, false); st.push(j); } continue; }
          if (t < 0) continue;
          const land = !wet(t);
          if (dx){ if (land) sEW++; else sNS++; } else { if (land) sNS++; else sEW++; }
        }
      }
      const way = sEW >= sNS;
      for (const i of cells) ew.set(i, way);
    }
    return (a.bridges = ew);
  }

  // A cave mouth in a south-facing cliff face, on a 96 × 144 art px canvas from the tile's top.
  const caveCache = new Map();
  function cave(v){
    let cv = caveCache.get(v);
    if (cv) return cv;
    const b = buffer(96, 144), cx = 48, base = 92, rw = 28, rh = 26;
    const inside = (x, y) => y <= base && (y >= base - rh * 0.6 ? Math.abs(x - cx) <= rw : ((x - cx) / rw) ** 2 + ((y - (base - rh * 0.6)) / (rh * 0.9)) ** 2 <= 1);
    for (let y = 0; y < 144; y++) for (let x = 0; x < 96; x++){
      const n = vn(x, y, 500 + v), dt = dith(x, y);
      if (inside(x, y)){
        // The dark inside, deepest in the middle.
        let e = 0; for (let r = 1; r <= 8 && !e; r++) if (!inside(x, y - r) || !inside(x - r, y) || !inside(x + r, y)) e = r;
        b.set(x, y, e && e < 3 ? PX.char1 : e && e < 6 && dt < 0.5 ? PX.char1 : PX.char0);
      } else if (inside(x, y + 5) || inside(x - 5, y) || inside(x + 5, y) || inside(x + 4, y + 4) || inside(x - 4, y + 4)){
        // The rocky rim, lit on the upper left.
        const lit = x < cx && y < base - 6;
        b.set(x, y, n + dt * 0.3 > 0.7 ? (lit ? PX.dust5 : PX.dust3) : lit ? PX.dust4 : PX.dust2);
      } else if (y > base && y < base + 30 && Math.abs(x - cx) < rw + (y - base) * 0.7 && vn(x * 2, y * 2, 520 + v) > 0.62){
        // Scree spilling out onto the ground below.
        b.set(x, y, n > 0.55 ? PX.dust4 : n > 0.4 ? PX.plate0 : PX.dust2);
        if (!b.get(x + 1, y + 1)) b.set(x + 1, y + 1, PX.char1);
      }
    }
    // Teeth of rock hanging from the roof of the opening.
    for (let s = 0; s < 4; s++){
      const tx = cx - rw * 0.6 + s * rw * 0.4 + (h3(s, v, 7) - 0.5) * 6, len = 5 + h3(s, v, 9) * 7;
      let top = 0; for (let y = 0; y < base; y++) if (inside(Math.round(tx), y)){ top = y; break; }
      for (let y = 0; y < len; y++) for (let x = -3; x <= 3; x++) if (Math.abs(x) <= 3 * (1 - y / len)) b.set(Math.round(tx + x), top + y, x < 0 ? PX.dust3 : PX.dust1);
    }
    cv = b.canvas(); caveCache.set(v, cv);
    return cv;
  }

  G.Structures = {
    // True when tile i belongs to a house drawn here (its tile art is left as grass).
    houseAt(grd, i){ return houses(grd).of[i] >= 0; },
    // Draws the structures reaching into the chunk of ct × ct tiles at tile (x0, y0).
    paintChunk(ctx, grd, x0, y0, ct){
      const T = G.CONFIG.TILE, k = ids(), cols = grd.cols, tiles = grd.tiles, Hs = houses(grd), smooth = ctx.imageSmoothingEnabled;
      const P = G.PixelArt;
      ctx.save(); ctx.translate(-x0 * T, -y0 * T);
      ctx.imageSmoothingEnabled = P.shrinks(ctx, T, 96);
      // Bridges: shadows on the water, then the decks.
      const Bw = bridges(grd), br = [];
      for (let y = Math.max(0, y0 - 1); y < Math.min(grd.rows, y0 + ct + 1); y++) for (let x = Math.max(0, x0 - 1); x < Math.min(cols, x0 + ct + 1); x++) if (tiles[y * cols + x] === k.bridge) br.push([x, y]);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      for (const [x, y] of br) ctx.fillRect(x * T + 5, y * T + 5, T, T);
      for (const [x, y] of br){
        const ew = Bw.get(y * cols + x), is = (dx, dy) => grd.inBounds(x + dx, y + dy) && tiles[(y + dy) * cols + x + dx] === k.bridge;
        // Rails along the sides with no deck beyond; posts where a rail stops.
        const r1 = ew ? !is(0, -1) : !is(-1, 0), r2 = ew ? !is(0, 1) : !is(1, 0);
        const back = ew ? [-1, 0] : [0, -1], fwd = ew ? [1, 0] : [0, 1];
        const railAt = (d, side) => is(d[0], d[1]) && (side === 1 ? (ew ? !is(d[0], d[1] - 1) : !is(d[0] - 1, d[1])) : (ew ? !is(d[0], d[1] + 1) : !is(d[0] + 1, d[1])));
        let rails = (r1 ? 1 : 0) | (r2 ? 2 : 0);
        if ((r1 && !railAt(back, 1)) || (r2 && !railAt(back, 2))) rails |= 4;
        if ((r1 && !railAt(fwd, 1)) || (r2 && !railAt(fwd, 2))) rails |= 8;
        ctx.drawImage(deck(ew, rails, Math.floor(G.hashRandom3(x, y, 17) * 4)), x * T, y * T, T, T);
      }
      // Houses overlapping this chunk.
      for (const H of Hs.list){
        if (H.x + H.w < x0 - 1 || H.y + H.h < y0 - 1 || H.x > x0 + ct || H.y > y0 + ct) continue;
        if (!H.cv) H.cv = H.intact ? roof(H, grd) : ruin(H, grd, Hs.of);
        ctx.drawImage(H.cv, H.x * T - PAD, H.y * T - PAD, H.cv.width / 2, H.cv.height / 2);
      }
      // Cave mouths.
      for (let y = Math.max(0, y0 - 1); y < Math.min(grd.rows, y0 + ct); y++) for (let x = Math.max(0, x0); x < Math.min(cols, x0 + ct); x++)
        if (tiles[y * cols + x] === k.cave) ctx.drawImage(cave(Math.floor(G.hashRandom3(x, y, 19) * 3)), x * T, y * T, T, T * 1.5);
      ctx.imageSmoothingEnabled = smooth;
      ctx.restore();
    }
  };
})();
