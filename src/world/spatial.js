/* Uniform spatial hash with numeric cell keys and pooled buckets. Rebuilt every tick;
   queries write into a caller-supplied array so hot loops do not allocate. */
(function(){
  'use strict';
  const G = GW;

  class SpatialHash {
    constructor(cellSize = G.CONFIG.SPATIAL_CELL){
      this.size = cellSize;
      this.inv = 1 / cellSize;
      this.cells = new Map();
      this.pool = [];
      this.count = 0;
    }
    key(cx, cy){ return (cx + 32768) * 65536 + (cy + 32768); }
    clear(){
      for (const bucket of this.cells.values()){ bucket.length = 0; this.pool.push(bucket); }
      this.cells.clear();
      this.count = 0;
    }
    insert(o){
      const k = this.key(Math.floor(o.x * this.inv), Math.floor(o.y * this.inv));
      let b = this.cells.get(k);
      if (!b){ b = this.pool.pop() || []; this.cells.set(k, b); }
      b.push(o); this.count++;
    }
    rebuild(list, filter){
      this.clear();
      for (const o of list) if (o.hp > 0 && (!filter || filter(o))) this.insert(o);
    }
    // Candidates whose cell overlaps the circle; callers do the exact distance test.
    query(x, y, r, out = []){
      out.length = 0;
      const inv = this.inv, x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv),
            y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++){
        const b = this.cells.get(this.key(cx, cy));
        if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
      return out;
    }
    // Nearest object within r that passes `accept`, or null.
    nearest(x, y, r, accept){
      const inv = this.inv, r2 = r * r;
      const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv), y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
      let best = null, bd = r2;
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++){
        const b = this.cells.get(this.key(cx, cy));
        if (!b) continue;
        for (let i = 0; i < b.length; i++){
          const o = b[i], dx = o.x - x, dy = o.y - y, d = dx * dx + dy * dy;
          if (d <= bd && (!accept || accept(o))){ bd = d; best = o; }
        }
      }
      return best;
    }
  }
  G.SpatialHash = SpatialHash;

  // Dense uniform grid over the whole world: per-cell linked lists in typed arrays, rebuilt
  // every tick. No hashing and no per-query allocation, so neighbour loops in very dense
  // crowds (collision separation) stay cheap. Same query / nearest API as SpatialHash.
  class DenseGrid {
    constructor(worldW, worldH, cellSize){
      this.size = cellSize; this.inv = 1 / cellSize;
      this.cols = Math.ceil(worldW / cellSize); this.rows = Math.ceil(worldH / cellSize);
      this.head = new Int32Array(this.cols * this.rows).fill(-1);
      this.next = new Int32Array(1024);
      this.items = [];
      this.count = 0;
    }
    cellOf(x, y){
      const cx = Math.min(this.cols - 1, Math.max(0, (x * this.inv) | 0)), cy = Math.min(this.rows - 1, Math.max(0, (y * this.inv) | 0));
      return cy * this.cols + cx;
    }
    clear(){ this.head.fill(-1); this.items.length = 0; this.count = 0; }
    insert(o){
      const i = this.items.length;
      if (i >= this.next.length){ const n = new Int32Array(this.next.length * 2); n.set(this.next); this.next = n; }
      this.items.push(o);
      const c = this.cellOf(o.x, o.y);
      this.next[i] = this.head[c]; this.head[c] = i;
      this.count++;
    }
    rebuild(list, filter){
      this.clear();
      for (const o of list) if (o.hp > 0 && (!filter || filter(o))) this.insert(o);
    }
    // Calls fn(obj) for every object in cells overlapping the circle (no distance test).
    each(x, y, r, fn){
      const inv = this.inv, x0 = Math.max(0, ((x - r) * inv) | 0), x1 = Math.min(this.cols - 1, ((x + r) * inv) | 0);
      const y0 = Math.max(0, ((y - r) * inv) | 0), y1 = Math.min(this.rows - 1, ((y + r) * inv) | 0);
      const head = this.head, next = this.next, items = this.items;
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++){
        for (let i = head[cy * this.cols + cx]; i !== -1; i = next[i]) fn(items[i]);
      }
    }
    query(x, y, r, out = []){ out.length = 0; this.each(x, y, r, o => out.push(o)); return out; }
    nearest(x, y, r, accept){
      if (!this.count) return null;
      const inv = this.inv, x0 = Math.max(0, ((x - r) * inv) | 0), x1 = Math.min(this.cols - 1, ((x + r) * inv) | 0);
      const y0 = Math.max(0, ((y - r) * inv) | 0), y1 = Math.min(this.rows - 1, ((y + r) * inv) | 0);
      const head = this.head, next = this.next, items = this.items;
      let best = null, bd = r * r;
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++){
        for (let i = head[cy * this.cols + cx]; i !== -1; i = next[i]){
          const o = items[i], dx = o.x - x, dy = o.y - y, d = dx * dx + dy * dy;
          if (d <= bd && (!accept || accept(o))){ bd = d; best = o; }
        }
      }
      return best;
    }
  }
  G.DenseGrid = DenseGrid;
  G.teamGrid = () => new DenseGrid(G.CONFIG.WORLD_W, G.CONFIG.WORLD_H, G.CONFIG.TARGET_CELL);
})();
