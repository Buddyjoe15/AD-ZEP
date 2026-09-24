/* Expedition log, fabrication window (anchored to the ship or a Fabricator), arrival
   report, and expedition file import / export. */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;
  const btn = (label, action, arg = '') => `<button data-ez="${action}" data-arg="${esc(arg)}">${label}</button>`;
  let pointerDown = false, openTimer = null;

  G.ExpeditionUI = {
    fabOwnerId: null,   // unit id of the ship or id of a Fabricator building
    init(){
      $('ezToggle').addEventListener('click', () => {
        this.closeFabrication();
        const p = $('ezPanel');
        p.classList.toggle('hidden');
        $('ezToggle').setAttribute('aria-expanded', String(!p.classList.contains('hidden')));
        this.renderPanel();
      });
      $('ezFile').addEventListener('change', async e => {
        try {
          const f = e.target.files[0];
          if (!f || f.size > 32e6) throw new Error('File too large');
          G.Save.importJSON(await f.text(), G.State.activeSaveSlot);
          G.Game.enterGameplay({});
          G.Expedition.log('ARIA: Expedition restored.');
        } catch (err){ G.UI.toast('Import rejected: ' + err.message); }
        e.target.value = '';
      });
      document.addEventListener('pointerdown', e => { if (e.target.closest('#ezPanel,#ezFabrication,#spawnerPanel')) pointerDown = true; });
      document.addEventListener('pointerup', () => { pointerDown = false; });
      document.addEventListener('pointercancel', () => { pointerDown = false; });
      G.Events.on('expedition:transit', () => { G.Save.save(G.State.activeSaveSlot); this.showReport(); });
      G.Events.on('expedition:autosave', () => G.Save.save(G.State.activeSaveSlot));
      G.Events.on('expedition:log', () => this.renderPanel());
      G.Events.on('ui:selection', ({ ship, units }) => {
        if (ship) this.openFabrication(G.State.shipId);
        else if (this.fabOwnerId === G.State.shipId || units.length) this.closeFabrication();
      });
      G.Events.on('world:created', () => { this.closeFabrication(); $('ezPanel').classList.add('hidden'); $('ezArrival').classList.add('hidden'); });
    },
    owner(){
      if (this.fabOwnerId == null) return null;
      return G.Units.alive(this.fabOwnerId) || G.State.buildings.find(b => b.id === this.fabOwnerId && b.hp > 0) || null;
    },
    openFabrication(id){
      if (G.SceneManager.currentName !== 'gameplay') return;
      this.fabOwnerId = id;
      const panel = $('ezFabrication');
      $('ezPanel').classList.add('hidden'); $('ezToggle').setAttribute('aria-expanded', 'false');
      // Ignore the pointer that opened the window so it cannot press a button underneath.
      panel.classList.add('ezOpening'); panel.classList.remove('hidden');
      this.renderFabrication();
      clearTimeout(openTimer); openTimer = setTimeout(() => panel.classList.remove('ezOpening'), 75);
    },
    closeFabrication(){ this.fabOwnerId = null; $('ezFabrication').classList.add('hidden'); $('ezFabrication').classList.remove('ezOpening'); },
    act(action, arg){
      if (action === 'fabricate') G.Expedition.action('fabricate', { ownerId: this.fabOwnerId, recipe: arg });
      else if (action === 'build'){ const u = G.State.units.find(v => v.team === 'blue' && v.hp > 0 && G.Units.can(v, 'build')); if (!u) G.UI.toast('Fabricate a Utility Spider'); else { G.Selection.set([u.id]); G.BuildUI.enter(u); G.BuildUI.choose(arg); $('ezPanel').classList.add('hidden'); } }
      else if (action === 'save') G.Save.save(G.State.activeSaveSlot);
      else if (action === 'export') this.exportFile();
      else G.Expedition.action(action, arg);
      this.renderPanel(); this.renderFabrication();
    },
    exportFile(){
      const blob = new Blob([G.Save.exportJSON()], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'AD-ZEP-expedition.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    renderPanel(){
      const E = G.State.expedition, el = $('ezBody');
      if (!E || pointerDown || $('ezPanel').classList.contains('hidden')) return;
      const S = G.State, d = G.Expedition.departure(), R = G.EXPEDITION_RULES, climate = G.Expedition.climate(), h = G.Units.hero(), sh = G.Units.ship();
      const metal = Math.floor(G.Economy.get('metal')), rate = G.Economy.rate('metal'), scroll = el.scrollTop, cap = G.Defs.resources.get('metal').transitCap;
      el.innerHTML = `<div class="ezEyebrow">${esc(sh ? sh.name.toUpperCase() : 'SHIP LOST')} / EXPEDITION ${String(E.world).padStart(4, '0')}</div><h2>Expedition log</h2>
        <div class="ezEarthDetails"><b>EARTH ${String(E.world).padStart(3, '0')} · ${esc(climate.name)}</b><span>${esc(climate.air)} · ${d.ready ? 'DEPARTURE READY' : E.repairs < 100 ? 'DRIVE OFFLINE' : E.readiness > 0 ? 'STABILIZING ' + Math.ceil(E.readiness) + 's' : 'CREW CHECK'}</span></div>
        <div class="ezStats"><div><small>SHIP CARGO</small><b>${metal} <em>metal</em></b><small>+${Math.round(rate.income)} / −${Math.round(rate.expense)} per min</small></div><div><small>CONTAINMENT</small><b>${E.elementP}<em> / ${R.elementPMax} P</em></b></div>
        <div><small>VANCE</small><b>${Math.ceil(h ? h.hp : 0)}<em> / ${h ? h.maxHp : 0} HP</em></b></div><div><small>SHIP HULL</small><b>${Math.ceil(sh ? sh.hp : 0)}<em> HP</em></b></div></div>
        <h3>Departure checklist</h3><ul class="ezChecklist">
          <li>${E.repairs === 100 ? '✓' : '○'} Drive repaired</li><li>${E.readiness <= 0 ? '✓' : '○'} Stabilization ${E.readiness <= 0 ? 'complete' : Math.ceil(E.readiness) + 's'}</li>
          <li>${d.away === 0 ? '✓' : '○'} Crew at ship ${d.crew - d.away}/${d.crew}</li><li>${d.cargo < 0.01 ? '✓' : '○'} Drone cargo unloaded (${Math.floor(d.cargo)} metal)</li>
          <li>${!G.Fabrication.totalQueued() && !S.constructionSites.length ? '✓' : '○'} Field work and fabrication complete</li></ul>
        <div class="ezGrid">${btn(E.repairs === 100 ? 'Drive repaired ✓' : 'Repair drive · ' + R.repairCost + ' metal', 'repair')}${btn('Recall + unload', 'recall')}${btn('P boost · −' + R.boostSeconds + 's', 'boost')}</div>
        <button class="ezTransit" data-ez="transit" ${d.ready ? '' : 'disabled'}>${d.ready ? 'TRANSIT TO NEXT EARTH →' : 'DEPARTURE BLOCKED'}</button>
        <p class="ezHint">${d.ready ? 'All checks passed. Departure is your choice.' : d.reasons.map(esc).join('<br>')}</p>
        <h3>Departure manifest</h3><p>Vance, surviving drones, health, equipment, upgrades and contained Element P persist. Carry up to ${cap} bulk metal; ${Math.max(0, metal - cap)} excess metal would remain. Field structures and untouched deposits stay behind.</p>
        <h3>ARIA / Mission records</h3><div id="ezLog"></div>
        <h3>Expedition files</h3><div class="ezGrid">${btn('Save expedition', 'save')}${btn('Export JSON', 'export')}<button id="ezImport">Import JSON</button><button id="ezReportBtn" ${E.lastReport ? '' : 'disabled'}>Last arrival report</button></div>
        <p class="ezHint">Seed ${S.seed} · v${G.VERSION}. Mouse: select / right-click move / wheel zoom. Touch: tap select / tap move / drag empty terrain to pan / pinch zoom. H: ship. Space: pause. I: inventory. Select the ship for fabrication. Select a Utility Spider for field construction.</p>`;
      $('ezLog').textContent = E.log.join('\n\n');
      el.scrollTop = scroll;
      el.querySelectorAll('[data-ez]').forEach(b => { b.onclick = () => this.act(b.dataset.ez, b.dataset.arg); });
      $('ezImport').onclick = () => $('ezFile').click();
      $('ezReportBtn').onclick = () => this.showReport();
    },
    renderFabrication(){
      const panel = $('ezFabrication');
      if (panel.classList.contains('hidden') || pointerDown || !G.State.expedition) return;
      const owner = this.owner();
      if (!owner){ this.closeFabrication(); return; }
      const S = G.State, E = S.expedition, R = G.EXPEDITION_RULES, el = $('ezFabBody'), scroll = el.scrollTop, Q = owner.fabQueue, max = G.Fabrication.queueMax(owner);
      const recipes = G.Defs.recipes.all().map(r => {
        const why = S.paused ? 'Paused' : G.Fabrication.blocker(owner, r.key);
        return `<button data-ez="fabricate" data-arg="${r.key}" ${why ? 'disabled' : ''} title="${esc(why)}"><b>${esc(r.name)}</b><span>${esc(G.Economy.describe(r.cost))} · ${r.time}s</span><small>${esc(r.blurb)}</small></button>`;
      }).join('');
      const upgrade = owner.isShip ? `<button data-ez="upgrade" ${S.paused || E.upgrades >= R.upgradeMax || !G.Economy.canAfford({ metal: R.upgradeCost }) ? 'disabled' : ''}><b>Vance frame upgrade</b><span>${E.upgrades >= R.upgradeMax ? 'Fully upgraded' : R.upgradeCost + ' metal · +' + R.upgradeHp + ' HP'}</span><small>Upgrade ${E.upgrades}/${R.upgradeMax} · improves transit readiness</small></button>` : '';
      const queue = Q.map((q, i) => (i ? 'Waiting: ' : 'Building: ') + esc(G.Defs.recipes.get(q.recipe)?.name || q.recipe) + ' · ' + Math.ceil(q.left) + 's').join('<br>') || 'Fabricator idle';
      el.innerHTML = `<div class="ezFabHeader"><div><div class="ezEyebrow">${owner.isShip ? esc(owner.name.toUpperCase()) : 'FABRICATOR · LEVEL ' + (owner.level || 1)}</div><h2>Fabrication</h2></div><button id="ezFabClose" aria-label="Close fabrication">×</button></div>
        <p class="ezHint">${Math.floor(G.Economy.get('metal'))} metal available · ${Q.length}/${max} queued · crew ${G.Fabrication.population()}/${G.CONFIG.POPULATION_CAP}</p>
        <div class="ezFabOptions">${recipes}${upgrade}</div><h3>Production queue</h3><p class="ezHint">${queue}</p>${S.paused ? '<p class="ezHint">Resume to fabricate.</p>' : ''}`;
      el.scrollTop = scroll;
      el.querySelectorAll('[data-ez]').forEach(b => { b.onclick = () => this.act(b.dataset.ez, b.dataset.arg); });
      $('ezFabClose').onclick = () => this.closeFabrication();
      this.positionFabrication();
    },
    positionFabrication(){ G.ExpeditionUI.placeNear($('ezFabrication'), this.owner()); },
    // Keeps a floating window beside an entity; on narrow screens it sits above or below.
    placeNear(panel, o){
      if (!o || !panel || panel.classList.contains('hidden')) return;
      const T = G.CONFIG.TILE, q = G.screenFromWorld(o.x, o.y), rect = panel.getBoundingClientRect();
      const width = rect.width || 264, height = rect.height || 350, edge = Math.max(o.isShip ? 28 : 14, ((o.w || 2) * T / 2) * G.State.camera.z), pad = 8;
      const right = q.x + edge + pad, left = q.x - edge - pad - width;
      const x = right + width < innerWidth - pad ? right : left >= pad ? left : Math.max(pad, Math.min(innerWidth - width - pad, q.x - width / 2));
      const sideFits = right + width < innerWidth - pad || left >= pad;
      let y = sideFits ? q.y - height / 2 : q.y + edge + pad;
      if (!sideFits && y + height > innerHeight - pad) y = q.y - edge - pad - height;
      panel.style.left = Math.round(Math.max(pad, Math.min(innerWidth - width - pad, x))) + 'px';
      panel.style.top = Math.round(Math.max(76, Math.min(innerHeight - height - pad, y))) + 'px';
    },
    showReport(){
      const E = G.State.expedition, r = E && E.lastReport;
      if (!r) return;
      const climate = G.Expedition.climate(), el = $('ezArrival');
      el.innerHTML = `<div class="ezArrivalCard"><div class="ezEyebrow">TRANSIT CONFIRMED / EARTH ${String(E.world).padStart(4, '0')}</div><h2>A new Earth.</h2>
        <p>The ${esc(G.Units.ship()?.name || 'ship')} and ${r.crew} surviving crew arrived together.</p>
        <div class="ezStats"><div><small>DELIVERED</small><b>${r.metal}<em> metal</em></b></div><div><small>FIELD BUILDS</small><b>${r.built}</b></div><div><small>IN TRANSIT</small><b>${r.retainedMetal}<em> metal</em></b></div><div><small>EXCESS LEFT</small><b>${r.leftMetal}<em> metal</em></b></div></div>
        <p class="ezHint">${esc(climate.name)} · ${esc(climate.air)}. ${climate.hazard ? 'Suit damage occurs beyond the ship safety perimeter.' : ''}</p><button id="ezArrivalContinue">Continue expedition →</button></div>`;
      el.classList.remove('hidden');
      G.Game.setPaused(true, true);
      $('ezArrivalContinue').onclick = () => { el.classList.add('hidden'); G.Game.setPaused(false, true); this.renderFabrication(); };
    },
    // Periodic refresh while panels are open (timers, queue progress).
    tick(){
      const t = performance.now();
      this.positionFabrication();
      if (this._last && t - this._last < 300) return;
      this._last = t;
      this.renderFabrication();
      this.renderPanel();
    }
  };
})();
