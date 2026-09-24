/* Structures: placement rules, occupancy stamping, and data-driven behaviours.
   A building's function comes from the `behaviors` list in its definition; each entry is
   dispatched to a handler registered with G.Behaviors.register(type, handler). */
(function(){
  'use strict';
  const G = GW;

  G.Behaviors = {
    handlers: new Map(),
    register(type, handler){ this.handlers.set(type, handler); return handler; }
  };

  G.Buildings = {
    version: 0,
    def(b){ return G.Defs.buildables.get(b.type); },
    get(id){ return G.State.buildings.find(b => b.id === id) || null; },
    // Places a finished structure. Container buildables become item containers.
    add(type, gx, gy, opts = {}){
      const S = G.State, d = G.Defs.buildables.require(type), T = G.CONFIG.TILE;
      if (d.container){
        const c = G.Containers.create((gx + 0.5) * T, (gy + 0.5) * T, [], { opened: true, built: true, gx, gy, capacity: d.container.capacity, name: d.name });
        Object.assign(c, opts.extra || {});
        return c;
      }
      const b = {
        id: opts.id || 'building-' + G.newId(), type, team: opts.team || d.team,
        gx, gy, w: d.w, h: d.h, x: (gx + d.w / 2) * T, y: (gy + d.h / 2) * T,
        hp: opts.hp != null ? opts.hp : d.hp, maxHp: d.hp, ...(opts.extra || {})
      };
      if (d.level) b.level = d.level;
      if (d.fabricator){ b.fabQueue = b.fabQueue || []; if (b.rally === undefined) b.rally = null; }
      return this.adopt(b);
    },
    adopt(b){
      const d = this.def(b);
      G.State.buildings.push(b);
      if (d && d.blocksMovement && G.State.grid) G.State.grid.stamp(b.gx, b.gy, b.w, b.h, 1);
      this.version++;
      G.Events.emit('building:placed', b);
      return b;
    },
    remove(b){
      const S = G.State, i = S.buildings.indexOf(b);
      if (i < 0) return false;
      S.buildings.splice(i, 1);
      const d = this.def(b);
      if (d && d.blocksMovement && S.grid) S.grid.stamp(b.gx, b.gy, b.w, b.h, -1);
      this.version++;
      G.Events.emit('building:removed', b);
      return true;
    },
    at(gx, gy){
      for (const b of G.State.buildings) if (gx >= b.gx && gx < b.gx + b.w && gy >= b.gy && gy < b.gy + b.h) return b;
      return null;
    },
    // True when a w×h footprint at (gx, gy) is open terrain free of structures, sites,
    // containers and units.
    canPlace(gx, gy, w = 1, h = 1){
      const S = G.State, C = G.CONFIG, grid = S.grid;
      if (!grid || gx < 0 || gy < 0 || gx + w > C.COLS || gy + h > C.ROWS) return false;
      for (let y = gy; y < gy + h; y++) for (let x = gx; x < gx + w; x++) if (!grid.passable(x, y)) return false;
      for (const c of S.containers){
        if (c.type === 'ground_item' && !c.items.length) continue;
        if (c.gx >= gx && c.gx < gx + w && c.gy >= gy && c.gy < gy + h) return false;
      }
      for (const s of S.constructionSites) if (s.gx < gx + w && s.gx + s.w > gx && s.gy < gy + h && s.gy + s.h > gy) return false;
      const T = C.TILE, cx = (gx + w / 2) * T, cy = (gy + h / 2) * T, r = Math.max(w, h) * T;
      const near = S.spatial ? S.spatial.query(cx, cy, r) : S.units;
      for (const u of near){
        if (u.isShip || u.hp <= 0) continue;
        const ux = Math.floor(u.x / T), uy = Math.floor(u.y / T);
        if (ux >= gx && ux < gx + w && uy >= gy && uy < gy + h) return false;
      }
      return true;
    },
    // Full placement rule for a buildable: open footprint, and deposits respected. Mine
    // structures (placeOnNode: 'deposit') must be centred on a free deposit; every other
    // structure must leave deposits uncovered.
    canPlaceKey(key, gx, gy){
      const d = G.Defs.buildables.get(key);
      if (!d || !this.canPlace(gx, gy, d.w, d.h)) return false;
      const inside = G.State.resourceNodes.filter(n => G.Gather.isDeposit(n) && n.gx >= gx && n.gx < gx + d.w && n.gy >= gy && n.gy < gy + d.h);
      if (d.placeOnNode !== 'deposit') return inside.length === 0;
      const centre = G.Gather.depositAt(gx + Math.floor(d.w / 2), gy + Math.floor(d.h / 2));
      return !!centre && inside.length === 1 && !G.Gather.mineOn(centre) && G.Defs.nodes.get(centre.type).building === key;
    },
    // Top-left tile for placing `key` near a world point: snapped over the nearest free
    // deposit for mine structures, the tile under the point otherwise.
    placementAt(key, wx, wy){
      const d = G.Defs.buildables.get(key), T = G.CONFIG.TILE;
      if (d && d.placeOnNode === 'deposit'){
        const n = G.Gather.freeDepositNear(wx, wy, 3);
        if (n) return { gx: n.gx - Math.floor(d.w / 2), gy: n.gy - Math.floor(d.h / 2), node: n };
        return { gx: Math.floor(wx / T) - Math.floor(d.w / 2), gy: Math.floor(wy / T) - Math.floor(d.h / 2), node: null };
      }
      return { gx: Math.floor(wx / T), gy: Math.floor(wy / T), node: null };
    },
    // Nearest structure an attacker of another team may target within `r` (edge distance).
    // Testing-zone fixtures are never targeted.
    nearestTarget(u, r){
      const T = G.CONFIG.TILE;
      let best = null, bd = Infinity;
      for (const b of G.State.buildings){
        if (b.hp <= 0 || b.team === u.team || b.testZone) continue;
        const dx = Math.max(Math.abs(u.x - b.x) - b.w * T / 2, 0), dy = Math.max(Math.abs(u.y - b.y) - b.h * T / 2, 0), d = Math.hypot(dx, dy);
        if (d <= r && d < bd){ bd = d; best = b; }
      }
      return best;
    },
    // Largest damage reduction from friendly aura structures covering `unit`.
    damageReduction(unit){
      if (!unit || unit.team !== 'blue' || !unit.radius) return 0;
      let best = 0;
      for (const b of G.State.buildings){
        if (b.hp <= 0 || b.team !== unit.team) continue;
        for (const beh of this.def(b)?.behaviors || []){
          if (beh.type !== 'defenseAura') continue;
          const r = G.CONFIG.TILE * beh.radiusTiles + unit.radius;
          if (G.dist2(unit, b) <= r * r) best = Math.max(best, beh.reduction || 0);
        }
      }
      return best;
    }
  };

  G.Behaviors.register('defenseAura', {});   // read on demand by combat

  G.Behaviors.register('repairAura', {
    update(b, cfg, dt){
      const S = G.State, r = G.CONFIG.TILE * cfg.radiusTiles;
      const hash = S.teamSpatial && S.teamSpatial[b.team];
      const near = hash ? hash.query(b.x, b.y, r + 40) : S.units;
      for (const u of near){
        if (u.hp <= 0 || u.isShip || u.team !== b.team || u.hp >= u.maxHp) continue;
        if (G.dist2(u, b) <= (r + u.radius) * (r + u.radius)) u.hp = Math.min(u.maxHp, u.hp + cfg.rate * dt);
      }
    }
  });

  G.SystemManager.register('buildings', {
    update(dt){
      const S = G.State;
      let destroyed = false;
      for (const b of S.buildings){
        if (b.hp <= 0){ destroyed = true; continue; }
        const d = G.Defs.buildables.get(b.type);
        if (!d) continue;
        for (const beh of d.behaviors){
          const h = G.Behaviors.handlers.get(beh.type);
          if (h && h.update) h.update(b, beh, dt);
        }
      }
      // Destroyed structures leave the world.
      if (destroyed) for (const b of S.buildings.filter(b => b.hp <= 0)){
        if (b.fabQueue && b.fabQueue.length) G.Fabrication.refundQueue(b);
        G.Buildings.remove(b);
      }
    }
  });
})();
