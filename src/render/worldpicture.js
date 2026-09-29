/* The whole map as one low-resolution picture (presentation only), painted once when a game
   starts, behind a loading bar, and kept up to date as the terrain changes. It is drawn under
   the detailed terrain chunks instead of the 1 px-per-tile overview, so wherever the camera
   goes (a jump across the map, a click on the minimap) the real landscape, trees, houses and
   all, is there at once, and the chunks only sharpen it.
   The map is painted in cells of CHUNK_TILES tiles, the same way as the chunks, at `res`
   world px per canvas px (128 canvas px a cell on a 512-tile map: 8 px a tile, about 64 MB),
   into blocks of BLOCK × BLOCK cells. Cells nearest the camera are painted first. */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math;
  const BLOCK = 8;               // cells a block side (a canvas of up to 1024 px)
  const MAX_PX = 4096;           // the whole picture at most this many px a side

  G.WorldPicture = {
    grid: null, res: 0, cellPx: 0, ncx: 0, ncy: 0, blocks: [], painted: null, count: 0, dirty: null,
    loading: false,
    reset(grid){
      const C = G.CONFIG, ct = C.CHUNK_TILES;
      this.grid = grid; this.blocks = []; this.count = 0; this.dirty = null;
      if (!grid) return;
      this.ncx = Math.ceil(grid.cols / ct); this.ncy = Math.ceil(grid.rows / ct);
      this.cellPx = Math.min(128, Math.floor(MAX_PX / Math.max(this.ncx, this.ncy)));
      this.res = this.cellPx / (ct * C.TILE);
      this.painted = new Uint8Array(this.ncx * this.ncy);
    },
    get done(){ return !!this.grid && this.count === this.ncx * this.ncy && !(this.dirty && this.dirty.size); },
    progress(){ return this.grid ? this.count / (this.ncx * this.ncy) : 0; },
    block(bx, by){
      const k = by * Math.ceil(this.ncx / BLOCK) + bx;
      let cv = this.blocks[k];
      if (!cv){
        cv = this.blocks[k] = document.createElement('canvas');
        cv.width = Math.min(BLOCK, this.ncx - bx * BLOCK) * this.cellPx; cv.height = Math.min(BLOCK, this.ncy - by * BLOCK) * this.cellPx;
      }
      return cv;
    },
    // Paints the next cells (nearest the camera first, then cells whose terrain changed)
    // until the clock passes `deadline`, at least one. True when the picture is complete.
    work(deadline){
      const TC = G.TerrainCache;
      if (!this.grid || this.grid !== TC.grid) this.reset(TC.grid);
      if (!this.grid) return true;
      if (this.done) return true;
      const C = G.CONFIG, S = G.State, cs = C.CHUNK_TILES * C.TILE, c = S.camera, R = G.Renderer;
      const mx = (c.x + (R.w || 0) / c.z / 2) / cs, my = (c.y + (R.h || 0) / c.z / 2) / cs;
      if (!this.order || this.order.mx !== Math.floor(mx) || this.order.my !== Math.floor(my)){
        // Cells still to paint, nearest first (sorted again when the camera moves a cell).
        const list = [];
        for (let y = 0; y < this.ncy; y++) for (let x = 0; x < this.ncx; x++) if (!this.painted[y * this.ncx + x]) list.push(y * this.ncx + x);
        const d = i => ((i % this.ncx) + 0.5 - mx) ** 2 + (((i / this.ncx) | 0) + 0.5 - my) ** 2;
        list.sort((a, b) => d(b) - d(a));   // (popped from the end)
        this.order = { mx: Math.floor(mx), my: Math.floor(my), list };
      }
      const list = this.order.list;
      do {
        let i;
        if (list.length) i = list.pop();
        else if (this.dirty && this.dirty.size){ i = this.dirty.values().next().value; this.dirty.delete(i); }
        else break;
        this.paintCell(i % this.ncx, (i / this.ncx) | 0);
      } while (performance.now() < deadline);
      return this.done;
    },
    paintCell(cx, cy){
      const TC = G.TerrainCache, i = cy * this.ncx + cx, cv = TC.paint(cx, cy, this.res, true);
      const b = this.block(Math.floor(cx / BLOCK), Math.floor(cy / BLOCK)), g = b.getContext('2d');
      g.drawImage(cv, (cx % BLOCK) * this.cellPx, (cy % BLOCK) * this.cellPx, this.cellPx, this.cellPx);
      if (!this.painted[i]){ this.painted[i] = 1; this.count++; }
    },
    // Tiles in `rect` changed (null: all of them): their cells are painted again (the old
    // picture stays until then).
    invalidate(rect){
      if (!this.grid) return;
      const ct = G.CONFIG.CHUNK_TILES;
      if (!rect){ this.reset(this.grid); this.order = null; return; }
      this.dirty = this.dirty || new Set();
      for (let y = Math.max(0, Math.floor(rect.y / ct)); y <= Math.min(this.ncy - 1, Math.floor((rect.y + rect.h) / ct)); y++)
        for (let x = Math.max(0, Math.floor(rect.x / ct)); x <= Math.min(this.ncx - 1, Math.floor((rect.x + rect.w) / ct)); x++){
          const i = y * this.ncx + x;
          if (this.painted[i]) this.dirty.add(i);   // (unpainted cells are still queued)
        }
    },
    // Draws the world rect (x, y, w, h) of the picture into (dx, dy, dw, dh) of `g`; parts not
    // yet painted are left clear.
    draw(g, x, y, w, h, dx, dy, dw, dh){
      if (!this.grid || !this.count) return;
      const bw = BLOCK * this.cellPx / this.res, sx = dw / w, sy = dh / h, nbx = Math.ceil(this.ncx / BLOCK);
      for (let by = Math.max(0, Math.floor(y / bw)); by * bw < y + h && by * BLOCK < this.ncy; by++)
        for (let bx = Math.max(0, Math.floor(x / bw)); bx * bw < x + w && bx * BLOCK < this.ncx; bx++){
          const cv = this.blocks[by * nbx + bx];
          if (!cv) continue;
          // The part of this block inside the rect, in world px, then in the block's px.
          const X0 = Math.max(x, bx * bw), Y0 = Math.max(y, by * bw), X1 = Math.min(x + w, bx * bw + cv.width / this.res), Y1 = Math.min(y + h, by * bw + cv.height / this.res);
          if (X1 <= X0 || Y1 <= Y0) continue;
          g.drawImage(cv, (X0 - bx * bw) * this.res, (Y0 - by * bw) * this.res, (X1 - X0) * this.res, (Y1 - Y0) * this.res,
            dx + (X0 - x) * sx, dy + (Y0 - y) * sy, (X1 - X0) * sx, (Y1 - Y0) * sy);
        }
    }
  };
  G.Events.on('world:created', () => { G.WorldPicture.reset(G.TerrainCache.grid); G.WorldPicture.order = null; });
})();
