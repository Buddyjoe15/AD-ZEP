/* Build mode for units with the `build` capability: pick a structure from the catalog,
   preview it on the grid, and confirm to hand the order to G.Construction. */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;

  G.BuildUI = {
    get mode(){ return G.State.buildMode; },
    active(){ return !!(this.mode && this.mode.active); },
    placing(){ return this.active() && !!this.mode.key; },
    enter(builder){
      if (!builder || !G.Units.can(builder, 'build')) return false;
      G.State.buildMode = { active: true, builderId: builder.id, key: null };
      G.State.buildPreview = null;
      $('selectionPanel').classList.add('hidden');
      const p = $('catalogPanel'); p.dataset.kind = 'build'; p.classList.remove('hidden');
      this.render();
      return true;
    },
    choose(key){
      if (!this.active() || !G.Defs.buildables.has(key)) return false;
      this.mode.key = key;
      G.UI.toast(G.Defs.buildables.get(key).placeOnNode === 'deposit' ? 'Tap a resource deposit: the extractor centres on it' : 'Tap a grid cell or hold and drag to refine placement');
      this.render();
      return true;
    },
    cancel(){
      G.State.buildMode = { active: false, builderId: null, key: null };
      G.State.buildPreview = null;
      const p = $('catalogPanel');
      if (p.dataset.kind === 'build'){ p.classList.add('hidden'); p.dataset.kind = ''; }
      $('selectionPanel').classList.remove('hidden');
      G.UI.refreshSelection(true);
    },
    previewAt(wx, wy){
      if (!this.placing()) return null;
      const { gx, gy } = G.Buildings.placementAt(this.mode.key, wx, wy);
      G.State.buildPreview = { key: this.mode.key, gx, gy, ok: G.Buildings.canPlaceKey(this.mode.key, gx, gy) };
      return G.State.buildPreview;
    },
    confirm(){
      const pr = G.State.buildPreview;
      if (!this.placing() || !pr) return false;
      const builder = G.Construction.builder(this.mode.builderId);
      if (!builder){ G.UI.toast('Utility Spider is unavailable'); this.cancel(); return false; }
      const site = G.Construction.order(builder, this.mode.key, pr.gx, pr.gy);
      if (site) this.cancel();
      return !!site;
    },
    icon(key){
      const d = G.Defs.buildables.get(key);
      if (d.symbol) return `<div class="catalog-art" style="background:${esc(d.color)};color:#0b1820;font-weight:800">${esc(d.symbol)}</div>`;
      if (key === 'defensive_wall' || key === 'reinforced_wall') return `<div class="catalog-art catalog-wall${key === 'reinforced_wall' ? ' reinforced' : ''}">WALL</div>`;
      if (d.container) return '<div class="catalog-art catalog-chest">CHEST</div>';
      return `<div class="catalog-art">${esc(G.initials(d.name))}</div>`;
    },
    render(){
      const p = $('catalogPanel'), m = this.mode;
      if (!this.active()){ this.cancel(); return; }
      p.innerHTML = `<div class="catalog-header"><b>Utility Spider — Build</b><button id="cancelBuildBtn">×</button></div>
        <div class="catalog-help">${m.key ? 'Tap a grid cell to place. Hold and drag across the map to refine the cell.' : 'Choose a structure.'}</div>
        <div class="catalog-grid">${G.Defs.buildables.all().filter(d => !d.debugOnly).map(d => `<button class="catalog-entry build-pick ${m.key === d.key ? 'active' : ''}" data-build-pick="${d.key}">
          ${this.icon(d.key)}<div class="catalog-name">${esc(d.name)}</div><div class="catalog-desc">${esc(d.description)}<br><b>${esc(G.Economy.describe(d.cost))}</b></div></button>`).join('')}</div>`;
      $('cancelBuildBtn').addEventListener('click', () => this.cancel());
      p.querySelectorAll('[data-build-pick]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.choose(b.dataset.buildPick); }));
    }
  };

  G.Events.on('build:cancel', () => { if (G.BuildUI.active()) G.BuildUI.cancel(); });
  G.Events.on('world:created', () => { if (G.hasDOM && $('catalogPanel')) G.BuildUI.cancel(); });
})();
