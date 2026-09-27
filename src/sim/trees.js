/* Destructible trees and dead wood on maps with free-standing trees (Genesis, grid.art.trees).
   Explosions (turret splash, where a shell or missile lands) damage everything within their
   radius, and a Salvage Crawler ordered onto a tree saws it down and takes its wood (see
   G.Gather.chop). A tree that is destroyed leaves a stump: sawn when cut, snapped when blown
   apart. Destroying a stump or a fallen tree clears it away. Toughness and wood are in
   GW.TREES (src/data/trees.js). Events: 'tree:changed' when something is destroyed, 'blast'
   for every explosion (the renderer draws the fall, dust and scorch marks from them).

   Saved state (`trees` in a save, schema 9): [index, state, damage] for every tree touched,
   where index is the tree's place in grid.art.trees (fixed by the seed), state is ALIVE,
   CUT, SNAPPED or GONE, and damage is what it has taken since reaching that state. Freeing
   a tile that a trunk or fallen tree blocked is recorded as a terrain edit, like any other
   terrain change, so restoring replays it before the tree states are applied. */
(function(){
  'use strict';
  const G = GW, Math = globalThis.Math;
  const ALIVE = 0, CUT = 1, SNAPPED = 2, GONE = 3;

  // Live state for the current grid's trees, rebuilt when the map changes.
  let cur = null;
  function ensure(){
    const S = G.State, grid = S.grid, art = grid && grid.art, tr = art && art.trees;
    if (!tr){ cur = null; return null; }
    if (cur && cur.art === art) return cur;
    const W = grid.cols, n = tr.count, T = G.CONFIG.TILE;
    // Per-tile lists of trees by position, for area and point queries.
    const head = new Int32Array(grid.size).fill(-1), next = new Int32Array(n);
    for (let k = 0; k < n; k++){ const i = Math.floor(tr.y[k] / T) * W + Math.floor(tr.x[k] / T); next[k] = head[i]; head[i] = k; }
    cur = { art, tr, state: new Uint8Array(n), damage: new Float32Array(n), head, next, W, logK: G.TREES.ALL.indexOf('log') };
    return cur;
  }
  G.Events.on('world:created', () => { cur = null; });

  const isTree = k => cur.tr.kind[k] < G.TREES.KINDS.length;
  // What stands at tree k now: its own kind while alive, else the stump it left.
  function kindNow(k){
    const st = cur.state[k];
    if (st === CUT) return 'stump_cut';
    if (st === SNAPPED) return 'stump_broken';
    return G.TREES.ALL[cur.tr.kind[k]];
  }
  function maxHp(k){
    const H = G.TREES.HP, kind = kindNow(k), z = cur.tr.size[k];
    if (cur.state[k] === CUT || cur.state[k] === SNAPPED) return H.stump[z >= 2 ? 1 : 0];
    if (kind === 'log') return H.log[z];
    if (kind === 'stump_cut' || kind === 'stump_broken') return H.stump[z];
    return H.tree[z] * (G.TREES.species[kind].tough || 1);
  }
  // Still standing where it was generated: not destroyed, and (while alive) its tile not
  // painted over in the Map Editor.
  function present(k){
    const st = cur.state[k];
    if (st === GONE) return false;
    if (st !== ALIVE) return true;
    return G.State.grid.tiles[cur.tr.tile[k]] === cur.tr.on[k];
  }
  // Frees a tile a trunk or fallen tree was blocking, unless something else still blocks it,
  // recording the change as a terrain edit.
  function free(i, blockId){
    const S = G.State, grid = S.grid, tr = cur.tr, W = cur.W, T = G.CONFIG.TILE, x = i % W, y = (i / W) | 0;
    if (grid.tiles[i] !== blockId) return;
    for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++){
      if (!grid.inBounds(xx, yy)) continue;
      for (let q = cur.head[yy * W + xx]; q >= 0; q = cur.next[q]){
        if (cur.state[q] !== ALIVE || !present(q)) continue;
        if (tr.kind[q] === cur.logK){ let hit = false; G.TREES.logTiles(tr.x[q], tr.y[q], tr.size[q], tr.variant[q] >> 1, T, (tx, ty) => { if (ty * W + tx === i) hit = true; }); if (hit) return; }
        else if (isTree(q) && tr.size[q] >= G.TREES.BLOCKS_FROM && tr.tile[q] === i) return;
      }
    }
    const t = cur.art.treeBase ? cur.art.treeBase[i] : G.Defs.terrain.get('forest').id;
    grid.fill(x, y, 1, 1, t);
    (S.terrainEdits || (S.terrainEdits = [])).push({ x, y, w: 1, h: 1, t });
    G.Events.emit('terrain:changed', { x, y, w: 1, h: 1 });
  }

  G.Trees = {
    ALIVE, CUT, SNAPPED, GONE,
    has(){ return !!ensure(); },
    count(){ return ensure() ? cur.tr.count : 0; },
    state(k){ return ensure() ? cur.state[k] : GONE; },
    // State array for the renderer (null without trees). Read only.
    states(){ return ensure() ? cur.state : null; },
    present(k){ return !!ensure() && k >= 0 && k < cur.tr.count && present(k); },
    kind(k){ return ensure() ? kindNow(k) : null; },
    hp(k){ return ensure() ? Math.max(0, maxHp(k) - cur.damage[k]) : 0; },
    maxHp(k){ return ensure() ? maxHp(k) : 0; },
    // Wood in tree k as it was planted, standing (what a felled tree yields once it lands).
    treeWood(k){
      if (!ensure() || !isTree(k)) return 0;
      const kind = G.TREES.ALL[cur.tr.kind[k]];
      return Math.round(G.TREES.WOOD.tree[cur.tr.size[k]] * (G.TREES.species[kind].wood || 1));
    },
    // Wood a Salvage Crawler gets from sawing down tree k as it stands now (GW.TREES.WOOD).
    wood(k){
      if (!ensure() || !present(k)) return 0;
      const W = G.TREES.WOOD, kind = kindNow(k), z = cur.tr.size[k];
      if (cur.state[k] === CUT || cur.state[k] === SNAPPED) return W.stump[z >= 2 ? 1 : 0];
      if (kind === 'log') return W.log[z];
      if (kind === 'stump_cut' || kind === 'stump_broken') return W.stump[z];
      return Math.round(W.tree[z] * (G.TREES.species[kind].wood || 1));
    },
    pos(k){ return ensure() ? { x: cur.tr.x[k], y: cur.tr.y[k] } : null; },
    // The point of tree k nearest to (x, y): its trunk, or for a fallen tree a point on its trunk.
    nearestPoint(k, x, y){
      const tr = cur.tr;
      if (tr.kind[k] !== cur.logK || cur.state[k] !== ALIVE) return { x: tr.x[k], y: tr.y[k] };
      const d = G.TREES.props.log.sizes[tr.size[k]], th = (tr.variant[k] >> 1) / G.TREES.LOG_ANGLES * Math.PI * 2, ux = Math.cos(th), uy = Math.sin(th);
      const s = G.clamp((x - tr.x[k]) * ux + (y - tr.y[k]) * uy, -d.length / 2 + d.width, d.length * 0.22);
      return { x: tr.x[k] + ux * s, y: tr.y[k] + uy * s };
    },
    // Trees, stumps and fallen trees within r of (x, y), measured to their nearest point.
    within(x, y, r, fn){
      if (!ensure()) return;
      const T = G.CONFIG.TILE, W = cur.W, grid = G.State.grid, reach = r + 60;
      const x0 = Math.floor((x - reach) / T), x1 = Math.floor((x + reach) / T), y0 = Math.floor((y - reach) / T), y1 = Math.floor((y + reach) / T);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++){
        if (!grid.inBounds(xx, yy)) continue;
        for (let q = cur.head[yy * W + xx]; q >= 0; q = cur.next[q]){
          if (!present(q)) continue;
          const p = this.nearestPoint(q, x, y);
          if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r * r) fn(q);
        }
      }
    },
    // The tree, stump or fallen tree to act on at world point (x, y), or -1: whatever is
    // nearest within its own size (a crown's radius, a stump's, a fallen tree's width).
    at(x, y){
      let best = -1, bd = Infinity;
      this.within(x, y, 30, k => {
        const tr = cur.tr, kind = kindNow(k), p = this.nearestPoint(k, x, y), d = Math.hypot(p.x - x, p.y - y);
        const r = kind === 'log' ? G.TREES.props.log.sizes[tr.size[k]].width + 6 : kind.startsWith('stump') ? 12 : Math.max(10, G.TREES.species[kind].crown[tr.size[k]] * 0.4);
        if (d <= r && d < bd){ bd = d; best = k; }
      });
      return best;
    },
    // Deals `amount` damage to tree k. `how` is 'cut' (sawn down) or 'blast'; `from` ({x, y},
    // optional) is where the saw or blast is, so a felled tree falls away from it. Returns
    // true when it was destroyed (a tree becomes a stump; a stump or fallen tree goes).
    damage(k, amount, how = 'blast', from = null){
      if (!ensure() || !(amount > 0) || !present(k)) return false;
      cur.damage[k] += amount;
      if (cur.damage[k] < maxHp(k)) return false;
      const tr = cur.tr, st = cur.state[k], was = kindNow(k);
      cur.damage[k] = 0;
      if (st === ALIVE && isTree(k)){
        cur.state[k] = how === 'cut' ? CUT : SNAPPED;
        if (tr.size[k] >= G.TREES.BLOCKS_FROM) free(tr.tile[k], G.Defs.terrain.get('tree').id);
      } else {
        cur.state[k] = GONE;
        if (st === ALIVE && tr.kind[k] === cur.logK){
          const T = G.CONFIG.TILE, W = cur.W, logId = G.Defs.terrain.get('fallen_tree').id;
          G.TREES.logTiles(tr.x[k], tr.y[k], tr.size[k], tr.variant[k] >> 1, T, (tx, ty) => { if (G.State.grid.inBounds(tx, ty)) free(ty * W + tx, logId); });
        }
      }
      G.Events.emit('tree:changed', { k, x: tr.x[k], y: tr.y[k], size: tr.size[k], variant: tr.variant[k], was, now: kindNow(k), state: cur.state[k], how, from: from ? { x: from.x, y: from.y } : null });
      return true;
    },
    // An explosion: `amount` damage to everything within r of (x, y). Returns how many
    // things it destroyed.
    // On every map, an explosion is announced ('blast': dust and a scorch mark are drawn).
    blast(x, y, r, amount){
      G.Events.emit('blast', { x, y, r });
      if (!ensure()) return 0;
      const hit = [];
      this.within(x, y, r, k => hit.push(k));
      let n = 0;
      for (const k of hit) if (this.damage(k, amount, 'blast', { x, y })) n++;
      return n;
    },
    // Save data: [index, state, damage] for every tree that isn't untouched.
    serialize(){
      if (!ensure()) return [];
      const out = [];
      for (let k = 0; k < cur.tr.count; k++) if (cur.state[k] || cur.damage[k]) out.push([k, cur.state[k], G.round6(cur.damage[k])]);
      return out;
    },
    // Restores saved tree states (after the terrain edits are replayed). Entries for trees this
    // map doesn't have are ignored.
    apply(list){
      if (!ensure()) return;
      for (const [k, st, dmg] of list) if (k < cur.tr.count){ cur.state[k] = st; cur.damage[k] = dmg; }
    }
  };
})();
