/* Weather, for now only how the wind moves Woodlands trees. The current weather is a
   session setting, like fog of war and pixel art: it is not saved, and the Debug panel
   switches it. Once weather affects the simulation, the presets belong in src/data and the
   current weather in the save (see "Save format rules" in CLAUDE.md). */
(function(){
  'use strict';
  const G = GW, TAU = Math.PI * 2;
  G.Weather = {
    // Two motions: leaves rustling (`rustle`: share of trees, `rustleFps`: steps per second)
    // and the crown leaning downwind (`swaying`: share of trees, `lean`: furthest lean,
    // 0–2 art px, `speed`: lean cycles per second). Gusts roll from west to east.
    PRESETS: {
      calm:         { name: 'Calm',         rustle: 0.3, rustleFps: 1.5, swaying: 0,    lean: 0, speed: 0 },
      small_breeze: { name: 'Small breeze', rustle: 0.5, rustleFps: 2.5, swaying: 0.25, lean: 1, speed: 0.4 },
      breeze:       { name: 'Breeze',       rustle: 0.8, rustleFps: 4,   swaying: 0.6,  lean: 1, speed: 0.7 },
      strong_wind:  { name: 'Strong wind',  rustle: 1,   rustleFps: 6,   swaying: 0.9,  lean: 2, speed: 1.2 },
      storm:        { name: 'Storm',        rustle: 1,   rustleFps: 9,   swaying: 1,    lean: 2, speed: 2 }
    },
    key: 'small_breeze',
    current(){ return this.PRESETS[this.key]; },
    set(key){
      if (!this.PRESETS[key]) return false;
      this.key = key;
      G.Events.emit('weather:changed', key);
      return true;
    },
    sways(gx, gy){ const w = this.current(); return w.lean > 0 && G.hashRandom3(gx, gy, 911) < w.swaying; },
    rustles(gx, gy){ return G.hashRandom3(gx, gy, 917) < this.current().rustle; },
    // True when the tree on tile (gx, gy) moves at all in the current weather.
    moves(gx, gy){ return this.sways(gx, gy) || this.rustles(gx, gy); },
    // Lean (0 = upright) and rustle step (0–2) for the tree on tile (gx, gy) at time t (s).
    pose(gx, gy, t){
      const w = this.current();
      let lean = 0, rustle = 0;
      if (this.sways(gx, gy)){
        const phase = G.hashRandom3(gx, gy, 913) * TAU;
        const gust = 0.6 + 0.4 * Math.sin(TAU * t * w.speed * 0.3 - gx * 0.15 - gy * 0.05);
        const s = 0.5 + 0.5 * Math.sin(TAU * t * w.speed + phase);
        lean = Math.min(w.lean, Math.round(s * gust * (w.lean + 0.4)));
      }
      if (this.rustles(gx, gy)) rustle = Math.floor(t * w.rustleFps + G.hashRandom3(gx, gy, 919) * 3) % 3;
      return { lean, rustle };
    }
  };
})();
