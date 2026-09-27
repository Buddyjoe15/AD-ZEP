/* Pixel-art presentation (art/pixel-test, data in pixel-data.js). Units, the Repair Station,
   the Sentry Turret (with a head layer that turns to track its target) and grass/clearing terrain get top-down pixel art; everything without pixel art keeps its
   Canvas art. Each sprite records its own world px per art px (units and structures are
   drawn at 2 art px per world px, terrain at 1). Units pick the nearest of eight authored facings instead of being rotated, and
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
    UNITS: { utility: 'spider', salvage: 'salvage_crawler', rifle: 'drone', scout: 'drone', hero: 'vance' },
    BUILDINGS: { repair: 'repair_station', sentry_turret: 'sentry_turret' },
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
    // World px per art px of sprite `sp` (terrain and tiles use the data's top-level value).
    worldPerArt(sp){ return (sp && sp.worldPxPerArtPx) || D.worldPxPerArtPx; },
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

    // Variant block for unit `u` in a sprite with variants (0 without). By cargo: empty only
    // when nothing is aboard, otherwise the nearest of the other levels.
    variant(V, u){
      if (!V || V.by !== 'cargo') return 0;
      const fill = u.cargoCapacity > 0 ? G.Units.cargoTotal(u) / u.cargoCapacity : 0;
      if (!(fill > 0)) return 0;
      let best = 1;
      for (let i = 2; i < V.at.length; i++) if (Math.abs(V.at[i] - fill) < Math.abs(V.at[best] - fill)) best = i;
      return best;
    },

    // ---- Structures (main canvas, world space) ----
    // State of a built structure: damaged below half health, working while its behaviour is
    // active (a Repair Station with a damaged friendly unit in reach), else finished.
    buildingState(b, sp){
      const st = sp.states;
      if (st.damaged && b.hp < b.maxHp * 0.5) return 'damaged';
      if (st.working && this.repairing(b)) return 'working';
      return 'finished';
    },
    stationState(b, t){ const sp = D.sprites.repair_station; return this.frameOf(sp.states[this.buildingState(b, sp)], t); },
    frameOf(a, t){ return a.start + (a.fps ? Math.floor(t * a.fps) % a.frames : 0); },
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
      const sp = D.sprites[name];
      this.stampFrame(g, sp, sp.frames[0][col], gx, gy, team);
    },
    // Stamps frame string `str` of sprite `sp` over the footprint at (gx, gy), shadow first.
    stampFrame(g, sp, str, gx, gy, team){
      const T = G.CONFIG.TILE, k = this.worldPerArt(sp);
      const w = sp.frameWidth * k, h = sp.frameHeight * k, x = gx * T, y = gy * T, smooth = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = false;
      g.globalAlpha = SHADOW_ALPHA;
      g.drawImage(this.canvas(str, sp.frameWidth, sp.frameHeight, null, true), x + sp.shadow.offset[0] * k, y + sp.shadow.offset[1] * k, w, h);
      g.globalAlpha = 1;
      g.drawImage(this.canvas(str, sp.frameWidth, sp.frameHeight, team || 'blue'), x, y, w, h);
      g.imageSmoothingEnabled = smooth;
    },
    drawBuilding(g, b, z, t){
      const name = this.BUILDINGS[b.type], sp = D.sprites[name], state = this.buildingState(b, sp);
      this.stamp(g, name, this.frameOf(sp.states[state], t), b.gx, b.gy, b.team);
      if (sp.head && sp.head.on[state]) this.drawHead(g, b, sp, sp.head.on[state], t);
      if (b.hp < b.maxHp) G.Visuals.bar(g, b.x, b.gy * G.CONFIG.TILE - 7, b.w * G.CONFIG.TILE * 0.8, b.hp / b.maxHp);
    },
    // A turret's head layer: the facing nearest the aim it is drawn at, which eases toward the
    // aim the simulation last set (G.Turrets) at the head's turn rate. After each round it
    // plays `firing` (muzzle flash, then recoil) over the idle head; a damaged head keeps
    // its damaged look. Its shadow falls on the base under it.
    aims: new Map(),       // building id → { a: drawn aim (radians, 0 = +x), t: last draw time }
    headAim(b, H, t){
      const want = G.Turrets.get(b).aim;
      let d = this.aims.get(b.id);
      if (!d){ this.aims.set(b.id, d = { a: want, t }); return want; }
      const dt = Math.min(0.25, Math.max(0, t - d.t)), step = (H.turnRate || Math.PI * 2) * dt;
      const diff = ((want - d.a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      d.a = Math.abs(diff) <= step ? want : d.a + Math.sign(diff) * step; d.t = t;
      return d.a;
    },
    drawHead(g, b, sp, hs, t){
      const H = sp.head, s = G.Turrets.get(b), fire = H.states.firing;
      let a = H.states[hs], f = this.frameOf(a, t);
      if (hs === 'idle' && fire && s.targetId != null && !s.noAmmo){
        const cfg = (G.Defs.buildables.get(b.type)?.behaviors || []).find(x => x.type === 'turret'), since = cfg ? cfg.reload - s.cool : Infinity;
        if (since >= 0 && since < fire.frames / fire.fps){ a = fire; f = fire.start + Math.min(fire.frames - 1, Math.floor(since * fire.fps)); }
      }
      const facing = ((Math.round((this.headAim(b, H, t) + Math.PI / 2) / (Math.PI * 2 / H.facings)) % H.facings) + H.facings) % H.facings;
      this.stampFrame(g, sp, H.frames[facing][f], b.gx, b.gy, b.team);
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
        if (inView((r.gx + 1) * T, (r.gy + 1) * T, sp.frameWidth * this.worldPerArt(sp))) this.stamp(g, name, sp.states.rubble.start, r.gx, r.gy, r.team);
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
    tileArt(){ return D ? D.tileArt : 48; },
    // True when `art` px of art drawn `size` units across in `g` land on fewer device px than
    // art px (96 px terrain in a 1× chunk, or zoomed out). Such draws are averaged (smoothed)
    // rather than sampled, so fine terrain detail doesn't shimmer.
    shrinks(g, size, art){ return Math.abs(g.getTransform().a) * size < art - 1e-6; },
    // A tree canopy prop with its engine shadow (unless `noShadow`), drawn at world rect
    // (x, y, size). Shadow and canopy are composed once per frame string and size, so each
    // tree is a single draw.
    propCache: new Map(),
    prop(g, str, x, y, size, noShadow){
      const key = str + '|' + size + (noShadow ? '|n' : '');
      let c = this.propCache.get(key);
      if (!c){
        const k = Math.max(1, Math.round(size / D.tileArt)), off = D.woodlands.tree.shadow.offset, n = D.tileArt;
        c = document.createElement('canvas'); c.width = (n + off[0]) * k; c.height = (n + off[1]) * k;
        const cg = c.getContext('2d');
        cg.imageSmoothingEnabled = false;
        if (!noShadow){
          cg.globalAlpha = SHADOW_ALPHA;
          cg.drawImage(this.canvas(str, n, n, null, true), off[0] * k, off[1] * k, n * k, n * k);
          cg.globalAlpha = 1;
        }
        cg.drawImage(this.canvas(str, n, n, 'neutral'), 0, 0, n * k, n * k);
        c.scale = size / (n * k);
        this.propCache.set(key, c);
      }
      const smooth = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = this.shrinks(g, c.width * c.scale, c.width);
      g.drawImage(c, x, y, c.width * c.scale, c.height * c.scale);
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
  G.Events.on('world:created', () => { P.rubble = []; P.aims.clear(); });
  G.Events.on('building:removed', b => P.aims.delete(b.id));
})();
