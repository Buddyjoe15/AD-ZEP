/* Main menu, save-slot flow, and the scene definitions (menu → wormhole → gameplay). */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;

  // Top-level game flow used by menus and panels.
  G.Game = {
    setPaused(p, silent = false){
      G.State.paused = !!p; G.State.clockReset = true;
      G.UI.syncPauseButton();
      if (!silent) G.Events.emit('game:paused', G.State.paused);
    },
    start(seed, slot){
      G.Scenario.newGame({ seed, slot });
      G.SceneManager.change('wormhole');
    },
    enterGameplay(data = {}){ G.SceneManager.change('gameplay', data); },
    loadSlot(n){
      if (!G.Save.load(n)) return false;
      this.enterGameplay({ loaded: true });
      G.UI.toast('Loaded Save Slot ' + n);
      return true;
    },
    // Reloads the active slot's last save; with no save, starts over on the current seed.
    restart(){
      G.UI.hideDefeat();
      const slot = G.State.activeSaveSlot;
      if (G.Save.info(slot) && this.loadSlot(slot)) return;
      G.Scenario.newGame({ seed: G.State.seed, slot });
      this.enterGameplay({ introReveal: true, skip: true });
    }
  };

  G.MainMenu = {
    selectedSlot: 1, expeditionSeed: 72491,
    backgroundVideo(){ return $('mainMenuBackgroundVideo'); },
    playBackground(){
      const v = this.backgroundVideo();
      if (!v) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        v.pause();
        try { v.currentTime = 0; } catch (_) {}
        return;
      }
      const play = v.play();
      if (play && typeof play.catch === 'function') play.catch(() => {});
    },
    pauseBackground(){
      const v = this.backgroundVideo();
      if (v) v.pause();
    },
    init(){
      $('mainMenuBackBtn').addEventListener('click', () => this.showHome());
      $('introSkipBtn').addEventListener('click', () => this.finishIntro(true));
    },
    back(show){ $('mainMenuBackBtn').classList.toggle('hidden', !show); },
    panel(html){ $('mainMenuPanel').innerHTML = html; },
    action(a){
      if (a === 'new') this.showNewSlots();
      else if (a === 'continue'){ const n = G.Save.newestSlot(); if (n) G.Game.loadSlot(n); else G.UI.toast('No save files available'); }
      else if (a === 'load') this.showLoadSlots();
      else if (a === 'options') this.showOptions();
      else if (a === 'how') this.showHow();
      else if (a === 'credits') this.showCredits();
      else if (a === 'fullscreen') G.UI.toggleFullscreen();
    },
    showHome(){
      $('mainMenuOverlay').classList.remove('hidden');
      this.playBackground();
      this.back(false);
      const n = G.Save.newestSlot();
      this.panel(`<div class="main-buttons">
        <button data-home="new">New Game</button><button data-home="continue" ${n ? '' : 'disabled'}>Continue</button>
        <button data-home="load">Load Game</button><button data-home="options">Options</button>
        <button data-home="how">How to Play</button><button data-home="credits">Credits</button><button data-home="fullscreen">Fullscreen</button></div>`);
      document.querySelectorAll('[data-home]').forEach(b => b.addEventListener('click', () => this.action(b.dataset.home)));
    },
    slotCards(mode){
      return [1, 2, 3].map(n => {
        const i = G.Save.info(n), when = i && i.error ? 'Cannot be loaded (select for details)' : i && i.savedAt ? new Date(i.savedAt).toLocaleString() : 'Empty Slot';
        const what = !i ? 'Create New Save' : i.error ? 'Unreadable save' : `Earth ${i.world} · ${Math.floor(i.time / 60)}m ${Math.floor(i.time % 60)}s`;
        return `<button class="main-slot ${i ? 'occupied' : 'empty'}" data-${mode}-slot="${n}" ${mode === 'load' && !i ? 'disabled' : ''}>
          <b>Save Slot ${n}</b><span>${esc(what)}</span><small>${esc(when)}</small></button>`;
      }).join('');
    },
    showNewSlots(){
      this.back(true);
      this.panel(`<h2>New Game</h2><p class="main-copy">Choose one of the three save slots. Occupied slots can be overwritten.</p><div class="main-slot-grid">${this.slotCards('new')}</div>`);
      document.querySelectorAll('[data-new-slot]').forEach(b => b.addEventListener('click', () => {
        const n = Number(b.dataset.newSlot);
        this.selectedSlot = n;
        if (G.Save.info(n)) this.confirmOverwrite(n); else this.showLaunch(n);
      }));
    },
    confirmOverwrite(n){
      this.panel(`<div class="confirm-box"><h2>Overwrite Save Slot ${n}?</h2><p>This replaces the existing expedition in this slot when the new one begins.</p><div><button id="confirmOverwriteBtn">Overwrite</button><button id="cancelOverwriteBtn">Cancel</button></div></div>`);
      $('confirmOverwriteBtn').addEventListener('click', () => this.showLaunch(n));
      $('cancelOverwriteBtn').addEventListener('click', () => this.showNewSlots());
    },
    showLaunch(n){
      this.selectedSlot = n;
      this.panel(`<div class="ezEyebrow">FIRST EXPEDITION / v${esc(G.VERSION)}</div><h2>Beyond your Earth.</h2>
        <p class="main-copy">Commander Elias Vance. UES Aster Vale. One unfamiliar Earth, and one way forward.</p>
        <p class="main-copy">Explore a signal, mine metal, build a field generator, and survive until the drive is ready. Bring the crew home to the ship. Jump again.</p>
        <label class="ezSeed">EARTH SEED <input id="ezSeedInput" type="number" min="1" max="4294967295" step="1" value="${this.expeditionSeed}"></label>
        <p class="main-copy">Same seed, same terrain. Desktop: select Vance and right-click to move. Touch: select, then tap terrain.</p>
        <button id="launchVance">Launch expedition →</button>`);
      $('launchVance').onclick = () => {
        const seed = Number($('ezSeedInput').value);
        if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295){ G.UI.toast('Enter a whole seed from 1 to 4294967295'); return; }
        this.beginNewGame(seed);
      };
    },
    beginNewGame(seed = this.expeditionSeed){
      this.expeditionSeed = seed;
      G.Save.clear(this.selectedSlot);
      G.Game.start(seed, this.selectedSlot);
    },
    finishIntro(skip){ const s = G.SceneManager.current; if (G.SceneManager.currentName === 'wormhole' && s && s.finish) s.finish(skip); },
    showLoadSlots(){
      this.back(true);
      this.panel(`<h2>Load Game</h2><p class="main-copy">Choose a saved expedition.</p><div class="main-slot-grid">${this.slotCards('load')}</div>`);
      document.querySelectorAll('[data-load-slot]').forEach(b => b.addEventListener('click', () => G.Game.loadSlot(Number(b.dataset.loadSlot))));
    },
    keyBindings(){ return `<div class="main-bindings">${G.KEY_BINDINGS.map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>`; },
    showOptions(){
      this.back(true);
      this.panel(`<h2>Options</h2><div class="main-info-card"><div class="option-row"><span>Fullscreen</span><button id="mainFullscreenBtn">${document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen'}</button></div><h3>Key Bindings</h3>${this.keyBindings()}</div>`);
      $('mainFullscreenBtn').addEventListener('click', () => G.UI.toggleFullscreen());
    },
    showHow(){
      this.back(true);
      this.panel(`<h2>How to Play</h2><div class="main-info-card"><p>Keep Commander Vance and the ship alive. Study signals, mine metal with Utility Spiders, fabricate drones at the ship, build field structures, repair the drive and wait for stabilization. Recall the crew and transit to the next Earth.</p>${this.keyBindings()}</div>`);
    },
    showCredits(){
      this.back(true);
      this.panel(`<h2>Credits</h2><div class="main-info-card"><p><b>Abyssal Dawn: Zero Earth Protocol</b></p><p>Built on the Groundfall prototype.</p><p>Game direction, testing, and world concept: Player.</p><p>Prototype systems and implementation developed collaboratively with AI assistants.</p></div>`);
    }
  };

  G.SceneManager.register('mainMenu', {
    enter(){ G.Game.setPaused(true, true); G.MainMenu.showHome(); },
    exit(){ G.MainMenu.pauseBackground(); $('mainMenuOverlay').classList.add('hidden'); },
    render(){}
  });

  let introTimer = null;
  G.SceneManager.register('wormhole', {
    enter(){
      G.Game.setPaused(true, true);
      const intro = $('wormholeIntro');
      $('mainMenuOverlay').classList.add('hidden');
      intro.classList.remove('hidden', 'play'); void intro.offsetWidth; intro.classList.add('play');
      clearTimeout(introTimer); introTimer = setTimeout(() => this.finish(false), 1800);
    },
    finish(skip){ clearTimeout(introTimer); introTimer = null; G.Game.enterGameplay({ introReveal: true, skip: !!skip }); },
    exit(){ const intro = $('wormholeIntro'); intro.classList.add('hidden'); intro.classList.remove('play'); },
    render(){ G.Renderer.draw(); }
  });

  G.SceneManager.register('gameplay', {
    enter(data = {}){
      G.UI.hideDefeat();
      $('mainMenuOverlay').classList.add('hidden');
      document.body.classList.add('in-game');
      G.Game.setPaused(false, true);
      G.UI.refreshSelection(true);
      if (data.introReveal){
        const ship = G.Units.ship();
        if (ship){
          G.centerCamera(ship.x, ship.y, 2.15);
          G.State.introCamera = { start: performance.now(), duration: 2600, from: 2.15, to: 0.72, cx: ship.x, cy: ship.y };
        }
        setTimeout(() => { if (G.SceneManager.currentName === 'gameplay') G.Scenario.disembark(); }, data.skip ? 40 : 450);
        G.UI.toast('Wormhole transit complete');
      }
    },
    exit(){ document.body.classList.remove('in-game'); G.State.clockReset = true; },
    update(dt){ if (!document.hidden) G.Sim.step(dt); },
    render(t, realDt){
      const S = G.State, ic = S.introCamera;
      if (ic){
        const k = Math.min(1, (t - ic.start) / ic.duration), e = 1 - Math.pow(1 - k, 3);
        G.centerCamera(ic.cx, ic.cy, ic.from + (ic.to - ic.from) * e);
        if (k >= 1) S.introCamera = null;
      }
      G.Input.update(realDt);
      G.Renderer.draw();
      G.UI.update();
      G.ExpeditionUI.tick();
      if (G.SpawnerUI.isOpen()) G.SpawnerUI.refresh();
      if (G.ShieldUI.isOpen()) G.ShieldUI.refresh();
    }
  });
})();
