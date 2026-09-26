/* Small shared helpers. No DOM, no game state. */
(function(){
  'use strict';
  const G = GW;

  // Deterministic LCG. Terrain generation depends on this exact sequence: changing it
  // changes every seeded Earth and invalidates the terrain of existing saves.
  G.RNG = function(seed){
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  };
  G.nextSeed = seed => (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  // Stateless deterministic random number in [0, 1) from integer inputs (e.g. seed, tick).
  // Simulation code uses this or G.RNG, never Math.random (tools/check.mjs enforces it).
  G.hashRandom = (...ints) => {
    let h = 2166136261;
    for (const n of ints){ h = Math.imul(h ^ (n | 0), 16777619); h ^= h >>> 13; }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // hashRandom(a, b, c) for hot loops such as terrain noise: the same numbers, without the
  // rest-parameter array or global lookups (both slow millions of calls).
  const imul = Math.imul;
  G.hashRandom3 = (a, b, c) => {
    let h = 2166136261;
    h = imul(h ^ (a | 0), 16777619); h ^= h >>> 13;
    h = imul(h ^ (b | 0), 16777619); h ^= h >>> 13;
    h = imul(h ^ (c | 0), 16777619); h ^= h >>> 13;
    h = imul(h ^ (h >>> 16), 2246822507); h = imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // 32-bit FNV-1a hash of a string (e.g. a structure id), for use as a hashRandom input.
  G.hashString = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h | 0; };
  // Wall clock, injected by the presentation layer (src/main.js). The simulation may only
  // use it for diagnostics timings and save timestamps, never for game logic, and it reads
  // as zero headless so tests stay deterministic.
  G.Clock = { now: () => 0, stamp: () => '1970-01-01T00:00:00.000Z' };

  G.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  G.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  G.dist2 = (a, b) => { const x = a.x - b.x, y = a.y - b.y; return x * x + y * y; };
  G.within = (a, b, r) => G.dist2(a, b) <= r * r;
  G.copy = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  G.isNum = x => typeof x === 'number' && Number.isFinite(x);
  G.round6 = n => Math.round(n * 1e6) / 1e6;

  G.esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  G.initials = n => {
    const w = String(n).trim().split(/\s+/);
    return (w.length > 1 ? w.map(x => x[0]).join('') : w[0].slice(0, 2)).toUpperCase();
  };
  G.fmtTime = t => {
    const s = Math.floor(t % 60), m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };

  // Min-heap of integer ids keyed by float priority. Allocation-free after warm-up;
  // shared by A*, Dijkstra flow fields and anything else that needs a priority queue.
  class IndexHeap {
    constructor(capacity = 1024){
      this.ids = new Int32Array(capacity);
      this.keys = new Float32Array(capacity);
      this.length = 0;
    }
    clear(){ this.length = 0; }
    grow(){
      const ids = new Int32Array(this.ids.length * 2), keys = new Float32Array(this.keys.length * 2);
      ids.set(this.ids); keys.set(this.keys); this.ids = ids; this.keys = keys;
    }
    push(id, key){
      if (this.length === this.ids.length) this.grow();
      const ids = this.ids, keys = this.keys;
      let i = this.length++;
      while (i > 0){
        const p = (i - 1) >> 1;
        if (keys[p] <= key) break;
        ids[i] = ids[p]; keys[i] = keys[p]; i = p;
      }
      ids[i] = id; keys[i] = key;
    }
    peekKey(){ return this.keys[0]; }
    pop(){
      const ids = this.ids, keys = this.keys, top = ids[0];
      const n = --this.length;
      if (n > 0){
        const id = ids[n], key = keys[n];
        let i = 0;
        for (;;){
          const l = i * 2 + 1;
          if (l >= n) break;
          const r = l + 1, c = r < n && keys[r] < keys[l] ? r : l;
          if (keys[c] >= key) break;
          ids[i] = ids[c]; keys[i] = keys[c]; i = c;
        }
        ids[i] = id; keys[i] = key;
      }
      return top;
    }
  }
  G.IndexHeap = IndexHeap;
})();
