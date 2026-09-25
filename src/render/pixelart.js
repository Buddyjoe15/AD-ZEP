/* Pixel-art presentation (art/pixel-test, data in pixel-data.js). Units, the Repair Station
   and grass/clearing terrain get top-down pixel art; everything without pixel art keeps its
   Canvas art. Units pick the nearest of eight authored facings instead of being rotated, and
   shadows are drawn here, never baked into sprites: each sprite's silhouette, offset by its
   `shadow.offset`, darkens what is underneath by 55%, and overlapping shadows don't stack.
   Presentation only: nothing here is saved or read by the simulation.
   `?art=classic` (or the Debug panel) switches back to the original art. */
(function(){
  'use strict';
  const G = GW;
  const D = typeof window !== 'undefined' ? window.PIXEL_ART : null;
  const SHADOW_ALPHA = 0.55, FACING_STEP = Math.PI / 4;
  const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('art') : null;

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const CODE = {};
  if (D) [...D.alphabet].forEach((ch, i) => CODE[ch] = i);
  const PAL = D ? D.palette.map(c => hex(c.hex)) : [];
  const TEAMS = {};
  if (D) for (const [k, ramp] of Object.entries(D.teams)) TEAMS[k] = ramp.map(hex);

  // 32-bit integer mix (murmur3 finaliser) for picking terrain variants without patterns.
  const fmix32 = h => { h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return h >>> 0; };

  G.PixelArt = {
    data: D,
    enabled: !!D && param !== 'classic',
    // Unit `visual` → sprite; buildable key → structure sprite.
    UNITS: { utility: 'spider', rifle: 'drone', scout: 'drone', hero: 'vance' },
    BUILDINGS: { repair: 'repair_station' },
    // Terrain drawn with the dust plain tiles (the test map is all grass).
    DUST: new Set(['grass', 'clearing']),
    SHADOW_ALPHA,
    rubble: [],            // recently destroyed pixel-art structures: { type, team, gx, gy, until }
    RUBBLE_SECONDS: 90,

    set(on){
      on = !!on && !!D;
      if (on === this.enabled) return;
      this.enabled = on;
      G.SpriteAtlas.reset();
      if (G.TerrainCache.grid) G.TerrainCache.invalidate();
      G.Events.emit('art:changed', on);
    },
    unitSprite(def){ return this.enabled && def ? this.UNITS[def.visual] || null : null; },
    buildingSprite(type){ return this.enabled ? this.BUILDINGS[type] || null : null; },
    sprite(name){ return D.sprites[name]; },
    worldPerArt(){ return D.worldPxPerArtPx; },
    // Nearest of the eight facings (0 = up, clockwise) for a heading in radians (0 = +x).
    facing(heading){ return ((Math.round((heading + Math.PI / 2) / FACING_STEP) % 8) + 8) % 8; },

    // Decoded 1× frames: team-coloured, or a black silhouette for shadows. Cached per string.
    cache: new Map(),
    canvas(str, w, h, team, silhouette){
      const key = str + (silhouette ? '|s' : '|' + team);
      let c = this.cache.get(key);
      if (c) return c;
      c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'), img = g.createImageData(w, h), ramp = TEAMS[team] || TEAMS.blue;
      for (let i = 0; i < w * h; i++){
        const k = CODE[str[i]];
        if (!k) continue;
        const t = D.teamIndex.indexOf(k), rgb = silhouette ? [0, 0, 0] : t >= 0 ? ramp[t] : PAL[k - 1];
        img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2]; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.cache.set(key, c);
      return c;
    },

    // Animation for a unit this frame: work while beaming, walk while moving, else idle.
    anim(anims, u){
      if (anims.work && G.Visuals.laserTarget(u)) return anims.work;
      if (anims.walk && u.path.length) return anims.walk;
      return anims.idle || anims.fly || anims[Object.keys(anims)[0]];
    },

    // ---- Structures (main canvas, world space) ----
    stationState(b, t){
      const st = D.sprites.repair_station.states;
      if (b.hp < b.maxHp * 0.5) return st.damaged.start;
      if (this.repairing(b)) return st.working.start + Math.floor(t * st.working.fps) % st.working.frames;
      return st.finished.start;
    },
    // True while a Repair Station has a damaged friendly unit in reach (read-only).
    repairing(b){
      const d = G.Defs.buildables.get(b.type), aura = d && d.behaviors.find(x => x.type === 'repairAura');
      if (!aura) return false;
      const S = G.State, r = G.CONFIG.TILE * aura.radiusTiles, hash = S.teamSpatial && S.teamSpatial[b.team];
      for (const u of hash ? hash.query(b.x, b.y, r + 40) : S.units)
        if (u.hp > 0 && !u.isShip && u.team === b.team && u.hp < u.maxHp && G.dist2(u, b) <= (r + u.radius) * (r + u.radius)) return true;
      return false;
    },
    // Stamps one structure frame at grid position (gx, gy), with its engine shadow.
    stamp(g, name, col, gx, gy, team){
      const sp = D.sprites[name], T = G.CONFIG.TILE, k = D.worldPxPerArtPx, str = sp.frames[0][col];
      const w = sp.frameWidth * k, h = sp.frameHeight * k, x = gx * T, y = gy * T, smooth = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = false;
      g.globalAlpha = SHADOW_ALPHA;
      g.drawImage(this.canvas(str, sp.frameWidth, sp.frameHeight, null, true), x + sp.shadow.offset[0] * k, y + sp.shadow.offset[1] * k, w, h);
      g.globalAlpha = 1;
      g.drawImage(this.canvas(str, sp.frameWidth, sp.frameHeight, team || 'blue'), x, y, w, h);
      g.imageSmoothingEnabled = smooth;
    },
    drawBuilding(g, b, z, t){
      const name = this.BUILDINGS[b.type];
      this.stamp(g, name, this.stationState(b, t), b.gx, b.gy, b.team);
      if (b.hp < b.maxHp) G.Visuals.bar(g, b.x, b.gy * G.CONFIG.TILE - 7, b.w * G.CONFIG.TILE * 0.8, b.hp / b.maxHp);
    },
    // Construction site: foundation, frame, then near-complete as the build progresses.
    drawSite(g, site, pct){
      const st = D.sprites[this.BUILDINGS[site.type]].states;
      const s = pct < 1 / 3 ? st.foundation : pct < 2 / 3 ? st.frame : st['near-complete'];
      this.stamp(g, this.BUILDINGS[site.type], s.start, site.gx, site.gy, site.team);
    },
    drawRubble(g, inView){
      const now = G.State.time, T = G.CONFIG.TILE;
      if (this.rubble.length && this.rubble[0].until < now) this.rubble = this.rubble.filter(r => r.until >= now);
      for (const r of this.rubble){
        const name = this.BUILDINGS[r.type], sp = D.sprites[name];
        if (inView((r.gx + 1) * T, (r.gy + 1) * T, sp.frameWidth * D.worldPxPerArtPx)) this.stamp(g, name, sp.states.rubble.start, r.gx, r.gy, r.team);
      }
    },

    // ---- Terrain ----
    tileVariant(x, y){
      const T = D.terrain.v2, total = this._tw || (this._tw = T.weights.reduce((a, b) => a + b, 0));
      let r = fmix32(Math.imul(x, 0x9E3779B1) ^ Math.imul(y, 0x85EBCA77) ^ 0x2545F491) % total;
      for (let i = 0; i < T.weights.length; i++){ if (r < T.weights[i]) return i; r -= T.weights[i]; }
      return 0;
    },
    tile(x, y){ const str = D.terrain.v2.tiles[this.tileVariant(x, y)]; return this.canvas(str, D.tileArt, D.tileArt); },
    dustIds(){
      if (!this._dust){ this._dust = new Set(); for (const t of G.Defs.terrain.all()) if (this.DUST.has(t.key)) this._dust.add(t.id); }
      return this._dust;
    },
    DUST_MINIMAP: D ? hex(D.palette.find(c => c.name === 'dust2').hex) : [0, 0, 0],
    // Woodlands pilot art (grass, tall grass, water, shoreline, cliffs, tree props), or null
    // when pixel art is off; the Woodlands renderer keeps its vector art for anything else.
    woodlands(){ return this.enabled && D && D.woodlands ? D.woodlands : null; },
    // Weighted variant for tile (x, y), mixing-hashed like the dust plain; `salt` keeps
    // different terrain types from picking in step.
    weighted(weights, x, y, salt){
      let total = 0;
      for (const w of weights) total += w;
      let r = fmix32(Math.imul(x, 0x9E3779B1) ^ Math.imul(y, 0x85EBCA77) ^ salt) % total;
      for (let i = 0; i < weights.length; i++){ if (r < weights[i]) return i; r -= weights[i]; }
      return 0;
    },
    tileCanvas(str){ return this.canvas(str, D.tileArt, D.tileArt); },
    // A tree canopy prop with its engine shadow, drawn at world rect (x, y, size).
    prop(g, str, x, y, size){
      const k = size / D.tileArt, smooth = g.imageSmoothingEnabled, off = D.woodlands.tree.shadow.offset;
      g.imageSmoothingEnabled = false;
      g.globalAlpha = SHADOW_ALPHA;
      g.drawImage(this.canvas(str, D.tileArt, D.tileArt, null, true), x + off[0] * k, y + off[1] * k, size, size);
      g.globalAlpha = 1;
      g.drawImage(this.canvas(str, D.tileArt, D.tileArt, 'neutral'), x, y, size, size);
      g.imageSmoothingEnabled = smooth;
    }
  };

  const P = G.PixelArt;
  // Rubble is a render-only afterimage of a destroyed structure; it is never saved.
  G.Events.on('building:removed', b => {
    if (b.hp <= 0 && P.BUILDINGS[b.type]) P.rubble.push({ type: b.type, team: b.team, gx: b.gx, gy: b.gy, until: G.State.time + P.RUBBLE_SECONDS });
  });
  const clearAt = s => { P.rubble = P.rubble.filter(r => r.gx + 2 <= s.gx || s.gx + s.w <= r.gx || r.gy + 2 <= s.gy || s.gy + s.h <= r.gy); };
  G.Events.on('building:placed', clearAt);
  G.Events.on('construction:queued', clearAt);
  G.Events.on('world:created', () => { P.rubble = []; });
})();
