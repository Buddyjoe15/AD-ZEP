/* Cave contents on Genesis maps. The generator cuts a cavern behind each cave mouth and says
   where things go (grid.art.caverns, src/world/genesis.js); when a game starts on a map, or
   the expedition arrives on a new Earth, this places them:
   - a cache at the deepest spot of every cave: an ordinary one (crystals, alloy, now and then
     a helmet), or a rare one (the better gear);
   - in some caves a Hostile Nest (buildable 'cave_nest'): it sleeps until a friendly unit comes
     within `wakeTiles`, then makes its guards, who wait round it and attack whatever comes
     within `releaseTiles`, and it keeps making more until destroyed;
   - in some caves a black-box recorder holding one of the recordings (GW.RECORDINGS). When it
     is opened, the recording plays in the Expedition log.
   Everything placed is an ordinary container or building, saved as they are; nothing here has
   state of its own. Contents follow from the seed. */
(function(){
  'use strict';
  const G = GW;

  G.Caves = {
    // ---- Layers: the surface (-1) or one of the caves (its index in grid.art.caverns). ----
    // A cave is underground and sealed from the surface: units cross only through its
    // entrance, and nothing sees, targets or wakes anything on another layer.
    layerAt(x, y){
      const grid = G.State.grid, of = grid && grid.art && grid.art.caveOf, T = G.CONFIG.TILE;
      if (!of) return -1;
      const gx = Math.floor(x / T), gy = Math.floor(y / T);
      return grid.inBounds(gx, gy) ? of[gy * grid.cols + gx] : -1;
    },
    layer(o){ return this.layerAt(o.x, o.y); },
    same(a, b){ return !G.State.grid?.art?.caveOf || this.layer(a) === this.layer(b); },
    list(){ const art = G.State.grid && G.State.grid.art; return (art && art.caverns) || []; },
    // World points of a cave's way through: just inside and just outside its mouth.
    door(k, side){ const c = this.list()[k], T = G.CONFIG.TILE, p = c && c[side]; return p ? { x: (p.x + 0.5) * T, y: (p.y + 0.5) * T } : null; },
    // A unit of the player's asked to go to (x, y) on another layer: it heads for the entrance
    // first (the way out of its cave, or into the target's), and G.Caves carries it through.
    // Returns the entrance point to walk to, or null when (x, y) is on its own layer.
    redirect(u, x, y){
      if (u.team !== 'blue' || u.isShip) return null;
      const from = this.layer(u), to = this.layerAt(x, y);
      if (from === to) return null;
      const out = from >= 0, k = out ? from : to;
      u.caveTransit = { cave: k, dir: out ? 'out' : 'in', then: { x, y } };
      return this.door(k, out ? 'inside' : 'outside');
    },
    // Moves units heading for an entrance through it once they reach it, then on to where
    // they were going.
    update(){
      const S = G.State, T = G.CONFIG.TILE;
      for (const u of S.units){
        const tr = u.caveTransit;
        if (!tr || u.hp <= 0) continue;
        const from = this.door(tr.cave, tr.dir === 'in' ? 'outside' : 'inside'), to = this.door(tr.cave, tr.dir === 'in' ? 'inside' : 'outside');
        if (!from || !to){ u.caveTransit = null; continue; }
        if (Math.hypot(u.x - from.x, u.y - from.y) <= T * 0.9){
          u.x = to.x; u.y = to.y; u.path = []; u.pathIndex = 0;
          if (S.paths) S.paths.cancel(u);
          u.caveTransit = null;
          G.Events.emit('cave:crossed', { unit: u, cave: tr.cave, dir: tr.dir });
          if (tr.then && Math.hypot(tr.then.x - u.x, tr.then.y - u.y) > T * 0.6) S.paths.request(u, tr.then.x, tr.then.y);
        } else if (!u.path.length && !u.pathPending && S.time >= (u.caveRetry || 0)){
          u.caveRetry = S.time + 1;
          S.paths.request(u, from.x, from.y, { noCaves: true });
        }
      }
    },

    // Places every cave's contents on the current map.
    populate(){
      const S = G.State, art = S.grid && S.grid.art, T = G.CONFIG.TILE;
      if (!art || !art.caverns) return;
      const h = (i, q) => G.hashRandom3(S.seed & 0xffff, i, 1301 + q);
      // Recordings in this Earth's caves: a run through the list starting where the seed says.
      let rec = Math.floor(h(0, 0) * G.RECORDINGS.length);
      art.caverns.forEach((c, i) => {
        const x = (c.chest.x + 0.5) * T, y = (c.chest.y + 0.5) * T;
        const items = c.chest.rare ? this.rareLoot(i, h) : this.loot(i, h);
        G.Containers.create(x, y, items, { type: 'cave_cache', name: c.chest.rare ? 'Rare Cave Cache' : 'Cave Cache', gx: c.chest.x, gy: c.chest.y, capacity: 12 });
        if (c.recording){
          const key = 'recording_' + String(rec % G.RECORDINGS.length + 1).padStart(2, '0');
          rec++;
          G.Containers.create((c.recording.x + 0.5) * T, (c.recording.y + 0.5) * T, [G.Items.create(key)],
            { type: 'black_box', name: 'Black Box Recorder', gx: c.recording.x, gy: c.recording.y, capacity: 1 });
        }
        // (The generator left room for the nest on the cave's floor; players can't build in caves,
        // so this doesn't ask G.Buildings.canPlace.)
        if (c.nest && !S.buildings.some(o => o.type === 'cave_nest' && o.gx === c.nest.x && o.gy === c.nest.y)){
          // Its guards wait round it, on the side towards the way in.
          const b = G.Buildings.add('cave_nest', c.nest.x, c.nest.y), dx = c.x - c.nest.x, dy = c.y - c.nest.y, d = Math.hypot(dx, dy) || 1;
          G.Spawner.configure(b, { rally: { x: b.x + dx / d * T * 2, y: b.y + dy / d * T * 2 } });
        }
      });
    },
    loot(i, h){
      const out = [G.Items.create('cave_crystal', 2 + Math.floor(h(i, 1) * 5)), G.Items.create('salvaged_alloy', 3 + Math.floor(h(i, 2) * 6))];
      if (h(i, 3) < 0.3) out.push(G.Items.create('miners_helmet'));
      return out;
    },
    rareLoot(i, h){
      const out = [G.Items.create('cave_crystal', 6 + Math.floor(h(i, 4) * 8)), G.Items.create('salvaged_alloy', 8 + Math.floor(h(i, 5) * 8))];
      out.push(G.Items.create(h(i, 6) < 0.5 ? 'prototype_visor' : 'expedition_pack'));
      if (h(i, 7) < 0.5) out.push(G.Items.create('miners_helmet'));
      return out;
    },
    // A nest's turn: wake when a friendly unit comes near, then release its guards on whatever
    // comes closer.
    nest(b, cfg){
      const S = G.State, T = G.CONFIG.TILE, s = G.Spawner.state(b);
      if (!s) return;
      // (Only units in the nest's own cave count: rock lies between it and the surface.)
      const near = r => { const hash = S.teamSpatial && S.teamSpatial.blue; return !!(hash && hash.count && hash.nearest(b.x, b.y, r * T, u => this.same(u, b))); };
      if (!s.running && s.spawned < s.amount && near(cfg.wakeTiles || 9)){
        if (!s.spawned) G.notify('Something stirs in the cave');
        G.Spawner.start(b);
      }
      if (s.hold && near(cfg.releaseTiles || 6)) G.Spawner.configure(b, { hold: false });
    }
  };

  G.Behaviors.register('caveNest', { update(b, cfg){ G.Caves.nest(b, cfg); } });
  G.SystemManager.register('caves', { update(){ G.Caves.update(); } });
  // A recording plays when its recorder is opened.
  G.Events.on('container:opened', c => {
    if (!c || c.type !== 'black_box') return;
    const it = c.items[0], k = it && /^recording_(\d+)$/.exec(it.key);
    if (!k) return;
    const r = G.RECORDINGS[+k[1] - 1];
    G.notify('Recording found: ' + r.title);
    if (G.State.expedition) G.Expedition.log('Black box: ' + r.title + ': ' + r.text);
  });
})();
