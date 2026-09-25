/* Map Editor (debug mode): paint terrain with a brush, place structures, resource nodes
   and signals, erase objects, reset the map to grass, load another map type (the test map
   or a generated Woodlands), and keep named maps to reload later. Edits go through
   GW.MapEdit, so they are recorded as terrain edits and saved with the game. */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;
  // Friendly names for the terrain palette, in display order.
  const PALETTE = [
    ['grass', 'Grass'], ['clearing', 'Clearing'], ['path', 'Dirt path'], ['forest', 'Forest floor'], ['tree', 'Trees'],
    ['bush', 'Brush'], ['water', 'Water'], ['rock', 'Mountain / rock'], ['bridge', 'Bridge'], ['floor', 'Floor'],
    ['wall', 'Ruin wall'], ['door', 'Doorway'],
    // Woodlands terrain.
    ['tall_grass', 'Tall grass'], ['wildflowers', 'Wildflowers'], ['thicket', 'Dense thicket'], ['stump', 'Tree stump'],
    ['fallen_tree', 'Fallen tree'], ['mushrooms', 'Mushrooms'], ['reeds', 'Reeds'], ['swamp', 'Swamp'], ['bog', 'Bog water'],
    ['deep_water', 'Deep water'], ['waterfall', 'Waterfall'], ['cliff', 'Cliff'], ['slope', 'Grassy slope'], ['steps', 'Carved steps'],
    ['cave', 'Cave mouth'], ['mossy_rock', 'Mossy boulders'], ['crystal', 'Crystals'], ['outcrop', 'Mineral outcrop'],
    ['steam_vent', 'Steam vent'], ['termite_mound', 'Termite mound'], ['burrow', 'Animal burrow'], ['alien_flora', 'Alien vegetation'],
    ['barren', 'Barren ground'], ['rubble', 'Rubble'], ['log_pile', 'Log pile'], ['sawhorse', 'Sawhorse'], ['log_wall', 'Log wall']
  ];
  const mapName = key => (G.MapGen.types[key] && G.MapGen.types[key].name) || key;

  G.MapEditorUI = {
    tab: 'terrain', terrain: 'water', brush: 3, object: null, stroke: null, woodSeed: null, confirm: null,
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
      const tabs = [['terrain', 'Terrain'], ['objects', 'Objects'], ['erase', 'Erase'], ['maps', 'Maps']]
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
      } else if (tab === 'maps') body = this.mapsBody();
      else body = '<p class="dbgHelp">Tap a structure, container, resource node, signal or construction site to remove it. The ship and units are never erased.</p>';
      const help = tab === 'terrain' ? `Tap or drag on the map to paint <b>${esc(PALETTE.find(x => x[0] === this.terrain)?.[1] || this.terrain)}</b>. Blocking terrain skips structures and moves units aside. Two fingers still pan and zoom.`
        : tab === 'objects' ? (this.object ? `Tap the map to place <b>${esc(this.object.name)}</b>.` : 'Choose something to place.')
        : tab === 'maps' ? 'Loading a map replaces the terrain. Units, structures and resources stay, with open ground cleared under them.' : 'Erase mode is on.';
      p.innerHTML = `<div class="dbgHead"><b>Map Editor</b><button id="medClose" type="button">×</button></div>
        <div class="medTabs">${tabs}</div><div class="dbgHelp">${help}</div>${body}`;
      $('medClose').onclick = () => this.toggle(false);
      p.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.confirm = null; this.render(); });
      p.querySelectorAll('[data-brush]').forEach(b => b.onclick = () => { this.brush = +b.dataset.brush; this.render(); });
      p.querySelectorAll('[data-terrain]').forEach(b => b.onclick = () => { this.terrain = b.dataset.terrain; this.render(); });
      const list = this.objects();
      p.querySelectorAll('[data-obj]').forEach(b => b.onclick = () => {
        const e = list[+b.dataset.obj], a = this.object;
        this.object = a && a.kind === e.kind && a.key === e.key ? null : e; this.render();
      });
      if (tab === 'maps') this.bindMaps(p);
      const reset = $('medReset');
      if (reset) reset.onclick = () => {
        if (reset.dataset.confirm){ G.MapEdit.reset(); G.UI.toast('Map reset to grass'); this.render(); }
        else { reset.dataset.confirm = '1'; reset.textContent = 'Tap again to reset the whole map'; }
      };
    },

    // ---- Maps tab ----
    mapsBody(){
      const S = G.State, seed = this.woodSeed ?? S.seed, saved = G.MapLibrary.list(), c = this.confirm;
      const edits = (S.terrainEdits || []).length;
      const confirmText = key => c === key ? ' <small>Tap again to load</small>' : '';
      const defName = S.map === 'grass' ? 'Test map' : `${mapName(S.map)} ${S.seed}`;
      return `<div class="dbgGroup">Current map</div>
        <p class="dbgHelp"><b>${esc(mapName(S.map))}</b> · seed ${S.seed} · ${edits} edit${edits === 1 ? '' : 's'}</p>
        <div class="dbgGroup">Load a map</div>
        <button type="button" class="dbgEntry" data-load="grass"><span class="dbgIcon" style="background:${this.swatch('grass')}"></span>Test map (open grass)${confirmText('grass')}</button>
        <div class="medRow"><label class="medLabel" for="medSeed">Woodlands seed</label><input id="medSeed" class="medInput" type="number" min="0" max="4294967295" value="${seed}"><button type="button" id="medRnd" class="medSize">Random</button></div>
        <button type="button" class="dbgEntry" data-load="woodlands"><span class="dbgIcon" style="background:${this.swatch('tree')}"></span>Woodlands, seed ${seed}${confirmText('woodlands')}</button>
        <div class="dbgGroup">Saved maps</div>
        <div class="medRow"><input id="medName" class="medInput" type="text" maxlength="60" value="${esc(defName)}" aria-label="Name for the saved map"><button type="button" id="medSave" class="medSize">Save current map</button></div>
        ${saved.length ? saved.map((m, i) => `<div class="medRow"><button type="button" class="dbgEntry medSaved" data-saved="${i}">${esc(m.name)} <small>${esc(mapName(m.map))} · seed ${m.seed} · ${m.edits.length} edits${c === 'saved' + i ? ' · tap again to load' : ''}</small></button><button type="button" class="medSize medDel" data-del="${i}" aria-label="Delete ${esc(m.name)}">×</button></div>`).join('')
          : '<p class="dbgHelp">No saved maps yet. Save the current map to reload it later.</p>'}`;
    },
    bindMaps(p){
      const readSeed = () => { const v = Number($('medSeed').value); return Number.isInteger(v) && v >= 0 && v <= 4294967295 ? v : null; };
      // Loading replaces the whole terrain, so it takes a second tap.
      const twice = (key, run) => {
        if (this.confirm !== key){ this.confirm = key; this.render(); return; }
        this.confirm = null;
        G.UI.toast('Generating map…');
        setTimeout(() => { run(); this.render(); }, 30);
      };
      $('medSeed').onchange = () => { const v = readSeed(); if (v !== null) this.woodSeed = v; this.confirm = null; this.render(); };
      $('medRnd').onclick = () => { this.woodSeed = 1 + Math.floor(Math.random() * 999999); this.confirm = null; this.render(); };
      p.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
        const map = b.dataset.load, seed = map === 'woodlands' ? (readSeed() ?? G.State.seed) : G.State.seed;
        if (map === 'woodlands') this.woodSeed = seed;
        twice(map, () => G.UI.toast(G.MapEdit.loadMap(map, seed) ? `Loaded ${mapName(map)}${map === 'woodlands' ? ', seed ' + seed : ''}` : 'Could not load that map'));
      });
      $('medSave').onclick = () => {
        const name = $('medName').value.trim();
        if (!name){ G.UI.toast('Give the map a name'); return; }
        const m = G.MapLibrary.saveCurrent(name);
        G.UI.toast(m ? `Saved “${m.name}”` : 'Could not save the map (storage full?)');
        this.render();
      };
      const saved = G.MapLibrary.list();
      p.querySelectorAll('[data-saved]').forEach(b => b.onclick = () => {
        const m = saved[+b.dataset.saved];
        twice('saved' + b.dataset.saved, () => G.UI.toast(G.MapLibrary.load(m.name) ? `Loaded “${m.name}”` : 'That saved map no longer fits this game'));
      });
      p.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        const m = saved[+b.dataset.del];
        if (G.MapLibrary.remove(m.name)) G.UI.toast(`Deleted “${m.name}”`);
        this.confirm = null; this.render();
      });
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
