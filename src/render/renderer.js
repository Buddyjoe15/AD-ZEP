/* Main canvas renderer and minimap. Everything outside the camera view is culled; the
   minimap redraws at a fixed low rate instead of every frame. */
(function(){
  'use strict';
  const G = GW, TAU = Math.PI * 2;
  const now = () => performance.now();

  G.worldFromScreen = (x, y) => { const c = G.State.camera; return { x: c.x + x / c.z, y: c.y + y / c.z }; };
  G.screenFromWorld = (x, y) => { const c = G.State.camera; return { x: (x - c.x) * c.z, y: (y - c.y) * c.z }; };
  G.clampCamera = function(){
    const c = G.State.camera, C = G.CONFIG, R = G.Renderer;
    // Never let a bad value (NaN / Infinity) stick: fall back to the world centre.
    if (!Number.isFinite(c.z) || c.z <= 0) c.z = 0.72;
    if (!Number.isFinite(c.x)) c.x = C.WORLD_W / 2 - R.w / c.z / 2;
    if (!Number.isFinite(c.y)) c.y = C.WORLD_H / 2 - R.h / c.z / 2;
    c.x = G.clamp(c.x, 0, Math.max(0, C.WORLD_W - R.w / c.z));
    c.y = G.clamp(c.y, 0, Math.max(0, C.WORLD_H - R.h / c.z));
  };
  G.centerCamera = function(x, y, z){
    const c = G.State.camera, R = G.Renderer;
    if (z) c.z = z;
    c.x = x - R.w / c.z / 2; c.y = y - R.h / c.z / 2;
    G.clampCamera();
  };

  G.Renderer = {
    cv: null, g: null, w: 1, h: 1, dpr: 1, minimapAt: 0,
    init(){
      this.cv = document.getElementById('game');
      this.g = this.cv.getContext('2d', { alpha: false });
      this.mini = document.getElementById('minimap');
      this.ov = document.getElementById('overlay');
      this.o = this.ov.getContext('2d');
      if (!G.GPU.init(document.getElementById('gpu'))){ this.ov.style.display = 'none'; document.getElementById('gpu').style.display = 'none'; }
      this.resize();
      addEventListener('resize', () => this.resize());
    },
    // Keeps the view centred on the same world point when the window changes size.
    resize(){
      const c = G.State.camera, cx = c.x + this.w / c.z / 2, cy = c.y + this.h / c.z / 2;
      this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.w = innerWidth; this.h = innerHeight;
      this.cv.width = Math.floor(this.w * this.dpr); this.cv.height = Math.floor(this.h * this.dpr);
      this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
      if (this.ov){ this.ov.width = this.cv.width; this.ov.height = this.cv.height; this.ov.style.width = this.w + 'px'; this.ov.style.height = this.h + 'px'; }
      G.GPU.resize(this.w, this.h, this.dpr);
      if (G.State.grid) G.centerCamera(cx, cy);
    },
    view(pad = 0){
      const c = G.State.camera;
      return { x0: c.x - pad, y0: c.y - pad, x1: c.x + this.w / c.z + pad, y1: c.y + this.h / c.z + pad };
    },
    draw(){
      const t0 = now(), S = G.State, g = this.g, C = G.CONFIG, T = C.TILE;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = '#1a211a'; g.fillRect(0, 0, this.w, this.h);
      if (!S.grid) return;
      const c = S.camera, z = c.z, t = S.time, v = this.view(), inView = (x, y, p) => x > v.x0 - p && y > v.y0 - p && x < v.x1 + p && y < v.y1 + p;
      // Surface or a cave (Genesis): the terrain comes from the surface copy of the grid, and
      // only what is on the layer in view is drawn.
      const CV = G.CaveView, inCave = CV.cave >= 0, TG = CV.terrainGrid(), here = o => CV.here(o);
      g.save(); g.scale(z, z); g.translate(-c.x, -c.y);

      // Terrain: overview image underneath, detailed chunks on top when close enough.
      const TC = G.TerrainCache, CT = C.CHUNK_TILES * T;
      const span = ct => [Math.max(0, Math.floor(v.x0 / ct)), Math.max(0, Math.floor(v.y0 / ct)), Math.min(Math.ceil(C.WORLD_W / ct) - 1, Math.floor(v.x1 / ct)), Math.min(Math.ceil(C.WORLD_H / ct) - 1, Math.floor(v.y1 / ct))];
      const count0 = (() => { const [a0, b0, a1, b1] = span(CT); return (a1 - a0 + 1) * (b1 - b0 + 1); })();
      // Full-resolution chunks up close, lower-resolution chunks at middle zoom (or when the
      // view holds more chunks than the full cache), and only the overview image when far.
      const near = z >= C.LOD_ZOOM && count0 <= C.CHUNK_CACHE_MAX;
      const far = !near && (z < C.FAR_CHUNK_ZOOM || count0 > C.FAR_CHUNK_CACHE_MAX), low = !near && !far;
      // Close up, chunks are painted at about the screen's own resolution: a world px covers
      // zd device px, and chunks come at ½, 1, 2, 3 or 4 canvas px per world px (the largest the
      // cache can hold for this view). Thresholds have some give, so zooming back and forth
      // across one doesn't repaint the whole view each time.
      const L = this.lod || (this.lod = { res: 1, live: false }), zd = this.dpr * z;
      const fits = r => { const [a0, b0, a1, b1] = span(TC.tilesFor(r) * T); return (a1 - a0 + 1) * (b1 - b0 + 1) * TC.cost(r) <= C.CHUNK_CACHE_MAX * 0.8; };
      const pick = d => d <= 0.55 ? 0.5 : Math.min(C.TERRAIN_RES_MAX, Math.max(1, Math.ceil(d - 0.08)));
      let want1 = pick(zd);
      if (want1 !== L.res && (pick(zd * 1.08) === L.res || pick(zd / 1.08) === L.res)) want1 = L.res;   // hysteresis
      while (want1 > 1 && !fits(want1)) want1--;
      L.res = want1;
      const res = low ? C.FAR_CHUNK_SCALE : want1, ct = TC.tilesFor(res) * T;
      const [cx0, cy0, cx1, cy1] = span(ct);
      // Free-standing trees (Genesis) are drawn live up close and drawn into the chunks further out.
      const TA = G.TreeArt, trees = TA.has(TG);
      L.live = near && TA.live(TG, z * (L.live ? 1.08 : 0.95));
      const bake = trees && !L.live, live = trees && near ? new Set() : null;
      if (inCave) CV.drawCave(g, v, z, t);
      else { g.imageSmoothingEnabled = false; g.drawImage(TC.getOverview(), 0, 0, C.WORLD_W, C.WORLD_H); g.imageSmoothingEnabled = true; }
      let chunks = 0;
      // The best copy at hand for the world rect of chunk (cx, cy) while it is painted: another
      // resolution (its chunk may be larger or smaller: the matching part, or the parts), the
      // other tree layer, or a middle-zoom copy. Returns whether anything was drawn, and
      // whether it had the trees in it.
      const stand = (cx, cy) => {
        const X = cx * ct, Y = cy * ct;
        const tries = [];
        for (const r of [res, 2, 1, 3, 4, 0.5]) if (r !== res || trees) for (const bk of trees ? [bake, !bake] : [false]) if (!(r === res && bk === bake)) tries.push([r, bk]);
        tries.push([C.FAR_CHUNK_SCALE, true]);
        for (const [r, bk] of tries){
          const cs = TC.tilesFor(r) * T;
          if (cs >= ct){
            const k = Math.floor(X / cs), m = Math.floor(Y / cs), cv = TC.peek(k, m, r, bk);
            if (!cv) continue;
            const f = cv.width / cs;
            g.drawImage(cv, (X - k * cs) * f, (Y - m * cs) * f, ct * f, ct * f, X, Y, ct, ct);
            return { baked: bk || r < 1 };
          }
          // Smaller chunks: all of the pieces, or none.
          const n = ct / cs, parts = [];
          for (let j = 0; j < n; j++) for (let i = 0; i < n; i++){ const cv = TC.peek(cx * n + i, cy * n + j, r, bk); if (!cv) break; parts.push([cv, i, j]); }
          if (parts.length < n * n) continue;
          for (const [cv, i, j] of parts) g.drawImage(cv, X + i * cs, Y + j * cs, cs, cs);
          return { baked: bk || r < 1 };
        }
        return null;
      };
      if (!far && !inCave){
        g.imageSmoothingEnabled = !(G.PixelArt.enabled && z * this.dpr >= 1);   // pixel terrain stays crisp up close
        // Chunks in view are never evicted while they are wanted. Missing ones are painted
        // nearest the middle of the screen first, as many as fit in a few milliseconds a frame
        // (at least one), so the view fills from the centre out and never waits on the edges.
        TC.pin.clear();
        const mx = (v.x0 + v.x1) / 2 / ct - 0.5, my = (v.y0 + v.y1) / 2 / ct - 0.5, want = [];
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++){ TC.pin.add(TC.key(cx, cy, res, bake)); if (!TC.has(cx, cy, res, bake)) want.push([cx, cy]); }
        want.sort((a, b) => (a[0] - mx) ** 2 + (a[1] - my) ** 2 - (b[0] - mx) ** 2 - (b[1] - my) ** 2);
        // Painted a band of rows at a time within the frame's budget, so even a big chunk
        // never stalls a frame; a half-painted one carries on next frame.
        const t1 = now();
        for (let k = 0; k < want.length && (k < 1 || now() - t1 < C.CHUNK_BUILD_MS); k++) if (!TC.work(want[k][0], want[k][1], res, bake, t1 + C.CHUNK_BUILD_MS)) break;
        // What is left of the budget for work ahead of need (time spent drawing doesn't count).
        const spare = () => C.CHUNK_BUILD_MS - (now() - t1 - drawn), t2 = now(); let drawn = 0;
        const liveKey = (cx, cy) => { const k = ct / CT; return Math.floor(cy * k) * 4096 + Math.floor(cx * k); };   // (in the tree index's full-size chunks)
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++){
          if (TC.has(cx, cy, res, bake)){
            g.drawImage(TC.chunk(cx, cy, res, bake), cx * ct, cy * ct, ct, ct); chunks++;
            if (live && !bake && res >= 1) live.add(liveKey(cx, cy));
            continue;
          }
          const got = stand(cx, cy);
          if (!got) continue;
          chunks++;
          if (live && !got.baked) live.add(liveKey(cx, cy));
        }
        drawn = now() - t2;
        // With the view complete and time to spare, the ring of chunks round it is painted
        // ahead, so scrolling finds them ready.
        if (!want.length || spare() > C.CHUNK_BUILD_MS * 0.5){
          const rx0 = Math.max(0, cx0 - 1), ry0 = Math.max(0, cy0 - 1), rx1 = Math.min(Math.ceil(C.WORLD_W / ct) - 1, cx1 + 1), ry1 = Math.min(Math.ceil(C.WORLD_H / ct) - 1, cy1 + 1);
          if (res < 1 || (rx1 - rx0 + 1) * (ry1 - ry0 + 1) * TC.cost(res) <= C.CHUNK_CACHE_MAX){
            const ring = [];
            for (let cy = ry0; cy <= ry1; cy++) for (let cx = rx0; cx <= rx1; cx++){ const k = TC.key(cx, cy, res, bake); TC.pin.add(k); if (!TC.has(cx, cy, res, bake)) ring.push([cx, cy]); }
            ring.sort((a, b) => (a[0] - mx) ** 2 + (a[1] - my) ** 2 - (b[0] - mx) ** 2 - (b[1] - my) ** 2);
            if (ring.length && spare() > C.CHUNK_BUILD_MS * 0.5) TC.work(ring[0][0], ring[0][1], res, bake, now() + spare());
          }
        }
        // Time to spare: houses and caverns are drawn ahead of need.
        if (!this.warmed && spare() > C.CHUNK_BUILD_MS * 0.5) this.warmed = G.Structures.warm(TG, now() + spare() * 0.8);
        g.imageSmoothingEnabled = true;
        // Pixel-art trees moving in the wind (Woodlands); lower-resolution chunks have them drawn in.
        if (near) G.Landscape.drawLive(g, TG, v, t, z);   // waterfalls and glinting water (Genesis)
        if (near) G.WoodlandsArt.drawTrees(g, TG, v, T, t, z);
        if (live && live.size) TA.drawLive(g, TG, v, t, (cx, cy) => live.has(cy * 4096 + cx));
      }

      // Resource nodes.
      for (const n of S.resourceNodes){
        if (n.remaining <= 0 || !inView(n.x, n.y, 30) || !here(n)) continue;
        if (G.Gather.isDeposit(n)){
          // 1×1 mine deposit (hidden under its Mine Building once built).
          if (G.Gather.mineOn(n)) continue;
          const px = n.gx * T, py = n.gy * T;
          g.fillStyle = '#3f3a33'; g.fillRect(px + 1, py + 1, T - 2, T - 2);
          g.fillStyle = '#6f6453'; g.beginPath(); g.moveTo(px + 6, py + T - 8); g.lineTo(px + 16, py + 10); g.lineTo(px + 28, py + 20); g.lineTo(px + 40, py + 8); g.lineTo(px + T - 5, py + T - 6); g.closePath(); g.fill();
          g.fillStyle = G.Gather.def(n).ore || '#c9d4dc';   // ore colour tells deposits apart
          for (const [ox, oy, r] of [[15, 27, 4], [27, 33, 3.2], [33, 21, 3.6], [21, 16, 2.6]]){ g.beginPath(); g.arc(px + ox, py + oy, r, 0, TAU); g.fill(); }
          g.strokeStyle = '#d0a65b'; g.lineWidth = 2 / z; g.setLineDash([5 / z, 4 / z]); g.strokeRect(px + 1, py + 1, T - 2, T - 2); g.setLineDash([]);
          if (!far){ g.fillStyle = '#e8d9b4'; g.font = (10 / z) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(n.name, n.x, py - 5); }
          continue;
        }
        g.save(); g.translate(n.x, n.y);
        g.fillStyle = '#6c6255'; g.strokeStyle = '#b4a27e'; g.lineWidth = 2 / z; g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#9ca5a0'; g.fillRect(-13, -5, 26, 10); g.fillStyle = '#d0a65b'; g.fillRect(-4, -14, 8, 28);
        g.restore();
      }
      // Containers and ground items.
      for (const ctn of S.containers){
        if (!inView(ctn.x, ctn.y, 48) || !here(ctn)) continue;
        if (ctn.type === 'ground_item'){
          if (!ctn.items.length) continue;
          g.fillStyle = '#87d5e3'; g.fillRect(ctn.x - 7, ctn.y - 7, 14, 14);
          if (!far){ g.fillStyle = '#0b1820'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(G.initials(G.Items.name(ctn.items[0])), ctn.x, ctn.y + 0.5); g.textBaseline = 'alphabetic'; }
          continue;
        }
        if ((ctn.type === 'cave_cache' || ctn.type === 'black_box') && !far){ G.Visuals.drawCaveFind(g, ctn, z, t); continue; }
        const px = ctn.gx * T, py = ctn.gy * T;
        g.fillStyle = ctn.opened ? '#79552f' : '#d3a92e';
        if (far){ g.fillRect(ctn.x - 12, ctn.y - 12, 24, 24); continue; }
        g.strokeStyle = '#2b2115'; g.lineWidth = 2 / z; g.fillRect(px + 3, py + 5, T - 6, T - 10); g.strokeRect(px + 3, py + 5, T - 6, T - 10);
        g.fillStyle = ctn.opened ? '#cda96d' : '#fff0a0'; g.fillRect(px + T / 2 - 3, py + T / 2 - 4, 6, 10);
      }
      // Construction sites.
      for (const site of S.constructionSites){
        if (!inView(site.x, site.y, site.w * T) || !here(site)) continue;
        const px = G.Buildings.fx(site) * T, py = G.Buildings.fy(site) * T, pct = 1 - site.remaining / site.buildTime;
        if (G.PixelArt.buildingSprite(site.type)) G.PixelArt.drawSite(g, site, pct);
        else {
        g.fillStyle = 'rgba(160,160,145,.28)'; g.strokeStyle = '#d4b96b'; g.lineWidth = 2 / z; g.setLineDash([6 / z, 5 / z]);
        g.fillRect(px + 2, py + 2, T * site.w - 4, T * site.h - 4); g.strokeRect(px + 2, py + 2, T * site.w - 4, T * site.h - 4); g.setLineDash([]);
        }
        g.fillStyle = '#111'; g.fillRect(px + 4, py + T * site.h - 8, T * site.w - 8, 5);
        g.fillStyle = '#e0c15b'; g.fillRect(px + 5, py + T * site.h - 7, (T * site.w - 10) * G.clamp(pct, 0, 1), 3);
        g.fillStyle = '#fff0b0'; g.font = (9 / z) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(site.remaining.toFixed(1) + 's', site.x, py - 5);
      }
      // Structures (and, with pixel art, the rubble of recently destroyed ones).
      if (G.PixelArt.enabled && !inCave) G.PixelArt.drawRubble(g, inView);
      // Pixel-art structures draw every shadow first, so no shadow falls on a neighbour.
      const P = G.PixelArt;
      if (P.enabled) for (const b of S.buildings) if (inView(b.x, b.y, b.w * T) && here(b) && P.buildingSprite(b.type)) P.drawBuildingShadow(g, b, t);
      for (const b of S.buildings) if (inView(b.x, b.y, b.w * T) && here(b)) G.Visuals.drawBuilding(g, b, z, t, P.enabled);
      G.Visuals.shields(g, z, t, inView);
      // Expedition signals.
      const E = S.expedition;
      if (E && !inCave) for (const p of E.sites){
        if (p.done || !inView(p.x, p.y, 50)) continue;
        g.strokeStyle = p.kind === 'Element P' ? '#c591ff' : '#70e3dd'; g.lineWidth = 2 / z;
        g.beginPath(); g.arc(p.x, p.y, 20, 0, TAU); g.stroke();
        if (p.progress > 0){ g.beginPath(); g.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * p.progress / G.EXPEDITION_RULES.signalStudySeconds); g.stroke(); }
        g.fillStyle = g.strokeStyle; g.font = `${11 / z}px sans-serif`; g.textAlign = 'center'; g.fillText(p.kind, p.x, p.y - 30);
      }

      // Fog of war over the map and structures; hidden enemies are not drawn at all.
      const Fog = G.Fog;
      if (Fog.enabled && !inCave){ Fog.update(); Fog.draw(g); }
      if (!inCave) CV.drawMouths(g, z, inView);

      // Units. With WebGL2 they are drawn by the GPU on their own canvas (one instanced call);
      // the ship stays on this canvas and everything that must sit above units (selection,
      // routes, beams, gunfire, previews) goes on a 2D overlay canvas. Without WebGL2 the
      // same content is drawn here with Canvas 2D.
      const visible = [];
      for (const u of S.units) if (inView(u.x, u.y, u.isShip ? 340 : 80) && here(u) && (u.team === 'blue' || inCave || Fog.visibleAt(u.x, u.y))) visible.push(u);
      const gpu = G.GPU.ok, sprites = [], bars = [];
      for (const u of visible){
        if (u.isShip) G.Visuals.drawUnit(g, u, z, t);
        else if (gpu){ sprites.push(u); if (u.hp < u.maxHp || S.selected.has(u.id)) bars.push(u); }
      }
      if (!gpu) this.drawUnits2D(g, visible, z, t);
      let o = g;
      if (gpu){
        g.restore();
        G.GPU.clear();
        G.GPU.draw(sprites, bars, t);
        o = this.o;
        o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        o.clearRect(0, 0, this.w, this.h);
        o.save(); o.scale(z, z); o.translate(-c.x, -c.y);
      }
      G.Lighting.draw(o, c, z, this.w, this.h, t);   // night and the lights in it (Genesis), under the orders and selection
      this.drawOverlay(o, visible, z, t, inView, !gpu);
      o.restore();

      const box = G.Input && G.Input.box;
      if (box){
        const x = Math.min(box.x0, box.x1), y = Math.min(box.y0, box.y1), w = Math.abs(box.x1 - box.x0), h = Math.abs(box.y1 - box.y0);
        o.fillStyle = 'rgba(80,170,255,.12)'; o.fillRect(x, y, w, h); o.strokeStyle = '#7dc0ff'; o.lineWidth = 1; o.strokeRect(x + 0.5, y + 0.5, w, h);
      }
      Object.assign(S.metrics, { lod: far ? 'overview' : low ? 'detail (low res)' : 'detail', cached: TC.chunks.size + TC.farChunks.size, visible: visible.length, chunks, drawMs: now() - t0 });
      if (now() - this.minimapAt > 1000 / C.MINIMAP_HZ){ this.minimapAt = now(); this.drawMinimap(); }
      else this.drawMinimapCamera();
    },
    // Canvas 2D unit drawing (fallback when hardware WebGL2 is unavailable). Units are
    // stamped from the sprite atlas with one transform + drawImage each; zoomed out,
    // ordinary units become team-coloured markers batched into one path per team.
    // Pixel-art units first get their shadows, merged in one mask so they don't stack.
    // Zoom below which ordinary units are drawn as team squares. Pixel-art units stay
    // readable further out than the Canvas art.
    unitLodZoom(){ return G.PixelArt.enabled ? G.CONFIG.UNIT_LOD_ZOOM_PIXEL : G.CONFIG.UNIT_LOD_ZOOM; },
    drawUnits2D(g, visible, z, t){
      const S = G.State, C = G.CONFIG, lod = z < this.unitLodZoom(), batches = new Map();
      const A = G.SpriteAtlas, c = S.camera, k = this.dpr * z, items = [];
      A.ensureRoom();
      let shadows = false;
      for (const u of visible){
        if (u.isShip) continue;
        if (lod && !u.isHero && !S.selected.has(u.id)){
          const col = C.COLORS[u.team] || '#ccc';
          let list = batches.get(col);
          if (!list) batches.set(col, list = []);
          list.push(u);
          continue;
        }
        const def = G.Defs.units.get(u.type);
        if (!def) continue;
        const e = A.entryFor(def, u.team);
        items.push(u, e, A.frame(e, u, t));
        if (e.shadow) shadows = true;
      }
      if (items.length){
        // Atlas level n holds RES / 2^n px per world px (Canvas art); use the most detailed
        // level that is at most 2× the device resolution.
        const lv = Math.min(Math.log2(A.RES) + 1, Math.max(0, Math.ceil(Math.log2(A.RES / (2 * k))))), s = 1 / (1 << lv);
        const stamp = (ctx, img, u, e, f, dx, dy) => {
          const ang = e.upright ? 0 : u.heading, co = Math.cos(ang) * k, si = Math.sin(ang) * k, at = e.at[f];
          ctx.setTransform(co, si, -si, co, (u.x + dx - c.x) * k, (u.y + dy - c.y) * k);
          ctx.drawImage(img, at[0] * s, at[1] * s, e.rect.w * e.scale * s, e.rect.h * e.scale * s, e.rect.x, e.rect.y, e.rect.w, e.rect.h);
        };
        const smooth = g.imageSmoothingEnabled;
        g.imageSmoothingEnabled = !G.PixelArt.enabled;
        if (shadows){
          const mask = this.shadowMask || (this.shadowMask = document.createElement('canvas'));
          if (mask.width !== this.cv.width || mask.height !== this.cv.height){ mask.width = this.cv.width; mask.height = this.cv.height; }
          const m = mask.getContext('2d'), sil = A.silhouette(lv);
          m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, mask.width, mask.height); m.imageSmoothingEnabled = false;
          for (let i = 0; i < items.length; i += 3){ const e = items[i + 1]; if (e.shadow) stamp(m, sil, items[i], e, items[i + 2], e.shadow[0], e.shadow[1]); }
          g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = G.PixelArt.SHADOW_ALPHA; g.drawImage(mask, 0, 0); g.globalAlpha = 1;
        }
        const img = A.level(lv);
        for (let i = 0; i < items.length; i += 3) stamp(g, img, items[i], items[i + 1], items[i + 2], 0, 0);
        g.imageSmoothingEnabled = smooth;
      }
      g.setTransform(k, 0, 0, k, -c.x * k, -c.y * k);   // back to world space
      for (const [col, list] of batches){
        g.fillStyle = col; g.beginPath();
        for (const u of list){ const r = Math.max(u.radius, 2.5 / z); g.rect(u.x - r, u.y - r, r * 2, r * 2); }
        g.fill();
      }
      if (lod) return;
      for (const u of visible){
        if (u.isShip || !(u.hp < u.maxHp || S.selected.has(u.id))) continue;
        const off = G.Defs.units.get(u.type)?.barOffset || 34;
        G.Visuals.bar(g, u.x, u.y - off, 32, u.hp / u.maxHp, u.hp / u.maxHp > 0.45 ? '#5fd16b' : '#e85e55');
      }
    },
    // Everything drawn above units, in world coordinates.
    drawOverlay(g, visible, z, t, inView, lod2d){
      const S = G.State, C = G.CONFIG, T = C.TILE;
      // Hostile entry points on the map's edge: red chevrons pointing into the map.
      if (S.expedition && G.CaveView.cave < 0) for (const e of G.Expedition.entries()){
        if (!inView(e.x, e.y, 200)) continue;
        const pulse = 0.55 + 0.35 * Math.sin(t * 3), px = -e.ny, py = e.nx;
        g.save(); g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = `rgba(255,80,64,${pulse.toFixed(3)})`;
        for (let k = 0; k < 3; k++){
          const d = 20 + k * 34, cx = e.x + e.nx * d, cy = e.y + e.ny * d;
          g.beginPath(); g.moveTo(cx + px * 30 - e.nx * 18, cy + py * 30 - e.ny * 18); g.lineTo(cx, cy); g.lineTo(cx - px * 30 - e.nx * 18, cy - py * 30 - e.ny * 18); g.stroke();
        }
        g.restore();
      }
      // Treetops over the units under them, then falling trees, dust and sawdust (Genesis).
      if (G.CaveView.cave < 0) G.TreeArt.drawOverUnits(g, G.CaveView.terrainGrid(), visible, t, z);
      for (const u of visible){ const p = u.command === 'gather' && G.Gather.chopTarget(u) >= 0 && G.Visuals.laserTarget(u); if (p) G.TreeFX.saw(p.x, p.y); }
      G.TreeFX.draw(g, z);
      const sel = visible.filter(u => S.selected.has(u.id) && !u.isShip);
      if (sel.length){
        g.fillStyle = 'rgba(115,190,255,.025)'; g.strokeStyle = 'rgba(145,210,255,.12)'; g.lineWidth = 1 / z;
        g.beginPath(); for (const u of sel) if (u.range > 0){ g.moveTo(u.x + u.range, u.y); g.arc(u.x, u.y, u.range, 0, TAU); } g.fill(); g.stroke();
        g.strokeStyle = '#fff6a5'; g.lineWidth = 2 / z;
        g.beginPath(); for (const u of sel){ const r = u.radius + 8; g.moveTo(u.x + r, u.y); g.arc(u.x, u.y, r, 0, TAU); } g.stroke();
      }
      for (const u of visible) if (u.isShip) G.Visuals.bar(g, u.x, u.gy * T - 15, u.w * T * 0.72, u.hp / u.maxHp, '#6fd27a');
      // Spider cargo gauges (the atlas art shows an empty hold).
      if (!lod2d) for (const u of visible) if (u.cargo && u.cargoCapacity && z >= this.unitLodZoom()){
        const f = Math.min(1, G.Units.cargoTotal(u) / u.cargoCapacity);
        if (f > 0){ g.fillStyle = '#213039'; g.fillRect(u.x - 12, u.y + 22, 24, 3); g.fillStyle = '#e5bf65'; g.fillRect(u.x - 12, u.y + 22, 24 * f, 3); }
      }
      for (const u of sel){
        if (u.command === 'follow'){
          const tu = G.Units.alive(u.followId);
          if (tu){ g.strokeStyle = 'rgba(112,227,221,.75)'; g.lineWidth = 1.5 / z; g.setLineDash([4 / z, 6 / z]); g.beginPath(); g.moveTo(u.x, u.y); g.lineTo(tu.x, tu.y); g.stroke(); g.setLineDash([]);
            g.beginPath(); g.arc(tu.x, tu.y, tu.radius + 12, 0, TAU); g.stroke(); }
        }
        if (u.path.length){
          g.strokeStyle = '#f1df73'; g.lineWidth = 1.5 / z; g.setLineDash([10 / z, 8 / z]); g.beginPath(); g.moveTo(u.x, u.y);
          for (let i = u.pathIndex; i < u.path.length; i++) g.lineTo(u.path[i].x, u.path[i].y);
          g.stroke(); g.setLineDash([]);
        }
        if (!u.isHero && u.command && u.command !== 'idle'){
          g.fillStyle = '#fff2a8'; g.font = (11 / z) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(u.command.toUpperCase(), u.x, u.y - 40);
        }
      }
      // Rally points: a flag for every building that produces units (red for spawners,
      // blue for the ship and Fabricators), and a dashed line from the one whose window is
      // open.
      const flag = (r, from, open, color, line) => {
        if (open){
          g.strokeStyle = line; g.lineWidth = 2 / z; g.setLineDash([8 / z, 6 / z]);
          g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(r.x, r.y); g.stroke(); g.setLineDash([]);
          g.beginPath(); g.arc(from.x, from.y, 10, 0, TAU); g.stroke();
        }
        const k = Math.max(1, 1 / z) * (open ? 1.2 : 1);
        g.strokeStyle = '#1b1f22'; g.lineWidth = 3 * k; g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x, r.y - 34 * k); g.stroke();
        g.fillStyle = color; g.beginPath(); g.moveTo(r.x, r.y - 34 * k); g.lineTo(r.x + 22 * k, r.y - 27 * k); g.lineTo(r.x, r.y - 20 * k); g.closePath(); g.fill();
        g.globalAlpha = 0.35; g.beginPath(); g.ellipse(r.x, r.y, 12 * k, 5 * k, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
      };
      for (const b of S.buildings){
        if (b.hp <= 0) continue;
        const s = b.spawner;
        if (s && s.rally && s.hold && b.type !== 'cave_nest') flag(s.rally, G.SpawnerUI.buildingId === b.id ? G.Spawner.spawnPoint(b) : b, G.SpawnerUI.buildingId === b.id, '#e0685f', 'rgba(255,120,100,.8)');
        if (b.fabQueue && b.rally) flag(b.rally, b, G.ExpeditionUI.fabOwnerId === b.id, '#5fb7e0', 'rgba(110,190,240,.85)');
      }
      const ship = G.Units.ship();
      if (ship && ship.rally) flag(ship.rally, ship, G.ExpeditionUI.fabOwnerId === ship.id, '#5fb7e0', 'rgba(110,190,240,.85)');
      G.Visuals.lasers(g, visible, t);
      if (S.shots.length){
        g.lineWidth = 2 / z;
        for (const [team, col] of [['blue', '#b9e2ff'], ['red', '#ffb08b']]){
          g.strokeStyle = col; g.beginPath();
          for (const s of S.shots) if (!s.kind && (s.team === 'blue') === (team === 'blue') && inView(s.x1, s.y1, 700) && (s.team === 'blue' || G.Fog.visibleAt(s.x1, s.y1))){ g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); }
          g.stroke();
        }
        // Heavy cannon shells and missiles: a thick trail and a blast at the target.
        for (const s of S.shots){
          if (!s.kind || !inView(s.x2, s.y2, 700)) continue;
          if (s.kind === 'laser'){
            // Laser: a cyan beam with a white core from the rifle's emitter, fading with its
            // life, and a spark at the target.
            const a = G.clamp(s.life / 0.18, 0, 1), from = s.from && G.Buildings.get(s.from);
            if (from){
              const m = G.PixelArt.muzzle(from), aim = G.Turrets.get(from).aim;
              const o = m || { x: from.x + Math.cos(aim) * 22, y: from.y + Math.sin(aim) * 22 };   // classic art: the barrel's end
              s.x1 = o.x; s.y1 = o.y;
            }
            g.strokeStyle = `rgba(54,184,239,${0.55 * a})`; g.lineWidth = 7 / z; g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke();
            g.strokeStyle = `rgba(230,252,255,${a})`; g.lineWidth = 2.5 / z; g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke();
            g.fillStyle = `rgba(174,244,255,${0.5 * a})`; g.beginPath(); g.arc(s.x2, s.y2, 14, 0, TAU); g.fill();
            continue;
          }
          const missile = s.kind === 'missile';
          g.strokeStyle = missile ? '#ffc27a' : '#fff0b0'; g.lineWidth = (missile ? 3 : 5) / z;
          g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke();
          g.fillStyle = missile ? 'rgba(255,140,60,.45)' : 'rgba(255,230,160,.45)';
          g.beginPath(); g.arc(s.x2, s.y2, missile ? 70 : 40, 0, TAU); g.fill();
        }
      }
      if (S.buildMode && S.buildMode.active && S.buildMode.key) this.drawBuildGrid(g, z);
      if (S.buildPreview){
        const bp = S.buildPreview, d = G.Defs.buildables.get(bp.key) || { w: 1, h: 1, cost: {} }, builder = !!G.Construction.builder(S.buildMode.builderId);
        const cell = (o, ok) => {
          const x = G.Buildings.fx(o) * T, y = G.Buildings.fy(o) * T;
          g.fillStyle = ok ? 'rgba(125,220,130,.30)' : 'rgba(230,90,80,.32)'; g.strokeStyle = ok ? '#8de295' : '#ee6b62'; g.lineWidth = 2 / z;
          g.fillRect(x, y, T * d.w, T * d.h); g.strokeRect(x, y, T * d.w, T * d.h);
        };
        if (bp.cells){
          // A row of walls: green where it will be built, red where blocked or beyond the resources.
          for (const c of bp.cells) cell({ ...c, w: d.w, h: d.h }, c.afford && builder);
          const n = bp.cells.filter(c => c.afford).length, last = bp.cells[bp.cells.length - 1];
          const cost = G.Economy.describe(Object.fromEntries(Object.entries(d.cost).map(([k, v]) => [k, v * n])));
          g.font = `bold ${12 / z}px sans-serif`; g.textAlign = 'center';
          const label = `${n} × ${d.name}${n ? ' · ' + cost : ''}`, lx = (G.Buildings.fx(last) + d.w / 2) * T, ly = G.Buildings.fy(last) * T - 8 / z, w = g.measureText(label).width + 12 / z;
          g.fillStyle = 'rgba(10,16,12,.8)'; g.fillRect(lx - w / 2, ly - 14 / z, w, 18 / z);
          g.fillStyle = n ? '#dff5c8' : '#ffb3a8'; g.fillText(label, lx, ly);
        } else cell({ ...bp, w: d.w, h: d.h }, G.Buildings.canPlaceKey(bp.key, bp.gx, bp.gy, bp.sx || 0, bp.sy || 0) && builder && G.Economy.canAfford(d.cost));
      }
      if (S.formationPreview){
        const fp = S.formationPreview;
        g.strokeStyle = '#ffe67b'; g.fillStyle = 'rgba(255,230,123,.16)'; g.lineWidth = 2 / z;
        g.beginPath(); g.arc(fp.x, fp.y, 10 / z, 0, TAU); g.stroke();
        g.setLineDash([8 / z, 6 / z]); g.beginPath(); g.moveTo(fp.x, fp.y); g.lineTo(fp.handleX, fp.handleY); g.stroke(); g.setLineDash([]);
        fp.slots.forEach((q, i) => {
          g.fillStyle = 'rgba(255,230,123,.16)'; g.beginPath(); g.arc(q.x, q.y, 14, 0, TAU); g.fill(); g.stroke();
          g.fillStyle = '#fff4b0'; g.font = (9 / z) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), q.x, q.y + 3 / z);
        });
      }
    },
    // The building grid while a structure is picked for placing, over the whole view: tile
    // lines, the quarter-tile cells inside them (when zoomed in enough to see them), ground
    // nothing can be built on (cliffs, water, trees) shaded red, and the footprint of every
    // structure and site, so it is clear which cells each one takes.
    drawBuildGrid(g, z){
      const S = G.State, grid = S.grid, T = G.CONFIG.TILE, K = G.Buildings.SUB, c = S.camera;
      if (z < 0.3) return;
      const x0 = Math.max(0, Math.floor(c.x / T)), y0 = Math.max(0, Math.floor(c.y / T));
      const x1 = Math.min(grid.cols, Math.ceil((c.x + this.w / z) / T)), y1 = Math.min(grid.rows, Math.ceil((c.y + this.h / z) / T));
      g.save();
      g.fillStyle = 'rgba(220,60,50,.3)';
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!grid.terrainPassable(x, y)) g.fillRect(x * T, y * T, T, T);
      const lines = (step, style) => {
        g.strokeStyle = style; g.lineWidth = 1 / z; g.beginPath();
        for (let x = x0 * T; x <= x1 * T; x += step){ g.moveTo(x, y0 * T); g.lineTo(x, y1 * T); }
        for (let y = y0 * T; y <= y1 * T; y += step){ g.moveTo(x0 * T, y); g.lineTo(x1 * T, y); }
        g.stroke();
      };
      if (T / K * z >= 5) lines(T / K, 'rgba(230,240,225,.13)');
      lines(T, 'rgba(230,240,225,.3)');
      // Footprints of what is already there.
      g.strokeStyle = 'rgba(255,236,150,.55)'; g.lineWidth = 1.5 / z; g.setLineDash([4 / z, 3 / z]); g.beginPath();
      for (const o of [...S.buildings, ...S.constructionSites]){
        const x = G.Buildings.fx(o) * T, y = G.Buildings.fy(o) * T;
        if (x + o.w * T < x0 * T || y + o.h * T < y0 * T || x > x1 * T || y > y1 * T) continue;
        g.rect(x, y, o.w * T, o.h * T);
      }
      g.stroke(); g.setLineDash([]);
      g.restore();
    },
    drawMinimap(){
      const m = this.mini, S = G.State, C = G.CONFIG;
      if (!m || !S.grid) return;
      if (!this.miniBase){ this.miniBase = document.createElement('canvas'); }
      const base = this.miniBase, W = base.width = m.width, H = base.height = m.height;
      const g = base.getContext('2d'), sx = W / C.WORLD_W, sy = H / C.WORLD_H;
      g.drawImage(G.TerrainCache.getOverview(), 0, 0, W, H);
      for (const n of S.resourceNodes) if (n.remaining > 0){ g.fillStyle = G.Gather.isDeposit(n) ? G.Gather.def(n).ore || '#c9d4dc' : '#d0a65b'; g.fillRect(n.x * sx - 1, n.y * sy - 1, 3, 3); }
      for (const b of S.buildings){ if (G.Caves.layer(b) >= 0) continue; g.fillStyle = '#adb5ad'; g.fillRect(b.x * sx - 1, b.y * sy - 1, 3, 3); }   // (not underground)
      for (const s of S.constructionSites){ g.fillStyle = '#d4b96b'; g.fillRect(s.x * sx - 1, s.y * sy - 1, 3, 3); }
      // Where hostile waves enter the map: red wedges on the edge, pointing in.
      if (S.expedition) for (const e of G.Expedition.entries()){
        const x = e.x * sx, y = e.y * sy;
        g.fillStyle = '#ff5a4a'; g.beginPath();
        g.moveTo(x + e.nx * 7, y + e.ny * 7); g.lineTo(x - e.ny * 5, y + e.nx * 5); g.lineTo(x + e.ny * 5, y - e.nx * 5); g.fill();
      }
      if (G.Fog.enabled && G.Fog.canvas){ G.Fog.update(); g.imageSmoothingEnabled = true; g.drawImage(G.Fog.canvas, 0, 0, W, H); }
      // Ordinary units batched per team; ship and Vance on top.
      const byTeam = new Map();
      for (const u of S.units){
        if (u.isShip || u.isHero || !G.Fog.canSee(u) || G.Caves.layer(u) >= 0) continue;   // (not those underground)
        const col = C.COLORS[u.team] || '#ccc';
        let list = byTeam.get(col);
        if (!list) byTeam.set(col, list = []);
        list.push(u);
      }
      for (const [col, list] of byTeam){
        g.fillStyle = col; g.beginPath();
        for (const v of list) g.rect(v.x * sx - 1.5, v.y * sy - 1.5, 3, 3);
        g.fill();
      }
      for (const u of S.units){
        if (!u.isShip && !u.isHero) continue;
        const sz = u.isShip ? 7 : 5;
        g.fillStyle = u.isShip ? '#d5e1e5' : C.COLORS[u.team] || '#ccc';
        g.fillRect(u.x * sx - sz / 2, u.y * sy - sz / 2, sz, sz);
      }
      this.drawMinimapCamera();
    },
    // Between full redraws only the camera rectangle moves.
    drawMinimapCamera(){
      const m = this.mini, S = G.State, C = G.CONFIG;
      if (!m || !this.miniBase) return;
      const g = m.getContext('2d'), c = S.camera;
      g.drawImage(this.miniBase, 0, 0);
      g.strokeStyle = '#fff'; g.lineWidth = 1;
      g.strokeRect(c.x / C.WORLD_W * m.width, c.y / C.WORLD_H * m.height, (this.w / c.z) / C.WORLD_W * m.width, (this.h / c.z) / C.WORLD_H * m.height);
    }
  };
})();
