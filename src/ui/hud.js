/* Heads-up display: toasts, resource bar, selection panel, squads, game menu, defeat
   screen and developer diagnostics. Panels re-render only when their content changes so
   buttons stay stable under the pointer. */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;

  G.UI = {
    dev: false, menuTab: 'overview', menuWasPaused: false, selectionSig: '', economySig: '', lastSlow: 0,
    init(){
      document.querySelectorAll('.version-label').forEach(n => { n.textContent = 'AD-EZP ' + G.VERSION; });
      $('inventoryBtn').addEventListener('click', () => this.toggleInventory());
      $('pauseBtn').addEventListener('click', () => this.togglePause());
      $('menuBtn').addEventListener('click', () => this.openGameMenu());
      $('closeMenuBtn').addEventListener('click', () => this.closeGameMenu());
      $('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
      $('performanceBtn').addEventListener('click', () => this.toggleDev());
      document.querySelectorAll('[data-menu-tab]').forEach(b => b.addEventListener('click', () => this.setMenuTab(b.dataset.menuTab)));
      $('restartAfterDefeatBtn').addEventListener('click', () => G.Game.restart());
      for (let i = 1; i <= 4; i++) $('squadBtn' + i).addEventListener('click', () => this.selectSquad(i));
      G.Events.on('notify', msg => this.toast(msg));
      G.Events.on('game:defeat', ({ reason }) => this.showDefeat(reason));
      G.Events.on('save:written', () => this.renderGameMenu());
      G.Events.on('save:cleared', () => this.renderGameMenu());
      G.Events.on('orders:issued', () => this.refreshSelection(true));
      G.Events.on('unit:died', () => this.refreshSelection());
      this.refreshSelection(true);
    },
    toast(msg){
      const n = $('toast');
      n.textContent = msg; n.style.opacity = '1';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { n.style.opacity = '0'; }, 1600);
    },

    // ---- Game menu ----
    openGameMenu(){
      const o = $('gameMenuOverlay');
      if (!o.classList.contains('hidden')) return;
      this.menuWasPaused = G.State.paused;
      G.Game.setPaused(true, true);
      o.classList.remove('hidden');
      this.renderGameMenu();
    },
    closeGameMenu(){
      $('gameMenuOverlay').classList.add('hidden');
      G.Game.setPaused(this.menuWasPaused, true);
    },
    setMenuTab(tab){
      this.menuTab = tab;
      document.querySelectorAll('[data-menu-tab]').forEach(b => b.classList.toggle('active', b.dataset.menuTab === tab));
      this.renderGameMenu();
    },
    toggleFullscreen(){
      const el = document.documentElement;
      if (!document.fullscreenElement){ if (el.requestFullscreen) el.requestFullscreen().catch(() => this.toast('Fullscreen unavailable')); }
      else if (document.exitFullscreen) document.exitFullscreen();
    },
    renderGameMenu(){
      const c = $('gameMenuContent');
      if (!c || $('gameMenuOverlay').classList.contains('hidden')) return;
      const S = G.State, E = S.expedition, ship = G.Units.ship(), allies = G.Units.crew(), fmt = G.fmtTime;
      if (this.menuTab === 'overview'){
        const res = G.Defs.resources.all().filter(r => !r.hidden).map(r => {
          const rate = G.Economy.rate(r.key);
          return `<p>${esc(r.name)} <b>${Math.floor(G.Economy.get(r.key))}</b> <small class="muted">+${Math.round(rate.income)} / −${Math.round(rate.expense)} per min</small></p>`;
        }).join('');
        c.innerHTML = `<div class="menu-grid"><div class="menu-card"><h3>Current Expedition</h3>
          <p>Earth <b>${E ? E.world : 1}</b></p><p>Climate <b>${E ? esc(G.Expedition.climate().name) : '—'}</b></p>
          <p>Play Time <b>${fmt(S.time)}</b></p><p>Map Seed <b>${S.seed}</b></p><p>Friendly Units <b>${allies.length}</b></p>
          <p>Command Ship <b>${ship ? Math.ceil(ship.hp) + ' / ' + ship.maxHp : 0} HP</b></p></div>
          <div class="menu-card"><h3>Economy</h3>${res}<p>Inventory <b>${G.Inventory.items.length} / ${G.Inventory.capacity()}</b></p></div></div>`;
      } else if (this.menuTab === 'stats'){
        const counts = {};
        for (const u of allies) counts[u.type] = (counts[u.type] || 0) + 1;
        const units = Object.entries(counts).map(([k, n]) => `<p>${esc(G.Defs.units.get(k)?.name || k)} <b>${n}</b></p>`).join('') || '<p class="muted">No crew</p>';
        const squads = [1, 2, 3, 4].map(n => allies.filter(u => u.squad === n).length);
        c.innerHTML = `<div class="menu-grid"><div class="menu-card"><h3>Units</h3>${units}<p>Squads <b>${squads.join(' / ')}</b></p></div>
          <div class="menu-card"><h3>World</h3><p>Structures <b>${S.buildings.length}</b></p><p>Containers <b>${S.containers.filter(c => c.type !== 'ground_item').length}</b></p>
          <p>Signals studied <b>${E ? E.scans : 0}</b></p><p>Current Zoom <b>${S.camera.z.toFixed(2)}</b></p><p>Play Time <b>${fmt(S.time)}</b></p></div></div>`;
      } else if (this.menuTab === 'saves'){
        c.innerHTML = `<div class="save-slots">${[1, 2, 3].map(n => {
          const i = G.Save.info(n), when = i && i.savedAt ? new Date(i.savedAt).toLocaleString() : 'Empty';
          return `<div class="save-slot"><div><b>Save Slot ${n}</b><small>${i ? `Earth ${i.world} · ${fmt(i.time)} · ${i.units} units` : 'No save data'}</small><small>${esc(when)}</small></div>
            <div class="save-actions"><button data-save-slot="${n}">Save</button><button data-load-slot="${n}" ${i ? '' : 'disabled'}>Load</button></div></div>`;
        }).join('')}</div>${G.Storage.persistent ? '' : '<p class="muted">Browser storage is unavailable; saves last until the page closes. Use Export JSON in the expedition log.</p>'}`;
        c.querySelectorAll('[data-save-slot]').forEach(b => b.addEventListener('click', () => G.Save.save(Number(b.dataset.saveSlot))));
        c.querySelectorAll('[data-load-slot]').forEach(b => b.addEventListener('click', () => { if (G.Game.loadSlot(Number(b.dataset.loadSlot))) this.closeGameMenu(); }));
      } else {
        c.innerHTML = `<div class="menu-grid"><div class="menu-card"><h3>Options</h3><p class="muted">Interface and display controls.</p>
          <div class="option-row"><span>Fullscreen</span><button id="menuFullscreenBtn">${document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen'}</button></div>
          <div class="option-row"><span>Developer Diagnostics</span><button id="menuDevBtn">${this.dev ? 'Hide' : 'Show'}</button></div>
          <div class="option-row"><span>Reload Last Save</span><button id="menuResetBtn">Reload</button></div></div>
          <div class="menu-card keybindings"><h3>Key Bindings & Controls</h3>${G.KEY_BINDINGS.map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div></div>`;
        $('menuFullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
        $('menuDevBtn').addEventListener('click', () => { this.toggleDev(); this.renderGameMenu(); });
        $('menuResetBtn').addEventListener('click', () => { this.closeGameMenu(); G.Game.restart(); });
      }
    },

    showDefeat(reason){ $('defeatReason').textContent = reason; $('defeatOverlay').classList.remove('hidden'); G.Game.setPaused(true, true); },
    hideDefeat(){ $('defeatOverlay').classList.add('hidden'); },

    // ---- Squads ----
    refreshSquadButtons(){
      for (let i = 1; i <= 4; i++){
        const n = G.State.units.filter(u => u.team === 'blue' && !u.isHero && u.squad === i && u.hp > 0).length;
        $('squadBtn' + i).innerHTML = `<span>${i}</span>${n ? `<small>${n}</small>` : ''}`;
      }
    },
    assignSquad(units, num){
      const crew = units.filter(u => u.team === 'blue' && !u.isHero && !u.isShip);
      for (const u of crew) u.squad = num || null;
      this.refreshSquadButtons(); this.refreshSelection(true);
      this.toast(num ? `Assigned ${crew.length} unit${crew.length !== 1 ? 's' : ''} to Squad ${num}` : 'Removed from squad');
    },
    selectSquad(num){
      const us = G.State.units.filter(u => u.team === 'blue' && !u.isHero && u.squad === num && u.hp > 0);
      if (!us.length){ this.toast('Squad ' + num + ' is empty'); return; }
      G.Selection.set(us.map(u => u.id));
      this.toast('Squad ' + num + ' selected');
    },

    // ---- Panels shared by inventory / chest ----
    closeRPG(except = null){ for (const id of ['inventoryPanel', 'chestPanel']) if (id !== except) $(id).classList.add('hidden'); },
    togglePause(){
      if (!$('gameMenuOverlay').classList.contains('hidden') || G.State.gameOver) return;
      G.Game.setPaused(!G.State.paused);
      this.toast(G.State.paused ? 'Paused' : 'Resumed');
    },
    syncPauseButton(){ $('pauseBtn').textContent = G.State.paused ? 'Resume' : 'Pause'; },
    toggleDev(){ this.dev = !this.dev; $('devPanel').classList.toggle('hidden', !this.dev); },

    // ---- Selection panel ----
    selectionSignature(us){
      return us.map(u => `${u.id}:${u.command}:${u.followId}:${u.haulState}:${u.path.length ? 1 : 0}:${Math.floor(G.Units.cargoTotal(u) / 10)}:${Math.ceil(u.hp / u.maxHp * 20)}:${u.squad}:${u.storage ? u.storage.items.length : ''}`).join('|') + '#' + G.State.formation;
    },
    // `picked` is true when the player changed what is selected (other windows react to
    // that); otherwise this only redraws the panel when the selected units' state changes.
    refreshSelection(force = false, picked = false){
      const p = $('selectionPanel'), S = G.State, us = G.Selection.units(), ship = G.Units.ship(), shipSel = ship && S.selected.has(ship.id);
      const ids = (shipSel ? 'ship|' : '') + us.map(u => u.id).join(',');
      const sig = ids + '#' + this.selectionSignature(us);
      if (picked || ids !== this.selectionIds){ this.selectionIds = ids; G.Events.emit('ui:selection', { units: us, ship: shipSel }); }
      if (!force && sig === this.selectionSig) return;
      this.selectionSig = sig;
      if (shipSel && !us.length){ p.innerHTML = `<b>${esc(ship.name)}</b><br>Ship fabricator selected`; return; }
      if (!us.length){ p.innerHTML = "<b>No units selected</b><br><span class='muted'>Select friendly units to issue orders.</span>"; return; }
      const followRow = `<button data-unit-command="follow" title="Then tap the unit to follow">Follow</button><button data-unit-command="idle" title="Cancel standing orders">Stop</button>`;
      if (us.length === 1 && us[0].isHero){
        const h = us[0];
        p.innerHTML = `<b>${esc(h.name)}</b><br>Frame integrity: ${Math.ceil(h.hp)} / ${h.maxHp}<br>${this.orderLine(h)}<div class="unit-command-row">${followRow}</div>`;
        this.bindCommands(p, us);
        return;
      }
      const hp = Math.round(us.reduce((a, u) => a + u.hp / u.maxHp, 0) / us.length * 100);
      const counts = us.reduce((a, u) => (a[u.type] = (a[u.type] || 0) + 1, a), {});
      const parts = Object.entries(counts).map(([k, v]) => v + ' ' + esc(G.Defs.units.get(k)?.name || k)).join(' · ');
      const crew = us.filter(u => !u.isHero);
      const head = us.length === 1 ? `<b>${esc(us[0].name)}</b>` : `<b>${us.length} selected</b>`;
      const cmds = `<div class="unit-command-row">${followRow}${crew.length ? '<button data-unit-command="guard">Guard Location</button><button data-unit-command="patrol">Patrol</button>' : ''}</div>`;
      const forms = us.length > 1 ? `<div class="formation-row"><span>Formation:</span>${G.FORMATIONS.map(f => `<button class="${S.formation === f ? 'active' : ''}" data-formation="${f}">${f === 'v' ? 'V' : f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>` : '';
      const squads = crew.length ? `<div class="squad-assign-row"><span>Add to squad:</span>${[1, 2, 3, 4].map(n => `<button data-assign-squad="${n}">${n}</button>`).join('')}<button data-assign-squad="0">None</button></div>` : '';
      const builder = us.find(u => G.Units.can(u, 'build'));
      const buildRow = builder ? `<div class="builder-row"><button id="truckBuildBtn">Build</button>${builder.storage ? '<button id="truckStorageBtn">Storage</button>' : ''}<span class="muted">Storage <b>${builder.storage ? builder.storage.items.length : 0} / ${builder.storage ? builder.storage.capacity : 0}</b> · Cargo ${Math.floor(G.Units.cargoTotal(builder))} / ${builder.cargoCapacity || 0} metal</span></div>` : '';
      const task = us.length === 1 ? '<br>' + this.orderLine(us[0]) : '';
      p.innerHTML = `${head}<br>Average health: ${hp}%<br>${parts}${task}${cmds}${forms}${squads}${buildRow}`;
      this.bindCommands(p, us);
      p.querySelectorAll('[data-formation]').forEach(b => b.addEventListener('click', () => {
        S.formation = b.dataset.formation;
        const anchor = G.Units.get(S.selectionAnchorId) || us[0];
        if (anchor && us.length > 1) G.Orders.arrange(us, S.formation, anchor.x, anchor.y, S.formationAngle || 0);
        this.toast('Formation: ' + b.textContent); this.refreshSelection(true);
      }));
      p.querySelectorAll('[data-assign-squad]').forEach(b => b.addEventListener('click', () => this.assignSquad(us, Number(b.dataset.assignSquad))));
      const bb = $('truckBuildBtn'); if (bb) bb.addEventListener('click', () => G.BuildUI.enter(builder));
      const sb = $('truckStorageBtn'); if (sb) sb.addEventListener('click', () => G.InventoryUI.openUnitStorage(builder));
    },

    // What a single unit is doing, in words.
    orderLine(u){
      const t = u.followId != null && G.Units.alive(u.followId);
      let s = 'Idle';
      if (u.command === 'follow' && t) s = 'Following ' + esc(t.name);
      else if (u.command === 'guard') s = 'Guarding a position';
      else if (u.command === 'patrol') s = 'Patrolling';
      else if (u.command === 'build') s = 'Constructing';
      else if (u.command === 'gather'){
        const where = u.mineId ? 'Mine Building' : (G.Gather.node(u.nodeId)?.name || 'salvage');
        s = ({ toNode: 'Heading to ', collecting: 'Collecting at ', toMine: 'Heading to ', loading: 'Loading at ', waiting: 'Waiting for ore at ', return: 'Hauling to ship from ' }[u.haulState] || 'Working ') + esc(where);
      } else if (u.path.length) s = 'Moving';
      return `<span class="muted">${s}</span>`;
    },
    bindCommands(p, us){
      p.querySelectorAll('[data-unit-command]').forEach(b => b.addEventListener('click', () => {
        const cmd = b.dataset.unitCommand;
        if (cmd === 'idle'){ G.Input.commandMode = null; G.Orders.setCommand(us, 'idle'); this.toast('Orders cleared'); }
        else { G.Input.commandMode = cmd; this.toast(cmd === 'follow' ? 'Tap the unit to follow' : cmd === 'guard' ? 'Tap a location to guard' : 'Tap a patrol destination'); }
      }));
    },
    renderEconomy(){
      const res = G.Defs.resources.all().filter(r => !r.hidden);
      const sig = res.map(r => Math.floor(G.Economy.get(r.key))).join(',');
      if (sig === this.economySig) return;
      this.economySig = sig;
      $('economyBar').innerHTML = res.map(r => `<div class="resource-pill ${esc(r.key)}" title="${esc(r.name)}"><span class="resource-icon">${esc(r.icon)}</span><b>${Math.floor(G.Economy.get(r.key))}</b></div>`).join('');
    },
    // Called every rendered frame; heavier refreshes are throttled.
    update(){
      const S = G.State, t = performance.now();
      this.renderEconomy();
      G.InventoryUI.refreshSearch();
      if (t - this.lastSlow < 250) return;
      this.lastSlow = t;
      this.refreshSelection();
      this.refreshSquadButtons();
      const title = $('gameTitle').getBoundingClientRect(), dbg = $('dbgBtn');
      if (title.width){ dbg.style.left = (title.right + 6) + 'px'; dbg.style.top = Math.max(2, title.top + title.height / 2 - dbg.offsetHeight / 2) + 'px'; }
      else { dbg.style.left = ''; dbg.style.top = ''; }
      const h = G.Units.hero();
      $('status').textContent = `VANCE · ${Math.ceil(h ? h.hp : 0)} HP · ${G.Units.countTeam('red')} HOSTILES · ${S.paused ? 'PAUSED' : 'EXPEDITION ACTIVE'}`;
      if (this.dev){
        const m = S.metrics, avg = m.pathCalls ? m.pathMs / m.pathCalls : 0, sys = G.SystemManager.timings;
        const top = Object.entries(sys).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('<br>');
        $('devPanel').innerHTML = `<b>DEVELOPER MODE</b><br>FPS ${m.fps.toFixed(0)}<br>Update ${m.updateMs.toFixed(2)} ms<br>Draw ${m.drawMs.toFixed(2)} ms<br>
          Entities ${m.entities} · Visible ${m.visible}<br>LOD ${m.lod} · Chunks ${m.chunks} · Cached ${m.cached}/${G.CONFIG.CHUNK_CACHE_MAX}<br>
          Path calls ${m.pathCalls} · Avg ${avg.toFixed(2)} ms<br>Path queue ${m.pathQueue} · Flow fields ${m.flowFields}<br>Zoom ${S.camera.z.toFixed(2)}<br><br><b>Systems (ms)</b><br>${top}`;
      }
    }
  };

  // Selection helpers shared by input and panels.
  G.Selection = {
    units(){ const S = G.State; return S.units.filter(u => S.selected.has(u.id) && u.team === 'blue' && !u.isShip && u.hp > 0); },
    set(ids){
      const S = G.State;
      G.Input && G.Input.cancelFormationGesture();
      S.selected = new Set(ids);
      S.selectionAnchorId = ids.length ? ids[0] : null;
      G.UI.refreshSelection(true, true);
    },
    toggle(id){
      const S = G.State;
      if (S.selected.has(id)){ S.selected.delete(id); if (S.selectionAnchorId === id) S.selectionAnchorId = [...S.selected][0] ?? null; }
      else { S.selected.add(id); if (S.selectionAnchorId == null) S.selectionAnchorId = id; }
      G.UI.refreshSelection(true, true);
    },
    clear(){ this.set([]); }
  };
})();
