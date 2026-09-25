/* Fog of war (presentation only). Every friendly unit reveals a circle of its `sight`,
   every friendly structure the `sight` of its definition (BUILDING_SIGHT when it has
   none) and every construction site a small circle. Tiles are:
     visible   – inside a circle now: shown as normal, enemies drawn;
     explored  – seen before: dimmed, terrain and structures remembered, no enemies;
     unexplored – never seen: nearly black.
   It never changes the simulation (enemies still fight, AI still sees), and it is not
   saved: after loading, the explored area starts again from what the crew can see.
   `?fog=0` or the Debug panel turns it off. */
(function(){
  'use strict';
  const G = GW;
  const BUILDING_SIGHT = 240, SITE_SIGHT = 144, UPDATE_MS = 150;
  const SEEN_ALPHA = 140, DARK_ALPHA = 238, SHADE = [4, 8, 11];
  const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fog') : null;

  G.Fog = {
    enabled: param !== '0' && param !== 'off',
    cols: 0, rows: 0, vis: null, seen: null, canvas: null, img: null, last: -Infinity, grid: null,
    circles: new Map(),
    reset(){
      const grid = G.State.grid;
      this.grid = grid;
      if (!grid) return;
      this.cols = grid.cols; this.rows = grid.rows;
      this.vis = new Uint8Array(grid.size); this.seen = new Uint8Array(grid.size);
      if (typeof document !== 'undefined'){
        this.canvas = this.canvas || document.createElement('canvas');
        this.canvas.width = this.cols; this.canvas.height = this.rows;
        const g = this.canvas.getContext('2d');
        this.img = g.createImageData(this.cols, this.rows);
        for (let i = 0; i < grid.size; i++){ const p = i * 4; this.img.data[p] = SHADE[0]; this.img.data[p + 1] = SHADE[1]; this.img.data[p + 2] = SHADE[2]; }
      }
      this.last = -Infinity;
    },
    set(on){ this.enabled = !!on; this.last = -Infinity; G.Events.emit('fog:changed', this.enabled); },
    // Tile offsets inside a circle of `r` tiles (cached per radius).
    circle(r){
      let c = this.circles.get(r);
      if (c) return c;
      c = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) c.push(dx, dy);
      this.circles.set(r, c);
      return c;
    },
    stamp(x, y, sight){
      const T = G.CONFIG.TILE, cx = Math.floor(x / T), cy = Math.floor(y / T), r = Math.max(1, Math.round(sight / T));
      const c = this.circle(r), W = this.cols, H = this.rows, vis = this.vis;
      for (let i = 0; i < c.length; i += 2){
        const tx = cx + c[i], ty = cy + c[i + 1];
        if (tx >= 0 && ty >= 0 && tx < W && ty < H) vis[ty * W + tx] = 1;
      }
    },
    // Recomputes what the crew sees (throttled; `force` skips the throttle).
    update(force = false){
      const S = G.State;
      if (!S.grid) return;
      if (this.grid !== S.grid) this.reset();
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      if (!force && now - this.last < UPDATE_MS) return;
      this.last = now;
      const vis = this.vis, seen = this.seen;
      vis.fill(0);
      for (const u of S.units) if (u.team === 'blue' && u.hp > 0) this.stamp(u.x, u.y, u.sight || BUILDING_SIGHT);
      for (const b of S.buildings) if (b.team === 'blue' && b.hp > 0) this.stamp(b.x, b.y, G.Defs.buildables.get(b.type)?.sight || BUILDING_SIGHT);
      for (const s of S.constructionSites) if (s.team === 'blue') this.stamp(s.x, s.y, SITE_SIGHT);
      if (!this.img) return;
      const a = this.img.data;
      for (let i = 0; i < vis.length; i++){
        if (vis[i]) seen[i] = 1;
        a[i * 4 + 3] = vis[i] ? 0 : seen[i] ? SEEN_ALPHA : DARK_ALPHA;
      }
      this.canvas.getContext('2d').putImageData(this.img, 0, 0);
    },
    // Whether a world point is in view (always true with fog off).
    visibleAt(x, y){
      if (!this.enabled || !this.vis) return true;
      const T = G.CONFIG.TILE, tx = Math.floor(x / T), ty = Math.floor(y / T);
      return tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows && this.vis[ty * this.cols + tx] === 1;
    },
    // Friendly units are always shown; others only where the crew can see.
    canSee(u){ return u.team === 'blue' || this.visibleAt(u.x, u.y); },
    // Draws the fog over the map in world space (soft edges from smoothing).
    draw(g){
      if (!this.enabled || !this.canvas) return;
      const C = G.CONFIG, smooth = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = true;
      g.drawImage(this.canvas, 0, 0, C.WORLD_W, C.WORLD_H);
      g.imageSmoothingEnabled = smooth;
    }
  };

  G.Events.on('world:created', () => G.Fog.reset());
  for (const e of ['game:started', 'game:restored', 'expedition:transit']) G.Events.on(e, () => G.Fog.update(true));
})();
