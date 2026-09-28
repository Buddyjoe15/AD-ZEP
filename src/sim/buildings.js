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

  // Structures are placed on a building grid of SUB × SUB cells per tile: `gx, gy` is the tile
  // of the top-left corner and `sx, sy` (0 to SUB − 1) the cell within it, so a structure can
  // sit a quarter tile over. Sizes (`w`, `h`) stay whole tiles. Movement stays tile-based:
  // every tile a structure touches (its `cover`) is blocked for pathfinding, while placement
  // checks overlaps cell by cell, so two structures may share a tile.
  const SUB = 4;

  G.Buildings = {
    version: 0, SUB,
    // Left and top edges in tiles (fractional), for drawing; `cover` is the tiles it touches.
    fx(b){ return b.gx + (b.sx || 0) / SUB; },
    fy(b){ return b.gy + (b.sy || 0) / SUB; },
    cover(b){ return { gx: b.gx, gy: b.gy, w: b.w + (b.sx ? 1 : 0), h: b.h + (b.sy ? 1 : 0) }; },
    // Building-grid cell under world point (wx, wy) as a tile and a cell within it.
    cellAt(wx, wy){ const T = G.CONFIG.TILE, c = Math.floor(wx / T * SUB), r = Math.floor(wy / T * SUB); return this.split(c, r); },
    split(c, r){ const gx = Math.floor(c / SUB), gy = Math.floor(r / SUB); return { gx, gy, sx: c - gx * SUB, sy: r - gy * SUB }; },
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
      const sx = opts.sx || 0, sy = opts.sy || 0;
      const b = {
        id: opts.id || 'building-' + G.newId(), type, team: opts.team || d.team,
        gx, gy, sx, sy, w: d.w, h: d.h, x: (gx + sx / SUB + d.w / 2) * T, y: (gy + sy / SUB + d.h / 2) * T,
        hp: opts.hp != null ? opts.hp : d.hp, maxHp: d.hp, ...(opts.extra || {})
      };
      if (d.level) b.level = d.level;
      if (d.fabricator){ b.fabQueue = b.fabQueue || []; if (b.rally === undefined) b.rally = null; }
      if (d.shield){ if (b.shieldOn === undefined) b.shieldOn = false; if (b.shield === undefined) b.shield = 0; }   // switched off, empty
      return this.adopt(b);
    },
    adopt(b){
      const d = this.def(b);
      G.State.buildings.push(b);
      if (d && d.blocksMovement && G.State.grid){ const c = this.cover(b); G.State.grid.stamp(c.gx, c.gy, c.w, c.h, 1); }
      this.version++;
      G.Events.emit('building:placed', b);
      return b;
    },
    remove(b){
      const S = G.State, i = S.buildings.indexOf(b);
      if (i < 0) return false;
      S.buildings.splice(i, 1);
      const d = this.def(b);
      if (d && d.blocksMovement && S.grid){ const c = this.cover(b); S.grid.stamp(c.gx, c.gy, c.w, c.h, -1); }
      this.version++;
      G.Events.emit('building:removed', b);
      return true;
    },
    // The structure covering tile (gx, gy), if any.
    at(gx, gy){
      for (const b of G.State.buildings){ const c = this.cover(b); if (gx >= c.gx && gx < c.gx + c.w && gy >= c.gy && gy < c.gy + c.h) return b; }
      return null;
    },
    // The structure whose footprint contains world point (wx, wy), if any.
    atPoint(wx, wy){
      const T = G.CONFIG.TILE;
      for (const b of G.State.buildings){ const x = this.fx(b) * T, y = this.fy(b) * T; if (wx >= x && wx < x + b.w * T && wy >= y && wy < y + b.h * T) return b; }
      return null;
    },
    // True when a w×h footprint at tile (gx, gy), cell (sx, sy), is on open terrain and
    // overlaps no structure, site, container or unit (structures and sites cell by cell).
    canPlace(gx, gy, w = 1, h = 1, sx = 0, sy = 0){
      const S = G.State, C = G.CONFIG, grid = S.grid, cw = w + (sx ? 1 : 0), ch = h + (sy ? 1 : 0);
      if (!grid || gx < 0 || gy < 0 || gx + cw > C.COLS || gy + ch > C.ROWS) return false;
      for (let y = gy; y < gy + ch; y++) for (let x = gx; x < gx + cw; x++) if (!grid.terrainPassable(x, y)) return false;
      // In cells: this footprint, then anything else's.
      const c0 = gx * SUB + sx, r0 = gy * SUB + sy, c1 = c0 + w * SUB, r1 = r0 + h * SUB;
      const hits = (x, y, ww, hh) => x < c1 && x + ww > c0 && y < r1 && y + hh > r0;
      const rect = o => hits(o.gx * SUB + (o.sx || 0), o.gy * SUB + (o.sy || 0), o.w * SUB, o.h * SUB);
      for (const c of S.containers){
        if (c.type === 'ground_item' && !c.items.length) continue;
        if (hits(c.gx * SUB, c.gy * SUB, SUB, SUB)) return false;
      }
      for (const s of S.constructionSites) if (rect(s)) return false;
      for (const b of S.buildings) if (rect(b)) return false;
      const T = C.TILE, x0 = c0 * T / SUB, y0 = r0 * T / SUB, x1 = c1 * T / SUB, y1 = r1 * T / SUB;
      const near = S.spatial ? S.spatial.query((x0 + x1) / 2, (y0 + y1) / 2, Math.max(cw, ch) * T) : S.units;
      for (const u of near){
        if (u.hp <= 0) continue;
        if (u.isShip){ if (u.w && hits(u.gx * SUB, u.gy * SUB, u.w * SUB, u.h * SUB)) return false; continue; }
        if (u.x >= x0 && u.x < x1 && u.y >= y0 && u.y < y1) return false;
      }
      // (The ship stamps the grid too; the spatial query can miss its far corners.)
      const ship = G.Units.ship && G.Units.ship();
      if (ship && ship.w && hits(ship.gx * SUB, ship.gy * SUB, ship.w * SUB, ship.h * SUB)) return false;
      return true;
    },
    // Full placement rule for a buildable: open footprint, and deposits respected. Mine
    // structures (placeOnNode: 'deposit') must be centred on a free deposit; every other
    // structure must leave deposits uncovered.
    canPlaceKey(key, gx, gy, sx = 0, sy = 0){
      const d = G.Defs.buildables.get(key);
      if (!d || !this.canPlace(gx, gy, d.w, d.h, sx, sy)) return false;
      const cw = d.w + (sx ? 1 : 0), ch = d.h + (sy ? 1 : 0);
      const inside = G.State.resourceNodes.filter(n => G.Gather.isDeposit(n) && n.gx >= gx && n.gx < gx + cw && n.gy >= gy && n.gy < gy + ch);
      if (d.placeOnNode !== 'deposit') return inside.length === 0;
      if (sx || sy) return false;   // an extractor sits squarely on its deposit's tile
      const centre = G.Gather.depositAt(gx + Math.floor(d.w / 2), gy + Math.floor(d.h / 2));
      return !!centre && inside.length === 1 && !G.Gather.mineOn(centre) && G.Defs.nodes.get(centre.type).building === key;
    },
    // Where to place `key` near a world point, as { gx, gy, sx, sy }: snapped over the nearest
    // free deposit for mine structures (whole tiles), otherwise centred on the point and
    // snapped to the building grid's cells.
    placementAt(key, wx, wy){
      const d = G.Defs.buildables.get(key), T = G.CONFIG.TILE;
      if (d && d.placeOnNode === 'deposit'){
        const n = G.Gather.freeDepositNear(wx, wy, 3);
        if (n) return { gx: n.gx - Math.floor(d.w / 2), gy: n.gy - Math.floor(d.h / 2), sx: 0, sy: 0, node: n };
        return { gx: Math.floor(wx / T) - Math.floor(d.w / 2), gy: Math.floor(wy / T) - Math.floor(d.h / 2), sx: 0, sy: 0, node: null };
      }
      const w = d ? d.w : 1, h = d ? d.h : 1;
      return { ...this.split(Math.round(wx / T * SUB - w * SUB / 2), Math.round(wy / T * SUB - h * SUB / 2)), node: null };
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
    // Fraction of damage a structure shrugs off (its definition's `armor`); 0 for units.
    armor(t){ return t && !t.radius && t.type ? this.def(t)?.armor || 0 : 0; },
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
