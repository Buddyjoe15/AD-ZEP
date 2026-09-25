/* Gates, turrets, Shield Projectors and Defensive Sensors. Gate states follow from where
   units stand, and a turret's cooldown and aim and a sensor's last warning restart when a
   game loads; only a Shield Projector's switch (`shieldOn`) and charge (`shield`) are saved.

   Gates don't stamp the grid, so paths lead through them. Movement asks G.Gates.blocks():
   enemy units can never enter a gate tile; friendly units only while the gate is open.
   A gate opens when a friendly unit is within `openTiles` of it and no enemy is within
   `hostileTiles`; otherwise it stays shut.

   Turrets (`turret` behaviour) pick the nearest enemy unit they can hit (ground, air or
   any) between `minRange` and `range`, and fire every `reload` seconds. `splash` also
   hits other enemies that close to the target; `ammo` spends one of that resource per shot
   from the stockpile and holds fire without it. Testing-zone copies never fire. Each shot
   hits with the turret's `accuracy`, raised by a Defensive Sensor within its boostTiles;
   the roll is G.hashRandom of the tick, turret and target, so replays are identical.

   Shield Projectors charge while switched on (slower on a short power grid). Damage to a
   friendly structure inside a charged field comes off the field's charge first.
   Defensive Sensors see through fog (their `sight`) and raise a warning, at most every
   30 s each, when enemies come within detectTiles. */
(function(){
  'use strict';
  const G = GW;
  const OPEN = 2, CLOSED = 1;

  const def = b => G.Defs.buildables.get(b.type);
  const flying = u => !!G.Defs.units.get(u.type)?.flying;

  G.Gates = {
    mask: null, open: new Map(), version: -1, grid: null, count: 0,
    // Rebuilds the tile mask when structures change; updates each gate's state every tick.
    update(){
      const S = G.State, grid = S.grid, T = G.CONFIG.TILE;
      if (!grid) return;
      if (this.grid !== grid || !this.mask){ this.grid = grid; this.mask = new Uint8Array(grid.size); this.version = -1; }
      if (this.version !== G.Buildings.version){ this.mask.fill(0); this.open.clear(); this.version = G.Buildings.version; }
      this.count = 0;
      for (const b of S.buildings){
        const gd = def(b)?.gate;
        if (!gd || b.hp <= 0) continue;
        this.count++;
        const open = this.shouldOpen(b, gd), v = open ? OPEN : CLOSED;
        this.open.set(b.id, open);
        for (let y = b.gy; y < b.gy + b.h; y++) for (let x = b.gx; x < b.gx + b.w; x++) if (grid.inBounds(x, y)) this.mask[y * grid.cols + x] = v;
      }
      // Destroyed gates leave the mask on the next structure change (their removal).
    },
    shouldOpen(b, gd){
      const S = G.State, T = G.CONFIG.TILE;
      let friend = false;
      const reach = (gd.openTiles + Math.max(b.w, b.h) / 2) * T;
      const own = S.teamSpatial && S.teamSpatial[b.team];
      for (const u of own ? own.query(b.x, b.y, reach) : S.units){
        if (u.hp > 0 && !u.isShip && u.team === b.team && G.dist2(u, b) <= reach * reach){ friend = true; break; }
      }
      if (!friend) return false;
      const danger = (gd.hostileTiles + Math.max(b.w, b.h) / 2) * T;
      for (const [team, hash] of Object.entries(S.teamSpatial || {})){
        if (team === b.team || !hash.count) continue;
        if (hash.nearest(b.x, b.y, danger)) return false;
      }
      return true;
    },
    isOpen(b){ return !!this.open.get(b.id); },
    // Whether `u` may not stand on tile (tx, ty) because of a gate.
    blocks(u, tx, ty){
      const m = this.mask, grid = this.grid;
      if (!this.count || !m || !grid.inBounds(tx, ty)) return false;
      const v = m[ty * grid.cols + tx];
      return v !== 0 && (u.team !== 'blue' || v !== OPEN);
    },
    blocksWorld(u, wx, wy){ const T = G.CONFIG.TILE; return this.blocks(u, Math.floor(wx / T), Math.floor(wy / T)); },
    reset(){ this.mask = null; this.open.clear(); this.grid = null; this.count = 0; }
  };

  G.Turrets = {
    state: new Map(),   // building id → { cool, aim, targetId, noAmmo }
    get(b){
      let s = this.state.get(b.id);
      if (!s) this.state.set(b.id, s = { cool: 0, aim: -Math.PI / 2, targetId: null, noAmmo: false });
      return s;
    },
    canHit(cfg, u){ return cfg.targets === 'any' || (cfg.targets === 'air') === flying(u); },
    // Chance to hit: the turret's own accuracy plus the best nearby Defensive Sensor.
    accuracy(b, cfg){ return Math.min(1, (cfg.accuracy ?? 1) + G.Sensors.bonus(b)); },
    // Nearest enemy unit this turret can hit, or null.
    target(b, cfg){
      const S = G.State, min2 = (cfg.minRange || 0) ** 2, max2 = cfg.range * cfg.range;
      let best = null, bd = Infinity;
      for (const [team, hash] of Object.entries(S.teamSpatial)){
        if (team === b.team || !hash.count) continue;
        for (const u of hash.query(b.x, b.y, cfg.range)){
          if (u.hp <= 0 || !this.canHit(cfg, u)) continue;
          const d = G.dist2(u, b);
          if (d >= min2 && d <= max2 && d < bd){ bd = d; best = u; }
        }
      }
      return best;
    },
    fire(b, cfg, t){
      const S = G.State, s = this.get(b);
      s.shots = (s.shots || 0) + 1;
      if (G.hashRandom(Math.round(S.time * 60), s.seed ?? (s.seed = G.hashString(b.id)), t.id, s.shots) >= this.accuracy(b, cfg)){
        // A miss: the round lands beside the target.
        const a = s.shots * 2.39996, off = 18 + (t.radius || 10);
        S.shots.push({ x1: b.x, y1: b.y, x2: t.x + Math.cos(a) * off, y2: t.y + Math.sin(a) * off, life: cfg.shot ? 0.18 : 0.09, team: b.team, kind: cfg.shot || null, miss: true });
        return false;
      }
      const hit = u => { u.hp -= cfg.damage; G.Events.emit('combat:hit', { attacker: b, target: u, damage: cfg.damage }); };
      hit(t);
      if (cfg.splash){
        const hash = S.teamSpatial[t.team];
        for (const u of hash ? hash.query(t.x, t.y, cfg.splash) : []) if (u !== t && u.hp > 0 && this.canHit(cfg, u) && G.dist2(u, t) <= cfg.splash * cfg.splash) hit(u);
      }
      S.shots.push({ x1: b.x, y1: b.y, x2: t.x, y2: t.y, life: cfg.shot ? 0.18 : 0.09, team: b.team, kind: cfg.shot || null });
      return true;
    },
    update(b, cfg, dt){
      if (b.testZone) return;
      const s = this.get(b);
      s.cool -= dt;
      if (s.cool > 0) return;
      const t = this.target(b, cfg);
      if (!t){ s.cool = 0.2; s.targetId = null; return; }   // rescan a few times a second
      s.aim = Math.atan2(t.y - b.y, t.x - b.x); s.targetId = t.id;
      if (cfg.ammo){
        s.noAmmo = !G.Economy.spend({ [cfg.ammo]: 1 }, 'ammunition');
        if (s.noAmmo){ s.cool = 0.5; return; }
      }
      this.fire(b, cfg, t);
      s.cool = cfg.reload;
    }
  };

  G.Shields = {
    hitAt: new Map(),
    def(b){ return G.Defs.buildables.get(b.type)?.shield || null; },
    // Switches a projector on or off (from its window). Charge is kept either way.
    set(b, on){
      if (!this.def(b) || b.hp <= 0) return false;
      b.shieldOn = !!on;
      G.Events.emit('shield:changed', b);
      return true;
    },
    // The live projector covering a structure with the most charge, or null.
    cover(t){
      const S = G.State, T = G.CONFIG.TILE;
      let best = null;
      for (const p of S.buildings){
        const sh = p.hp > 0 && p.team === t.team && p.shieldOn && p.shield > 0 && this.def(p);
        if (!sh) continue;
        const r = sh.radiusTiles * T;
        if (G.dist2(p, t) <= r * r && (!best || p.shield > best.shield)) best = p;
      }
      return best;
    },
    // Damage left after the covering field (if any) takes what it can.
    absorb(t, dmg){
      if (!(dmg > 0) || !t || t.radius) return dmg;   // structures only
      const p = this.cover(t);
      if (!p) return dmg;
      const took = Math.min(p.shield, dmg);
      p.shield = G.round6(p.shield - took);
      this.hitAt.set(p.id, G.State.time);              // presentation: flash the field (not saved)
      return dmg - took;
    },
    update(dt){
      for (const b of G.State.buildings){
        const sh = this.def(b);
        if (!sh || b.hp <= 0 || !b.shieldOn || b.shield >= sh.capacity) continue;
        b.shield = G.round6(Math.min(sh.capacity, b.shield + sh.recharge * dt * G.Power.factor(b)));
      }
    }
  };

  G.Sensors = {
    last: new Map(),   // sensor id → time of its last warning (not saved)
    def(b){ return G.Defs.buildables.get(b.type)?.sensor || null; },
    // Accuracy bonus a turret gets from the best friendly sensor in range.
    bonus(b){
      const T = G.CONFIG.TILE;
      let best = 0;
      for (const s of G.State.buildings){
        const d = s.hp > 0 && s.team === b.team && this.def(s);
        if (!d) continue;
        const r = (d.boostTiles + Math.max(b.w, b.h) / 2) * T;
        if (G.dist2(s, b) <= r * r) best = Math.max(best, d.accuracyBonus);
      }
      return best;
    },
    // Enemies within a sensor's detection range.
    detect(b){
      const S = G.State, d = this.def(b), r = d.detectTiles * G.CONFIG.TILE, out = [];
      for (const [team, hash] of Object.entries(S.teamSpatial)){
        if (team === b.team || !hash.count) continue;
        for (const u of hash.query(b.x, b.y, r)) if (u.hp > 0 && G.dist2(u, b) <= r * r) out.push(u);
      }
      return out;
    },
    update(){
      const S = G.State;
      for (const b of S.buildings){
        if (b.hp <= 0 || b.testZone || !this.def(b)) continue;
        if (S.time - (this.last.get(b.id) ?? -Infinity) < 30) continue;
        const found = this.detect(b);
        if (!found.length) continue;
        this.last.set(b.id, S.time);
        const cx = found.reduce((a, u) => a + u.x, 0) / found.length, cy = found.reduce((a, u) => a + u.y, 0) / found.length;
        const dir = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][((Math.round(Math.atan2(cy - b.y, cx - b.x) / (Math.PI / 4)) % 8) + 8) % 8];
        G.notify(`Sensor: ${found.length} hostile${found.length === 1 ? '' : 's'} approaching from the ${dir}`);
        G.Events.emit('sensor:alert', { sensor: b, count: found.length, x: cx, y: cy, direction: dir });
      }
    }
  };

  G.Behaviors.register('turret', { update(b, cfg, dt){ G.Turrets.update(b, cfg, dt); } });
  G.SystemManager.register('shields', { update(dt){ G.Shields.update(dt); G.Sensors.update(); }, reset(){ G.Sensors.last.clear(); G.Shields.hitAt.clear(); } });
  G.SystemManager.register('gates', { update(){ G.Gates.update(); }, reset(){ G.Gates.reset(); G.Turrets.state.clear(); } });
  G.Events.on('building:removed', b => G.Turrets.state.delete(b.id));
})();
