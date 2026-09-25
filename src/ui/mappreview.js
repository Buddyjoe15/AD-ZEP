/* Woodlands preview (Map Editor → Maps → Preview): builds the Woodlands map for a seed
   without loading it and lays it out like the Woodlands mock-up: the whole map with its
   named places, a close view to drag and zoom, what the map is made of, its ground detail,
   and a list of places. Nothing changes in the game until "Load this map". */
(function(){
  'use strict';
  const G = GW;
  const $ = id => document.getElementById(id);
  const esc = G.esc;
  const VIEWS = [24, 32, 48, 64, 96, 128];
  const HYPSO = [[52, 96, 80], [88, 122, 74], [140, 140, 86], [150, 118, 84], [214, 210, 200]];
  const LEVELS = ['0 lowland', '1', '2', '3', '4 high ground'];
  const DETAIL_NAMES = {
    PEBBLES: 'Pebbles', TWIGS: 'Twigs', LEAVES: 'Leaves', TUFT: 'Grass tufts', WEEDS: 'Small weeds', FLOWER: 'Flowers',
    MUD: 'Mud patches', CRACKED: 'Cracked soil', DIRT: 'Dirt patches', ASH: 'Ash', PUDDLE: 'Puddles', BONES: 'Bones',
    FEATHER: 'Feathers', SHELLS: 'Shells', FOOT: 'Footprints', ANIMAL: 'Animal tracks', TIRE: 'Tyre tracks',
    DRAG: 'Drag marks', SCORCH: 'Scorch marks', BRANCH: 'Fallen branches'
  };
  const PLACE_TEXT = {
    settlement: 'Settlement', waterfall: 'Waterfall', anomaly: 'Alien vegetation and crystals', geothermal: 'Steam vents, ash and ore',
    lake: 'Lake and creek', swamp: 'Sunken swamp', cave: 'Cave in a cliff', camp: 'Log hut, sawhorse, stumps and log piles'
  };
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const id = key => G.Defs.terrain.get(key).id;

  G.MapPreviewUI = {
    grid: null, seed: 0, info: null, view: { x: 0, y: 0 }, viewIdx: 2, mode: 'terrain', confirm: false, drag: null, queued: false,
    base: null,

    isOpen(){ return !$('mapPreview').classList.contains('hidden'); },
    open(seed){
      const el = $('mapPreview');
      el.classList.remove('hidden');
      this.seed = seed >>> 0; this.confirm = false; this.grid = null;
      el.innerHTML = `<div class="mpvBox"><div class="mpvHead"><div><div class="mpvEyebrow">Woodlands preview</div><h2>Seed ${this.seed}</h2></div>
        <button type="button" class="mpvClose" id="mpvClose" aria-label="Close preview">×</button></div>
        <p class="mpvWait">Generating the map for seed ${this.seed}…</p></div>`;
      $('mpvClose').onclick = () => this.close();
      // Let the "Generating" text paint before the generator runs (about a second).
      setTimeout(() => {
        if (!this.isOpen() || this.seed !== (seed >>> 0)) return;
        this.grid = G.MapGen.woodlands(this.seed);
        const c = this.grid.cols;
        this.view = { x: c / 2, y: c / 2 };
        this.info = this.survey(this.grid);
        this.build();
      }, 40);
    },
    close(){ $('mapPreview').classList.add('hidden'); $('mapPreview').innerHTML = ''; this.grid = null; this.info = null; },

    // Counts for the side panels: terrain coverage, ground detail, waterfalls and bridges.
    survey(grid){
      const counts = new Map(), dcounts = new Map(), art = grid.art;
      for (let i = 0; i < grid.size; i++){
        counts.set(grid.tiles[i], (counts.get(grid.tiles[i]) || 0) + 1);
        if (art.detail[i]) dcounts.set(art.detail[i], (dcounts.get(art.detail[i]) || 0) + 1);
      }
      const groups = t => {
        const seen = new Uint8Array(grid.size), cols = grid.cols;
        let n = 0;
        for (let i = 0; i < grid.size; i++){
          if (grid.tiles[i] !== t || seen[i]) continue;
          n++;
          const st = [i]; seen[i] = 1;
          while (st.length){
            const q = st.pop(), x = q % cols, y = (q / cols) | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
              const nx = x + dx, ny = y + dy, m = ny * cols + nx;
              if (grid.inBounds(nx, ny) && !seen[m] && grid.tiles[m] === t){ seen[m] = 1; st.push(m); }
            }
          }
        }
        return n;
      };
      const kinds = k => art.places.filter(p => p.kind === k).length;
      return {
        counts, dcounts,
        falls: groups(id('waterfall')), bridges: groups(id('bridge')),
        sites: kinds('settlement'), caves: kinds('cave'), camps: kinds('camp'),
        huts: counts.get(id('sawhorse')) || 0
      };
    },

    build(){
      const el = $('mapPreview'), s = this.seed, info = this.info, N = this.grid.size;
      const pct = n => { const p = n / N * 100; return p < .1 ? '<0.1%' : p.toFixed(1) + '%'; };
      const terrain = [...info.counts.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => {
        const d = G.Defs.terrain.all().find(x => x.id === t);
        return `<div class="mpvRow"><span class="mpvSw" style="background:${rgb(d.minimap)}"></span><span>${esc(d.name)}</span>${d.passable ? '<span></span>' : '<span class="mpvTag">blocks</span>'}<span class="mpvPct">${pct(n)}</span></div>`;
      }).join('');
      const detail = (G.WOODLANDS_DETAIL || []).map((key, i) => `<div class="mpvRow mpvDec"><canvas class="mpvIco" width="56" height="56" data-d="${i + 1}"></canvas><span>${esc(DETAIL_NAMES[key] || key)}</span><span class="mpvPct">${(info.dcounts.get(i + 1) || 0).toLocaleString()}</span></div>`).join('');
      const stat = (k, v) => `<div class="mpvStat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
      const places = this.places();
      el.innerHTML = `<div class="mpvBox">
        <div class="mpvHead">
          <div><div class="mpvEyebrow">Woodlands preview · not loaded yet</div><h2>Seed ${s}</h2>
            <p class="mpvLede">This is the map the Maps tab will build for this seed: five height levels with cliffs between them, rivers that fall at every step, villages, logging camps and caves. The ship lands on the clearing in the middle.</p></div>
          <div class="mpvActions">
            <button type="button" class="mpvBtn mpvPrimary" id="mpvLoad">${this.confirm ? 'Tap again to load' : 'Load this map'}</button>
            <button type="button" class="mpvBtn" id="mpvAnother">Preview another seed</button>
            <button type="button" class="mpvClose" id="mpvClose" aria-label="Close preview">×</button>
          </div>
        </div>
        <div class="mpvStage">
          <div class="mpvFrame">
            <div class="mpvFrameHead"><h3>Full map</h3><div class="mpvSeg"><button type="button" data-mode="terrain" class="${this.mode === 'terrain' ? 'on' : ''}">Terrain</button><button type="button" data-mode="height" class="${this.mode === 'height' ? 'on' : ''}">Height</button></div></div>
            <canvas id="mpvOv" class="mpvMap" width="1024" height="1024" aria-label="Whole map. Tap to inspect an area."></canvas>
            <div class="mpvLevels">Height levels: ${HYPSO.map((c, l) => `<span><i style="background:${rgb(c)}"></i>${LEVELS[l]}</span>`).join('')}</div>
            <div class="mpvRead" id="mpvOvRead">Tap the map to inspect an area.</div>
          </div>
          <div class="mpvFrame">
            <div class="mpvFrameHead"><h3>Close view</h3><div class="mpvTools"><button type="button" id="mpvOut" aria-label="Show more tiles">−</button><span id="mpvZoom">${VIEWS[this.viewIdx]} × ${VIEWS[this.viewIdx]} tiles</span><button type="button" id="mpvIn" aria-label="Show fewer tiles">+</button><button type="button" id="mpvShip">Ship</button></div></div>
            <canvas id="mpvDt" class="mpvMap" width="768" height="768" tabindex="0" aria-label="Close view. Drag or use the arrow keys to pan."></canvas>
            <div class="mpvRead" id="mpvDtRead">Drag or use the arrow keys to pan.</div>
          </div>
        </div>
        <div class="mpvCols">
          <div class="mpvFrame"><h3>Tiles</h3><div class="mpvList">${terrain}</div></div>
          <div class="mpvFrame"><h3>Ground detail</h3><p class="mpvNote">Small marks drawn on top of tiles. They never block movement.</p><div class="mpvList">${detail}</div></div>
          <div class="mpvFrame"><h3>Features</h3>
            <div class="mpvStats">${stat('Height levels', 5)}${stat('Waterfalls', info.falls)}${stat('Settlements', info.sites)}${stat('Bridges', info.bridges)}${stat('Caves', info.caves)}${stat('Logging huts', `${info.huts} in ${info.camps} camps`)}</div>
            <h4>Places</h4>
            <div class="mpvPlaces">${places.map((p, i) => `<button type="button" class="mpvPlace" data-place="${i}"><span>${esc(p.name)}<small>${esc(p.sub)}</small></span><span class="mpvXY">${p.x}, ${p.y}</span></button>`).join('')}</div>
          </div>
          <div class="mpvFrame mpvNotes"><h3>About this map</h3>
            <p><b>Height.</b> Every tile has a level from 0 to 4. Height is drawn only: cliffs block movement, and units change level on grassy slopes and carved steps.</p>
            <p><b>Loading.</b> Loading swaps the terrain under the game in progress. Units, structures and resources stay, with open ground cleared under them. The seed and map type are saved with the game.</p>
            <p><b>Keeping it.</b> After loading, <b>Save current map</b> in the Maps tab keeps it under a name to reload later.</p>
          </div>
        </div>
      </div>`;
      this.bind();
      this.buildBase();
      el.querySelectorAll('canvas[data-d]').forEach(c => {
        const ctx = c.getContext('2d');
        ctx.fillStyle = rgb(G.Defs.terrain.get('grass').minimap); ctx.fillRect(0, 0, 56, 56);
        G.WoodlandsArt.detailIcon(ctx, +c.dataset.d, 56);
      });
      this.redraw();
    },
    places(){
      const c = this.grid.cols, counters = {};
      const list = [{ name: 'Ship landing zone', sub: 'Where the ship lands', x: c / 2, y: c / 2 }];
      for (const p of this.grid.art.places){
        counters[p.kind] = (counters[p.kind] || 0) + 1;
        const numbered = p.kind === 'cave' || p.kind === 'camp';
        list.push({ name: numbered ? `${p.name} ${counters[p.kind]}` : p.name, sub: PLACE_TEXT[p.kind] || p.kind, x: p.x, y: p.y });
      }
      return list;
    },

    bind(){
      const el = $('mapPreview');
      $('mpvClose').onclick = () => this.close();
      $('mpvLoad').onclick = () => {
        if (!this.confirm){ this.confirm = true; $('mpvLoad').textContent = 'Tap again to load'; return; }
        const seed = this.seed;
        this.close();
        G.UI.toast('Generating map…');
        setTimeout(() => {
          G.UI.toast(G.MapEdit.loadMap('woodlands', seed) ? `Loaded Woodlands, seed ${seed}` : 'Could not load that map');
          if (G.MapEditorUI.isOpen()) G.MapEditorUI.render();
        }, 30);
      };
      $('mpvAnother').onclick = () => {
        const seed = 1 + Math.floor(Math.random() * 999999);
        G.MapEditorUI.woodSeed = seed;
        if (G.MapEditorUI.isOpen()) G.MapEditorUI.render();
        this.open(seed);
      };
      el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { this.mode = b.dataset.mode; el.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); this.buildBase(); this.redraw(); });
      $('mpvIn').onclick = () => { this.viewIdx = Math.max(0, this.viewIdx - 1); this.redraw(); };
      $('mpvOut').onclick = () => { this.viewIdx = Math.min(VIEWS.length - 1, this.viewIdx + 1); this.redraw(); };
      $('mpvShip').onclick = () => { const c = this.grid.cols; this.view = { x: c / 2, y: c / 2 }; this.redraw(); };
      const places = this.places();
      el.querySelectorAll('[data-place]').forEach(b => b.onclick = () => { const p = places[+b.dataset.place]; this.view = { x: p.x, y: p.y }; this.redraw(); });

      const ov = $('mpvOv'), dt = $('mpvDt'), cols = this.grid.cols;
      const ovTile = e => { const r = ov.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / r.width * cols), y: Math.floor((e.clientY - r.top) / r.height * cols) }; };
      ov.onpointermove = e => { const p = ovTile(e); $('mpvOvRead').innerHTML = this.describe(p.x, p.y); };
      ov.onclick = e => { this.view = ovTile(e); this.redraw(); };
      const dtTile = e => {
        const r = dt.getBoundingClientRect(), v = VIEWS[this.viewIdx], o = this.origin();
        return { x: o.x + Math.floor((e.clientX - r.left) / r.width * v), y: o.y + Math.floor((e.clientY - r.top) / r.height * v) };
      };
      dt.onpointerdown = e => { this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; dt.setPointerCapture(e.pointerId); };
      dt.onpointermove = e => {
        if (!this.drag){ $('mpvDtRead').innerHTML = this.describe(dtTile(e).x, dtTile(e).y); return; }
        const k = VIEWS[this.viewIdx] / dt.getBoundingClientRect().width;
        this.view = { x: Math.round(this.drag.vx - (e.clientX - this.drag.x) * k), y: Math.round(this.drag.vy - (e.clientY - this.drag.y) * k) };
        this.redraw();
      };
      dt.onpointerup = dt.onpointercancel = () => { this.drag = null; };
      dt.onkeydown = e => {
        const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!m) return;
        e.preventDefault(); e.stopPropagation();
        const step = Math.max(4, VIEWS[this.viewIdx] / 8);
        this.view = { x: this.view.x + m[0] * step, y: this.view.y + m[1] * step }; this.redraw();
      };
    },
    describe(x, y){
      const g = this.grid;
      if (!g || !g.inBounds(x, y)) return '&nbsp;';
      const i = y * g.cols + x, t = G.Defs.terrain.all().find(d => d.id === g.tiles[i]), d = g.art.detail[i];
      const dk = d ? (G.WOODLANDS_DETAIL || [])[d - 1] : null;
      return `Tile <b>${x}, ${y}</b> · level <b>${g.art.level[i]}</b> · <b>${esc(t.name)}</b>${t.passable ? '' : ' (blocks movement)'}${dk ? ' · detail: <b>' + esc(DETAIL_NAMES[dk] || dk) + '</b>' : ''}`;
    },

    // One pixel per tile, coloured by terrain (with height shading) or by height level.
    buildBase(){
      const g = this.grid, cols = g.cols, art = g.art;
      const cv = this.base || (this.base = document.createElement('canvas'));
      cv.width = cols; cv.height = g.rows;
      const ctx = cv.getContext('2d'), img = ctx.createImageData(cols, g.rows), lut = [];
      for (const d of G.Defs.terrain.all()) lut[d.id] = d.minimap;
      const wet = new Set(['water', 'deep_water', 'waterfall', 'bog'].map(id)), cliff = id('cliff'), cave = id('cave');
      for (let i = 0; i < g.size; i++){
        const t = g.tiles[i], l = art.level[i];
        let c, k;
        if (this.mode === 'height'){
          c = wet.has(t) ? [58, 112, 150] : HYPSO[l];
          k = t === cliff || t === cave ? .55 : 1;
          if (i >= cols && art.level[i - cols] > l) k *= .78;
        } else { c = lut[t]; k = G.WoodlandsArt.overviewShade(g, i); }
        const p = i * 4;
        img.data[p] = c[0] * k; img.data[p + 1] = c[1] * k; img.data[p + 2] = c[2] * k; img.data[p + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    },
    // Top-left tile of the close view, kept inside the map.
    origin(){
      const v = VIEWS[this.viewIdx], c = this.grid.cols;
      return { x: G.clamp(Math.round(this.view.x - v / 2), 0, c - v), y: G.clamp(Math.round(this.view.y - v / 2), 0, this.grid.rows - v) };
    },
    redraw(){
      if (this.queued) return;
      this.queued = true;
      requestAnimationFrame(() => { this.queued = false; if (this.grid){ this.drawOverview(); this.drawClose(); } });
    },
    drawOverview(){
      const ov = $('mpvOv');
      if (!ov) return;
      const ctx = ov.getContext('2d'), g = this.grid, k = ov.width / g.cols;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.base, 0, 0, ov.width, ov.height);
      const label = (text, x, y, size, color, weight = 600) => {
        ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 4); ctx.strokeStyle = 'rgba(8,12,9,.85)';
        ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
      };
      const mark = (x, y, shape, color) => {
        ctx.beginPath();
        if (shape === 'dot') ctx.arc(x, y, 6, 0, Math.PI * 2);
        else if (shape === 'sq') ctx.rect(x - 5, y - 5, 10, 10);
        else { ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y + 6); ctx.lineTo(x - 7, y + 6); ctx.closePath(); }
        ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = shape === 'tri' ? '#e8dcc4' : '#0a0e0b'; ctx.stroke();
      };
      const P = g.art.places;
      for (const p of P) if (p.kind === 'swamp') label(p.name.toUpperCase(), p.x * k, p.y * k, 24, '#c9d6a8');
      for (const p of P) if (p.kind === 'lake') label(p.name.toUpperCase(), p.x * k, p.y * k, 22, '#bfe3ee');
      for (const p of P) if (p.kind === 'anomaly' || p.kind === 'geothermal') label(p.name.toUpperCase(), p.x * k, (p.y - 20) * k, 20, p.kind === 'anomaly' ? '#d5b2ff' : '#f0a47a');
      for (const p of P) if (p.kind === 'waterfall'){ mark(p.x * k, p.y * k, 'dot', '#e8f7fb'); label(p.name, p.x * k + 14, p.y * k - 16, 19, '#e8f7fb'); }
      for (const p of P) if (p.kind === 'camp'){ mark(p.x * k, p.y * k, 'sq', '#e0b56a'); label('Logging', p.x * k, p.y * k + 19, 16, '#e0b56a', 500); }
      for (const p of P) if (p.kind === 'cave') mark(p.x * k, p.y * k, 'tri', '#1b1814');
      for (const p of P) if (p.kind === 'settlement') label(p.name, p.x * k, (p.y - 26) * k, 26, '#f1ecd0', 700);
      const m = g.cols / 2 * k;
      ctx.beginPath(); ctx.moveTo(m, m - 16); ctx.lineTo(m + 11, m + 10); ctx.lineTo(m, m + 5); ctx.lineTo(m - 11, m + 10); ctx.closePath();
      ctx.fillStyle = '#49a4ff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#0a0e0b'; ctx.stroke();
      label('SHIP', m, m + 26, 18, '#9fd0ff', 700);
      const v = VIEWS[this.viewIdx], o = this.origin();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,12,9,.9)'; ctx.strokeRect(o.x * k, o.y * k, v * k, v * k);
      ctx.lineWidth = 2; ctx.strokeStyle = '#d4c46c'; ctx.strokeRect(o.x * k, o.y * k, v * k, v * k);
    },
    // The close view uses the game's own Woodlands terrain art, so it looks as it will in play.
    drawClose(){
      const dt = $('mpvDt');
      if (!dt) return;
      const ctx = dt.getContext('2d'), v = VIEWS[this.viewIdx], S = dt.width / v, o = this.origin(), g = this.grid;
      ctx.fillStyle = '#0a0e0b'; ctx.fillRect(0, 0, dt.width, dt.height);
      G.WoodlandsArt.paintChunk(ctx, g, o.x, o.y, v, S);
      const mid = g.cols / 2, px = (mid - o.x) * S, py = (mid - o.y) * S;
      if (px > -S * 30 && px < dt.width + S * 30 && py > -S * 30 && py < dt.height + S * 30){
        ctx.save(); ctx.translate(px, py); ctx.scale(S, S);
        const poly = (pts, dx = 0, dy = 0) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)); ctx.closePath(); };
        const hull = [[0, -4.6], [1.2, -2.6], [1.5, -.6], [3.4, 1.4], [3.4, 2.4], [1.4, 2.1], [1.1, 3.2], [-1.1, 3.2], [-1.4, 2.1], [-3.4, 2.4], [-3.4, 1.4], [-1.5, -.6], [-1.2, -2.6]];
        poly(hull, .5, .7); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
        poly(hull); ctx.fillStyle = '#b9c3ca'; ctx.fill(); ctx.lineWidth = .12; ctx.strokeStyle = '#2a3238'; ctx.stroke();
        ctx.fillStyle = '#49a4ff';
        poly([[3.4, 1.4], [3.4, 2.4], [1.4, 2.1], [1.5, 1.2]]); ctx.fill();
        poly([[-3.4, 1.4], [-3.4, 2.4], [-1.4, 2.1], [-1.5, 1.2]]); ctx.fill();
        ctx.fillStyle = '#8b979f'; ctx.fillRect(-.9, -.4, 1.8, 2.6);
        ctx.fillStyle = '#49a4ff'; ctx.fillRect(-.9, .6, 1.8, .35);
        poly([[0, -3.9], [.7, -2.5], [0, -2.1], [-.7, -2.5]]); ctx.fillStyle = '#1b2731'; ctx.fill();
        ctx.restore();
        ctx.setLineDash([S * .8, S * .6]); ctx.strokeStyle = 'rgba(212,196,108,.6)'; ctx.lineWidth = Math.max(1, S * .12);
        ctx.beginPath(); ctx.arc(px, py, S * 23.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      const z = $('mpvZoom');
      if (z) z.textContent = `${v} × ${v} tiles`;
    },

    init(){
      const el = $('mapPreview');
      // Taps, wheel and keys inside the preview never reach the game underneath.
      for (const ev of ['pointerdown', 'wheel', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
      el.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
      G.Events.on('scene:changed', ({ name }) => { if (name !== 'gameplay' && this.isOpen()) this.close(); });
    }
  };
})();
