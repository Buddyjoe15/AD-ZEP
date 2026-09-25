/* Terrain presentation: LRU caches of pre-rendered chunk canvases (1× or TERRAIN_RES for close
   zoom, a lower-resolution set for middle zoom) and a one-pixel-per-tile overview image for
   far zoom and the minimap. */
(function(){
  'use strict';
  const G = GW;
  const TT = G.TT;

  // Chunks are cached per resolution (canvas px per world px): 1 normally, TERRAIN_RES when
  // zoomed in past 1:1. `used` is the cache size in 1× chunks (a res-2 chunk costs 4).
  G.TerrainCache = {
    grid: null, chunks: new Map(), used: 0, farChunks: new Map(), overview: null, overviewDirty: true,
    reset(grid){ this.grid = grid; this.chunks.clear(); this.used = 0; this.farChunks.clear(); this.overview = null; this.overviewDirty = true; },
    sync(){ if (this.grid !== G.State.grid) this.reset(G.State.grid); },
    drop(key){ const cv = this.chunks.get(key); if (cv){ this.used -= cv.res * cv.res; this.chunks.delete(key); } },
    invalidate(rect){
      const ct = G.CONFIG.CHUNK_TILES, R = G.CONFIG.TERRAIN_RES;
      if (!rect){ this.chunks.clear(); this.used = 0; this.farChunks.clear(); this.overviewDirty = true; return; }
      for (let cy = Math.floor(rect.y / ct); cy <= Math.floor((rect.y + rect.h) / ct); cy++)
        for (let cx = Math.floor(rect.x / ct); cx <= Math.floor((rect.x + rect.w) / ct); cx++){
          this.drop(cx + ',' + cy + ',1');
          if (R !== 1) this.drop(cx + ',' + cy + ',' + R);
          this.farChunks.delete(cx + ',' + cy);
        }
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
    has(cx, cy, res = 1){ return res < 1 ? this.farChunks.has(cx + ',' + cy) : this.chunks.has(cx + ',' + cy + ',' + res); },
    // Cached chunk without painting or touching the LRU order (fallback while a chunk at
    // the wanted resolution is still queued).
    peek(cx, cy, res = 1){ return (res < 1 ? this.farChunks.get(cx + ',' + cy) : this.chunks.get(cx + ',' + cy + ',' + res)) || null; },
    chunk(cx, cy, res = 1){
      this.sync();
      if (res < 1){
        const key = cx + ',' + cy, hit = this.farChunks.get(key);
        if (hit){ this.farChunks.delete(key); this.farChunks.set(key, hit); return hit; }   // LRU touch
        const cv = this.paint(cx, cy, res);
        this.farChunks.set(key, cv);
        while (this.farChunks.size > G.CONFIG.FAR_CHUNK_CACHE_MAX) this.farChunks.delete(this.farChunks.keys().next().value);
        return cv;
      }
      const key = cx + ',' + cy + ',' + res;
      const hit = this.chunks.get(key);
      if (hit){ this.chunks.delete(key); this.chunks.set(key, hit); return hit; }   // LRU touch
      const cv = this.paint(cx, cy, res);
      this.chunks.set(key, cv); this.used += res * res;
      while (this.used > G.CONFIG.CHUNK_CACHE_MAX && this.chunks.size > 1) this.drop(this.chunks.keys().next().value);
      return cv;
    },
    // Paints in world px scaled by `res`, so the same art gains detail at higher res.
    paint(cx, cy, res = 1){
      const C = G.CONFIG, T = C.TILE, ct = C.CHUNK_TILES, size = ct * T, grid = this.grid, low = res < 1;
      const cv = document.createElement('canvas'); cv.width = Math.round(size * res); cv.height = Math.round(size * res); cv.res = res;
      const g = cv.getContext('2d'), r = G.RNG(G.State.seed + cx * 13007 + cy * 9011);
      g.scale(res, res);
      const P = G.PixelArt, dust = P.enabled ? P.dustIds() : null, WA = G.WoodlandsArt;
      g.imageSmoothingEnabled = false;
      // A Woodlands map draws every tile in its own style, with height and ground detail.
      if (WA.isWoodlands(grid)){ WA.paintChunk(g, grid, cx * ct, cy * ct, ct, T, { trees: !!low }); return cv; }
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
      WA.paintTops(g, grid, cx * ct, cy * ct, ct, T, false);
      return cv;
    }
  };

  G.Events.on('world:created', () => G.TerrainCache.reset(G.State.grid));
  G.Events.on('terrain:changed', rect => G.TerrainCache.invalidate(rect));
})();
