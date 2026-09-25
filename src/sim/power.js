/* Electricity. Power is a rate, not a stockpile: each tick the team's supply (the ship's
   Warp Drive, Solar Arrays) is compared with the demand of the structures that are
   working, and every consumer runs at the same fraction, `ratio` = supply / demand
   (capped at 1). A short grid slows production and extraction; it never stops them
   outright. There are no wires: every friendly producer feeds every friendly consumer.

   Definitions carry `power`:
     { supply: 25 }                       – constant output (the ship)
     { supply: 8, solar: true }           – output × the current Earth's solar efficiency
     { demand: 10, when: 'producing' }    – draws only while its production queue runs
     { demand: 5, when: 'extracting' }    – draws only while a Mine Building is extracting
     { demand: 2 }                        – draws all the time
   Everything here is recomputed from saved state every tick, so nothing is saved. */
(function(){
  'use strict';
  const G = GW;

  // Units and buildables have distinct keys (checked by GW.Defs.verify).
  const defOf = o => G.Defs.buildables.get(o.type) || G.Defs.units.get(o.type);

  G.Power = {
    grid: { supply: 0, demand: 0, ratio: 1, solar: 1 },   // blue team, rebuilt each tick
    // Solar efficiency of the current Earth (1 = full sun), from its climate.
    solarEfficiency(){
      const E = G.State.expedition;
      return E && G.Expedition ? G.Expedition.climate().solar ?? 1 : 1;
    },
    // Current output of one producer.
    output(o){
      const p = defOf(o)?.power;
      if (!p || !p.supply || o.hp <= 0) return 0;
      return p.solar ? p.supply * this.solarEfficiency() : p.supply;
    },
    // Whether a consumer is drawing power right now.
    drawing(o){
      const p = defOf(o)?.power;
      if (!p || !p.demand || o.hp <= 0) return false;
      if (p.when === 'producing') return !!(o.fabQueue && o.fabQueue.length);
      if (p.when === 'extracting') return G.Gather.extracting(o);
      return true;
    },
    // Current draw of one consumer.
    draw(o){ return this.drawing(o) ? defOf(o).power.demand : 0; },
    compute(team = 'blue'){
      const S = G.State;
      let supply = 0, demand = 0;
      for (const u of S.units) if (u.team === team){ supply += this.output(u); demand += this.draw(u); }
      for (const b of S.buildings) if (b.team === team){ supply += this.output(b); demand += this.draw(b); }
      supply = G.round6(supply);
      return { supply, demand, ratio: demand > 0 ? Math.min(1, supply / demand) : 1, solar: this.solarEfficiency() };
    },
    // Speed factor for a consumer this tick (1 for anything that doesn't use power or
    // isn't on the player's grid).
    factor(o){ return o.team === 'blue' && defOf(o)?.power?.demand ? this.grid.ratio : 1; },
    update(){ this.grid = this.compute('blue'); }
  };

  G.SystemManager.register('power', { update(){ G.Power.update(); }, reset(){ G.Power.update(); } });
  // Up to date as soon as a game starts, loads or arrives on a new Earth, even while paused.
  for (const e of ['game:started', 'game:restored', 'expedition:transit']) G.Events.on(e, () => G.Power.update());
})();
