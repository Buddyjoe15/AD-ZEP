/* Map Editor (debug mode): paint terrain with a brush, place structures, resource nodes
   and signals, erase objects, or reset the map to grass. Edits go through GW.MapEdit, so
   they are recorded as terrain edits and saved with the game. */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;
  // Friendly names for the terrain palette, in display order.
  const PALETTE = [
    ['grass', 'Grass'], ['clearing', 'Clearing'], ['path', 'Dirt path'], ['forest', 'Forest floor'], ['tree', 'Trees'],
    ['bush', 'Brush'], ['water', 'Water'], ['rock', 'Mountain / rock'], ['bridge', 'Bridge'], ['floor', 'Floor'],
    ['wall', 'Ruin wall'], ['door', 'Doorway']
  ];

  G.MapEditorUI = {
    tab: 'terrain', terrain: 'water', brush: 3, object: null, stroke: null,
    isOpen(){ return !$('mapEdPanel').classList.contains('hidden'); },
    // True when a tap or drag on the map should edit rather than play.
    active(){ return this.isOpen() && (this.tab === 'terrain' || this.tab === 'erase' || (this.tab === 'objects' && !!this.object)); },
    toggle(open){
      const p = $('mapEdPanel');
      open = open ?? p.classList.contains('hidden');
      p.classList.toggle('hidden', !open); $('mapEdBtn').classList.toggle('on', open);
      this.stroke = null;
      if (open){ if (G.DebugUI.isOpen()) G.DebugUI.toggle(false); this.render(); }
      this.syncButton();
    },
    // The button shows while debug mode (the Debug panel) or the editor is open.
    syncButton(){ $('mapEdBtn').classList.toggle('hidden', !(G.DebugUI.isOpen() || this.isOpen())); },
    terrainDef(key){ return G.Defs.terrain.get(key); },
    swatch(key){ const c = this.terrainDef(key).minimap; return `rgb(${c[0]},${c[1]},${c[2]})`; },
    objects(){ return G.DebugUI.catalog().filter(e => e.kind === 'building' || e.kind === 'node' || e.kind === 'site'); },
    render(){
      const p = $('mapEdPanel'), tab = this.tab;
      const tabs = [['terrain', 'Terrain'], ['objects', 'Objects'], ['erase', 'Erase']]
        .map(([k, n]) => `<button type="button" class="medTab${tab === k ? ' on' : ''}" data-tab="${k}">${n}</button>`).join('');
      let body = '';
      if (tab === 'terrain'){
        body = `<div class="dbgGroup">Brush size</div><div class="medRow">${G.MapEdit.BRUSHES.map(n => `<button type="button" class="medSize${this.brush === n ? ' on' : ''}" data-brush="${n}">${n}×${n}</button>`).join('')}</div>
          <div class="dbgGroup">Terrain</div>
          ${PALETTE.filter(([k]) => G.Defs.terrain.has(k)).map(([k, n]) => `<button type="button" class="dbgEntry${this.terrain === k ? ' active' : ''}" data-terrain="${k}"><span class="dbgIcon" style="background:${this.swatch(k)}"></span>${esc(n)}${this.terrainDef(k).passable ? '' : ' <small>blocks movement</small>'}</button>`).join('')}
          <div class="dbgGroup">Whole map</div><button type="button" id="medReset" class="dbgEntry">Reset map to grass</button>`;
      } else if (tab === 'objects'){
        const list = this.objects(), a = this.object;
        body = list.map((e, i) => `<button type="button" class="dbgEntry${a && a.kind === e.kind && a.key === e.key ? ' active' : ''}" data-obj="${i}"><span class="dbgIcon dbg-${e.kind}">${esc(G.DebugUI.symbol(e))}</span>${esc(e.name)}</button>`).join('');
      } else body = '<p class="dbgHelp">Tap a structure, container, resource node, signal or construction site to remove it. The ship and units are never erased.</p>';
      const help = tab === 'terrain' ? `Tap or drag on the map to paint <b>${esc(PALETTE.find(x => x[0] === this.terrain)?.[1] || this.terrain)}</b>. Blocking terrain skips structures and moves units aside. Two fingers still pan and zoom.`
        : tab === 'objects' ? (this.object ? `Tap the map to place <b>${esc(this.object.name)}</b>.` : 'Choose something to place.') : 'Erase mode is on.';
      p.innerHTML = `<div class="dbgHead"><b>Map Editor</b><button id="medClose" type="button">×</button></div>
        <div class="medTabs">${tabs}</div><div class="dbgHelp">${help}</div>${body}`;
      $('medClose').onclick = () => this.toggle(false);
      p.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.render(); });
      p.querySelectorAll('[data-brush]').forEach(b => b.onclick = () => { this.brush = +b.dataset.brush; this.render(); });
      p.querySelectorAll('[data-terrain]').forEach(b => b.onclick = () => { this.terrain = b.dataset.terrain; this.render(); });
      const list = this.objects();
      p.querySelectorAll('[data-obj]').forEach(b => b.onclick = () => {
        const e = list[+b.dataset.obj], a = this.object;
        this.object = a && a.kind === e.kind && a.key === e.key ? null : e; this.render();
      });
      const reset = $('medReset');
      if (reset) reset.onclick = () => {
        if (reset.dataset.confirm){ G.MapEdit.reset(); G.UI.toast('Map reset to grass'); this.render(); }
        else { reset.dataset.confirm = '1'; reset.textContent = 'Tap again to reset the whole map'; }
      };
    },

    // ---- Map input (called by GW.Input while active()) ----
    tile(wx, wy){ const T = G.CONFIG.TILE; return { x: Math.floor(wx / T), y: Math.floor(wy / T) }; },
    paintAt(wx, wy){
      const t = this.tile(wx, wy), last = this.stroke && this.stroke.last, id = this.terrainDef(this.terrain).id;
      // Fill the gap from the previous point so fast drags leave no holes.
      const steps = last ? Math.max(Math.abs(t.x - last.x), Math.abs(t.y - last.y)) : 0;
      const step = Math.max(1, Math.floor(this.brush / 2));
      for (let s = step; s < steps; s += step) G.MapEdit.paint(Math.round(last.x + (t.x - last.x) * s / steps), Math.round(last.y + (t.y - last.y) * s / steps), this.brush, id);
      if (!last || last.x !== t.x || last.y !== t.y) G.MapEdit.paint(t.x, t.y, this.brush, id);
      if (this.stroke) this.stroke.last = t;
    },
    pointerDown(wx, wy){
      if (this.tab === 'terrain'){ this.stroke = { last: null }; this.paintAt(wx, wy); return true; }
      if (this.tab === 'objects' && this.object){ G.DebugUI.spawn(this.object, wx, wy); return false; }
      if (this.tab === 'erase'){ const what = G.MapEdit.removeAt(wx, wy); G.UI.toast(what ? what + ' removed' : 'Nothing to remove here'); }
      return false;
    },
    pointerMove(wx, wy){ if (this.stroke) this.paintAt(wx, wy); },
    pointerUp(){ this.stroke = null; },

    init(){
      $('mapEdBtn').addEventListener('click', () => this.toggle());
      $('mapEdPanel').addEventListener('pointerdown', e => e.stopPropagation());
      G.Events.on('scene:changed', ({ name }) => { if (name !== 'gameplay' && this.isOpen()) this.toggle(false); this.syncButton(); });
      this.syncButton();
    }
  };
})();
