/* Unit spawners: structures with a `spawner` definition produce units continuously at a
   configurable rate until a configurable count is reached. Built for load testing (how
   many units the game handles on screen), e.g. the Hostile Fabricator.
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

    def(b){ return G.Defs.buildables.get(b.type)?.spawner || null; },
    // Settings for `b`, created from the definition's defaults on first use.
    state(b){
      const d = this.def(b);
      if (!d) return null;
      if (!b.spawner) b.spawner = { running: false, rate: d.rate || 5, amount: d.amount || 100, spawned: 0, acc: 0, hold: d.hold ?? true };
      return b.spawner;
    },
    configure(b, patch = {}){
      const s = this.state(b);
      if (!s) return null;
      if (patch.rate != null && G.isNum(+patch.rate)) s.rate = G.clamp(+patch.rate, 0.1, this.MAX_RATE);
      if (patch.amount != null && G.isNum(+patch.amount)) s.amount = G.clamp(Math.round(+patch.amount), 1, this.MAX_AMOUNT);
      if (patch.hold != null){
        s.hold = !!patch.hold;
        for (const u of this.spawnedBy(b)){ u.aiHold = s.hold; if (s.hold){ u.path = []; u.pathIndex = 0; G.State.paths.cancel(u); } }
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
    // Even disc around the structure (sunflower spiral), snapped to open tiles.
    spawnPoint(b, n){
      const T = G.CONFIG.TILE, a = n * 2.39996, r = (Math.max(b.w, b.h) * T) / 2 + 40 + 16 * Math.sqrt(n);
      return G.openPoint(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 0, 12);
    },
    update(b, dt){
      const s = this.state(b), d = this.def(b);
      if (!s || !s.running) return;
      s.acc += s.rate * dt;
      let made = 0;
      while (s.acc >= 1 && s.spawned < s.amount && made < this.MAX_PER_TICK){
        if (G.State.units.length >= this.HARD_UNIT_CAP){ s.running = false; G.notify('Spawner stopped: world unit cap reached'); break; }
        const p = this.spawnPoint(b, s.spawned), u = G.Units.spawn(d.unit, p.x, p.y, { team: b.team });
        u.spawnerId = b.id;
        if (s.hold) u.aiHold = true;
        s.acc -= 1; s.spawned++; made++;
      }
      if (s.acc > this.MAX_PER_TICK) s.acc = this.MAX_PER_TICK;   // never bank a large backlog
      if (s.spawned >= s.amount){ s.running = false; s.acc = 0; G.Events.emit('spawner:changed', b); }
    }
  };

  G.Behaviors.register('spawner', { update(b, cfg, dt){ G.Spawner.update(b, dt); } });
})();
