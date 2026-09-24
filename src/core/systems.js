/* Ordered simulation systems and scene switching. Systems are registered by name and run
   in an explicit order each fixed tick; per-system timings feed the diagnostics panel. */
(function(){
  'use strict';
  const G = GW;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  G.SystemManager = {
    registry: new Map(),
    order: [],
    timings: {},
    register(name, system){ this.registry.set(name, system); return system; },
    get(name){ return this.registry.get(name); },
    setOrder(names){
      for (const n of names) if (!this.registry.has(n)) throw new Error('Unknown system in order: ' + n);
      this.order = [...names];
    },
    // Called when a new world is created or restored, so systems can drop cached state.
    resetAll(){ for (const s of this.registry.values()) if (s.reset) s.reset(); },
    update(dt, names = this.order){
      for (const name of names){
        const s = this.registry.get(name);
        if (!s || !s.update) continue;
        const t0 = now();
        s.update(dt);
        this.timings[name] = (this.timings[name] || 0) * 0.9 + (now() - t0) * 0.1;
      }
    }
  };

  G.SceneManager = {
    scenes: new Map(), current: null, currentName: null, data: null,
    register(name, scene){ this.scenes.set(name, scene); return scene; },
    change(name, data = {}){
      const next = this.scenes.get(name);
      if (!next) throw new Error('Unknown scene: ' + name);
      if (this.current && this.current.exit) this.current.exit();
      this.current = next; this.currentName = name; this.data = data;
      if (next.enter) next.enter(data);
      G.Events.emit('scene:changed', { name, data });
    },
    update(dt){ if (this.current && this.current.update) this.current.update(dt); },
    render(t, realDt){ if (this.current && this.current.render) this.current.render(t, realDt); }
  };
})();
