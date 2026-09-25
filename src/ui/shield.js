/* Shield Projector window: switch the field on or off, and watch its charge, power draw
   and the structures it covers. Opens when a Shield Projector is tapped. */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;

  G.ShieldUI = {
    buildingId: null,
    building(){ return this.buildingId == null ? null : G.State.buildings.find(b => b.id === this.buildingId && b.hp > 0) || null; },
    isOpen(){ return !$('shieldPanel').classList.contains('hidden'); },
    open(id){
      this.buildingId = id;
      G.ExpeditionUI.closeFabrication();
      if (G.SpawnerUI.isOpen()) G.SpawnerUI.close();
      const panel = $('shieldPanel');
      panel.classList.add('ezOpening'); panel.classList.remove('hidden');
      this.render();
      clearTimeout(this._t); this._t = setTimeout(() => panel.classList.remove('ezOpening'), 75);
    },
    close(){ this.buildingId = null; $('shieldPanel').classList.add('hidden'); },
    // Friendly structures inside the field (the projector included).
    covered(b, sh){
      const r = sh.radiusTiles * G.CONFIG.TILE;
      return G.State.buildings.filter(x => x.hp > 0 && x.team === b.team && G.dist2(x, b) <= r * r).length;
    },
    render(){
      const b = this.building();
      if (!b){ this.close(); return; }
      const d = G.Defs.buildables.get(b.type), sh = d.shield;
      $('shieldBody').innerHTML = `<div class="ezFabHeader"><div><div class="ezEyebrow">${esc(d.name.toUpperCase())}</div><h2>Energy field</h2></div><button id="shClose" aria-label="Close shield window">×</button></div>
        <p class="ezHint">Absorbs damage to friendly structures within ${sh.radiusTiles} tiles while charged. Temporary protection: switch it on ahead of a dangerous attack.</p>
        <button id="shToggle" class="shToggle"></button>
        <div class="spProgress"><i id="shBar"></i></div>
        <div id="shLive" class="spLive"></div>`;
      $('shClose').onclick = () => this.close();
      $('shToggle').onclick = () => { const on = !b.shieldOn; G.Shields.set(b, on); G.UI.toast(d.name + (on ? ' on' : ' off')); this.refresh(true); };
      this.refresh(true);
    },
    refresh(force){
      const b = this.building();
      if (!b){ if (this.isOpen()) this.close(); return; }
      const t = performance.now();
      G.ExpeditionUI.placeNear($('shieldPanel'), b);
      if (!force && this._last && t - this._last < 250) return;
      this._last = t;
      const d = G.Defs.buildables.get(b.type), sh = d.shield, P = G.Power.grid, pct = b.shield / sh.capacity;
      const btn = $('shToggle');
      btn.textContent = b.shieldOn ? 'Switch off' : 'Switch on';
      btn.classList.toggle('on', b.shieldOn);
      $('shBar').style.width = G.clamp(pct * 100, 0, 100) + '%';
      const status = !b.shieldOn ? 'Off' : b.shield >= sh.capacity ? 'Full' : b.shield <= 0 ? 'Charging (no field yet)' : 'Charging';
      const rate = b.shieldOn && b.shield < sh.capacity ? sh.recharge * (P.ratio) : 0;
      $('shLive').innerHTML = `<div><span>Status</span><b>${status}</b></div>
        <div><span>Charge</span><b>${Math.floor(b.shield).toLocaleString()} / ${sh.capacity.toLocaleString()}</b></div>
        <div><span>Recharge</span><b>${rate ? '+' + rate.toFixed(1) + '/s' : '—'}${b.shieldOn && P.ratio < 1 ? ' (power short)' : ''}</b></div>
        <div><span>Power</span><b>${b.shieldOn ? d.power.demand + ' in use' : 'none while off (' + d.power.demand + ' when on)'}</b></div>
        <div><span>Covering</span><b>${this.covered(b, sh)} structures</b></div>`;
    }
  };

  G.Events.on('shield:changed', b => { if (G.ShieldUI.isOpen() && b.id === G.ShieldUI.buildingId) G.ShieldUI.refresh(true); });
  G.Events.on('world:created', () => { if (G.hasDOM && $('shieldPanel')) G.ShieldUI.close(); });
  G.Events.on('ui:selection', ({ ship, units }) => { if ((ship || units.length) && G.ShieldUI.isOpen()) G.ShieldUI.close(); });
})();
