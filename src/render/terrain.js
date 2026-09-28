/* Terrain presentation: LRU caches of pre-rendered chunk canvases and a one-pixel-per-tile
   overview image for far zoom and the minimap. Close up, chunks are painted at the screen's
   own resolution (1 to TERRAIN_RES_MAX canvas px per world px), so procedural detail (water,
   cliffs, ground texture) is drawn at full sharpness rather than stretched; middle zoom uses a
   lower-resolution set. */
(function(){
  'use strict';
  const G = GW;
  const TT = G.TT;

  // Chunks are cached per resolution (canvas px per world px): 1 normally, TERRAIN_RES when
  // zoomed in past 1:1. `used` is the cache size in 1× chunks (a res-2 chunk costs 4).
  // On maps with free-standing trees (G.TreeArt) a close chunk comes in two kinds: with the
  // trees drawn in at rest (`bake`, for middle zoom) or without (the trees are drawn live).
  // Chunks below 1× (middle zoom) always have the trees drawn in and live in farChunks.
  // Chunks at SUB_RES and above cover a quarter of the area (half the tiles each way), so each
  // costs about the same to paint and the cache can hold the view: (cx, cy) count in chunks of
  // their own size (tilesFor(res)).
  const key = (cx, cy, res, bake) => res < 1 ? 'f' + cx + ',' + cy + ',' + res : cx + ',' + cy + ',' + res + (bake ? ',t' : '');
  const tilesFor = res => res >= G.CONFIG.SUB_RES ? G.CONFIG.CHUNK_TILES / 2 : G.CONFIG.CHUNK_TILES;
  // Cache cost of a chunk, in full-size 1× chunks.
  const cost = res => res * res * (tilesFor(res) / G.CONFIG.CHUNK_TILES) ** 2;
  G.TerrainCache = {
    grid: null, chunks: new Map(), used: 0, farChunks: new Map(), overview: null, overviewDirty: true,
    // Keys of the chunks the view needs this frame (set by the renderer): never evicted.
    pin: new Set(), key, tilesFor, cost,
    reset(grid){ this.grid = grid; this.jobs.clear(); this.chunks.clear(); this.used = 0; this.farChunks.clear(); this.overview = null; this.overviewDirty = true; },
    sync(){ if (this.grid !== G.State.grid) this.reset(G.State.grid); },
    drop(key){ const cv = this.chunks.get(key); if (cv){ this.used -= cost(cv.res); this.chunks.delete(key); } },
    invalidate(rect){
      this.jobs.clear();   // (a half-painted chunk may be stale)
      if (!rect){ this.chunks.clear(); this.used = 0; this.farChunks.clear(); this.overviewDirty = true; return; }
      const C = G.CONFIG, hit = (k, ct) => { const [cx, cy] = k.replace(/^f/, '').split(',').map(Number); return cx * ct <= rect.x + rect.w && (cx + 1) * ct > rect.x && cy * ct <= rect.y + rect.h && (cy + 1) * ct > rect.y; };
      for (const k of [...this.chunks.keys()]) if (hit(k, tilesFor(+k.split(',')[2]))) this.drop(k);
      for (const k of [...this.farChunks.keys()]) if (hit(k, C.CHUNK_TILES)) this.farChunks.delete(k);
      this.overviewDirty = true;
    },
    getOverview(){
      this.sync();
      if (this.overview && !this.overviewDirty) return this.overview;
      const grid = this.grid, cv = this.overview || document.createElement('canvas');
      cv.width = grid.cols; cv.height = grid.rows;
      const g = cv.getContext('2d'), img = g.createImageData(grid.cols, grid.rows), lut = [];
      for (const t of G.Defs.terrain.all()) lut[t.id] = t.minimap;
      const WA = G.WoodlandsArt, wood = WA.isWoodlands(grid);
      if (G.PixelArt.enabled && !wood) for (const id of G.PixelArt.dustIds()) lut[id] = G.PixelArt.DUST_MINIMAP;
      for (let i = 0; i < grid.size; i++){
        const c = lut[grid.tiles[i]] || lut[0], p = i * 4, k = wood ? WA.overviewShade(grid, i) : 1;
        img.data[p] = c[0] * k; img.data[p + 1] = c[1] * k; img.data[p + 2] = c[2] * k; img.data[p + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.overview = cv; this.overviewDirty = false;
      return cv;
    },
    // `res` below 1 (FAR_CHUNK_SCALE) is the lower-resolution chunk used at middle zoom. Those
    // have their own cache, counted in chunks (FAR_CHUNK_CACHE_MAX), so they never push the
    // close-up chunks out.
    has(cx, cy, res = 1, bake = false){ return res < 1 ? this.farChunks.has(key(cx, cy, res)) : this.chunks.has(key(cx, cy, res, bake)); },
    // Cached chunk without painting or touching the LRU order (fallback while a chunk at
    // the wanted resolution is still queued).
    peek(cx, cy, res = 1, bake = false){ return (res < 1 ? this.farChunks.get(key(cx, cy, res)) : this.chunks.get(key(cx, cy, res, bake))) || null; },
    // Paints chunk (cx, cy) a band of tile rows at a time until the clock passes `deadline`
    // (always at least one band), picking up where the last call left off. Returns true once
    // the chunk is finished and cached. Woodlands maps only; others paint whole.
    jobs: new Map(),
    work(cx, cy, res, bake, deadline){
      this.sync();
      const k = key(cx, cy, res, bake), WA = G.WoodlandsArt;
      if (this.has(cx, cy, res, bake)) return true;
      if (!WA.isWoodlands(this.grid)){ this.chunk(cx, cy, res, bake); return true; }
      const C = G.CONFIG, T = C.TILE, ct = tilesFor(res), BAND = res >= 2 ? 1 : 2;   // tile rows per step
      let j = this.jobs.get(k);
      if (!j){ j = { cv: this.canvas(res, ct), row: 0 }; this.jobs.set(k, j); }
      const g = j.cv.getContext('2d');
      do {
        if (j.row < ct){ WA.paintChunk(g, this.grid, cx * ct, cy * ct, ct, T, { rows: [j.row, Math.min(ct, j.row + BAND)] }); j.row += BAND; }
        else {
          WA.paintChunk(g, this.grid, cx * ct, cy * ct, ct, T, { finish: true, trees: res < 1 || bake });
          this.jobs.delete(k);
          this.store(cx, cy, res, bake, j.cv);
          return true;
        }
      } while (performance.now() < deadline);
      return false;
    },
    // A blank chunk canvas at `res`, scaled to world px.
    canvas(res, ct){
      const T = G.CONFIG.TILE, size = ct * T, cv = document.createElement('canvas');
      cv.width = Math.round(size * res); cv.height = Math.round(size * res); cv.res = res;
      const g = cv.getContext('2d'), P = G.PixelArt;
      g.scale(res, res);
      g.imageSmoothingEnabled = !!(P.enabled && P.dustIds()) && P.shrinks(g, T, P.tileArt());
      return cv;
    },
    store(cx, cy, res, bake, cv){
      if (res < 1){
        const fk = key(cx, cy, res);
        this.farChunks.set(fk, cv);
        if (this.farChunks.size > G.CONFIG.FAR_CHUNK_CACHE_MAX) for (const old of [...this.farChunks.keys()]){
          if (this.farChunks.size <= G.CONFIG.FAR_CHUNK_CACHE_MAX) break;
          if (old !== fk && !this.pin.has(old)) this.farChunks.delete(old);
        }
        return cv;
      }
      const k = key(cx, cy, res, bake);
      this.chunks.set(k, cv); this.used += cost(res);
      // Oldest first, skipping what the view needs (the view never needs more than fits).
      if (this.used > G.CONFIG.CHUNK_CACHE_MAX) for (const old of [...this.chunks.keys()]){
        if (this.used <= G.CONFIG.CHUNK_CACHE_MAX) break;
        if (old !== k && !this.pin.has(old)) this.drop(old);
      }
      return cv;
    },
    chunk(cx, cy, res = 1, bake = false){
      this.sync();
      if (res < 1){
        const fk = key(cx, cy, res), hit = this.farChunks.get(fk);
        if (hit){ this.farChunks.delete(fk); this.farChunks.set(fk, hit); return hit; }   // LRU touch
        return this.store(cx, cy, res, bake, this.paint(cx, cy, res));
      }
      const k = key(cx, cy, res, bake);
      const hit = this.chunks.get(k);
      if (hit){ this.chunks.delete(k); this.chunks.set(k, hit); return hit; }   // LRU touch
      this.jobs.delete(k);
      return this.store(cx, cy, res, bake, this.paint(cx, cy, res, bake));
    },
    // Paints in world px scaled by `res`, so the same art gains detail at higher res.
    paint(cx, cy, res = 1, bake = false){
      const C = G.CONFIG, T = C.TILE, ct = tilesFor(res), size = ct * T, grid = this.grid, low = res < 1;
      const cv = document.createElement('canvas'); cv.width = Math.round(size * res); cv.height = Math.round(size * res); cv.res = res;
      const g = cv.getContext('2d'), r = G.RNG(G.State.seed + cx * 13007 + cy * 9011);
      g.scale(res, res);
      const P = G.PixelArt, dust = P.enabled ? P.dustIds() : null, WA = G.WoodlandsArt;
      g.imageSmoothingEnabled = !!dust && P.shrinks(g, T, P.tileArt());   // 96 px tiles average down in 1× chunks
      // A Woodlands map draws every tile in its own style, with height and ground detail.
      if (WA.isWoodlands(grid)){ WA.paintChunk(g, grid, cx * ct, cy * ct, ct, T, { trees: low || bake }); return cv; }
      for (let ly = 0; ly < ct; ly++) for (let lx = 0; lx < ct; lx++){
        const gx = cx * ct + lx, gy = cy * ct + ly;
        if (gx >= grid.cols || gy >= grid.rows) continue;
        const t = grid.get(gx, gy), px = lx * T, py = ly * T;
        if (t >= WA.FIRST_ID){ WA.paintTile(g, grid, t, gx, gy, px, py, T); continue; }   // Woodlands terrain painted in the editor
        if (dust && dust.has(t)){ g.drawImage(P.tile(gx, gy), px, py, T, T); continue; }   // pixel-art dust plain
        if (t === TT.PATH){
          g.fillStyle = '#73654a'; g.fillRect(px, py, T, T);
          g.fillStyle = '#8a7a58'; for (let k = 0; k < 4; k++) g.fillRect(px + 5 + r() * (T - 10), py + 5 + r() * (T - 10), 2 + r() * 3, 1 + r() * 2);
        } else if (t === TT.BRIDGE){
          g.fillStyle = '#5a4630'; g.fillRect(px, py, T, T);
          g.strokeStyle = '#8d714c'; g.lineWidth = 3; for (let k = 6; k < T; k += 9){ g.beginPath(); g.moveTo(px, py + k); g.lineTo(px + T, py + k); g.stroke(); }
          g.strokeStyle = '#3e3023'; g.lineWidth = 2; g.strokeRect(px + 2, py + 2, T - 4, T - 4);
        } else if (t === TT.WATER){
          g.fillStyle = '#2e6578'; g.fillRect(px, py, T, T);
          g.strokeStyle = 'rgba(143,195,205,.34)'; g.lineWidth = 2;
          for (let k = 0; k < 2; k++){ g.beginPath(); g.moveTo(px + 5, py + 13 + k * 16 + r() * 4); g.bezierCurveTo(px + 16, py + 8 + k * 16, px + 28, py + 19 + k * 16, px + 43, py + 12 + k * 16); g.stroke(); }
        } else if (t === TT.ROCK){
          g.fillStyle = '#4c5348'; g.fillRect(px, py, T, T);
          g.fillStyle = '#656b60'; g.beginPath(); g.moveTo(px + 5, py + 40); g.lineTo(px + 20, py + 8); g.lineTo(px + 42, py + 35); g.lineTo(px + 35, py + 44); g.closePath(); g.fill();
          g.fillStyle = '#7a8074'; g.beginPath(); g.arc(px + 22, py + 18, 6, 0, Math.PI * 2); g.fill();
        } else if (t === TT.TREE){
          g.fillStyle = '#29492e'; g.fillRect(px, py, T, T);
          g.fillStyle = '#4a3524'; g.fillRect(px + 21, py + 25, 6, 16);
          g.fillStyle = '#17341f'; g.beginPath(); g.arc(px + 24, py + 18, 18, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#23502d'; g.beginPath(); g.arc(px + 18, py + 16, 12, 0, Math.PI * 2); g.arc(px + 31, py + 17, 11, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(135,164,103,.16)'; g.beginPath(); g.arc(px + 17, py + 12, 6, 0, Math.PI * 2); g.fill();
        } else if (t === TT.FOREST){
          g.fillStyle = (gx + gy) % 2 ? '#344f36' : '#36543a'; g.fillRect(px, py, T, T);
          g.fillStyle = '#263f29'; for (let k = 0; k < 3; k++){ g.beginPath(); g.arc(px + 7 + r() * 34, py + 8 + r() * 32, 3 + r() * 5, 0, Math.PI * 2); g.fill(); }
        } else if (t === TT.BUSH){
          g.fillStyle = '#4e6844'; g.fillRect(px, py, T, T);
          g.fillStyle = '#29492e'; for (let k = 0; k < 5; k++){ g.beginPath(); g.arc(px + 8 + r() * 32, py + 10 + r() * 28, 5 + r() * 5, 0, Math.PI * 2); g.fill(); }
        } else if (t === TT.FLOOR){
          g.fillStyle = '#806e52'; g.fillRect(px, py, T, T);
          g.strokeStyle = 'rgba(40,28,18,.22)'; g.lineWidth = 1; for (let k = 8; k < T; k += 12){ g.beginPath(); g.moveTo(px, py + k); g.lineTo(px + T, py + k); g.stroke(); }
        } else if (t === TT.WALL){
          g.fillStyle = '#5e5140'; g.fillRect(px, py, T, T);
          g.fillStyle = '#796650'; g.fillRect(px + 4, py + 4, T - 8, T - 8);
        } else if (t === TT.DOOR){
          g.fillStyle = '#806e52'; g.fillRect(px, py, T, T);
          g.fillStyle = '#3d2d20'; g.fillRect(px + 11, py + 4, T - 22, T - 5);
          g.fillStyle = '#c99d55'; g.fillRect(px + 31, py + 24, 3, 3);
        } else {
          const clearing = t === TT.CLEARING;
          g.fillStyle = clearing ? ((gx + gy) % 2 ? '#596e49' : '#5c714b') : ((gx + gy) % 2 ? '#496443' : '#4d6846'); g.fillRect(px, py, T, T);
          if (r() < 0.17){ g.fillStyle = clearing ? '#71805a' : '#607453'; g.fillRect(px + 5 + r() * 38, py + 5 + r() * 38, 2, 2); }
          if (r() < 0.06){ g.strokeStyle = '#758761'; g.lineWidth = 1; g.beginPath(); const ax = px + 8 + r() * 32, ay = py + 10 + r() * 28; g.moveTo(ax, ay + 4); g.lineTo(ax - 2, ay); g.moveTo(ax, ay + 4); g.lineTo(ax + 2, ay); g.stroke(); }
        }
      }
      if (G.TreeFX) G.TreeFX.paintScorch(g, cx * size, cy * size, size);   // blast marks
      WA.paintTops(g, grid, cx * ct, cy * ct, ct, T, false);
      return cv;
    }
  };

  G.Events.on('world:created', () => G.TerrainCache.reset(G.State.grid));
  G.Events.on('terrain:changed', rect => G.TerrainCache.invalidate(rect));
})();
