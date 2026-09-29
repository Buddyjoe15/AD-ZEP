/* Build mode for units with the `build` capability: pick a structure from the catalog,
   preview it on the building grid (a quarter of a tile per cell), and confirm to hand the order to G.Construction. Walls build in
   rows: press on the first tile and drag, and the row runs from there in the direction you
   drag (east–west or north–south, whichever is further), up to MAX_ROW tiles. */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;

  const MAX_ROW = 24;
  G.BuildUI = {
    MAX_ROW,
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
      const d = G.Defs.buildables.get(key);
      G.UI.toast(d.placeOnNode === 'deposit' ? 'Tap a resource deposit: the extractor centres on it' : d.wall ? 'Tap a cell for one section, or press and drag to build a row' : 'Tap a grid cell or hold and drag to refine placement');
      this.render();
      return true;
    },
    // Turns the structure being placed (a gate) to its turned twin, keeping the preview cell.
    rotate(){
      const d = this.placing() && G.Defs.buildables.get(this.mode.key);
      if (!d || !d.rotateTo) return false;
      this.mode.key = d.rotateTo;
      const pr = G.State.buildPreview;
      if (pr) G.State.buildPreview = { key: this.mode.key, gx: pr.gx, gy: pr.gy, sx: pr.sx || 0, sy: pr.sy || 0, ok: G.Buildings.canPlaceKey(this.mode.key, pr.gx, pr.gy, pr.sx || 0, pr.sy || 0) };
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
    // Starts a placement gesture at (wx, wy): for a wall, this cell anchors the row.
    begin(wx, wy){
      if (!this.placing()) return null;
      this.mode.anchor = G.Defs.buildables.get(this.mode.key).wall ? G.Buildings.placementAt(this.mode.key, wx, wy) : null;
      return this.previewAt(wx, wy);
    },
    // The placements of a row from `a` toward `b` (both { gx, gy, sx, sy }): along whichever
    // axis b is further along, a footprint apart, on the building grid's cells.
    rowCells(a, b){
      const B = G.Buildings, K = B.SUB, d = G.Defs.buildables.get(this.mode.key), fw = (d ? d.w : 1) * K, fh = (d ? d.h : 1) * K;
      const ac = a.gx * K + (a.sx || 0), ar = a.gy * K + (a.sy || 0), dx = b.gx * K + (b.sx || 0) - ac, dy = b.gy * K + (b.sy || 0) - ar;
      const across = Math.abs(dx) / fw >= Math.abs(dy) / fh;
      const n = Math.min(Math.round(across ? Math.abs(dx) / fw : Math.abs(dy) / fh), MAX_ROW - 1), step = Math.sign(across ? dx : dy);
      return Array.from({ length: n + 1 }, (_, i) => B.split(across ? ac + i * step * fw : ac, across ? ar : ar + i * step * fh));
    },
    previewAt(wx, wy){
      if (!this.placing()) return null;
      const key = this.mode.key, at = G.Buildings.placementAt(key, wx, wy);
      if (this.mode.anchor){
        // A row: each cell marked buildable or not, and whether the resources stretch to it.
        const d = G.Defs.buildables.get(key), cells = this.rowCells(this.mode.anchor, at);
        let n = 0;
        const marked = cells.map(c => {
          const ok = G.Buildings.canPlaceKey(key, c.gx, c.gy, c.sx, c.sy);
          if (ok) n++;
          return { ...c, ok, afford: ok && G.Economy.canAfford(Object.fromEntries(Object.entries(d.cost).map(([k, v]) => [k, v * n]))) };
        });
        G.State.buildPreview = { key, gx: cells[0].gx, gy: cells[0].gy, sx: cells[0].sx, sy: cells[0].sy, ok: marked.some(c => c.ok), cells: marked };
        return G.State.buildPreview;
      }
      G.State.buildPreview = { key, gx: at.gx, gy: at.gy, sx: at.sx, sy: at.sy, ok: G.Buildings.canPlaceKey(key, at.gx, at.gy, at.sx, at.sy) };
      return G.State.buildPreview;
    },
    confirm(){
      const pr = G.State.buildPreview;
      if (!this.placing() || !pr) return false;
      const builder = G.Construction.builder(this.mode.builderId);
      if (!builder){ G.UI.toast('Utility Spider is unavailable'); this.cancel(); return false; }
      this.mode.anchor = null;
      if (pr.cells && pr.cells.length > 1){
        const sites = G.Construction.orderRow(builder, this.mode.key, pr.cells);
        if (sites.length) this.cancel(); else G.State.buildPreview = null;
        return sites.length > 0;
      }
      const site = G.Construction.order(builder, this.mode.key, pr.gx, pr.gy, pr.sx || 0, pr.sy || 0);
      if (site) this.cancel();
      return !!site;
    },
    icon(key){
      const d = G.Defs.buildables.get(key);
      if (d.symbol) return `<div class="catalog-art" style="background:${esc(d.color)};color:#0b1820;font-weight:800">${esc(d.symbol)}</div>`;
      if (d.wall) return `<div class="catalog-art catalog-wall${key === 'reinforced_wall' ? ' reinforced' : key === 'wood_wall' ? ' wood' : ''}">WALL</div>`;
      if (d.container) return '<div class="catalog-art catalog-chest">CHEST</div>';
      return `<div class="catalog-art">${esc(G.initials(d.name))}</div>`;
    },
    render(){
      const p = $('catalogPanel'), m = this.mode;
      if (!this.active()){ this.cancel(); return; }
      p.innerHTML = `<div class="catalog-header"><b>Utility Spider — Build</b><button id="cancelBuildBtn">×</button></div>
        <div class="catalog-help">${!m.key ? 'Choose a structure.' : G.Defs.buildables.get(m.key).wall ? `Tap a cell for one section. Press and drag to build a row of up to ${MAX_ROW} in the direction you drag.` : 'Tap a grid cell to place. Hold and drag across the map to refine the cell.'}${m.key && G.Defs.buildables.get(m.key).rotateTo ? ` <button id="rotateBuildBtn" class="catalog-rotate">Rotate (R): ${G.Defs.buildables.get(m.key).w > 1 ? 'east–west' : 'north–south'}</button>` : ''}</div>
        <div class="catalog-grid">${G.Defs.buildables.all().filter(d => !d.debugOnly && d.listed !== false).map(d => `<button class="catalog-entry build-pick ${m.key === d.key || (m.key && G.Defs.buildables.get(m.key).rotateTo === d.key) ? 'active' : ''}" data-build-pick="${d.key}">
          ${this.icon(d.key)}<div class="catalog-name">${esc(d.name)}</div><div class="catalog-desc">${esc(d.description)}<br><b>${esc(G.Economy.describe(d.cost))}</b></div></button>`).join('')}</div>`;
      $('cancelBuildBtn').addEventListener('click', () => this.cancel());
      if ($('rotateBuildBtn')) $('rotateBuildBtn').addEventListener('click', e => { e.stopPropagation(); this.rotate(); });
      p.querySelectorAll('[data-build-pick]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.choose(b.dataset.buildPick); }));
    }
  };

  G.Events.on('build:cancel', () => { if (G.BuildUI.active()) G.BuildUI.cancel(); });
  G.Events.on('world:created', () => { if (G.hasDOM && $('catalogPanel')) G.BuildUI.cancel(); });
})();
