/* Sprite atlas shared by both unit renderers. Each visual / team / animation frame is
   painted once into an atlas canvas; the WebGL renderer uploads it as a texture and the
   Canvas 2D fallback stamps it with drawImage. Stamping pre-drawn sprites costs one or two
   calls per unit instead of ~10 path commands.
   Two kinds of entry share the atlas:
   - Canvas art from visuals.js, one 512 px cell per frame at 4 atlas px per world px,
     rotated to the unit's heading when drawn.
   - Pixel art (pixelart.js), 128 px slots at 2 atlas px per art px, one frame per facing
     and animation step; never rotated, the facing is picked from the heading instead. */
(function(){
  'use strict';
  const G = GW;
  // Atlas cell: a 128×128 world-px box around the unit, stored at 4 px per world px so
  // Canvas art stays sharp at maximum zoom on high-DPI screens.
  const BOX = 128, RES = 4, CELL = BOX * RES, ATLAS_W = 4096, PER_ROW = ATLAS_W / CELL;
  const ORIGIN_X = 64, ORIGIN_Y = 76;   // unit position inside the box (tall art reaches up)
  // Pixel art: 2 atlas px per art px (1 art px = 1 world px), so the half-size atlas level
  // the Canvas 2D fallback uses around zoom 1 still keeps every art pixel. A slot holds
  // frames up to 64 art px (the 49×49 Spider and Vance).
  const SLOT = 128, SLOTS_PER_CELL = (CELL / SLOT) ** 2, PIXEL_RES = 2;   // pixel art: atlas px per art px

  G.SpriteAtlas = {
    RES, CELL,
    canvas: null, g: null, cells: new Map(), byDef: new Map(), next: 0, slotCell: -1, slotNext: SLOTS_PER_CELL,
    version: 0,   // bumps whenever new art is added (the GPU re-uploads)
    ensureCanvas(){
      if (this.canvas) return;
      this.canvas = document.createElement('canvas');
      this.canvas.width = ATLAS_W; this.canvas.height = CELL;
      this.g = this.canvas.getContext('2d', { willReadFrequently: true });
    },
    // Drops every entry (used when the art style changes).
    reset(){
      this.cells.clear(); this.byDef.clear(); this.next = 0; this.slotCell = -1; this.slotNext = SLOTS_PER_CELL;
      if (this.canvas){ this.canvas.height = CELL; this.g = this.canvas.getContext('2d', { willReadFrequently: true }); }
      this.version++;
    },
    cellX(idx){ return (idx % PER_ROW) * CELL; },
    cellY(idx){ return Math.floor(idx / PER_ROW) * CELL; },
    // Next free cell, growing the atlas (and keeping what is already drawn) when full.
    allocCell(){
      const idx = this.next++, row = Math.floor(idx / PER_ROW);
      if ((row + 1) * CELL > this.canvas.height){
        // One row at a time: rows are large at this resolution, so doubling would waste memory.
        const old = this.canvas, grown = document.createElement('canvas');
        grown.width = ATLAS_W; grown.height = Math.min(8192, (row + 1) * CELL);
        const gg = grown.getContext('2d', { willReadFrequently: true });
        gg.drawImage(old, 0, 0);
        this.canvas = grown; this.g = gg;
      }
      return idx;
    },
    allocSlot(){
      if (this.slotNext >= SLOTS_PER_CELL){ this.slotCell = this.allocCell(); this.slotNext = 0; }
      const s = this.slotNext++, per = CELL / SLOT;
      return [this.cellX(this.slotCell) + (s % per) * SLOT, this.cellY(this.slotCell) + Math.floor(s / per) * SLOT];
    },
    // Cached entry per unit definition and team (no per-unit string keys per frame).
    entryFor(def, team){
      let byTeam = this.byDef.get(def);
      if (!byTeam) this.byDef.set(def, byTeam = {});
      return byTeam[team] || (byTeam[team] = this.entry(def, team));
    },
    // Downscaled copies of the atlas (level 1 = half, 2 = quarter size) so Canvas 2D can
    // stamp sprites close to 1:1 when zoomed out; resampling a large image down to a tiny
    // one is expensive, especially where the canvas is rasterised in software. With pixel
    // art on they are point-sampled (every other pixel), not smoothed, so sprites stay crisp;
    // the GPU uses the same copies as its mipmaps.
    level(n){
      if (!n) return this.canvas;
      const L = this.levels || (this.levels = []);
      let c = L[n];
      if (!c || c.version !== this.version){
        const src = this.level(n - 1);
        c = L[n] = L[n] || document.createElement('canvas');
        c.width = Math.max(1, src.width >> 1); c.height = Math.max(1, src.height >> 1);
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = !G.PixelArt.enabled;
        g.imageSmoothingQuality = 'high';
        g.clearRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
        c.version = this.version;
      }
      return c;
    },
    // Black silhouettes of a level, for engine-drawn shadows in Canvas 2D.
    silhouette(n){
      const L = this.shadows || (this.shadows = []);
      let c = L[n];
      if (!c || c.version !== this.version){
        const src = this.level(n);
        c = L[n] = L[n] || document.createElement('canvas');
        c.width = src.width; c.height = src.height;
        const g = c.getContext('2d');
        g.globalCompositeOperation = 'copy'; g.drawImage(src, 0, 0);
        g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
        c.version = this.version;
      }
      return c;
    },
    // Current animation frame (an index into e.at) for unit `u` at time `t`.
    frame(e, u, t){
      if (e.pixel){
        const a = G.PixelArt.anim(e.anims, u), step = a.frames > 1 ? Math.floor((t + u.id * 0.37) * a.fps) % a.frames : 0;
        return e.facings[G.PixelArt.facing(u.heading)][a.start + step];
      }
      const frames = u.path.length && e.move.length ? e.move : e.idle;
      return frames.length > 1 ? frames[Math.floor(((t + u.id * 0.37) / e.period) * frames.length) % frames.length] : frames[0];
    },
    // Atlas entry for a visual + team. Every entry has `at` (atlas px of each frame's
    // top-left), `scale` (atlas px per world px), `rect` (art bounds around the unit, world
    // px), `upright`, and `shadow` (world px offset, or null when the art has its own).
    entry(def, team){
      this.ensureCanvas();
      const sprite = G.PixelArt.unitSprite(def);
      if (sprite) return this.pixelEntry(sprite, team);
      const key = def.visual + '|' + team, A = this;
      let e = A.cells.get(key);
      if (e) return e;
      const V = G.Visuals, fn = V.units[def.visual] || V.units.generic, anim = V.frames[def.visual] || { idle: 1, move: 1, period: 1 };
      e = { idle: [], move: [], period: anim.period, upright: !!fn.upright, cellIdx: [], at: [], scale: RES, shadow: null };
      const render = (moving, t) => {
        const idx = A.allocCell(), g = A.g, cx = A.cellX(idx), cy = A.cellY(idx);
        const fake = { id: 0, type: def.key, team, x: 0, y: 0, heading: 0, radius: def.radius, hp: 1, maxHp: 1,
          path: moving ? [{ x: 1, y: 0 }] : [], pathIndex: 0, cargo: {}, cargoCapacity: def.cargoCapacity || 1, isHero: false };
        g.save();
        g.clearRect(cx, cy, CELL, CELL);
        g.beginPath(); g.rect(cx, cy, CELL, CELL); g.clip();
        g.setTransform(RES, 0, 0, RES, cx + ORIGIN_X * RES, cy + ORIGIN_Y * RES);
        g.fillStyle = G.CONFIG.COLORS[team] || '#ccc';
        fn(g, fake, 1, t, def);
        g.restore();
        e.cellIdx.push(idx);
        return e.cellIdx.length - 1;
      };
      for (let i = 0; i < anim.idle; i++) e.idle.push(render(false, i / anim.idle * anim.period));
      for (let i = 0; i < anim.move; i++) e.move.push(render(true, i / anim.move * anim.period));
      // Tight bounds of the painted pixels over all frames, so each quad covers the art only
      // (a 128×128 box around a 30 px robot would waste most of the GPU's fill rate).
      let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1;
      for (const idx of e.cellIdx){
        const px = A.g.getImageData(A.cellX(idx), A.cellY(idx), CELL, CELL).data;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (px[(y * CELL + x) * 4 + 3] > 4){
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0){ x0 = y0 = 0; x1 = y1 = 1; }
      x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(CELL - 1, x1 + 2); y1 = Math.min(CELL - 1, y1 + 2);
      e.at = e.cellIdx.map(idx => [A.cellX(idx) + x0, A.cellY(idx) + y0]);
      e.rect = { x: x0 / RES - ORIGIN_X, y: y0 / RES - ORIGIN_Y, w: (x1 - x0 + 1) / RES, h: (y1 - y0 + 1) / RES };
      A.cells.set(key, e); A.version++;
      return e;
    },
    // Pixel-art entry: every facing × animation frame of `sprite` in the team's colours.
    pixelEntry(sprite, team){
      const key = 'px:' + sprite + '|' + team, A = this;
      let e = A.cells.get(key);
      if (e) return e;
      const P = G.PixelArt, sp = P.sprite(sprite), k = P.worldPerArt(), w = sp.frameWidth, h = sp.frameHeight;
      const pad = [Math.floor((SLOT - w * PIXEL_RES) / 2), Math.floor((SLOT - h * PIXEL_RES) / 2)];
      e = { pixel: true, upright: true, anims: sp.animations, facings: [], at: [], scale: PIXEL_RES / k,
        shadow: sp.shadow.offset.map(v => v * k),
        rect: { x: -(sp.origin[0] + 0.5) * k, y: -(sp.origin[1] + 0.5) * k, w: w * k, h: h * k } };
      for (const row of sp.frames){
        const list = [];
        for (const str of row){
          const [sx, sy] = A.allocSlot(), x = sx + pad[0], y = sy + pad[1], g = A.g;   // (the atlas may have grown)
          g.imageSmoothingEnabled = false;
          g.clearRect(sx, sy, SLOT, SLOT);
          g.drawImage(P.canvas(str, w, h, team), x, y, w * PIXEL_RES, h * PIXEL_RES);
          list.push(e.at.length); e.at.push([x, y]);
        }
        e.facings.push(list);
      }
      A.cells.set(key, e); A.version++;
      return e;
    }
  };
})();
