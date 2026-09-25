/* Gates and turrets. Nothing here is saved: gate states follow from where units stand,
   and a turret's cooldown and aim restart when a game loads.

   Gates don't stamp the grid, so paths lead through them. Movement asks G.Gates.blocks():
   enemy units can never enter a gate tile; friendly units only while the gate is open.
   A gate opens when a friendly unit is within `openTiles` of it and no enemy is within
   `hostileTiles`; otherwise it stays shut.

   Turrets (`turret` behaviour) pick the nearest enemy unit they can hit (ground, air or
   any) between `minRange` and `range`, and fire every `reload` seconds. `splash` also
   hits other enemies that close to the target; `ammo` spends one of that resource per shot
   from the stockpile and holds fire without it. Testing-zone copies never fire. */
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
      const S = G.State;
      const hit = u => { u.hp -= cfg.damage; G.Events.emit('combat:hit', { attacker: b, target: u, damage: cfg.damage }); };
      hit(t);
      if (cfg.splash){
        const hash = S.teamSpatial[t.team];
        for (const u of hash ? hash.query(t.x, t.y, cfg.splash) : []) if (u !== t && u.hp > 0 && this.canHit(cfg, u) && G.dist2(u, t) <= cfg.splash * cfg.splash) hit(u);
      }
      S.shots.push({ x1: b.x, y1: b.y, x2: t.x, y2: t.y, life: cfg.shot ? 0.18 : 0.09, team: b.team, kind: cfg.shot || null });
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

  G.Behaviors.register('turret', { update(b, cfg, dt){ G.Turrets.update(b, cfg, dt); } });
  G.SystemManager.register('gates', { update(){ G.Gates.update(); }, reset(){ G.Gates.reset(); G.Turrets.state.clear(); } });
  G.Events.on('building:removed', b => G.Turrets.state.delete(b.id));
})();
