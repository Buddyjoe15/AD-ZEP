/* Units. Plain serialisable objects created from unit definitions and indexed by id, so
   lookups stay O(1) no matter how many units exist. */
(function(){
  'use strict';
  const G = GW;
  const capCache = new WeakMap();
  const capsOf = def => {
    let s = capCache.get(def);
    if (!s){ s = new Set(def.capabilities); capCache.set(def, s); }
    return s;
  };

  G.Units = {
    def(u){ return G.Defs.units.get(u.type); },
    can(u, cap){ const d = u && G.Defs.units.get(u.type); return !!d && capsOf(d).has(cap); },
    get(id){ return id == null ? null : (G.State.unitIndex && G.State.unitIndex.get(id)) || null; },
    alive(id){ const u = this.get(id); return u && u.hp > 0 ? u : null; },
    hero(){ return this.alive(G.State.heroId); },
    ship(){ return this.alive(G.State.shipId); },
    rebuildIndex(){
      const S = G.State;
      S.unitIndex = new Map();
      for (const u of S.units) S.unitIndex.set(u.id, u);
    },
    // Builds a unit object from its definition without adding it to the world.
    make(type, x, y, opts = {}){
      const d = G.Defs.units.require(type);
      const u = {
        id: opts.id != null ? opts.id : G.newId(), type, team: opts.team || d.team, name: d.name,
        x, y, heading: 0, hp: d.hp, maxHp: d.hp, speed: d.speed, radius: d.radius,
        range: d.range, damage: d.damage, reload: d.reload, cool: 0, sight: d.sight,
        path: [], pathIndex: 0, pathPending: false,
        command: 'idle', guardPoint: null, patrolA: null, patrolB: null, patrolTarget: 0, commandNextPath: 0,
        recallPoint: null, recallRetry: 0, targetId: null, targetNextScan: 0, aiNextPath: 0, squad: null
      };
      if (d.cargoCapacity > 0){ u.cargo = {}; u.cargoCapacity = d.cargoCapacity; u.haulState = 'idle'; u.nodeId = null; }
      if (capsOf(d).has('build')) u.buildSiteId = null;
      if (d.storageSlots > 0) u.storage = { id: 'storage-' + u.id, name: d.name + ' Storage', capacity: d.storageSlots, items: [], opened: true, mobileUnitId: u.id };
      if (d.footprint){
        const T = G.CONFIG.TILE;
        u.w = d.footprint.w; u.h = d.footprint.h;
        u.gx = Math.round(x / T - u.w / 2); u.gy = Math.round(y / T - u.h / 2);
      }
      if (d.fabricator) u.fabQueue = [];
      return u;
    },
    spawn(type, x, y, opts = {}){
      const S = G.State, u = this.make(type, x, y, opts);
      S.units.push(u);
      if (!S.unitIndex) this.rebuildIndex(); else S.unitIndex.set(u.id, u);
      if (u.w && S.grid) S.grid.stamp(u.gx, u.gy, u.w, u.h, 1);
      G.Events.emit('unit:spawned', u);
      return u;
    },
    // Adds an existing unit object (restore / transit). Occupancy is stamped here.
    adopt(u){
      const S = G.State;
      S.units.push(u);
      if (!S.unitIndex) this.rebuildIndex(); else S.unitIndex.set(u.id, u);
      if (u.w && S.grid) S.grid.stamp(u.gx, u.gy, u.w, u.h, 1);
      return u;
    },
    // Removes dead units; returns the removed list.
    sweep(){
      const S = G.State, dead = [];
      let w = 0;
      for (const u of S.units){ if (u.hp > 0) S.units[w++] = u; else dead.push(u); }
      S.units.length = w;
      for (const u of dead){
        S.unitIndex.delete(u.id);
        S.selected.delete(u.id);
        if (u.w && S.grid) S.grid.stamp(u.gx, u.gy, u.w, u.h, -1);
        if (S.paths) S.paths.cancel(u);
        G.Events.emit('unit:died', u);
      }
      return dead;
    },
    friendly(){ return G.State.units.filter(u => u.team === 'blue' && u.hp > 0); },
    crew(){ return G.State.units.filter(u => u.team === 'blue' && u.hp > 0 && !u.isShip); },
    countTeam(team){ let n = 0; for (const u of G.State.units) if (u.team === team && u.hp > 0) n++; return n; },
    cargoTotal(u){ let n = 0; for (const v of Object.values(u.cargo || {})) n += Number(v) || 0; return n; },
    // Clears movement and any job. Construction in progress is cancelled and refunded.
    clearOrders(u, { keepRecall = false } = {}){
      if (u.buildSiteId && G.Construction) G.Construction.cancelFor(u, true);
      if (G.State.paths) G.State.paths.cancel(u);
      u.path = []; u.pathIndex = 0; u.command = 'idle'; u.commandNextPath = 0;
      u.guardPoint = null; u.patrolA = null; u.patrolB = null;
      if (u.cargo){ u.nodeId = null; u.mineId = null; u.haulState = 'idle'; }
      u.followId = null;
      if (!keepRecall) u.recallPoint = null;
    },
    navIdle(u){ return !u.path.length && !u.pathPending; }
  };
})();
