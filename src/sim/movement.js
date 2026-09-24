/* Path following, spatial index rebuild and unit separation. */
(function(){
  'use strict';
  const G = GW;
  const scratch = [];

  function follow(u, dt, grid, tick){
    if (!u.path.length || u.speed <= 0) return;
    if (u.pathIndex >= u.path.length){ u.path = []; u.pathIndex = 0; return; }
    // Incremental smoothing: every few ticks (staggered per unit) skip waypoints that are
    // already in direct line of sight.
    if (((tick + u.id) & 7) === 0){
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
    const nx = u.x + dx / d * step, ny = u.y + dy / d * step;
    if (!grid.passableWorld(nx, ny)){
      // Terrain or a new structure blocks the route; drop it so the owner re-plans.
      u.path = []; u.pathIndex = 0; return;
    }
    u.x = nx; u.y = ny; u.heading = Math.atan2(dy, dx);
  }

  // Pushes overlapping units apart. Each pair is resolved once (lower id handles it).
  function separate(S, maxRadius){
    const C = G.CONFIG, grid = S.grid, T = C.TILE;
    for (const u of S.units){
      if (u.hp <= 0 || u.isShip) continue;
      const near = S.spatial.query(u.x, u.y, u.radius + maxRadius + 6, scratch);
      for (let i = 0; i < near.length; i++){
        const v = near[i];
        if (v.id <= u.id || v.hp <= 0 || v.isShip) continue;
        let dx = u.x - v.x, dy = u.y - v.y;
        const min = u.radius + v.radius + 6, d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d === 0){ dx = (u.id % 2) ? 1 : -1; dy = (v.id % 2) ? 1 : -1; d = Math.SQRT2; }
        const push = (min - d) * 0.5, nx = dx / d, ny = dy / d;
        const ux = u.x + nx * push, uy = u.y + ny * push, vx = v.x - nx * push, vy = v.y - ny * push;
        if (grid.passable(Math.floor(ux / T), Math.floor(uy / T))){ u.x = G.clamp(ux, 4, C.WORLD_W - 4); u.y = G.clamp(uy, 4, C.WORLD_H - 4); }
        if (grid.passable(Math.floor(vx / T), Math.floor(vy / T))){ v.x = G.clamp(vx, 4, C.WORLD_W - 4); v.y = G.clamp(vy, 4, C.WORLD_H - 4); }
      }
    }
  }

  function rebuildSpatial(S){
    S.spatial.rebuild(S.units);
    for (const hash of Object.values(S.teamSpatial)) hash.clear();
    for (const u of S.units){
      if (u.hp <= 0) continue;
      (S.teamSpatial[u.team] || (S.teamSpatial[u.team] = new G.SpatialHash(G.CONFIG.TARGET_CELL))).insert(u);
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
        follow(u, dt, S.grid, tick);
        if (!u.isShip && u.radius > maxRadius) maxRadius = u.radius;
      }
      rebuildSpatial(S);
      separate(S, maxRadius);
      for (const u of S.units) if (u.storage){ u.storage.x = u.x; u.storage.y = u.y; }
    }
  });
})();
