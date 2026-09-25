/* Debug-mode tools: cheats (godmode, instant build, free resources) and the map editor's
   terrain painting and object removal. Cheat switches are session settings and are not
   saved; map edits are recorded as terrain edits, which are. */
(function(){
  'use strict';
  const G = GW;

  G.Cheats = {
    god: false,            // friendly units take no damage
    instantBuild: false,   // construction and fabrication finish on the next tick
    set(key, on){
      if (!(key in { god: 1, instantBuild: 1 })) throw new Error('Unknown cheat ' + key);
      this[key] = !!on;
      G.Events.emit('cheats:changed', { key, on: this[key] });
    },
    addResource(key, amount){
      if (!G.Defs.resources.has(key) || !G.isNum(amount) || amount <= 0) return false;
      G.Economy.add(key, amount, 'debug');
      return true;
    }
  };

  const T = () => G.CONFIG.TILE;
  const covers = (a, b) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;

  G.MapEdit = {
    BRUSHES: [1, 3, 5, 9],
    // Records an edit, dropping older edits it paints over completely, so repeated
    // strokes do not grow the save without bound.
    record(e){
      const S = G.State;
      S.terrainEdits = (S.terrainEdits || []).filter(o => !covers(e, o));
      S.terrainEdits.push(e);
    },
    // Tiles an impassable brush must leave alone: structures, construction sites and
    // resource nodes (the ship's footprint is a structure in the occupancy grid).
    protectedTile(x, y){
      const S = G.State, grid = S.grid;
      if (grid.occ[grid.idx(x, y)] > 0 || G.Buildings.at(x, y)) return true;
      if (S.constructionSites.some(s => x >= s.gx && x < s.gx + s.w && y >= s.gy && y < s.gy + s.h)) return true;
      const t = T();
      return S.resourceNodes.some(n => Math.floor(n.x / t) === x && Math.floor(n.y / t) === y);
    },
    // Paints a size×size square of terrain `t` centred on tile (gx, gy). Impassable
    // terrain skips protected tiles; units left standing on blocked ground are moved to
    // the nearest open point. Returns the number of tiles painted.
    paint(gx, gy, size, t){
      const S = G.State, grid = S.grid, def = G.Defs.terrain.all().find(d => d.id === t);
      if (!def || !grid) return 0;
      size = G.clamp(size | 0, 1, 64);
      const half = Math.floor(size / 2);
      const x0 = Math.max(0, gx - half), y0 = Math.max(0, gy - half), x1 = Math.min(grid.cols, gx - half + size), y1 = Math.min(grid.rows, gy - half + size);
      if (x0 >= x1 || y0 >= y1) return 0;
      const solid = !def.passable;
      let painted = 0;
      if (!solid){
        grid.fill(x0, y0, x1 - x0, y1 - y0, t);
        this.record({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, t });
        painted = (x1 - x0) * (y1 - y0);
      } else {
        // One edit per run of unprotected tiles in each row.
        for (let y = y0; y < y1; y++){
          for (let x = x0; x < x1;){
            if (this.protectedTile(x, y)){ x++; continue; }
            let e = x;
            while (e < x1 && !this.protectedTile(e, y)) e++;
            grid.fill(x, y, e - x, 1, t);
            this.record({ x, y, w: e - x, h: 1, t });
            painted += e - x;
            x = e;
          }
        }
        if (painted) this.evacuate(x0, y0, x1, y1);
      }
      if (painted) G.Events.emit('terrain:changed', { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      return painted;
    },
    evacuate(x0, y0, x1, y1){
      const S = G.State, t = T();
      for (const u of S.units){
        if (u.hp <= 0 || u.isShip) continue;
        const ux = Math.floor(u.x / t), uy = Math.floor(u.y / t);
        if (ux < x0 || ux >= x1 || uy < y0 || uy >= y1 || S.grid.passable(ux, uy)) continue;
        const p = G.openPoint(u.x, u.y);
        u.x = p.x; u.y = p.y; u.path = []; u.pathIndex = 0;
      }
    },
    // Repaints the whole map with passable terrain `t` (grass by default), replacing all
    // earlier edits. Another map type is first swapped for the test map.
    reset(t = G.TT.GRASS){
      const S = G.State, grid = S.grid, def = G.Defs.terrain.all().find(d => d.id === t);
      if (!def || !def.passable) return false;
      if (S.map !== 'grass') this.loadMap('grass', S.seed);
      grid.fill(0, 0, grid.cols, grid.rows, t);
      S.terrainEdits = S.map === 'grass' && t === G.TT.GRASS ? [] : [{ x: 0, y: 0, w: grid.cols, h: grid.rows, t }];
      G.Events.emit('terrain:changed', null);
      return true;
    },
    // True for a terrain edit that fits this map and names a known terrain type.
    validEdit(e){
      const grid = G.State.grid, int = Number.isInteger;
      return !!e && [e.x, e.y, e.w, e.h, e.t].every(int) && e.w >= 0 && e.h >= 0 && e.x >= 0 && e.y >= 0 &&
        e.x + e.w <= grid.cols && e.y + e.h <= grid.rows && G.Defs.terrain.all().some(d => d.id === e.t);
    },
    // Replaces the terrain with map type `map` generated from `seed`, then applies `edits`
    // (the terrain edits of a saved map). Everything else in the game stays: structures,
    // resource nodes, sites, containers and signals get open ground under them (recorded as
    // edits), and units on blocked ground move to the nearest open point. The map type and
    // seed are saved with the game, so a restored save rebuilds the same terrain.
    loadMap(map, seed = G.State.seed, edits = []){
      const S = G.State, grid = S.grid, type = G.MapGen.types[map];
      if (!type || !grid || !Number.isInteger(seed) || seed < 0 || !Array.isArray(edits) || !edits.every(e => this.validEdit(e))) return false;
      const fresh = type.generate(seed >>> 0);
      if (fresh.cols !== grid.cols || fresh.rows !== grid.rows) return false;
      grid.tiles.set(fresh.tiles);
      if (fresh.art) grid.art = fresh.art; else delete grid.art;
      S.map = map; S.seed = seed >>> 0; S.terrainEdits = [];
      for (const e of edits){ grid.fill(e.x, e.y, e.w, e.h, e.t); S.terrainEdits.push({ x: e.x, y: e.y, w: e.w, h: e.h, t: e.t }); }
      grid.touch();
      this.clearUnderObjects();
      this.evacuate(0, 0, grid.cols, grid.rows);
      G.Events.emit('terrain:changed', null);
      return true;
    },
    // Paints a clearing over each object's footprint (plus a one-tile margin) wherever that
    // area holds blocking terrain, so nothing is left sitting in water or inside a cliff.
    clearUnderObjects(){
      const S = G.State, grid = S.grid, t = T(), clearing = G.TT.CLEARING, rects = [];
      const tileRect = (wx, wy, r) => ({ x: Math.floor(wx / t) - r, y: Math.floor(wy / t) - r, w: 2 * r + 1, h: 2 * r + 1 });
      for (const b of S.buildings) rects.push({ x: b.gx - 1, y: b.gy - 1, w: b.w + 2, h: b.h + 2 });
      for (const u of S.units) if (u.isShip) rects.push({ x: u.gx - 1, y: u.gy - 1, w: u.w + 2, h: u.h + 2 });
      for (const c of S.constructionSites) rects.push({ x: c.gx - 1, y: c.gy - 1, w: c.w + 2, h: c.h + 2 });
      for (const n of S.resourceNodes) rects.push(tileRect(n.x, n.y, 2));
      for (const c of S.containers) rects.push(tileRect(c.x, c.y, 1));
      for (const p of (S.expedition && S.expedition.sites) || []) rects.push(tileRect(p.x, p.y, 1));
      for (const r of rects){
        const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(grid.cols, r.x + r.w), y1 = Math.min(grid.rows, r.y + r.h);
        let blocked = false;
        for (let y = y0; y < y1 && !blocked; y++) for (let x = x0; x < x1; x++) if (!grid.terrainPassable(x, y)){ blocked = true; break; }
        if (!blocked) continue;
        grid.fill(x0, y0, x1 - x0, y1 - y0, clearing);
        this.record({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, t: clearing });
      }
    },
    // Removes the object at a world point: a construction site (refunded), a structure
    // (not the ship), a container or ground item, a resource node, or a signal. Returns
    // a description of what was removed, or null.
    removeAt(wx, wy){
      const S = G.State, t = T(), gx = Math.floor(wx / t), gy = Math.floor(wy / t), near = (o, r) => Math.hypot(o.x - wx, o.y - wy) < r;
      const site = S.constructionSites.find(s => gx >= s.gx && gx < s.gx + s.w && gy >= s.gy && gy < s.gy + s.h);
      if (site){
        const builder = G.Units.get(site.builderId);
        if (builder && builder.buildSiteId === site.id) G.Construction.cancelFor(builder, true);
        else { S.constructionSites = S.constructionSites.filter(s => s !== site); G.Economy.refund(G.Defs.buildables.get(site.type)?.cost || {}, 'construction removed'); }
        return 'Construction site';
      }
      const b = G.Buildings.at(gx, gy);
      if (b){
        if (b.fabQueue && b.fabQueue.length) G.Fabrication.refundQueue(b);
        G.Buildings.remove(b);
        return G.Defs.buildables.get(b.type)?.name || 'Structure';
      }
      const c = S.containers.find(c => near(c, t * 0.6));
      if (c){ S.containers = S.containers.filter(x => x !== c); G.Events.emit('container:changed', c); return c.name || 'Container'; }
      const n = S.resourceNodes.find(n => near(n, t * 0.6));
      if (n){
        const mine = G.Gather.mineOn(n);
        if (mine) G.Buildings.remove(mine);
        S.resourceNodes = S.resourceNodes.filter(x => x !== n);
        for (const u of S.units) if (u.nodeId === n.id) G.Gather.stop(u);
        return n.name || 'Resource node';
      }
      const E = S.expedition, sig = E && E.sites.find(p => near(p, t));
      if (sig){ E.sites = E.sites.filter(p => p !== sig); return sig.kind + ' signal'; }
      return null;
    }
  };
  // Named maps kept in local storage by the Map Editor: a map type, a seed and the terrain
  // edits on top. They are separate from save slots and hold no units or structures;
  // loading one swaps the terrain under the game in progress (G.MapEdit.loadMap).
  G.MapLibrary = {
    KEY: 'ezp_maps_v1',
    MAX: 40,
    valid(m){
      return !!m && typeof m.name === 'string' && m.name.length > 0 && m.name.length <= 60 &&
        Object.prototype.hasOwnProperty.call(G.MapGen.types, m.map) && Number.isInteger(m.seed) && m.seed >= 0 && Array.isArray(m.edits);
    },
    list(){
      try { const a = JSON.parse(G.Storage.get(this.KEY) || '[]'); return Array.isArray(a) ? a.filter(m => this.valid(m)) : []; }
      catch (e){ return []; }
    },
    write(list){ G.Storage.set(this.KEY, JSON.stringify(list)); },
    // Saves the current map under `name`, replacing a saved map of the same name.
    saveCurrent(name){
      const S = G.State;
      name = String(name || '').trim().slice(0, 60);
      if (!name || !S.grid) return null;
      const entry = { name, map: S.map, seed: S.seed >>> 0, edits: G.copy(S.terrainEdits || []), savedAt: G.Clock.stamp() };
      const list = this.list().filter(m => m.name !== name);
      if (list.length >= this.MAX) return null;
      list.push(entry);
      try { this.write(list); } catch (e){ return null; }
      return entry;
    },
    load(name){
      const m = this.list().find(x => x.name === name);
      return !!m && G.MapEdit.loadMap(m.map, m.seed, m.edits);
    },
    remove(name){
      const list = this.list(), next = list.filter(m => m.name !== name);
      if (next.length === list.length) return false;
      this.write(next);
      return true;
    }
  };
})();
