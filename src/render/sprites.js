/* Sprite atlas shared by both unit renderers. Each visual / team / animation frame is
   painted once from the Canvas 2D art in visuals.js into an atlas canvas; the WebGL
   renderer uploads it as a texture and the Canvas 2D fallback stamps it with drawImage.
   Stamping pre-drawn sprites costs one or two calls per unit instead of ~10 path commands. */
(function(){
  'use strict';
  const G = GW;
  // Atlas cell: a 128×128 world-px box around the unit, stored at 2 px per world px.
  const BOX = 128, RES = 2, CELL = BOX * RES, ATLAS_W = 2048, PER_ROW = ATLAS_W / CELL;
  const ORIGIN_X = 64, ORIGIN_Y = 76;   // unit position inside the box (tall art reaches up)

  G.SpriteAtlas = {
    RES, CELL,
    canvas: null, g: null, cells: new Map(), byDef: new Map(), next: 0,
    version: 0,   // bumps whenever new art is added (the GPU re-uploads)
    ensureCanvas(){
      if (this.canvas) return;
      this.canvas = document.createElement('canvas');
      this.canvas.width = ATLAS_W; this.canvas.height = CELL;
      this.g = this.canvas.getContext('2d', { willReadFrequently: true });
    },
    cellX(idx){ return (idx % PER_ROW) * CELL; },
    cellY(idx){ return Math.floor(idx / PER_ROW) * CELL; },
    // Cached entry per unit definition and team (no per-unit string keys per frame).
    entryFor(def, team){
      let byTeam = this.byDef.get(def);
      if (!byTeam) this.byDef.set(def, byTeam = {});
      return byTeam[team] || (byTeam[team] = this.entry(def, team));
    },
    // Downscaled copies of the atlas (level 1 = half, 2 = quarter size) so Canvas 2D can
    // stamp sprites close to 1:1 when zoomed out; resampling a large image down to a tiny
    // one is expensive, especially where the canvas is rasterised in software.
    level(n){
      if (!n) return this.canvas;
      const L = this.levels || (this.levels = []);
      let c = L[n];
      if (!c || c.version !== this.version){
        const src = this.level(n - 1);
        c = L[n] = L[n] || document.createElement('canvas');
        c.width = src.width / 2; c.height = src.height / 2;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.clearRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
        c.version = this.version;
      }
      return c;
    },
    // Current animation frame (atlas cell index) for unit `u` at time `t`.
    frame(e, u, t){
      const frames = u.path.length && e.move.length ? e.move : e.idle;
      return frames.length > 1 ? frames[Math.floor(((t + u.id * 0.37) / e.period) * frames.length) % frames.length] : frames[0];
    },
    // Atlas entry for a visual + team: { idle: [cells], move: [cells], period }.
    entry(def, team){
      this.ensureCanvas();
      const key = def.visual + '|' + team, A = this;
      let e = A.cells.get(key);
      if (e) return e;
      const V = G.Visuals, fn = V.units[def.visual] || V.units.generic, anim = V.frames[def.visual] || { idle: 1, move: 1, period: 1 };
      e = { idle: [], move: [], period: anim.period, upright: !!fn.upright, frames: [] };
      const render = (moving, t) => {
        const idx = A.next++, row = Math.floor(idx / PER_ROW);
        if ((row + 1) * CELL > A.canvas.height){
          // Grow the atlas, keeping what is already drawn.
          const old = A.canvas, grown = document.createElement('canvas');
          grown.width = ATLAS_W; grown.height = Math.min(8192, old.height * 2);
          const gg = grown.getContext('2d', { willReadFrequently: true });
          gg.drawImage(old, 0, 0);
          A.canvas = grown; A.g = gg;
        }
        const g = A.g, cx = (idx % PER_ROW) * CELL, cy = row * CELL;
        const fake = { id: 0, type: def.key, team, x: 0, y: 0, heading: 0, radius: def.radius, hp: 1, maxHp: 1,
          path: moving ? [{ x: 1, y: 0 }] : [], pathIndex: 0, cargo: {}, cargoCapacity: def.cargoCapacity || 1, isHero: false };
        g.save();
        g.clearRect(cx, cy, CELL, CELL);
        g.beginPath(); g.rect(cx, cy, CELL, CELL); g.clip();
        g.setTransform(RES, 0, 0, RES, cx + ORIGIN_X * RES, cy + ORIGIN_Y * RES);
        g.fillStyle = G.CONFIG.COLORS[team] || '#ccc';
        fn(g, fake, 1, t, def);
        g.restore();
        e.frames.push(idx);
        return idx;
      };
      for (let i = 0; i < anim.idle; i++) e.idle.push(render(false, i / anim.idle * anim.period));
      for (let i = 0; i < anim.move; i++) e.move.push(render(true, i / anim.move * anim.period));
      // Tight bounds of the painted pixels over all frames, so each quad covers the art only
      // (a 128×128 box around a 30 px robot would waste most of the GPU's fill rate).
      let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1;
      for (const idx of e.frames){
        const cx = (idx % PER_ROW) * CELL, cy = Math.floor(idx / PER_ROW) * CELL, px = A.g.getImageData(cx, cy, CELL, CELL).data;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (px[(y * CELL + x) * 4 + 3] > 4){
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0){ x0 = y0 = 0; x1 = y1 = 1; }
      x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(CELL - 1, x1 + 2); y1 = Math.min(CELL - 1, y1 + 2);
      e.px = { x: x0, y: y0 };
      e.rect = { x: x0 / RES - ORIGIN_X, y: y0 / RES - ORIGIN_Y, w: (x1 - x0 + 1) / RES, h: (y1 - y0 + 1) / RES };
      A.cells.set(key, e); A.version++;
      return e;
    },
  };
})();
