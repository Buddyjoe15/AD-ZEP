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
      g.save(); g.scale(z, z); g.translate(-c.x, -c.y);

      // Terrain: overview image underneath, detailed chunks on top when close enough.
      const TC = G.TerrainCache, ct = C.CHUNK_TILES * T;
      const cx0 = Math.max(0, Math.floor(v.x0 / ct)), cy0 = Math.max(0, Math.floor(v.y0 / ct));
      const cx1 = Math.min(Math.ceil(C.WORLD_W / ct) - 1, Math.floor(v.x1 / ct)), cy1 = Math.min(Math.ceil(C.WORLD_H / ct) - 1, Math.floor(v.y1 / ct));
      const far = z < C.LOD_ZOOM || (cx1 - cx0 + 1) * (cy1 - cy0 + 1) > C.CHUNK_CACHE_MAX;
      g.imageSmoothingEnabled = false; g.drawImage(TC.getOverview(), 0, 0, C.WORLD_W, C.WORLD_H); g.imageSmoothingEnabled = true;
      let chunks = 0;
      if (!far){
        let built = 0;
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++){
          if (!TC.has(cx, cy)){ if (built >= C.CHUNKS_BUILT_PER_FRAME) continue; built++; }
          g.drawImage(TC.chunk(cx, cy), cx * ct, cy * ct); chunks++;
        }
      }

      // Resource nodes.
      for (const n of S.resourceNodes){
        if (n.remaining <= 0 || !inView(n.x, n.y, 30)) continue;
        if (G.Gather.isDeposit(n)){
          // 1×1 mine deposit (hidden under its Mine Building once built).
          if (G.Gather.mineOn(n)) continue;
          const px = n.gx * T, py = n.gy * T;
          g.fillStyle = '#3f3a33'; g.fillRect(px + 1, py + 1, T - 2, T - 2);
          g.fillStyle = '#6f6453'; g.beginPath(); g.moveTo(px + 6, py + T - 8); g.lineTo(px + 16, py + 10); g.lineTo(px + 28, py + 20); g.lineTo(px + 40, py + 8); g.lineTo(px + T - 5, py + T - 6); g.closePath(); g.fill();
          g.fillStyle = '#c9d4dc';
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
        if (!inView(ctn.x, ctn.y, 48)) continue;
        if (ctn.type === 'ground_item'){
          if (!ctn.items.length) continue;
          g.fillStyle = '#87d5e3'; g.fillRect(ctn.x - 7, ctn.y - 7, 14, 14);
          if (!far){ g.fillStyle = '#0b1820'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(G.initials(G.Items.name(ctn.items[0])), ctn.x, ctn.y + 0.5); g.textBaseline = 'alphabetic'; }
          continue;
        }
        const px = ctn.gx * T, py = ctn.gy * T;
        g.fillStyle = ctn.opened ? '#79552f' : '#d3a92e';
        if (far){ g.fillRect(ctn.x - 12, ctn.y - 12, 24, 24); continue; }
        g.strokeStyle = '#2b2115'; g.lineWidth = 2 / z; g.fillRect(px + 3, py + 5, T - 6, T - 10); g.strokeRect(px + 3, py + 5, T - 6, T - 10);
        g.fillStyle = ctn.opened ? '#cda96d' : '#fff0a0'; g.fillRect(px + T / 2 - 3, py + T / 2 - 4, 6, 10);
      }
      // Construction sites.
      for (const site of S.constructionSites){
        if (!inView(site.x, site.y, site.w * T)) continue;
        const px = site.gx * T, py = site.gy * T, pct = 1 - site.remaining / site.buildTime;
        g.fillStyle = 'rgba(160,160,145,.28)'; g.strokeStyle = '#d4b96b'; g.lineWidth = 2 / z; g.setLineDash([6 / z, 5 / z]);
        g.fillRect(px + 2, py + 2, T * site.w - 4, T * site.h - 4); g.strokeRect(px + 2, py + 2, T * site.w - 4, T * site.h - 4); g.setLineDash([]);
        g.fillStyle = '#111'; g.fillRect(px + 4, py + T * site.h - 8, T * site.w - 8, 5);
        g.fillStyle = '#e0c15b'; g.fillRect(px + 5, py + T * site.h - 7, (T * site.w - 10) * G.clamp(pct, 0, 1), 3);
        g.fillStyle = '#fff0b0'; g.font = (9 / z) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(site.remaining.toFixed(1) + 's', site.x, py - 5);
      }
      // Structures.
      for (const b of S.buildings) if (inView(b.x, b.y, b.w * T)) G.Visuals.drawBuilding(g, b, z, t);
      // Expedition signals.
      const E = S.expedition;
      if (E) for (const p of E.sites){
        if (p.done || !inView(p.x, p.y, 50)) continue;
        g.strokeStyle = p.kind === 'Element P' ? '#c591ff' : '#70e3dd'; g.lineWidth = 2 / z;
        g.beginPath(); g.arc(p.x, p.y, 20, 0, TAU); g.stroke();
        if (p.progress > 0){ g.beginPath(); g.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * p.progress / G.EXPEDITION_RULES.signalStudySeconds); g.stroke(); }
        g.fillStyle = g.strokeStyle; g.font = `${11 / z}px sans-serif`; g.textAlign = 'center'; g.fillText(p.kind, p.x, p.y - 30);
      }

      // Units.
      const visible = [];
      for (const u of S.units) if (inView(u.x, u.y, u.isShip ? 340 : 80)) visible.push(u);
      for (const u of visible){
        const sel = S.selected.has(u.id);
        if (sel && !u.isShip && u.range > 0){
          g.fillStyle = 'rgba(115,190,255,.025)'; g.strokeStyle = 'rgba(145,210,255,.12)'; g.lineWidth = 1 / z;
          g.beginPath(); g.arc(u.x, u.y, u.range, 0, TAU); g.fill(); g.stroke();
        }
        if (sel){ g.strokeStyle = '#fff6a5'; g.lineWidth = 2 / z; g.beginPath(); g.arc(u.x, u.y, u.radius + 8, 0, TAU); g.stroke(); }
      }
      for (const u of visible) G.Visuals.drawUnit(g, u, z, t);
      for (const u of visible){
        const sel = S.selected.has(u.id);
        if (u.isShip){
          const bw = u.w * T * 0.72;
          G.Visuals.bar(g, u.x, u.gy * T - 15, bw, u.hp / u.maxHp, '#6fd27a');
          continue;
        }
        if (u.hp < u.maxHp || sel){
          const off = G.Defs.units.get(u.type)?.barOffset || 34;
          G.Visuals.bar(g, u.x, u.y - off, 32, u.hp / u.maxHp, u.hp / u.maxHp > 0.45 ? '#5fd16b' : '#e85e55');
        }
        if (sel && u.command === 'follow'){
          const t = G.Units.alive(u.followId);
          if (t){ g.strokeStyle = 'rgba(112,227,221,.75)'; g.lineWidth = 1.5 / z; g.setLineDash([4 / z, 6 / z]); g.beginPath(); g.moveTo(u.x, u.y); g.lineTo(t.x, t.y); g.stroke(); g.setLineDash([]);
            g.beginPath(); g.arc(t.x, t.y, t.radius + 12, 0, TAU); g.stroke(); }
        }
        if (sel && u.path.length){
          g.strokeStyle = '#f1df73'; g.lineWidth = 1.5 / z; g.setLineDash([10 / z, 8 / z]); g.beginPath(); g.moveTo(u.x, u.y);
          for (let i = u.pathIndex; i < u.path.length; i++) g.lineTo(u.path[i].x, u.path[i].y);
          g.stroke(); g.setLineDash([]);
        }
        if (sel && !u.isHero && u.command && u.command !== 'idle'){
          g.fillStyle = '#fff2a8'; g.font = (11 / z) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(u.command.toUpperCase(), u.x, u.y - 40);
        }
      }
      G.Visuals.lasers(g, visible, t);
      for (const s of S.shots){ g.strokeStyle = s.team === 'blue' ? '#b9e2ff' : '#ffb08b'; g.lineWidth = 2 / z; g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke(); }

      // Placement and formation previews.
      if (S.buildPreview){
        const bp = S.buildPreview, d = G.Defs.buildables.get(bp.key) || { w: 1, h: 1, cost: {} };
        const ok = G.Buildings.canPlaceKey(bp.key, bp.gx, bp.gy) && !!G.Construction.builder(S.buildMode.builderId) && G.Economy.canAfford(d.cost);
        g.fillStyle = ok ? 'rgba(125,220,130,.30)' : 'rgba(230,90,80,.32)'; g.strokeStyle = ok ? '#8de295' : '#ee6b62'; g.lineWidth = 2 / z;
        g.fillRect(bp.gx * T, bp.gy * T, T * d.w, T * d.h); g.strokeRect(bp.gx * T, bp.gy * T, T * d.w, T * d.h);
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
      g.restore();

      const box = G.Input && G.Input.box;
      if (box){
        const x = Math.min(box.x0, box.x1), y = Math.min(box.y0, box.y1), w = Math.abs(box.x1 - box.x0), h = Math.abs(box.y1 - box.y0);
        g.fillStyle = 'rgba(80,170,255,.12)'; g.fillRect(x, y, w, h); g.strokeStyle = '#7dc0ff'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w, h);
      }
      Object.assign(S.metrics, { lod: far ? 'overview' : 'detail', cached: TC.chunks.size, visible: visible.length, chunks, drawMs: now() - t0 });
      if (now() - this.minimapAt > 1000 / C.MINIMAP_HZ){ this.minimapAt = now(); this.drawMinimap(); }
      else this.drawMinimapCamera();
    },
    drawMinimap(){
      const m = this.mini, S = G.State, C = G.CONFIG;
      if (!m || !S.grid) return;
      if (!this.miniBase){ this.miniBase = document.createElement('canvas'); }
      const base = this.miniBase, W = base.width = m.width, H = base.height = m.height;
      const g = base.getContext('2d'), sx = W / C.WORLD_W, sy = H / C.WORLD_H;
      g.drawImage(G.TerrainCache.getOverview(), 0, 0, W, H);
      for (const n of S.resourceNodes) if (n.remaining > 0){ g.fillStyle = G.Gather.isDeposit(n) ? '#c9d4dc' : '#d0a65b'; g.fillRect(n.x * sx - 1, n.y * sy - 1, 3, 3); }
      for (const b of S.buildings){ g.fillStyle = '#adb5ad'; g.fillRect(b.x * sx - 1, b.y * sy - 1, 3, 3); }
      for (const s of S.constructionSites){ g.fillStyle = '#d4b96b'; g.fillRect(s.x * sx - 1, s.y * sy - 1, 3, 3); }
      for (const u of S.units){
        const sz = u.isShip ? 7 : u.isHero ? 5 : 3;
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
