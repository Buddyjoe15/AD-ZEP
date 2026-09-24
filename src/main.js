/* Boot and the fixed-timestep main loop. */
(function(){
  'use strict';
  const G = GW, C = G.CONFIG;
  // The simulation reads wall-clock time only through this injected clock.
  G.Clock.now = () => performance.now();
  G.Clock.stamp = () => new Date().toISOString();

  function boot(){
    G.Defs.verify();
    G.Renderer.init();
    G.Input.init();
    G.UI.init();
    G.ExpeditionUI.init();
    G.DebugUI.init();
    G.MapEditorUI.init();
    G.InventoryUI.initDrag();
    G.MainMenu.init();
    // A world is generated immediately so the map renders behind the menu.
    G.Scenario.newGame({ seed: G.MainMenu.expeditionSeed, slot: 1 });
    const sh = G.Units.ship();
    G.centerCamera(sh.x, sh.y, 0.72);
    G.SceneManager.change('mainMenu');

    let last = performance.now(), acc = 0, fpsLast = last, frames = 0;
    document.addEventListener('visibilitychange', () => { G.State.clockReset = true; });
    function frame(t){
      requestAnimationFrame(frame);
      if (G.State.clockReset){ last = t; acc = 0; G.State.clockReset = false; }
      const real = Math.min(C.MAX_FRAME, (t - last) / 1000);
      last = t; frames++; acc += real;
      const u0 = performance.now();
      let steps = 0;
      while (acc >= C.FIXED_DT && steps < C.MAX_STEPS_PER_FRAME){ G.SceneManager.update(C.FIXED_DT); acc -= C.FIXED_DT; steps++; }
      if (steps === C.MAX_STEPS_PER_FRAME && acc >= C.FIXED_DT) acc = 0;   // drop time rather than spiral
      if (steps) G.State.metrics.updateMs = (performance.now() - u0) / steps;
      G.SceneManager.render(t, real);
      if (t - fpsLast >= 1000){ G.State.metrics.fps = frames * 1000 / (t - fpsLast); frames = 0; fpsLast = t; }
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
