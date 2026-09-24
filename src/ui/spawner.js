/* Spawner window (Hostile Fabricator): spawn speed, how many to spawn, hunt / hold, and
   live load figures for finding how many units the game handles on screen. The controls
   are rendered once per change; only the live figures refresh while the window is open,
   so typing in the number fields is never interrupted. */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;

  G.SpawnerUI = {
    buildingId: null,
    building(){ return this.buildingId == null ? null : G.State.buildings.find(b => b.id === this.buildingId && b.hp > 0) || null; },
    isOpen(){ return !$('spawnerPanel').classList.contains('hidden'); },
    open(id){
      this.buildingId = id;
      G.ExpeditionUI.closeFabrication();
      const panel = $('spawnerPanel');
      panel.classList.add('ezOpening'); panel.classList.remove('hidden');
      this.render();
      clearTimeout(this._t); this._t = setTimeout(() => panel.classList.remove('ezOpening'), 75);
    },
    close(){ this.buildingId = null; $('spawnerPanel').classList.add('hidden'); },
    render(){
      const b = this.building();
      if (!b){ this.close(); return; }
      const S = G.Spawner, s = S.state(b), d = G.Defs.buildables.get(b.type), unit = G.Defs.units.get(d.spawner.unit);
      const chip = (attr, v, cur, label) => `<button class="spChip ${cur === v ? 'active' : ''}" data-${attr}="${v}">${label ?? v}</button>`;
      $('spawnerBody').innerHTML = `<div class="ezFabHeader"><div><div class="ezEyebrow">${esc(d.name.toUpperCase())}</div><h2>Spawner</h2></div><button id="spClose" aria-label="Close spawner">×</button></div>
        <p class="ezHint">Produces ${esc(unit.name)}s.</p>
        <h3>Spawn speed <small>(per second)</small></h3>
        <div class="spChips">${S.RATES.map(v => chip('rate', v, s.rate)).join('')}<input id="spRate" type="number" min="0.1" max="${S.MAX_RATE}" step="any" value="${s.rate}" aria-label="Custom spawn speed"></div>
        <h3>How many to spawn</h3>
        <div class="spChips">${S.AMOUNTS.map(v => chip('amount', v, s.amount, v >= 1000 ? v / 1000 + 'k' : v)).join('')}<input id="spAmount" type="number" min="1" max="${S.MAX_AMOUNT}" step="1" value="${s.amount}" aria-label="Custom amount"></div>
        <h3>Spawned units</h3>
        <div class="spChips">${chip('hold', 'hold', s.hold ? 'hold' : 'hunt', 'Hold position')}${chip('hold', 'hunt', s.hold ? 'hold' : 'hunt', 'Advance on Vance')}</div>
        <div class="spActions">
          <button id="spStart" class="spPrimary">${s.running ? 'Pause' : s.spawned > 0 && s.spawned < s.amount ? 'Resume' : 'Start spawning'}</button>
          <button id="spReset">Reset count</button><button id="spClear">Remove spawned</button>
        </div>
        <div class="spProgress"><i id="spBar"></i></div>
        <div id="spLive" class="spLive"></div>`;
      const body = $('spawnerBody');
      $('spClose').onclick = () => this.close();
      body.querySelectorAll('[data-rate]').forEach(el => { el.onclick = () => { S.configure(b, { rate: +el.dataset.rate }); this.render(); }; });
      body.querySelectorAll('[data-amount]').forEach(el => { el.onclick = () => { S.configure(b, { amount: +el.dataset.amount }); this.render(); }; });
      body.querySelectorAll('[data-hold]').forEach(el => { el.onclick = () => { S.configure(b, { hold: el.dataset.hold === 'hold' }); this.render(); }; });
      $('spRate').onchange = e => { S.configure(b, { rate: +e.target.value }); this.render(); };
      $('spAmount').onchange = e => { S.configure(b, { amount: +e.target.value }); this.render(); };
      $('spStart').onclick = () => { if (s.running) S.stop(b); else S.start(b); this.render(); };
      $('spReset').onclick = () => { S.resetCount(b); this.render(); };
      $('spClear').onclick = () => { const n = S.clear(b); G.UI.toast(`Removed ${n} spawned unit${n !== 1 ? 's' : ''}`); this.render(); };
      this.refresh(true);
    },
    // Live figures only (cheap, safe while the user is typing).
    refresh(force){
      const b = this.building();
      if (!b){ if (this.isOpen()) this.close(); return; }
      const t = performance.now();
      G.ExpeditionUI.placeNear($('spawnerPanel'), b);
      if (!force && this._last && t - this._last < 250) return;
      this._last = t;
      const S = G.State, s = G.Spawner.state(b), m = S.metrics, mine = G.Spawner.spawnedBy(b).length;
      const btn = $('spStart');
      const label = s.running ? 'Pause' : s.spawned > 0 && s.spawned < s.amount ? 'Resume' : 'Start spawning';
      if (btn && btn.textContent !== label) btn.textContent = label;
      $('spBar').style.width = G.clamp(s.spawned / s.amount * 100, 0, 100) + '%';
      $('spLive').innerHTML = `<div><span>Status</span><b>${s.running ? 'Spawning' : s.spawned >= s.amount ? 'Complete' : s.spawned ? 'Paused' : 'Idle'} · ${s.spawned} / ${s.amount}</b></div>
        <div><span>Alive from here</span><b>${mine}</b></div>
        <div><span>Units in world</span><b>${S.units.length} (${G.Units.countTeam('red')} hostile)</b></div>
        <div><span>On screen</span><b>${m.visible}</b></div>
        <div><span>Frame rate</span><b>${m.fps.toFixed(0)} fps</b></div>
        <div><span>Update / draw</span><b>${m.updateMs.toFixed(1)} / ${m.drawMs.toFixed(1)} ms</b></div>`;
    }
  };

  G.Events.on('spawner:changed', b => { if (G.SpawnerUI.isOpen() && b.id === G.SpawnerUI.buildingId) G.SpawnerUI.refresh(true); });
  G.Events.on('world:created', () => { if (G.hasDOM && $('spawnerPanel')) G.SpawnerUI.close(); });
  G.Events.on('ui:selection', ({ ship, units }) => { if ((ship || units.length) && G.SpawnerUI.isOpen()) G.SpawnerUI.close(); });
})();
