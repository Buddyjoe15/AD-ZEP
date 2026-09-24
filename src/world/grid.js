/* World grid: terrain ids, cached passability, structure occupancy and connectivity regions.
   passable() is O(1): terrain passability is baked into a lookup table and structures
   stamp an occupancy counter when placed or removed. Regions (4-connected components of
   passable tiles) let the pathfinder reject unreachable goals without searching the map. */
(function(){
  'use strict';
  const G = GW;

  class Grid {
    constructor(cols, rows){
      this.cols = cols; this.rows = rows; this.size = cols * rows;
      this.tiles = new Uint8Array(this.size);
      this.occ = new Uint16Array(this.size);          // solid structures covering the tile
      this.region = new Int32Array(this.size);        // 0 = impassable, otherwise component id
      this.regionsDirty = true;
      this.version = 0;                                // bumps on any passability change
      const T = G.Defs.terrain.all();
      this.solidTerrain = new Uint8Array(256).fill(1);
      this.costTable = new Float32Array(256).fill(1);
      this.speedTable = new Float32Array(256).fill(1);
      for (const t of T){
        this.solidTerrain[t.id] = t.passable ? 0 : 1;
        this.costTable[t.id] = t.moveCost;
        this.speedTable[t.id] = t.speed;
      }
    }
    idx(x, y){ return y * this.cols + x; }
    inBounds(x, y){ return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
    get(x, y){ return this.inBounds(x, y) ? this.tiles[y * this.cols + x] : 3; }
    set(x, y, t){ if (this.inBounds(x, y)){ this.tiles[y * this.cols + x] = t; this.touch(); } }
    // Bulk terrain writes skip the per-call version bump; call touch() afterwards.
    setRaw(x, y, t){ if (this.inBounds(x, y)) this.tiles[y * this.cols + x] = t; }
    touch(){ this.regionsDirty = true; this.version++; }
    passable(x, y){
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
      const i = y * this.cols + x;
      return this.solidTerrain[this.tiles[i]] === 0 && this.occ[i] === 0;
    }
    passableIdx(i){ return this.solidTerrain[this.tiles[i]] === 0 && this.occ[i] === 0; }
    terrainPassable(x, y){ return this.inBounds(x, y) && this.solidTerrain[this.tiles[y * this.cols + x]] === 0; }
    moveCostIdx(i){ return this.costTable[this.tiles[i]]; }
    speedAt(wx, wy){
      const T = G.CONFIG.TILE, x = Math.floor(wx / T), y = Math.floor(wy / T);
      return this.inBounds(x, y) ? this.speedTable[this.tiles[y * this.cols + x]] : 1;
    }
    passableWorld(wx, wy){ const T = G.CONFIG.TILE; return this.passable(Math.floor(wx / T), Math.floor(wy / T)); }

    // Structures stamp +1 when placed and -1 when removed.
    stamp(gx, gy, w, h, delta){
      for (let y = gy; y < gy + h; y++) for (let x = gx; x < gx + w; x++){
        if (!this.inBounds(x, y)) continue;
        const i = y * this.cols + x;
        this.occ[i] = Math.max(0, this.occ[i] + delta);
      }
      this.touch();
    }
    fill(x0, y0, w, h, t){
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.setRaw(x, y, t);
      this.touch();
    }

    // 4-connected flood fill. Diagonal steps require both orthogonal neighbours to be open,
    // so 4-connectivity is exactly the reachability of the 8-direction pathfinder.
    rebuildRegions(){
      const { cols, rows, size, region } = this;
      region.fill(0);
      const stack = new Int32Array(size);
      let id = 0;
      for (let s = 0; s < size; s++){
        if (region[s] || !this.passableIdx(s)) continue;
        id++;
        let top = 0; stack[top++] = s; region[s] = id;
        while (top){
          const i = stack[--top], x = i % cols, y = (i / cols) | 0;
          if (x > 0){ const n = i - 1; if (!region[n] && this.passableIdx(n)){ region[n] = id; stack[top++] = n; } }
          if (x < cols - 1){ const n = i + 1; if (!region[n] && this.passableIdx(n)){ region[n] = id; stack[top++] = n; } }
          if (y > 0){ const n = i - cols; if (!region[n] && this.passableIdx(n)){ region[n] = id; stack[top++] = n; } }
          if (y < rows - 1){ const n = i + cols; if (!region[n] && this.passableIdx(n)){ region[n] = id; stack[top++] = n; } }
        }
      }
      this.regionCount = id;
      this.regionsDirty = false;
    }
    regionAt(x, y){
      if (!this.inBounds(x, y)) return 0;
      if (this.regionsDirty) this.rebuildRegions();
      return this.region[y * this.cols + x];
    }
    reachable(ax, ay, bx, by){
      const r = this.regionAt(ax, ay);
      return r !== 0 && r === this.regionAt(bx, by);
    }

    // Nearest passable tile to (x, y) whose region is `region` (any region when 0).
    // Rings outward, so the first hit is the closest by Chebyshev distance.
    nearestOpen(x, y, maxR = 18, region = 0){
      if (this.regionsDirty) this.rebuildRegions();
      const ok = (px, py) => this.passable(px, py) && (!region || this.region[py * this.cols + px] === region);
      if (ok(x, y)) return { x, y };
      for (let r = 1; r <= maxR; r++){
        let best = null, bd = Infinity;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const px = x + dx, py = y + dy;
          if (!ok(px, py)) continue;
          const d = dx * dx + dy * dy;
          if (d < bd){ bd = d; best = { x: px, y: py }; }
        }
        if (best) return best;
      }
      return null;
    }

    // Exact grid traversal (Amanatides & Woo). True when every tile the segment crosses is
    // passable and no diagonal corner between two blocked tiles is cut.
    lineClear(sx, sy, tx, ty){
      const T = G.CONFIG.TILE;
      let x = Math.floor(sx / T), y = Math.floor(sy / T);
      const ex = Math.floor(tx / T), ey = Math.floor(ty / T);
      if (!this.passable(x, y) || !this.passable(ex, ey)) return false;
      const dx = tx - sx, dy = ty - sy;
      const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
      const tDX = dx !== 0 ? Math.abs(T / dx) : Infinity, tDY = dy !== 0 ? Math.abs(T / dy) : Infinity;
      let tMX = dx !== 0 ? ((stepX > 0 ? (x + 1) * T - sx : sx - x * T) / Math.abs(dx)) : Infinity;
      let tMY = dy !== 0 ? ((stepY > 0 ? (y + 1) * T - sy : sy - y * T) / Math.abs(dy)) : Infinity;
      let guard = this.cols + this.rows + 4;
      while ((x !== ex || y !== ey) && guard-- > 0){
        if (Math.abs(tMX - tMY) < 1e-9){
          if (!this.passable(x + stepX, y) || !this.passable(x, y + stepY)) return false;
          x += stepX; y += stepY; tMX += tDX; tMY += tDY;
        } else if (tMX < tMY){ x += stepX; tMX += tDX; }
        else { y += stepY; tMY += tDY; }
        if (!this.passable(x, y)) return false;
      }
      return true;
    }
  }
  G.Grid = Grid;
})();
