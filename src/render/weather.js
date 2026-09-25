/* Weather, for now only how the wind moves Woodlands trees. The current weather is a
   session setting, like fog of war and pixel art: it is not saved, and the Debug panel
   switches it. Once weather affects the simulation, the presets belong in src/data and the
   current weather in the save (see "Save format rules" in CLAUDE.md). */
(function(){
  'use strict';
  const G = GW, TAU = Math.PI * 2;
  G.Weather = {
    // swaying: share of trees that move; lean: furthest sway frame (0–2 art px downwind);
    // speed: sway cycles per second. Gusts roll across the map from west to east.
    PRESETS: {
      calm:         { name: 'Calm',         swaying: 0,    lean: 0, speed: 0 },
      small_breeze: { name: 'Small breeze', swaying: 0.35, lean: 1, speed: 0.45 },
      breeze:       { name: 'Breeze',       swaying: 0.65, lean: 2, speed: 0.75 },
      strong_wind:  { name: 'Strong wind',  swaying: 0.9,  lean: 2, speed: 1.25 },
      storm:        { name: 'Storm',        swaying: 1,    lean: 2, speed: 2.1 }
    },
    key: 'small_breeze',
    current(){ return this.PRESETS[this.key]; },
    set(key){
      if (!this.PRESETS[key]) return false;
      this.key = key;
      G.Events.emit('weather:changed', key);
      return true;
    },
    // True when the tree on tile (gx, gy) moves in the current wind.
    sways(gx, gy){ const w = this.current(); return w.lean > 0 && G.hashRandom3(gx, gy, 911) < w.swaying; },
    // Sway frame for the tree on tile (gx, gy) at time t (seconds): 0 is at rest.
    swayFrame(gx, gy, t){
      const w = this.current();
      if (!this.sways(gx, gy)) return 0;
      const phase = G.hashRandom3(gx, gy, 913) * TAU;
      const gust = 0.6 + 0.4 * Math.sin(TAU * t * w.speed * 0.3 - gx * 0.15 - gy * 0.05);
      const s = 0.5 + 0.5 * Math.sin(TAU * t * w.speed + phase);
      return Math.min(w.lean, Math.round(s * gust * (w.lean + 0.4)));
    }
  };
})();
