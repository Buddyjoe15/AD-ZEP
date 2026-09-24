/* Swarm AI for hostile units (definition `ai: 'swarm'`).
   One shared flow field covers the whole map and points every tile toward Commander Vance.
   It is a Dijkstra search rebuilt in time-boxed slices over several ticks, so thousands
   of enemies advance on him without thousands of individual route searches.
   Each enemy marches down the field until something friendly comes within its aggro
   radius (`aggroTiles`, 10 tiles); it then engages the nearest target (units, the ship,
   or player structures when `attackStructures` is set), stopping to fire once in range,
   and returns to the march when the target dies or escapes. */
(function(){
  'use strict';
  const G = GW;
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1], STEP = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

  class TargetField {
    constructor(grid){
      this.grid = grid;
      this.cost = new Float32Array(grid.size).fill(Infinity);   // last finished field (read)
      this.work = new Float32Array(grid.size);                  // field being built
      this.heap = new G.IndexHeap(16384);
      this.building = false; this.ready = false;
      this.goal = -1; this.version = -1; this.builtAt = -Infinity;
      this.buildGoal = -1; this.buildVersion = -1;
      // The field only covers a window (x0..x1, y0..y1 inclusive); outside it reads Infinity.
      this.win = { x0: 0, y0: 0, x1: -1, y1: -1 }; this.buildWin = null;
      // Units per tile when the build started; crowded tiles cost more, so a swarm spreads
      // across several gaps instead of jamming the single best one.
      this.density = new Uint16Array(grid.size); this.crowdCost = 0;
    }
    // True when a rebuild toward tile (gx, gy) is due: the goal tile, the map's
    // passability or the needed window changed, and the last build is `minAge` s old.
    due(gx, gy, t, minAge, win){
      const g = this.grid, i = gy * g.cols + gx, w = this.win;
      if (this.building || !g.inBounds(gx, gy)) return false;
      const covered = win.x0 >= w.x0 && win.y0 >= w.y0 && win.x1 <= w.x1 && win.y1 <= w.y1;
      return !(this.ready && t - this.builtAt < minAge && covered);
    }
    start(gx, gy, t, win, units, crowdCost){
      const g = this.grid, i = gy * g.cols + gx, cols = g.cols, T = G.CONFIG.TILE, dens = this.density;
      for (let y = win.y0; y <= win.y1; y++){ this.work.fill(Infinity, y * cols + win.x0, y * cols + win.x1 + 1); dens.fill(0, y * cols + win.x0, y * cols + win.x1 + 1); }
      for (const u of units || []){ const k = ((u.y / T) | 0) * cols + ((u.x / T) | 0); if (dens[k] < 65535) dens[k]++; }
      this.crowdCost = crowdCost || 0;
      this.heap.clear();
      this.work[i] = 0; this.heap.push(i, 0);
      this.building = true; this.buildGoal = i; this.buildVersion = g.version; this.buildStart = t; this.buildWin = win;
    }
    // Continues the build by up to `budget` settled tiles (a fixed amount of work per tick,
    // so the simulation stays deterministic on any machine); swaps it in when complete.
    step(budget){
      if (!this.building) return false;
      const g = this.grid, cols = g.cols, work = this.work, heap = this.heap, W = this.buildWin;
      const tiles = g.tiles, solid = g.solidTerrain, occ = g.occ, costTable = g.costTable, dens = this.density, cc = this.crowdCost;
      const open = (x, y) => x >= W.x0 && y >= W.y0 && x <= W.x1 && y <= W.y1 && solid[tiles[y * cols + x]] === 0 && occ[y * cols + x] === 0;
      let n = 0;
      while (heap.length){
        const key = heap.peekKey(), cur = heap.pop();
        if (key > work[cur]) continue;
        const x = cur % cols, y = (cur / cols) | 0;
        for (let d = 0; d < 8; d++){
          const nx = x + DX[d], ny = y + DY[d];
          if (!open(nx, ny)) continue;
          if (d >= 4 && (!open(x + DX[d], y) || !open(x, y + DY[d]))) continue;
          const ni = ny * cols + nx, nc = key + STEP[d] * costTable[tiles[ni]] + dens[ni] * cc;
          if (nc < work[ni]){ work[ni] = nc; heap.push(ni, nc); }
        }
        if (++n >= budget) return false;
      }
      const old = this.cost; this.cost = this.work; this.work = old;
      this.goal = this.buildGoal; this.version = this.buildVersion; this.builtAt = this.buildStart; this.win = W;
      this.building = false; this.ready = true;
      return true;
    }
    inside(gx, gy){ const w = this.win; return gx >= w.x0 && gy >= w.y0 && gx <= w.x1 && gy <= w.y1; }
    at(gx, gy){ return this.inside(gx, gy) ? this.cost[gy * this.grid.cols + gx] : Infinity; }
    // Up to `steps` waypoints downhill from (wx, wy); [] at the goal, null if unreachable.
    walk(wx, wy, steps, jx = 0, jy = 0){
      const g = this.grid, T = G.CONFIG.TILE, cost = this.cost, cols = g.cols;
      let x = Math.floor(wx / T), y = Math.floor(wy / T);
      if (!this.inside(x, y)) return null;
      let here = cost[y * cols + x];
      const pts = [];
      for (let s = 0; s < steps; s++){
        let bx = -1, by = -1, bc = here;
        for (let d = 0; d < 8; d++){
          const nx = x + DX[d], ny = y + DY[d];
          if (!this.inside(nx, ny) || !g.passable(nx, ny)) continue;
          if (d >= 4 && (!g.passable(x + DX[d], y) || !g.passable(x, y + DY[d]))) continue;
          const c = cost[ny * cols + nx];
          if (c < bc){ bc = c; bx = nx; by = ny; }
        }
        if (bx < 0) break;
        x = bx; y = by; here = bc;
        pts.push({ x: (x + 0.5) * T + jx, y: (y + 0.5) * T + jy });
      }
      if (!pts.length && !Number.isFinite(here)) return null;
      return pts;
    }
  }
  G.TargetField = TargetField;

  const R = () => G.SWARM_RULES;
  const jitter = u => { const h = Math.imul(u.id, 2654435761) >>> 0; return [((h & 1023) / 1023 - 0.5) * 2 * R().spread, (((h >>> 10) & 1023) / 1023 - 0.5) * 2 * R().spread]; };

  G.Swarm = {
    field: null,
    ensure(){
      const S = G.State;
      if (!this.field || this.field.grid !== S.grid) this.field = new TargetField(S.grid);
      return this.field;
    },
    // Friendly target within aggro range: nearest unit (ship included), else a structure.
    findTarget(u, def){
      const S = G.State, r = (def.aggroTiles || 10) * G.CONFIG.TILE;
      let best = null, bd = r * r;
      for (const [team, hash] of Object.entries(S.teamSpatial)){
        if (team === u.team || !hash.count) continue;
        const v = hash.nearest(u.x, u.y, r);
        if (v){ const d = G.dist2(u, v); if (d <= bd){ bd = d; best = v; } }
      }
      if (best || !def.attackStructures) return best;
      return G.Buildings.nearestTarget(u, r);
    },
    resolveTarget(u, def){
      if (u.aiTargetId == null) return null;
      const t = G.Units.alive(u.aiTargetId) || G.State.buildings.find(b => b.id === u.aiTargetId && b.hp > 0);
      const leash = (def.aggroTiles || 10) * G.CONFIG.TILE * 1.3;
      return t && t.team !== u.team && G.within(u, t, leash) ? t : null;
    },
    think(u){
      const S = G.State, def = G.Defs.units.get(u.type);
      if (u.aiHold) return;
      if (S.time >= (u.aiNextScan || 0)){
        u.aiNextScan = S.time + 0.35 + (u.id % 11) * 0.02;
        const t = this.findTarget(u, def);
        u.aiTargetId = t ? t.id : null;
      }
      const t = this.resolveTarget(u, def);
      const mode = t ? 'engage' : 'march';
      if (mode !== u.aiMode){ u.aiMode = mode; u.path = []; u.pathIndex = 0; S.paths.cancel(u); u.aiNextPath = 0; }
      if (t) this.engage(u, t); else this.march(u);
    },
    engage(u, t){
      const S = G.State, T = G.CONFIG.TILE;
      // Structures and the ship: range is measured to their nearest edge, and the unit walks
      // toward the open ground just outside that edge rather than their solid centre.
      let ax = t.x, ay = t.y, dist = Math.hypot(u.x - t.x, u.y - t.y) - (t.radius || 0);
      if (t.w){
        const hw = t.w * T / 2, hh = t.h * T / 2;
        const ex = Math.min(t.x + hw, Math.max(t.x - hw, u.x)), ey = Math.min(t.y + hh, Math.max(t.y - hh, u.y));
        dist = Math.hypot(u.x - ex, u.y - ey);
        ax = Math.min(t.x + hw + T / 2, Math.max(t.x - hw - T / 2, u.x)); ay = Math.min(t.y + hh + T / 2, Math.max(t.y - hh - T / 2, u.y));
      }
      if (dist <= u.range * 0.85){ if (u.path.length){ u.path = []; u.pathIndex = 0; } return; }
      if (S.time < (u.aiNextPath || 0)) return;
      // Boxed in by the crowd ahead: hold and re-check shortly instead of shoving forever.
      if ((u.crowd || 0) >= R().crowdHold){ u.path = []; u.pathIndex = 0; u.aiNextPath = S.time + 0.5 + (u.id % 5) * 0.05; return; }
      if (S.grid.lineClear(u.x, u.y, ax, ay)){ u.aiNextPath = S.time + 0.4; u.path = [{ x: ax, y: ay }]; u.pathIndex = 0; }
      else if (S.paths.reachable(u.x, u.y, ax, ay)){ u.aiNextPath = S.time + 1.5; S.paths.request(u, ax, ay, { maxNodes: 2500 }); }
      else { u.aiNextPath = S.time + 1; this.march(u); }   // target across water etc.: keep advancing
    },
    // Look-ahead steering: walk the field a few tiles ahead and head straight for the
    // farthest of those points in direct line of sight. Each unit gets its own straight
    // line (like a smoothed route) instead of a shared tile-centre staircase.
    march(u){
      const S = G.State, f = this.field;
      if (!f || !f.ready || u.pathPending) return;
      if (u.path.length && S.time < (u.aiNextPath || 0)) return;
      u.aiNextPath = S.time + R().steerSeconds + (u.id % 7) * 0.02;
      const pts = f.walk(u.x, u.y, R().lookahead, 0, 0);
      // The field spans every reachable tile around the swarm, so no field value means
      // Vance is unreachable from here (a sealed pocket): stay put, still engaging anything
      // that comes within aggro range.
      if (!pts || !pts.length){ if (u.path.length){ u.path = []; u.pathIndex = 0; } return; }
      let k = pts.length - 1;
      while (k > 0 && !S.grid.lineClear(u.x, u.y, pts[k].x, pts[k].y)) k--;
      const [jx, jy] = jitter(u), p = pts[k];
      const tx = p.x + jx, ty = p.y + jy;
      u.path = [S.grid.passableWorld(tx, ty) && S.grid.lineClear(u.x, u.y, tx, ty) ? { x: tx, y: ty } : p];
      u.pathIndex = 0;
    },
    update(){
      const S = G.State, T = G.CONFIG.TILE;
      // The field only needs to cover the swarm and its goal (plus room for detours).
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const swarm = this.members || (this.members = []);
      swarm.length = 0;
      for (const u of S.units){
        if (u.hp <= 0 || u.aiHold || G.Defs.units.get(u.type)?.ai !== 'swarm') continue;
        swarm.push(u);
        const tx = (u.x / T) | 0, ty = (u.y / T) | 0;
        if (tx < x0) x0 = tx; if (tx > x1) x1 = tx; if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
      }
      if (x0 === Infinity) return;
      const f = this.ensure(), goal = G.Units.hero() || G.Units.ship();
      if (goal){
        const gx = Math.floor(goal.x / T), gy = Math.floor(goal.y / T), g = S.grid, m = R().margin;
        const win = { x0: Math.max(0, Math.min(x0, gx) - m), y0: Math.max(0, Math.min(y0, gy) - m), x1: Math.min(g.cols - 1, Math.max(x1, gx) + m), y1: Math.min(g.rows - 1, Math.max(y1, gy) + m) };
        // Rebuild when Vance moves or the map changes, and periodically so crowd costs stay current.
        if (f.due(gx, gy, S.time, R().rebuildSeconds, win) || (!f.building && S.time - f.builtAt >= R().refreshSeconds)) f.start(gx, gy, S.time, win, swarm, R().crowdCost);
      }
      f.step(f.ready ? R().buildTiles : R().firstBuildTiles);
      S.metrics.swarmField = f.ready ? (f.building ? 'rebuilding' : 'ready') : 'building';
    },
    reset(){ this.field = null; }
  };

  G.AI.swarm = u => G.Swarm.think(u);
  G.SystemManager.register('swarm', { update(){ G.Swarm.update(); }, reset(){ G.Swarm.reset(); } });
})();
