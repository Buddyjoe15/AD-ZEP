/* Hover info: a small panel in the bottom left, above the selection panel, that says what is
   under the mouse: a unit, structure, container, resource, tree or landscape feature, or the
   ground itself (water, cliff, grass, flowers…), with a line on what it means for play.
   Press ~ (the key left of 1) to turn it off and on; the choice is remembered. */
(function(){
  'use strict';
  const G = GW, esc = s => G.esc(String(s));
  // What some ground means for play, beyond its name.
  const TERRAIN_NOTE = {
    water: 'Too deep to wade. Units go round, or over a bridge or stepping stones.',
    deep_water: 'Deep water. Impassable.',
    waterfall: 'Falling water. Impassable.',
    cliff: 'A rock face. Impassable: find a ramp or carved steps.',
    slope: 'A ramp through the cliffs. Walkable, a little slower.',
    steps: 'Carved steps up the rock. Walkable.',
    bridge: 'Walkable, and quick.',
    path: 'A trail. Units move faster here.',
    forest: 'Forest floor between the trunks. Slows units.',
    bush: 'Brush. Slows units.',
    tall_grass: 'Long grass. Slightly slower going.',
    swamp: 'Sodden ground. Slow going.',
    bog: 'Bog water. Impassable.',
    stepping_stones: 'Stones across the river. Walkable, slowly.',
    cave: 'The mouth of a cave.',
    cave_floor: 'Inside a cave. Dark: keep an eye out for nests.',
    wildflowers: 'A meadow in flower.',
    reeds: 'Reeds by the water. Slows units.',
    wall: 'A building wall. Impassable.', floor: 'Inside a building. Impassable.', door: 'A doorway. Impassable.', log_wall: 'A log wall. Impassable.',
    clearing: 'Cleared, level ground: good for building.'
  };

  G.HoverInfo = {
    on: true, sx: -1, sy: -1, last: 0, sig: '',
    init(){
      try { this.on = localStorage.getItem('adzep.hoverInfo') !== 'off'; } catch (e){ /* storage blocked */ }
      const cv = G.Renderer.cv;
      cv.addEventListener('pointermove', e => { if (e.pointerType !== 'touch'){ const r = cv.getBoundingClientRect(); this.sx = e.clientX - r.left; this.sy = e.clientY - r.top; } });
      cv.addEventListener('pointerleave', () => { this.sx = -1; });
      addEventListener('keydown', e => {
        if (e.code !== 'Backquote' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || G.SceneManager.currentName !== 'gameplay') return;
        e.preventDefault();
        this.on = !this.on;
        try { localStorage.setItem('adzep.hoverInfo', this.on ? 'on' : 'off'); } catch (err){ /* storage blocked */ }
        G.UI.toast('Hover info ' + (this.on ? 'on' : 'off') + ' (~)');
        this.render(true);
      });
    },
    // What is at world point (x, y): { title, kind, lines[] } or null.
    describe(x, y){
      const S = G.State, I = G.Input, T = G.CONFIG.TILE;
      if (!S.grid) return null;
      const gx = Math.floor(x / T), gy = Math.floor(y / T);
      if (!S.grid.inBounds(gx, gy)) return null;
      const F = G.Fog, seen = !F.enabled || !F.seen || F.seen[gy * F.cols + gx];
      if (!seen) return { title: 'Unexplored', kind: 'Fog of war', lines: ['Send a unit to see what is here.'] };
      const u = I.unitAt(x, y, true);
      if (u){
        const d = G.Defs.units.get(u.type), friend = u.team === 'blue';
        const lines = [`HP ${Math.ceil(u.hp)} / ${u.maxHp}`];
        if (u.damage) lines.push(`Damage ${u.damage} · Range ${Math.round(u.range / T)} tiles`);
        if (d && d.description) lines.push(d.description);
        return { title: u.name || (d && d.name) || u.type, kind: u.isShip ? 'Ship' : friend ? 'Friendly unit' : 'Hostile unit', lines, tone: friend ? 'friend' : 'foe' };
      }
      const b = I.buildingAt(x, y);
      if (b){
        const d = G.Defs.buildables.get(b.type);
        return { title: d ? d.name : b.type, kind: b.team === 'blue' ? 'Structure' : 'Hostile structure', lines: [`HP ${Math.ceil(b.hp)} / ${b.maxHp}`, d && d.description ? d.description : ''].filter(Boolean), tone: b.team === 'blue' ? 'friend' : 'foe' };
      }
      const c = I.containerAt(x, y);
      if (c) return { title: c.name, kind: c.type === 'ground_item' ? 'Item' : 'Container', lines: [c.opened ? `${c.items.length} item${c.items.length === 1 ? '' : 's'} inside` : 'Not searched yet. Send Commander Vance to open it.'] };
      const n = I.nodeAt(x, y);
      if (n){ const d = G.Gather.def(n); return { title: n.name || (d && d.name), kind: 'Resource', lines: [`${Math.floor(n.remaining)} left`, d && d.description ? d.description : ''].filter(Boolean) }; }
      // Trees, stumps, fallen trees and the rest of the landscape (small detail included).
      if (G.Trees.has()){
        let best = -1, bd = 1e9;
        G.Trees.within(x, y, 18, k => { const p = G.Trees.nearestPoint(k, x, y), dd = Math.hypot(p.x - x, p.y - y); if (dd < bd){ bd = dd; best = k; } });
        if (best >= 0){
          const kind = G.Trees.kind(best), sp = G.TREES.species[kind], pr = G.TREES.props[kind], z = G.Trees.pos(best) && G.State.grid.art.trees.size[best];
          const name = sp ? `${['Young', 'Mature', 'Old'][z] || ''} ${sp.name.toLowerCase()}`.trim() : pr ? pr.name : kind;
          const hp = G.Trees.maxHp(best), wood = G.Trees.wood(best), lines = [];
          if (isFinite(hp)) lines.push(`Toughness ${Math.ceil(G.Trees.hp(best))} / ${Math.ceil(hp)}${wood ? ` · ${wood} wood` : ''}`);
          else lines.push("Can't be destroyed.");
          if (sp) lines.push(z >= G.TREES.BLOCKS_FROM ? 'Blocks its tile. A Salvage Crawler can saw it down for wood.' : 'A sapling: units pass through.');
          else if (wood) lines.push('A Salvage Crawler can clear it for wood.');
          return { title: name.charAt(0).toUpperCase() + name.slice(1), kind: sp ? 'Tree' : 'Landscape', lines };
        }
      }
      const t = S.grid.tiles[gy * S.grid.cols + gx], key = G.Defs.terrain.keys().find(k => G.Defs.terrain.get(k).id === t), d = G.Defs.terrain.get(key);
      const lines = [];
      if (TERRAIN_NOTE[key]) lines.push(TERRAIN_NOTE[key]);
      else if (!d.passable) lines.push('Impassable.');
      else if (d.speed && d.speed !== 1) lines.push(d.speed < 1 ? 'Slows units.' : 'Units move faster here.');
      const lvl = S.grid.art && S.grid.art.level;
      if (lvl) lines.push(`Height ${lvl[gy * S.grid.cols + gx]}`);
      return { title: d.name, kind: 'Ground', lines };
    },
    // Called from the HUD every frame; refreshes a few times a second.
    render(force){
      const el = document.getElementById('hoverInfo');
      if (!el) return;
      const now = performance.now();
      if (!force && now - this.last < 120) return;
      this.last = now;
      const S = G.State;
      let info = null;
      if (this.on && this.sx >= 0 && S.grid && G.SceneManager.currentName === 'gameplay'){ const w = G.worldFromScreen(this.sx, this.sy); info = this.describe(w.x, w.y); }
      const sig = info ? JSON.stringify(info) : '';
      if (sig === this.sig && !force) return;
      this.sig = sig;
      el.classList.toggle('hidden', !info);
      if (!info) return;
      el.className = 'panel hover-info' + (info.tone ? ' ' + info.tone : '');
      el.innerHTML = `<small>${esc(info.kind)}</small><b>${esc(info.title)}</b>${info.lines.map(l => `<div>${esc(l)}</div>`).join('')}<em>~ hides this</em>`;
      // Just above the selection panel.
      const sel = document.getElementById('selectionPanel');
      if (sel){ const r = sel.getBoundingClientRect(), H = innerHeight; el.style.bottom = Math.round(H - r.top + 6) + 'px'; }
    }
  };
})();
