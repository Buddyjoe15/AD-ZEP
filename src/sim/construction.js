/* Field construction by units with the `build` capability. Placement is validated, the
   cost is paid up front, and cancelling (new orders, recall, builder death) refunds it. */
(function(){
  'use strict';
  const G = GW;
  const REACH_TILES = 1.1, REPLAN = 0.8;

  G.Construction = {
    site(id){ return G.State.constructionSites.find(s => s.id === id) || null; },
    builder(id){ const u = G.Units.alive(id); return u && u.team === 'blue' && G.Units.can(u, 'build') ? u : null; },
    // Nearest open tile orthogonally or diagonally adjacent to the footprint.
    approachPoint(gx, gy, w, h, from){
      const T = G.CONFIG.TILE, grid = G.State.grid, cand = [];
      for (let x = gx - 1; x <= gx + w; x++){ cand.push([x, gy - 1], [x, gy + h]); }
      for (let y = gy; y < gy + h; y++){ cand.push([gx - 1, y], [gx + w, y]); }
      let best = null, bd = Infinity;
      for (const [x, y] of cand){
        if (!grid.passable(x, y)) continue;
        const px = (x + 0.5) * T, py = (y + 0.5) * T, d = (px - from.x) ** 2 + (py - from.y) ** 2;
        if (d < bd){ bd = d; best = { x: px, y: py }; }
      }
      return best || { x: (gx + 0.5) * T, y: (gy + h + 0.5) * T };
    },
    // Validates and queues a structure for `builder`. Returns the site or null.
    order(builder, key, gx, gy){
      const d = G.Defs.buildables.get(key);
      if (!d) return null;
      if (!this.builder(builder && builder.id)){ G.notify('Utility Spider is unavailable'); return null; }
      if (builder.buildSiteId){ G.notify('Utility Spider is busy. Finish the job or recall first.'); return null; }
      if (!G.Buildings.canPlaceKey(key, gx, gy)){ G.notify(d.placeOnNode === 'deposit' ? d.name + ' must be placed centred on a free mine deposit' : 'Cannot build there'); return null; }
      const ap = this.approachPoint(gx, gy, d.w, d.h, builder);
      if (!G.State.paths.reachable(builder.x, builder.y, ap.x, ap.y)){ G.notify('No construction route. Choose a reachable tile.'); return null; }
      if (!G.Economy.canAfford(d.cost)){ G.notify('Need ' + G.Economy.describe(d.cost)); return null; }
      G.Economy.spend(d.cost, 'construction');
      const T = G.CONFIG.TILE;
      const site = {
        id: 'site-' + G.newId(), type: key, team: 'blue', gx, gy, w: d.w, h: d.h,
        x: (gx + d.w / 2) * T, y: (gy + d.h / 2) * T, buildTime: d.buildTime, remaining: d.buildTime, builderId: builder.id
      };
      G.Units.clearOrders(builder);
      G.State.constructionSites.push(site);
      builder.command = 'build'; builder.buildSiteId = site.id;
      G.State.paths.request(builder, ap.x, ap.y, { priority: true });
      G.Events.emit('construction:queued', site);
      G.notify(d.name + ' queued — Utility Spider moving to build');
      return site;
    },
    // Within one tile of the footprint's edge (covers diagonal approach tiles).
    inReach(u, site){
      const T = G.CONFIG.TILE, x0 = site.gx * T, y0 = site.gy * T, x1 = x0 + site.w * T, y1 = y0 + site.h * T;
      const dx = Math.max(x0 - u.x, 0, u.x - x1), dy = Math.max(y0 - u.y, 0, u.y - y1);
      return Math.hypot(dx, dy) <= T * REACH_TILES;
    },
    cancelFor(builder, refund = true){
      if (!builder || !builder.buildSiteId) return;
      const site = this.site(builder.buildSiteId);
      builder.buildSiteId = null;
      if (builder.command === 'build') builder.command = 'idle';
      if (!site) return;
      if (refund) G.Economy.refund(G.Defs.buildables.get(site.type)?.cost || {}, 'construction cancelled');
      G.State.constructionSites = G.State.constructionSites.filter(s => s.id !== site.id);
      G.Events.emit('construction:cancelled', site);
    },
    complete(site){
      const S = G.State, d = G.Defs.buildables.require(site.type);
      S.constructionSites = S.constructionSites.filter(s => s.id !== site.id);
      const builder = G.Units.get(site.builderId);
      if (builder){ builder.command = 'idle'; builder.buildSiteId = null; builder.path = []; builder.pathIndex = 0; }
      // A unit may have wandered onto the footprint; nudge it off before the walls go up.
      const T = G.CONFIG.TILE;
      for (const u of S.units){
        if (u.isShip || u.hp <= 0) continue;
        const ux = Math.floor(u.x / T), uy = Math.floor(u.y / T);
        if (ux >= site.gx && ux < site.gx + site.w && uy >= site.gy && uy < site.gy + site.h){
          const p = this.approachPoint(site.gx, site.gy, site.w, site.h, u);
          u.x = p.x; u.y = p.y;
        }
      }
      const b = G.Buildings.add(site.type, site.gx, site.gy);
      G.Events.emit('construction:completed', { site, building: b });
      G.notify(d.name + ' construction complete');
      return b;
    }
  };

  G.SystemManager.register('construction', {
    update(dt){
      const S = G.State;
      for (const site of [...S.constructionSites]){
        const u = this.builderFor(site);
        if (u && G.Cheats.instantBuild){ G.Construction.complete(site); continue; }
        if (!u){
          // Builder lost: the site cannot finish, so refund it rather than block departure.
          S.constructionSites = S.constructionSites.filter(s => s !== site);
          G.Economy.refund(G.Defs.buildables.get(site.type)?.cost || {}, 'construction abandoned');
          continue;
        }
        if (!G.Construction.inReach(u, site)){
          if (G.Units.navIdle(u) && S.time >= u.commandNextPath){
            u.commandNextPath = S.time + REPLAN;
            const ap = G.Construction.approachPoint(site.gx, site.gy, site.w, site.h, u);
            S.paths.request(u, ap.x, ap.y);
          }
          continue;
        }
        u.path = []; u.pathIndex = 0;
        if (S.paths) S.paths.cancel(u);
        u.heading = Math.atan2(site.y - u.y, site.x - u.x);
        site.remaining = Math.max(0, site.remaining - dt);
        if (site.remaining <= 0) G.Construction.complete(site);
      }
    },
    builderFor(site){
      const u = G.Units.alive(site.builderId);
      return u && u.buildSiteId === site.id ? u : null;
    }
  });
})();
