/* Resource gathering and mining.
   Scavenge nodes: units with `gather` + `carry` collect the salvage themselves (fast) and
   haul it to the nearest dropoff (the ship, or any unit with `dropoff`) until the pile is
   gone.
   Deposit nodes (mines): a 1×1 tile that does nothing until a Mine Building is built
   centred over it. The building's `extractor` behaviour slowly fills its own stockpile
   from the deposit; Spiders assigned to the building load from that stockpile and haul it
   to the ship. Deposits are effectively endless. */
(function(){
  'use strict';
  const G = GW;
  const REPLAN = 0.8, DROPOFF_RADIUS = 70, LOAD_RATE = 60, MIN_LOAD = 20;

  const stockTotal = b => Object.values(b.stock || {}).reduce((a, v) => a + (Number(v) || 0), 0);

  G.Gather = {
    LOAD_RATE,
    node(id){ return G.State.resourceNodes.find(n => n.id === id) || null; },
    def(n){ return n && G.Defs.nodes.get(n.type); },
    isDeposit(n){ return this.def(n)?.kind === 'deposit'; },
    // Scavenge nodes use a free world position; deposits occupy one tile (gx, gy).
    addNode(type, x, y){
      const d = G.Defs.nodes.require(type), T = G.CONFIG.TILE;
      const n = { id: 'node-' + G.newId(), type, name: d.name, x, y, remaining: d.capacity };
      if (d.kind === 'deposit'){
        n.gx = Math.floor(x / T); n.gy = Math.floor(y / T);
        n.x = (n.gx + 0.5) * T; n.y = (n.gy + 0.5) * T;
        n.buildingId = null;
      }
      G.State.resourceNodes.push(n);
      return n;
    },
    depositAt(gx, gy){ return G.State.resourceNodes.find(n => n.gx === gx && n.gy === gy && this.isDeposit(n)) || null; },
    // The deposit nearest to a world point within `radiusTiles`, free of any structure.
    freeDepositNear(wx, wy, radiusTiles = 3){
      const T = G.CONFIG.TILE, r = radiusTiles * T;
      let best = null, bd = r * r;
      for (const n of G.State.resourceNodes){
        if (!this.isDeposit(n) || this.mineOn(n)) continue;
        const d = (n.x - wx) ** 2 + (n.y - wy) ** 2;
        if (d <= bd){ bd = d; best = n; }
      }
      return best;
    },
    // Finished Mine Building standing on the deposit, if any.
    mineOn(n){ return n && n.buildingId ? G.State.buildings.find(b => b.id === n.buildingId && b.hp > 0) || null : null; },
    isMine(b){ return !!b && (G.Defs.buildables.get(b.type)?.behaviors || []).some(x => x.type === 'extractor'); },
    stockTotal,

    // Assigns a gatherer to a scavenge node, a deposit with a mine, or a Mine Building.
    command(u, target){
      if (!G.Units.can(u, 'gather')){ G.notify('Select a Utility Spider'); return false; }
      if (!target) return false;
      let mine = null;
      if (this.isMine(target)) mine = target;
      else if (this.isDeposit(target)){
        mine = this.mineOn(target);
        if (!mine){ G.notify('Build a Mine Building on this ' + target.name + ' first'); return false; }
      }
      if (mine){
        G.Units.clearOrders(u);
        u.command = 'gather'; u.mineId = mine.id; u.nodeId = null; u.haulState = 'toMine';
        G.notify(u.name + ' hauling from ' + G.Defs.buildables.get(mine.type).name);
        return true;
      }
      if (target.remaining <= 0) return false;
      G.Units.clearOrders(u);
      u.command = 'gather'; u.nodeId = target.id; u.mineId = null; u.haulState = 'toNode';
      G.notify(u.name + ' assigned to ' + target.name);
      return true;
    },
    // Where haulers unload: just outside the nearest dropoff's south edge.
    dropoffPoint(u){
      let best = null, bd = Infinity;
      for (const v of G.State.units){
        if (v.hp <= 0 || v.team !== u.team || !G.Units.can(v, 'dropoff')) continue;
        const d = G.dist2(u, v);
        if (d < bd){ bd = d; best = v; }
      }
      if (!best) return null;
      const T = G.CONFIG.TILE, h = best.h || 1;
      return { x: best.x, y: best.y + (h / 2 + 1) * T };
    },
    unload(u){
      if (!u.cargo) return 0;
      let total = 0;
      const parts = [];
      for (const [k, v] of Object.entries(u.cargo)){
        if (!(v > 0)) continue;
        G.Economy.add(k, v, 'delivery');
        total += v; u.cargo[k] = 0;
        parts.push(Math.floor(v) + ' ' + (G.Defs.resources.get(k)?.name || k).toLowerCase());
      }
      if (total > 0){
        G.notify(`${u.name} delivered ${parts.join(' + ')} to the ship`);
        G.Events.emit('cargo:delivered', { unit: u, amount: total });
      }
      return total;
    },
    stop(u){ u.command = 'idle'; u.haulState = 'idle'; u.nodeId = null; u.mineId = null; },
    // Shared return leg: walk to the dropoff, unload, then `next` decides what follows.
    returnLeg(u, next){
      const S = G.State, rp = this.dropoffPoint(u);
      if (!rp){ this.stop(u); return; }
      if (Math.hypot(u.x - rp.x, u.y - rp.y) > DROPOFF_RADIUS){
        if (G.Units.navIdle(u) && S.time >= u.commandNextPath){ u.commandNextPath = S.time + REPLAN; S.paths.request(u, rp.x, rp.y); }
        return;
      }
      u.path = []; u.pathIndex = 0;
      this.unload(u);
      next();
    },
    update(u, dt){
      if (u.command !== 'gather') return;
      if (u.mineId) return this.updateMine(u, dt);
      if (!u.nodeId){ this.stop(u); return; }
      const S = G.State, node = this.node(u.nodeId), def = this.def(node);
      if (!node || !def){ this.stop(u); return; }
      const cap = u.cargoCapacity || 0;

      if (u.haulState === 'return'){
        this.returnLeg(u, () => { if (node.remaining > 0){ u.haulState = 'toNode'; u.commandNextPath = 0; } else this.stop(u); });
        return;
      }
      if (Math.hypot(u.x - node.x, u.y - node.y) > def.range){
        if (u.haulState === 'collecting') u.haulState = 'toNode';
        if (G.Units.navIdle(u) && S.time >= u.commandNextPath){ u.commandNextPath = S.time + REPLAN; S.paths.request(u, node.x, node.y); }
        return;
      }
      u.path = []; u.pathIndex = 0; u.haulState = 'collecting';
      const room = Math.max(0, cap - G.Units.cargoTotal(u));
      if (room <= 0){ u.haulState = 'return'; u.commandNextPath = 0; return; }
      const amount = Math.min(node.remaining, def.rate * dt, room);
      node.remaining = G.round6(node.remaining - amount);
      u.cargo[def.resource] = G.round6((u.cargo[def.resource] || 0) + amount);
      if (node.remaining <= 0){ node.remaining = 0; u.haulState = 'return'; u.commandNextPath = 0; }
      else if (G.Units.cargoTotal(u) >= cap - 0.001){ u.haulState = 'return'; u.commandNextPath = 0; }
    },
    // Hauling from a Mine Building's stockpile.
    updateMine(u, dt){
      const S = G.State, b = S.buildings.find(x => x.id === u.mineId && x.hp > 0);
      if (!b){ if (G.Units.cargoTotal(u) > 0) u.haulState = 'return'; else { this.stop(u); return; } }
      const cap = u.cargoCapacity || 0;
      if (u.haulState === 'return'){
        this.returnLeg(u, () => { if (b){ u.haulState = 'toMine'; u.commandNextPath = 0; } else this.stop(u); });
        return;
      }
      if (!G.Construction.inReach(u, b)){
        if (u.haulState === 'loading' || u.haulState === 'waiting') u.haulState = 'toMine';
        if (G.Units.navIdle(u) && S.time >= u.commandNextPath){
          u.commandNextPath = S.time + REPLAN;
          const ap = G.Construction.approachPoint(b.gx, b.gy, b.w, b.h, u);
          S.paths.request(u, ap.x, ap.y);
        }
        return;
      }
      u.path = []; u.pathIndex = 0;
      u.heading = Math.atan2(b.y - u.y, b.x - u.x);
      const room = Math.max(0, cap - G.Units.cargoTotal(u)), avail = stockTotal(b);
      if (room <= 0.001){ u.haulState = 'return'; u.commandNextPath = 0; return; }
      const carrying = G.Units.cargoTotal(u);
      // Stockpile drained mid-load: leave with what was loaded rather than wait on the trickle.
      if (avail < 1 && carrying >= 1){ u.haulState = 'return'; u.commandNextPath = 0; return; }
      // Arriving empty-handed: wait until the mine has produced a worthwhile load.
      if (carrying < 1 && avail < Math.min(MIN_LOAD, room)){ u.haulState = 'waiting'; return; }
      u.haulState = 'loading';
      let take = Math.min(room, avail, LOAD_RATE * dt);
      for (const [k, v] of Object.entries(b.stock)){
        if (take <= 0) break;
        const m = Math.min(v, take);
        b.stock[k] = G.round6(v - m); u.cargo[k] = G.round6((u.cargo[k] || 0) + m); take -= m;
      }
      if (G.Units.cargoTotal(u) >= cap - 0.001) { u.haulState = 'return'; u.commandNextPath = 0; }
    }
  };

  // A Mine Building claims the deposit under its centre as soon as it is placed.
  function bind(b){
    const n = (b.nodeId && G.Gather.node(b.nodeId)) || G.Gather.depositAt(b.gx + Math.floor(b.w / 2), b.gy + Math.floor(b.h / 2));
    if (!n) return null;
    b.nodeId = n.id; n.buildingId = b.id;
    return n;
  }
  G.Events.on('building:placed', b => { if (G.Gather.isMine(b)) bind(b); });

  // Mine Buildings fill their stockpile from the deposit.
  G.Behaviors.register('extractor', {
    update(b, cfg, dt){
      const G_ = G.Gather;
      const n = (b.nodeId && G_.node(b.nodeId)) || bind(b);
      if (!n) return;
      const d = G_.def(n), cap = cfg.stockCap || 300;
      if (!b.stock) b.stock = {};
      const room = cap - stockTotal(b);
      if (room <= 0 || n.remaining <= 0) return;
      const amount = Math.min(room, n.remaining, d.rate * dt);
      n.remaining = G.round6(n.remaining - amount);
      b.stock[d.resource] = G.round6((b.stock[d.resource] || 0) + amount);
    }
  });
  G.Events.on('building:removed', b => {
    for (const n of G.State.resourceNodes) if (n.buildingId === b.id) n.buildingId = null;
  });

  G.SystemManager.register('gather', {
    update(dt){ for (const u of G.State.units) if (u.hp > 0 && u.command === 'gather') G.Gather.update(u, dt); }
  });
})();
