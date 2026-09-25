/* Path following, spatial index rebuild and unit separation. */
(function(){
  'use strict';
  const G = GW;

  function follow(u, dt, grid, tick){
    if (!u.path.length || u.speed <= 0) return;
    if (u.pathIndex >= u.path.length){ u.path = []; u.pathIndex = 0; return; }
    // Incremental smoothing: every few ticks (staggered per unit) skip waypoints that are
    // already in direct line of sight.
    if (((tick + u.id) & 7) === 0 && u.aiMode !== 'march'){
      for (let k = 0; k < 3 && u.pathIndex + 1 < u.path.length; k++){
        const n = u.path[u.pathIndex + 1];
        if (!grid.lineClear(u.x, u.y, n.x, n.y)) break;
        u.pathIndex++;
      }
    }
    const p = u.path[u.pathIndex], dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
    if (d < 10){
      u.pathIndex++;
      if (u.pathIndex >= u.path.length){ u.path = []; u.pathIndex = 0; }
      return;
    }
    const step = Math.min(d, u.speed * grid.speedAt(u.x, u.y) * dt);
    let nx = u.x + dx / d * step, ny = u.y + dy / d * step;
    // Closed gates (and every gate, for enemies) block like walls.
    const Gt = G.Gates, ok = Gt.count ? (x, y) => grid.passableWorld(x, y) && !Gt.blocksWorld(u, x, y) : (x, y) => grid.passableWorld(x, y);
    if (!ok(nx, ny)){
      // Slide along the obstacle on whichever axis is still open (units nudged against a
      // wall by the crowd keep moving). A dead end, or heading almost straight into the wall
      // (the slide would barely move), drops the route so the owner re-plans.
      const min = step * 0.2;
      if (ok(nx, u.y) && Math.abs(nx - u.x) > min) ny = u.y;
      else if (ok(u.x, ny) && Math.abs(ny - u.y) > min) nx = u.x;
      else { u.path = []; u.pathIndex = 0; return; }
    }
    u.x = nx; u.y = ny; u.heading = Math.atan2(dy, dx);
  }

  // Resolves one overlapping pair (already known to overlap by `min - d`).
  function push(u, v, dx, dy, d2, min, grid, T){
    u.crowd++; v.crowd++;
    let d = Math.sqrt(d2);
    if (d === 0){ dx = (u.id % 2) ? 1 : -1; dy = (v.id % 2) ? 1 : -1; d = Math.SQRT2; }
    const p = (min - d) * 0.5, nx = dx / d, ny = dy / d;
    const ux = u.x + nx * p, uy = u.y + ny * p, vx = v.x - nx * p, vy = v.y - ny * p;
    // passable() is false outside the map, so an accepted push always stays in bounds.
    // Crowds can't push a unit through a gate it may not pass.
    // A unit against a wall slides along it on whichever axis is still open, so it can
    // still be pushed aside (all-or-nothing, a unit on a wall's edge could never move).
    shove(u, ux, uy, grid, T); shove(v, vx, vy, grid, T);
  }
  function shove(u, x, y, grid, T){
    if (open(u, x, y, grid, T)){ u.x = x; u.y = y; }
    else if (open(u, x, u.y, grid, T)) u.x = x;
    else if (open(u, u.x, y, grid, T)) u.y = y;
  }
  function open(u, x, y, grid, T){
    const Gt = G.Gates, gx = Math.floor(x / T), gy = Math.floor(y / T);
    return grid.passable(gx, gy) && !(Gt.count && Gt.blocks(u, gx, gy));
  }

  // Pushes overlapping units apart. Walks the occupied cells of the dense collision grid,
  // comparing each cell with itself and its four "forward" neighbours, so every nearby
  // pair is examined exactly once (the hottest loop in a swarm). The ship is not in the
  // collision grid and dead units never are, so the inner loops need no liveness checks.
  // Valid while a cell is at least as wide as the largest interaction distance.
  function separate(S, maxRadius){
    const grid = S.grid, T = G.CONFIG.TILE, sp = S.spatial;
    if (sp.size < 2 * maxRadius + 6) return separateSlow(S, maxRadius);
    const head = sp.head, next = sp.next, items = sp.items, cols = sp.cols, rows = sp.rows, occ = sp.occupied;
    const pair = (u, j) => {
      for (; j !== -1; j = next[j]){
        const v = items[j], dx = u.x - v.x, dy = u.y - v.y, min = u.radius + v.radius + 6, d2 = dx * dx + dy * dy;
        if (d2 < min * min) push(u, v, dx, dy, d2, min, grid, T);
      }
    };
    for (let k = 0; k < occ.length; k++){
      const c = occ[k], cx = c % cols, cy = (c / cols) | 0, south = cy + 1 < rows;
      for (let i = head[c]; i !== -1; i = next[i]){
        const u = items[i];
        pair(u, next[i]);                                   // rest of this cell
        if (cx + 1 < cols) pair(u, head[c + 1]);            // east
        if (south){
          if (cx > 0) pair(u, head[c + cols - 1]);          // south-west
          pair(u, head[c + cols]);                          // south
          if (cx + 1 < cols) pair(u, head[c + cols + 1]);   // south-east
        }
      }
    }
  }
  // General version for unusually large units: searches around each unit.
  function separateSlow(S, maxRadius){
    const grid = S.grid, T = G.CONFIG.TILE, sp = S.spatial;
    for (const u of S.units){
      if (u.hp <= 0 || u.isShip) continue;
      sp.each(u.x, u.y, u.radius + maxRadius + 6, v => {
        if (v.id <= u.id) return;
        const dx = u.x - v.x, dy = u.y - v.y, min = u.radius + v.radius + 6, d2 = dx * dx + dy * dy;
        if (d2 < min * min) push(u, v, dx, dy, d2, min, grid, T);
      });
    }
  }

  const notShip = u => !u.isShip;
  function rebuildSpatial(S){
    S.spatial.rebuild(S.units, notShip);   // the ship's footprint already blocks the grid
    for (const hash of Object.values(S.teamSpatial)) hash.clear();
    for (const u of S.units){
      if (u.hp <= 0) continue;
      (S.teamSpatial[u.team] || (S.teamSpatial[u.team] = G.teamGrid())).insert(u);
    }
  }
  G.rebuildSpatial = () => rebuildSpatial(G.State);

  let tick = 0;
  G.SystemManager.register('spatial', { update(){ rebuildSpatial(G.State); } });
  // Moves units, then rebuilds every spatial index once for the rest of the tick (and the
  // AI of the next one), then resolves overlaps.
  G.SystemManager.register('movement', {
    update(dt){
      const S = G.State;
      tick++;
      let maxRadius = 0;
      for (const u of S.units){
        if (u.hp <= 0) continue;
        u.crowd = 0;
        follow(u, dt, S.grid, tick);
        if (!u.isShip && u.radius > maxRadius) maxRadius = u.radius;
      }
      rebuildSpatial(S);
      separate(S, maxRadius);
      for (const u of S.units) if (u.storage){ u.storage.x = u.x; u.storage.y = u.y; }
    }
  });
})();
