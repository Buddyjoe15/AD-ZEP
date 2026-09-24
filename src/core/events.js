/* Synchronous event bus. Simulation code announces changes here; UI code listens.
   This keeps the simulation free of DOM calls. */
(function(){
  'use strict';
  const G = GW;
  G.Events = {
    listeners: new Map(),
    on(name, fn){
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(fn);
      return () => this.off(name, fn);
    },
    off(name, fn){ const s = this.listeners.get(name); if (s) s.delete(fn); },
    emit(name, payload){
      const s = this.listeners.get(name);
      if (!s) return;
      for (const fn of [...s]){
        try { fn(payload); }
        catch (err){ console.error('Event handler failed for "' + name + '"', err); }
      }
    }
  };
  // Player-facing message. The HUD shows it as a toast; headless runs ignore it.
  G.notify = msg => G.Events.emit('notify', String(msg));
})();
