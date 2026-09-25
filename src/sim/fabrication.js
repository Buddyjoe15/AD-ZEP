/* Production queues. Any unit or structure whose definition has `fabricator` owns a queue
   ({ recipe, left }) and builds recipes from src/data/world.js: units (the ship and
   Fabricators) or construction resources (the Ore Processor, whose `fabricator.recipes`
   lists what it makes). Costs are paid on enqueue and refunded if the owner is
   destroyed. */
(function(){
  'use strict';
  const G = GW;

  // Centre of the nearest open tile to (x, y), optionally restricted to a region.
  G.openPoint = function(x, y, region = 0, radius = 18){
    const T = G.CONFIG.TILE, grid = G.State.grid;
    const p = grid.nearestOpen(Math.floor(x / T), Math.floor(y / T), radius, region) || grid.nearestOpen(Math.floor(x / T), Math.floor(y / T), radius * 3);
    if (!p) throw new Error('No safe deployment point');
    return { x: (p.x + 0.5) * T, y: (p.y + 0.5) * T };
  };

  G.Fabrication = {
    defOf(owner){ return owner.fabQueue ? (G.Defs.units.get(owner.type) || G.Defs.buildables.get(owner.type)) : null; },
    owners(){
      const S = G.State, out = [];
      for (const u of S.units) if (u.hp > 0 && u.fabQueue) out.push(u);
      for (const b of S.buildings) if (b.hp > 0 && b.fabQueue) out.push(b);
      return out;
    },
    queueMax(owner){ return this.defOf(owner)?.fabricator?.queueMax || 0; },
    // Recipes this owner can build: its own list, or every unit recipe.
    recipesFor(owner){
      const list = this.defOf(owner)?.fabricator?.recipes;
      return list ? list.map(k => G.Defs.recipes.get(k)).filter(Boolean) : G.Defs.recipes.all().filter(r => r.unit);
    },
    makesUnits(owner){ return this.recipesFor(owner).some(r => r.unit); },
    totalQueued(){ return this.owners().reduce((n, o) => n + o.fabQueue.length, 0); },
    // Friendly units plus units still in production (processing does not count).
    population(){
      let queued = 0;
      for (const o of this.owners()) for (const q of o.fabQueue) if (G.Defs.recipes.get(q.recipe)?.unit) queued++;
      return G.Units.countTeam('blue') + queued;
    },
    // Reason the recipe cannot be queued, or '' when it can.
    blocker(owner, key){
      const r = G.Defs.recipes.get(key);
      if (!owner || !owner.fabQueue || !r || !this.recipesFor(owner).includes(r)) return 'Unavailable';
      if (owner.fabQueue.length >= this.queueMax(owner)) return 'Queue full';
      if (r.unit && this.population() >= G.CONFIG.POPULATION_CAP) return 'Fabrication capacity reached';
      if (!G.Economy.canAfford(r.cost)) return 'Need ' + G.Economy.describe(r.cost);
      return '';
    },
    enqueue(owner, key){
      const why = this.blocker(owner, key);
      if (why){ G.notify(why); return false; }
      const r = G.Defs.recipes.get(key);
      G.Economy.spend(r.cost, 'fabrication');
      owner.fabQueue.push({ recipe: key, left: r.time });
      G.Events.emit('fabrication:queued', { owner, recipe: key });
      return true;
    },
    refundQueue(owner){
      for (const q of owner.fabQueue || []) G.Economy.refund(G.Defs.recipes.get(q.recipe)?.cost || {}, 'fabrication cancelled');
      if (owner.fabQueue) owner.fabQueue.length = 0;
    },
    // Rally point for newly fabricated units (null: they wait beside their fabricator).
    setRally(owner, point){
      if (!owner || !owner.fabQueue) return false;
      const C = G.CONFIG;
      owner.rally = point && G.isNum(point.x) && G.isNum(point.y) ? { x: G.clamp(point.x, 0, C.WORLD_W), y: G.clamp(point.y, 0, C.WORLD_H) } : null;
      G.Events.emit('fabrication:rally', owner);
      return true;
    },
    // Sends a new unit to its owner's rally point, spread around it so arrivals do not
    // stack (the offset comes from the unit id, so it needs no saved state).
    toRally(owner, u){
      const r = owner.rally;
      if (!r) return;
      const n = u.id % 37, a = n * 2.39996, d = 26 * Math.sqrt(n), p = G.openPoint(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d);
      G.Orders.move([u], p.x, p.y);
    },
    deployPoint(owner){
      const T = G.CONFIG.TILE, w = owner.w || 1, h = owner.h || 1;
      const ship = G.Units.ship(), region = ship ? G.State.grid.regionAt(ship.gx + Math.floor(ship.w / 2), ship.gy + ship.h) : 0;
      return G.openPoint(owner.x + w * T * 0.75, owner.y + (h / 2 + 2) * T, region);
    },
    update(dt){
      for (const owner of this.owners()){
        const q = owner.fabQueue[0];
        if (!q) continue;
        q.left = G.Cheats.instantBuild ? 0 : q.left - dt;
        if (q.left > 0) continue;
        const r = G.Defs.recipes.get(q.recipe);
        owner.fabQueue.shift();
        if (!r) continue;
        if (r.produces){
          for (const [k, v] of Object.entries(r.produces)) G.Economy.add(k, v, 'processing');
          G.Events.emit('fabrication:completed', { owner, recipe: q.recipe, produced: r.produces });
          continue;
        }
        const p = this.deployPoint(owner), u = G.Units.spawn(r.unit, p.x, p.y);
        this.toRally(owner, u);
        G.Events.emit('fabrication:completed', { owner, unit: u, recipe: q.recipe });
      }
    }
  };

  G.SystemManager.register('fabrication', { update(dt){ G.Fabrication.update(dt); } });
})();
