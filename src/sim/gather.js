/* Resource gathering: units with the `gather` and `carry` capabilities harvest a node,
   haul the cargo to the nearest dropoff (the ship, or any unit / structure with the
   `dropoff` capability) and repeat until the node is empty. */
(function(){
  'use strict';
  const G = GW;
  const REPLAN = 0.8, DROPOFF_RADIUS = 70;

  G.Gather = {
    node(id){ return G.State.resourceNodes.find(n => n.id === id) || null; },
    addNode(type, x, y){
      const d = G.Defs.nodes.require(type);
      const n = { id: 'node-' + G.newId(), type, name: d.name, x, y, remaining: d.capacity };
      G.State.resourceNodes.push(n);
      return n;
    },
    command(u, node){
      if (!G.Units.can(u, 'gather')){ G.notify('Select a Utility Spider'); return false; }
      if (!node || node.remaining <= 0) return false;
      G.Units.clearOrders(u);
      u.command = 'gather'; u.nodeId = node.id; u.haulState = 'toNode';
      G.notify(u.name + ' assigned to ' + node.name);
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
      for (const [k, v] of Object.entries(u.cargo)){
        if (!(v > 0)) continue;
        G.Economy.add(k, v, 'delivery');
        total += v; u.cargo[k] = 0;
      }
      if (total > 0){
        G.notify(`${u.name} delivered ${Math.floor(total)} metal to the ship`);
        G.Events.emit('cargo:delivered', { unit: u, amount: total });
      }
      return total;
    },
    update(u, dt){
      if (u.command !== 'gather' || !u.nodeId) return;
      const S = G.State, node = this.node(u.nodeId), def = node && G.Defs.nodes.get(node.type);
      if (!node || !def){ u.command = 'idle'; u.haulState = 'idle'; u.nodeId = null; return; }
      const cap = u.cargoCapacity || 0;

      if (u.haulState === 'return'){
        const rp = this.dropoffPoint(u);
        if (!rp){ u.command = 'idle'; u.haulState = 'idle'; return; }
        if (Math.hypot(u.x - rp.x, u.y - rp.y) > DROPOFF_RADIUS){
          if (G.Units.navIdle(u) && S.time >= u.commandNextPath){ u.commandNextPath = S.time + REPLAN; S.paths.request(u, rp.x, rp.y); }
          return;
        }
        u.path = []; u.pathIndex = 0;
        this.unload(u);
        if (node.remaining > 0){ u.haulState = 'toNode'; u.commandNextPath = 0; }
        else { u.command = 'idle'; u.haulState = 'idle'; u.nodeId = null; }
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
    }
  };

  G.SystemManager.register('gather', {
    update(dt){ for (const u of G.State.units) if (u.hp > 0 && u.command === 'gather') G.Gather.update(u, dt); }
  });
})();
