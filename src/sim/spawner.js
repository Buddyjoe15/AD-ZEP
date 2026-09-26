/* Unit spawners: structures with a `spawner` definition produce units at a configurable
   rate until a configurable count is reached. Built for load testing (how many units the
   game handles on screen), e.g. the Hostile Fabricator.
   Units appear in waves at one spawn point, on the side of the structure facing its rally
   point. A new wave only appears once the previous one has moved off the spawn point.
   With `hold` on, spawned units gather at the rally point (which can be moved) and wait
   there; with it off they advance on Vance.
   Per-building settings live on the building (b.spawner) and are saved with it. */
(function(){
  'use strict';
  const G = GW;

  G.Spawner = {
    RATES: [1, 5, 10, 25, 50, 100, 250],                 // units per second
    AMOUNTS: [10, 50, 100, 250, 500, 1000, 2000, 5000],   // total to spawn
    MAX_RATE: 1000, MAX_AMOUNT: 20000,
    MAX_PER_TICK: 250,        // spreads very fast rates over several ticks
    HARD_UNIT_CAP: 25000,     // never exceed this many units in the world
    RALLY_TILES: 5,           // default rally point: this far south of the structure's edge
    CLEAR_TILES: 1.5,         // the spawn point is clear when no unit of the last wave is this close

    def(b){ return G.Defs.buildables.get(b.type)?.spawner || null; },
    // Settings for `b`, created from the definition's defaults on first use.
    state(b){
      const d = this.def(b);
      if (!d) return null;
      if (!b.spawner) b.spawner = { running: false, rate: d.rate || 5, amount: d.amount || 100, spawned: 0, acc: 0, hold: d.hold ?? true, rally: this.defaultRally(b) };
      return b.spawner;
    },
    defaultRally(b){ const T = G.CONFIG.TILE; return { x: b.x, y: b.y + (b.h / 2 + this.RALLY_TILES) * T }; },
    configure(b, patch = {}){
      const s = this.state(b);
      if (!s) return null;
      if (patch.rate != null && G.isNum(+patch.rate)) s.rate = G.clamp(+patch.rate, 0.1, this.MAX_RATE);
      if (patch.amount != null && G.isNum(+patch.amount)) s.amount = G.clamp(Math.round(+patch.amount), 1, this.MAX_AMOUNT);
      if (patch.rally && G.isNum(patch.rally.x) && G.isNum(patch.rally.y)){
        const C = G.CONFIG;
        s.rally = { x: G.clamp(patch.rally.x, 0, C.WORLD_W), y: G.clamp(patch.rally.y, 0, C.WORLD_H) };
        if (s.hold) this.gather(b);
      }
      if (patch.hold != null && !!patch.hold !== s.hold){
        s.hold = !!patch.hold;
        if (s.hold) this.gather(b);
        else for (const u of this.spawnedBy(b)){ u.aiHold = false; u.path = []; u.pathIndex = 0; G.State.paths.cancel(u); }
      }
      G.Events.emit('spawner:changed', b);
      return s;
    },
    start(b){
      const s = this.state(b);
      if (!s) return false;
      if (s.spawned >= s.amount) s.spawned = 0;   // starting a finished run begins a new one
      s.running = true; s.acc = 0;
      G.Events.emit('spawner:changed', b);
      return true;
    },
    stop(b){ const s = this.state(b); if (s){ s.running = false; G.Events.emit('spawner:changed', b); } },
    resetCount(b){ const s = this.state(b); if (s){ s.spawned = 0; s.acc = 0; G.Events.emit('spawner:changed', b); } },
    spawnedBy(b){ return G.State.units.filter(u => u.spawnerId === b.id && u.hp > 0); },
    // Removes every living unit this spawner produced.
    clear(b){
      let n = 0;
      for (const u of this.spawnedBy(b)){ u.hp = 0; n++; }
      G.Units.sweep();
      G.rebuildSpatial();
      G.Events.emit('spawner:changed', b);
      return n;
    },
    // The single point units appear at: just outside the structure, on the side facing the
    // rally point (south when the rally point is on top of it).
    spawnPoint(b){
      const T = G.CONFIG.TILE, s = this.state(b), dx = s.rally.x - b.x, dy = s.rally.y - b.y, d = Math.hypot(dx, dy);
      const ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : 1, reach = (Math.max(b.w, b.h) * T) / 2 + 30;
      return G.openPoint(b.x + ux * reach, b.y + uy * reach, 0, 12);
    },
    // True when no living unit from this spawner is still on the spawn point. Held units
    // standing there with no route (pushed back, or their route was dropped), or whose next
    // waypoint is no longer in a clear line (the crowd pushed them against a wall), are sent
    // to the rally point again, so the spawner can never block itself.
    spawnClear(b, p){
      const r = this.CLEAR_TILES * G.CONFIG.TILE, r2 = r * r, s = this.state(b), stuck = [], grid = G.State.grid;
      let clear = true;
      G.State.spatial.each(p.x, p.y, r, u => {
        if (u.spawnerId !== b.id || u.hp <= 0 || G.dist2(u, p) >= r2) return;
        clear = false;
        if (!s.hold || u.pathPending) return;
        const next = u.path[u.pathIndex];
        if (!next || !grid.lineClear(u.x, u.y, next.x, next.y)) stuck.push(u);
      });
      stuck.forEach((u, i) => this.sendToRally(b, u, s.spawned + i));
      return clear;
    },
    // Where the n-th unit waits at the rally point (a filled disc, snapped to open ground).
    rallySlot(b, n){
      const s = this.state(b), a = n * 2.39996, r = 22 * Math.sqrt(n);
      return G.openPoint(s.rally.x + Math.cos(a) * r, s.rally.y + Math.sin(a) * r, 0, 12);
    },
    sendToRally(b, u, n){
      const S = G.State, p = this.rallySlot(b, n);
      u.aiHold = true; S.paths.cancel(u);
      if (S.grid.lineClear(u.x, u.y, p.x, p.y)){ u.path = [p]; u.pathIndex = 0; }
      else { u.path = []; u.pathIndex = 0; S.paths.request(u, p.x, p.y); }
    },
    // Sends every living unit from this spawner to the rally point.
    gather(b){ this.spawnedBy(b).forEach((u, i) => this.sendToRally(b, u, i)); },
    update(b, dt){
      const s = this.state(b), d = this.def(b);
      if (!s || !s.running) return;
      s.acc = Math.min(this.MAX_PER_TICK, s.acc + s.rate * dt);   // what waits while the point is busy becomes the next wave
      if (s.acc < 1) return;
      const p = this.spawnPoint(b);
      if (!this.spawnClear(b, p)) return;
      const wave = Math.min(Math.floor(s.acc), s.amount - s.spawned);
      for (let i = 0; i < wave; i++){
        if (G.State.units.length >= this.HARD_UNIT_CAP){ s.running = false; G.notify('Spawner stopped: world unit cap reached'); break; }
        // The wave stands on the spawn point, packed as tightly as the units allow.
        const a = i * 2.39996, r = 9 * Math.sqrt(i);
        let x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (!G.State.grid.passableWorld(x, y)){ x = p.x; y = p.y; }
        const u = G.Units.spawn(d.unit, x, y, { team: b.team });
        u.spawnerId = b.id;
        if (s.hold) this.sendToRally(b, u, s.spawned);
        s.acc -= 1; s.spawned++;
      }
      if (s.spawned >= s.amount){ s.running = false; s.acc = 0; G.Events.emit('spawner:changed', b); }
    }
  };

  G.Behaviors.register('spawner', { update(b, cfg, dt){ G.Spawner.update(b, dt); } });
})();
