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
})();
