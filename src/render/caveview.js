/* Caves are underground (Genesis maps). The map is seen either from the surface or inside one
   cave, never both:
   - On the surface, the terrain is drawn from a copy of the grid in which every cavern is
     still rock: the tiles, heights and detail the ground had before the cavern was dug
     (grid.art.roof), so only the mouth in the cliff shows. Cave props (crystals, fungi) stand
     on cave floor, so on the copy they are not drawn either.
   - Inside a cave, everything but the cavern is black: its floor, walls and props, and the
     units, caches and nests in it.
   Units, structures and containers are drawn and picked only on the layer being viewed
   (G.Caves.layer). Clicking a cave's entrance with units selected sends them through it;
   with none selected it switches the view. Presentation only: nothing here is saved. */
(function(){
  'use strict';
  const G = GW;

  // The surface copy: shares everything with the game's grid (and its art) except the tiles,
  // heights and detail, and the caches that depend on them.
  function make(g){
    const sg = Object.create(g);
    sg.tiles = new g.tiles.constructor(g.tiles.length);
    sg.art = Object.create(g.art);
    sg.art.level = new g.art.level.constructor(g.art.level.length);
    sg.art.detail = new g.art.detail.constructor(g.art.detail.length);
    Object.assign(sg.art, { caverns: [], cavernArt: [], caveOf: null, roof: null, land: null, treeIndex: null });
    sg.surfaceOf = g;
    return sg;
  }
  // Over a cavern the ground is a rocky rise, a level above the hillside it is dug into, with a
  // rock face round it: units can't cross it (the cave is under it), and it looks it.
  function sync(sg, g){
    const roof = g.art.roof, cols = g.cols, of = g.art.caveOf, cliff = G.Defs.terrain.get('cliff').id;
    sg.tiles.set(g.tiles); sg.art.level.set(g.art.level); sg.art.detail.set(g.art.detail);
    const over = new Set(roof.idx);
    for (let k = 0; k < roof.idx.length; k++){
      const i = roof.idx[k], x = i % cols, y = (i / cols) | 0;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (!over.has((y + dy) * cols + x + dx)){ edge = true; break; }
      sg.tiles[i] = edge ? cliff : roof.tiles[k]; sg.art.level[i] = roof.level[k] + 1; sg.art.detail[i] = roof.detail[k];
    }
  }

  G.CaveView = {
    cave: -1,           // the cave in view, or -1 for the surface
    follow: -1,         // a cave the selection was sent into: the view follows them in
    surface: null, real: null, ver: -1, cellsOf: null,
    reset(){ this.cave = -1; this.follow = -1; this.surface = null; this.real = null; this.cellsOf = null; },
    // The grid the terrain is drawn from: the surface copy on the surface, else the game's grid.
    terrainGrid(){
      const g = G.State.grid, roof = g && g.art && g.art.roof;
      if (!roof || !roof.idx.length) return g;
      if (this.real !== g){ this.real = g; this.surface = make(g); this.ver = -1; this.cellsOf = null; }
      if (this.ver !== g.version){ sync(this.surface, g); this.ver = g.version; }
      return this.surface;
    },
    // Whether something at world point (x, y), or object `o`, is on the layer in view.
    hereAt(x, y){ return G.Caves.layerAt(x, y) === this.cave; },
    here(o){ return this.hereAt(o.x, o.y); },
    enter(k){
      if (!G.Caves.list()[k]) return;
      this.cave = k; this.follow = -1;
      const p = G.Caves.door(k, 'inside'), c = G.Caves.list()[k], T = G.CONFIG.TILE;
      // Centre on the cavern: its cache is at the deepest spot, so between that and the way in.
      G.centerCamera((p.x + (c.chest.x + 0.5) * T) / 2, (p.y + (c.chest.y + 0.5) * T) / 2);
      G.UI.toast((c.size === 'medium' ? 'Cave' : 'Small cave') + ': click the way out (or Return to surface) to go back up');
      this.renderButton();
    },
    leave(){
      const k = this.cave;
      this.cave = -1;
      const p = k >= 0 && G.Caves.door(k, 'outside');
      if (p) G.centerCamera(p.x, p.y);
      this.renderButton();
    },
    // The entrance of a cave under world point (x, y) on the layer in view: on the surface
    // the mouth or the ground in front of it, in a cave the floor behind the mouth.
    doorAt(x, y){
      const T = G.CONFIG.TILE, gx = Math.floor(x / T), gy = Math.floor(y / T), list = G.Caves.list();
      for (let k = 0; k < list.length; k++){
        const c = list[k];
        if (this.cave < 0 && gx === c.x && (gy === c.y || gy === c.outside.y)) return k;
        if (this.cave === k && ((gx === c.inside.x && gy === c.inside.y) || (gx === c.x && gy === c.y))) return k;
      }
      return -1;
    },
    // A click on cave k's entrance: selected units go through; with none, the view does.
    useDoor(k, units){
      const T = G.CONFIG.TILE, us = units.filter(u => u.team === 'blue' && !u.isShip && u.hp > 0 && u.speed > 0);
      if (us.length){
        if (this.cave < 0){
          const p = G.Caves.door(k, 'inside');
          G.Orders.move(us, p.x, p.y);
          this.follow = k;
          G.UI.toast(`${us.length === 1 ? us[0].name : us.length + ' units'} heading into the cave`);
        } else {
          const p = G.Caves.door(k, 'outside');
          G.Orders.move(us, p.x, p.y + T * 1.5);
          G.UI.toast(`${us.length === 1 ? us[0].name : us.length + ' units'} heading back to the surface`);
        }
        return;
      }
      if (this.cave < 0) this.enter(k); else this.leave();
    },
    // The "Return to surface" button while a cave is in view.
    renderButton(){
      let b = document.getElementById('caveReturnBtn');
      if (!b){
        b = document.createElement('button'); b.id = 'caveReturnBtn'; b.textContent = 'Return to surface';
        b.addEventListener('click', () => this.leave());
        document.getElementById('app').appendChild(b);
      }
      b.classList.toggle('hidden', this.cave < 0);
    },
    // Tiles drawn for cave k: its floor and the rock round it.
    cells(k){
      const g = G.State.grid;
      if (!this.cellsOf || this.cellsOf.grid !== g){
        const of = g.art.caveOf, cols = g.cols, byCave = new Map();
        for (let i = 0; i < of.length; i++){
          const c = of[i];
          if (c < 0) continue;
          let set = byCave.get(c);
          if (!set) byCave.set(c, set = new Set());
          const x = i % cols, y = (i / cols) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g.inBounds(x + dx, y + dy)) set.add((y + dy) * cols + x + dx);
        }
        this.cellsOf = { grid: g, byCave };
      }
      return this.cellsOf.byCave.get(k) || new Set();
    },
    // Inside cave k: black all round, then its floor, walls and props, and the way out.
    drawCave(g, v, z, t){
      const S = G.State, grd = S.grid, T = G.CONFIG.TILE, cols = grd.cols, k = this.cave, of = grd.art.caveOf, cave = G.Caves.list()[k];
      g.fillStyle = '#000'; g.fillRect(v.x0 - T, v.y0 - T, v.x1 - v.x0 + 2 * T, v.y1 - v.y0 + 2 * T);
      const cells = this.cells(k), clip = new Path2D();
      for (const i of cells) clip.rect((i % cols) * T, ((i / cols) | 0) * T, T, T);
      g.save(); g.clip(clip);
      g.fillStyle = '#15120f'; g.fillRect(v.x0 - T, v.y0 - T, v.x1 - v.x0 + 2 * T, v.y1 - v.y0 + 2 * T);
      for (const i of cells) if (of[i] === k) G.Structures.caveFloor(g, i % cols, (i / cols) | 0, (i % cols) * T, ((i / cols) | 0) * T, T);
      for (const C of G.Structures.cavernArt(grd)) if ([...C.cells].some(i => of[i] === k)) g.drawImage(C.cv, C.x * T, C.y * T, C.w * T, C.h * T);
      if (G.TreeArt.has(grd)) G.TreeArt.drawLive(g, grd, v, t, () => true);
      g.restore();
      // The way out: daylight falling in at the mouth, and a marker on the floor behind it.
      const m = G.Caves.door(k, 'inside'), pulse = 0.6 + 0.3 * Math.sin(t * 3);
      const gr = g.createRadialGradient(m.x, m.y - T * 0.2, 4, m.x, m.y, T * 2.2);
      gr.addColorStop(0, 'rgba(255,244,214,.45)'); gr.addColorStop(1, 'rgba(255,244,214,0)');
      g.fillStyle = gr; g.fillRect(m.x - T * 2.5, m.y - T * 2.5, T * 5, T * 5);
      g.strokeStyle = `rgba(150,235,255,${pulse.toFixed(3)})`; g.lineWidth = 3;
      g.beginPath(); g.moveTo(m.x - 12, m.y - 2); g.lineTo(m.x, m.y + 10); g.lineTo(m.x + 12, m.y - 2); g.stroke();
      g.fillStyle = '#dff8ff'; g.font = `600 ${Math.max(9, 11 / z)}px Montserrat, sans-serif`; g.textAlign = 'center';
      g.fillText('Way out', m.x, (cave.inside.y) * T - 4);
    },
    // On the surface: a small label at each cave mouth, close up.
    drawMouths(g, z, inView){
      if (z < 0.5) return;
      const T = G.CONFIG.TILE;
      g.fillStyle = 'rgba(223,248,255,.85)'; g.font = `600 ${Math.max(8, 10 / z)}px Montserrat, sans-serif`; g.textAlign = 'center';
      for (const c of G.Caves.list()){
        const x = (c.x + 0.5) * T, y = (c.y + 1) * T + 14;
        if (inView(x, y, 60)) g.fillText('Cave', x, y);
      }
    }
  };

  G.Events.on('world:created', () => { G.CaveView.reset(); G.CaveView.renderButton(); });
  // Units sent into a cave: the view follows them in when the first of them arrives.
  G.Events.on('cave:crossed', e => {
    const CV = G.CaveView;
    if (e.dir === 'in' && CV.follow === e.cave && CV.cave < 0 && G.State.selected.has(e.unit.id)) CV.enter(e.cave);
    if (e.dir === 'out' && CV.cave === e.cave && G.State.selected.size && [...G.State.selected].every(id => { const u = G.Units.alive(id); return !u || G.Caves.layer(u) !== e.cave; })) CV.leave();
  });
})();
