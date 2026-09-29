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
    BUILDINGS: {
      repair: 'repair_station', sentry_turret: 'sentry_turret', laser_turret: 'laser_turret',
      wood_wall: 'wood_wall', defensive_wall: 'defensive_wall', reinforced_wall: 'reinforced_wall',
      gate: 'gate', gate_3: 'gate_3', gate_4: 'gate_4', gate_v: 'gate_v', gate_3_v: 'gate_3_v', gate_4_v: 'gate_4_v'
    },
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
    // Frame text may be run-length encoded (a character, then its count when it repeats).
    expand(str){ return /\d/.test(str) ? str.replace(/(\D)(\d+)/g, (_, ch, n) => ch.repeat(+n)) : str; },
    // (Two levels, by the frame's own text then its colouring: a frame's text can run to tens of
    // KB, and a key made by joining it to anything would have to be hashed on every lookup.)
    canvas(str, w, h, team, silhouette){
      let by = this.cache.get(str);
      if (!by) this.cache.set(str, by = new Map());
      const sub = silhouette ? '|s' : team || '';
      let c = by.get(sub);
      if (c) return c;
      const raw = str;
      str = this.expand(str);
      c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'), img = g.createImageData(w, h), ramp = TEAMS[team] || TEAMS.blue;
      for (let i = 0; i < w * h; i++){
        const k = CODE[str[i]];
        if (!k) continue;
        const t = D.teamIndex.indexOf(k), rgb = silhouette ? [0, 0, 0] : t >= 0 ? ramp[t] : PAL[k - 1];
        img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2]; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.cache.get(raw).set(sub, c);
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
    // State of a built structure: open while a gate is open, damaged below half health,
    // working while its behaviour is active (a Repair Station with a damaged friendly unit in
    // reach), else finished.
    buildingState(b, sp){
      const st = sp.states;
      if (st.open && G.Gates.isOpen(b)) return 'open';
      if (st.damaged && b.hp < b.maxHp * 0.5) return 'damaged';
      if (st.working && this.repairing(b)) return 'working';
      return 'finished';
    },
    stationState(b, t){ const sp = D.sprites.repair_station; return this.frameOf(sp.states[this.buildingState(b, sp)], t); },
    frameOf(a, t){ return a.start + (a.fps ? Math.floor(t * a.fps) % a.frames : 0); },
    // Sheet column for built structure b: a connecting state (walls) picks its piece by which
    // sides join, others play their frames.
    buildingCol(b, sp, t){
      const a = sp.states[this.buildingState(b, sp)];
      return a.connect ? a.start + this.joins(b) : this.frameOf(a, t);
    },
    // Wall joins: a wall joins, on each side, a wall of its team on the next tile, or the end
    // of a gate of its team (a horizontal gate's east or west end, a vertical gate's north or
    // south end), never diagonally. Bits: 1 north, 2 east, 4 south, 8 west. Rebuilt whenever
    // structures change; presentation only.
    joinMasks: new Map(), joinVersion: -1,
    joins(b){
      if (this.joinVersion !== G.Buildings.version){ this.joinVersion = G.Buildings.version; this.rebuildJoins(); }
      return this.joinMasks.get(b.id) || 0;
    },
    rebuildJoins(){
      // Walls and gates by building-grid cell (walls can sit a quarter tile over).
      const cells = new Map(), key = (x, y) => y * 65536 + x, masks = this.joinMasks, K = G.Buildings.SUB;
      const at = b => [b.gx * K + (b.sx || 0), b.gy * K + (b.sy || 0)];
      masks.clear();
      for (const b of G.State.buildings){
        const d = G.Defs.buildables.get(b.type);
        if (!d || !(d.wall || d.gate)) continue;
        const [c0, r0] = at(b);
        for (let y = r0; y < r0 + b.h * K; y++) for (let x = c0; x < c0 + b.w * K; x++) cells.set(key(x, y), b);
      }
      for (const b of G.State.buildings){
        if (!G.Defs.buildables.get(b.type)?.wall) continue;
        let mask = 0;
        const [c0, r0] = at(b);
        // (The cell just past each side of its footprint, level with its top-left cell.)
        for (const [bit, dx, dy] of [[1, 0, -1], [2, b.w * K, 0], [4, 0, b.h * K], [8, -1, 0]]){
          const n = cells.get(key(c0 + dx, r0 + dy));
          if (!n || n.team !== b.team) continue;
          const nd = G.Defs.buildables.get(n.type);
          if (nd.wall || (nd.gate && (dx ? n.w > n.h : n.h > n.w))) mask |= bit;
        }
        masks.set(b.id, mask);
      }
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
      const sp = D.sprites[name];
      this.stampFrame(g, sp, sp.frames[0][col], gx, gy, team);
    },
    // Stamps frame string `str` of sprite `sp` over the footprint at (gx, gy): its engine
    // shadow, then the sprite; `part` 'shadow' or 'body' stamps just one.
    stampFrame(g, sp, str, gx, gy, team, part){
      const T = G.CONFIG.TILE, k = this.worldPerArt(sp);
      const w = sp.frameWidth * k, h = sp.frameHeight * k, x = gx * T, y = gy * T, smooth = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = false;
      if (part !== 'body'){
        g.globalAlpha = SHADOW_ALPHA;
        g.drawImage(this.canvas(str, sp.frameWidth, sp.frameHeight, null, true), x + sp.shadow.offset[0] * k, y + sp.shadow.offset[1] * k, w, h);
        g.globalAlpha = 1;
      }
      if (part !== 'shadow') g.drawImage(this.canvas(str, sp.frameWidth, sp.frameHeight, team || 'blue'), x, y, w, h);
      g.imageSmoothingEnabled = smooth;
    },
    // Built structures draw in two passes, all shadows first, so a structure's shadow never
    // falls on its neighbour (the joins of a wall stay clean).
    drawBuildingShadow(g, b, t){
      const sp = D.sprites[this.BUILDINGS[b.type]];
      this.stampFrame(g, sp, sp.frames[0][this.buildingCol(b, sp, t)], G.Buildings.fx(b), G.Buildings.fy(b), b.team, 'shadow');
    },
    drawBuilding(g, b, z, t, noShadow){
      const name = this.BUILDINGS[b.type], sp = D.sprites[name], state = this.buildingState(b, sp);
      this.stampFrame(g, sp, sp.frames[0][this.buildingCol(b, sp, t)], G.Buildings.fx(b), G.Buildings.fy(b), b.team, noShadow ? 'body' : undefined);
      if (sp.head && sp.head.on[state]) this.drawHead(g, b, sp, sp.head.on[state], t);
      if (b.hp < b.maxHp) G.Visuals.bar(g, b.x, G.Buildings.fy(b) * G.CONFIG.TILE - 7, b.w * G.CONFIG.TILE * 0.8, b.hp / b.maxHp);
    },
    // A turret's head layer: the facing nearest the aim it is drawn at, which eases toward the
    // aim the simulation last set (G.Turrets) at the head's turn rate. While the turret has a
    // target it loops the firing frames for its resting state (`head.firing`: idle → firing,
    // damaged → damaged-firing; barrels spinning, belts feeding), and for `flashTime` after
    // each round the matching flash frame (muzzle flash and recoil). A turret that charges
    // its shots (the Laser Turret) shows the charging frame for its charge so far instead. Its shadow falls on the
    // base under it.
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
    // Where a turret's shot leaves its barrel: the muzzle of the head as it is drawn (the
    // facing nearest its drawn aim), so a beam comes straight out of the rifle. Null for
    // turrets without pixel art or a muzzle.
    muzzle(b){
      const name = this.enabled && this.BUILDINGS[b.type], H = name && D.sprites[name].head, d = H && H.muzzle && this.aims.get(b.id);
      if (!d) return null;
      const step = Math.PI * 2 / H.facings, a = Math.round((d.a + Math.PI / 2) / step) * step - Math.PI / 2;
      return { x: b.x + Math.cos(a) * H.muzzle, y: b.y + Math.sin(a) * H.muzzle };
    },
    drawHead(g, b, sp, hs, t){
      const H = sp.head, s = G.Turrets.get(b), [fireName, flashName] = (H.firing && H.firing[hs]) || [], fire = H.states[fireName], flash = H.states[flashName];
      let f = this.frameOf(H.states[hs], t);
      if (fire && s.targetId != null && !s.noAmmo){
        const cfg = (G.Defs.buildables.get(b.type)?.behaviors || []).find(x => x.type === 'turret'), since = cfg ? cfg.reload - s.cool : Infinity;
        if (flash && since >= 0 && since < (H.flashTime || 0.12)){
          // Just fired: a charging head plays its flash frames through; others show the
          // flash frame matching their firing loop.
          f = cfg.charge ? flash.start + Math.min(flash.frames - 1, Math.floor(since / (H.flashTime || 0.12) * flash.frames)) : this.frameOf(fire, t) + flash.start - fire.start;
        } else if (cfg && cfg.charge){
          // Charging: the frame for the charge so far (idle until it starts).
          if (s.charged > 0) f = fire.start + Math.min(fire.frames - 1, Math.floor(s.charged / cfg.charge * fire.frames));
        } else f = this.frameOf(fire, t);
      }
      const facing = ((Math.round((this.headAim(b, H, t) + Math.PI / 2) / (Math.PI * 2 / H.facings)) % H.facings) + H.facings) % H.facings;
      this.stampFrame(g, sp, H.frames[facing][f], G.Buildings.fx(b), G.Buildings.fy(b), b.team);
    },
    // Construction site: foundation, frame, then near-complete as the build progresses.
    drawSite(g, site, pct){
      const st = D.sprites[this.BUILDINGS[site.type]].states;
      const s = pct < 1 / 3 ? st.foundation : pct < 2 / 3 ? st.frame : st['near-complete'];
      this.stamp(g, this.BUILDINGS[site.type], s.start, G.Buildings.fx(site), G.Buildings.fy(site), site.team);
    },
    drawRubble(g, inView){
      const now = G.State.time, T = G.CONFIG.TILE;
      if (this.rubble.length && this.rubble[0].until < now) this.rubble = this.rubble.filter(r => r.until >= now);
      for (const r of this.rubble){
        const name = this.BUILDINGS[r.type], sp = D.sprites[name];
        if (inView((r.gx + r.w / 2) * T, (r.gy + r.h / 2) * T, sp.frameWidth * this.worldPerArt(sp))) this.stamp(g, name, sp.states.rubble.start, r.gx, r.gy, r.team);
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
    if (b.hp <= 0 && P.BUILDINGS[b.type]) P.rubble.push({ type: b.type, team: b.team, gx: G.Buildings.fx(b), gy: G.Buildings.fy(b), w: b.w, h: b.h, until: G.State.time + P.RUBBLE_SECONDS });   // (gx, gy: edges in tiles, fractional)
  });
  const clearAt = s => { const x = G.Buildings.fx(s), y = G.Buildings.fy(s); P.rubble = P.rubble.filter(r => r.gx + r.w <= x || x + s.w <= r.gx || r.gy + r.h <= y || y + s.h <= r.gy); };
  G.Events.on('building:placed', clearAt);
  G.Events.on('construction:queued', clearAt);
  G.Events.on('world:created', () => { P.rubble = []; P.aims.clear(); });
  G.Events.on('building:removed', b => P.aims.delete(b.id));
})();
