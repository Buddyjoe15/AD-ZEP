/* Tree effects (Genesis maps): a felled tree falling away from the saw or blast and landing
   in a cloud of dust, sawdust from a working Salvage Crawler, splinters when a stump or
   fallen tree is cleared, and dust and a scorch mark where anything explodes (any map).
   Falling trees and dust are drawn above units; scorch marks are drawn into the terrain
   chunks, under the trees. Driven by the simulation's 'tree:changed' and 'blast' events and
   timed by game time, so they pause with the game. Presentation only: nothing here is saved,
   and scorch marks last for the session. */
(function(){
  'use strict';
  const G = GW, TAU = Math.PI * 2;
  const FALL = 1.3, SETTLE = 0.9, MAX_DUST = 1500, MAX_SCORCH = 400;
  // How tall each species stands, in crown diameters: how far its crown lands from the stump.
  const HEIGHT = { spruce: 2.8, pine: 2.5, birch: 2.3, maple: 1.9, snag: 2.4 };
  const DUST = ['#9e896b', '#b09c7e', '#8e7a5e'], SAWDUST = ['#e1bd76', '#b09c7e', '#c98a2e'], SMOKE = ['#433a33', '#5e4f3d', '#231f1c'], FIRE = ['#f2c66a', '#c98a2e', '#ffffff'];
  const now = () => G.State.time;

  const FX = G.TreeFX = {
    falls: [], dust: [], scorch: [],
    reset(){ this.falls = []; this.dust = []; this.scorch = []; },
    // `n` particles around (x, y): drifting outward at up to `speed` world px/s, `size` px.
    puff(x, y, n, spread, speed, size, cols, life = 1.1){
      const t = now();
      for (let i = 0; i < n && this.dust.length < MAX_DUST; i++){
        const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7), d = Math.random() * spread;
        this.dust.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: size * (0.6 + Math.random() * 0.6), t0: t, life: life * (0.6 + Math.random() * 0.6), col: cols[i % cols.length] });
      }
    },
    // Sawdust thrown up where a Crawler's saw is cutting.
    saw(x, y){ if (Math.random() < 0.5) this.puff(x, y, 1, 3, 26, 1.5, SAWDUST, 0.6); },
    // Scorch marks overlapping a terrain chunk at world px (ox, oy), `size` across, drawn into it.
    paintScorch(ctx, ox, oy, size){
      if (!this.scorch.length) return;
      ctx.save(); ctx.translate(-ox, -oy);
      for (const s of this.scorch){
        if (s.x + s.r < ox || s.y + s.r < oy || s.x - s.r > ox + size || s.y - s.r > oy + size) continue;
        // Blotchy, in whole world px, darkest in the middle.
        for (let y = -s.r; y <= s.r; y += 2) for (let x = -s.r; x <= s.r; x += 2){
          const d = Math.hypot(x, y) / s.r;
          if (d > 1) continue;
          const h = G.hashRandom3(s.seed, x + 1000, y + 1000);
          if (h > 1.15 - d) continue;
          ctx.fillStyle = h < 0.08 ? 'rgba(67,58,51,.8)' : `rgba(24,20,17,${(0.62 - d * 0.4).toFixed(2)})`;
          ctx.fillRect(s.x + x, s.y + y, 2, 2);
        }
      }
      ctx.restore();
    },
    // Falling trees and dust, above units. `g` is in world coordinates.
    draw(g, z){
      const t = now();
      if (this.falls.length){
        this.falls = this.falls.filter(f => {
          const age = t - f.t0, p = Math.min(1, age / FALL);
          if (age >= FALL && !f.landed){
            f.landed = true;
            // Dust along the trunk and around the crown where it hits the ground.
            for (let s = 0.2; s <= 1; s += 0.2) this.puff(f.x + f.dx * f.H * s, f.y + f.dy * f.H * s, 3, 5, 22, 2.5, DUST);
            this.puff(f.x + f.dx * f.H, f.y + f.dy * f.H, 14, f.crown * 0.4, 40, 3, DUST, 1.4);
          }
          const alpha = age < FALL ? 1 : 1 - (age - FALL) / SETTLE;
          if (alpha <= 0) return false;
          // Top down, the crown swings out from above the stump to the ground, faster and
          // faster, and the trunk comes into view behind it.
          const off = f.H * Math.sin(Math.PI / 2 * p * p), cx = f.x + f.dx * off, cy = f.y + f.dy * off;
          g.save(); g.globalAlpha = alpha; g.lineCap = 'round';
          g.strokeStyle = '#5e4f3d'; g.lineWidth = f.w; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(cx, cy); g.stroke();
          g.strokeStyle = '#8e7a5e'; g.lineWidth = Math.max(1, f.w * 0.35); g.beginPath(); g.moveTo(f.x - f.w * 0.2, f.y - f.w * 0.2); g.lineTo(cx - f.w * 0.2, cy - f.w * 0.2); g.stroke();
          g.restore();
          G.TreeArt.drawCrown(g, f.kind, f.size, f.variant, cx, cy, alpha);
          return true;
        });
      }
      if (this.dust.length){
        this.dust = this.dust.filter(d => t - d.t0 < d.life && t >= d.t0);
        for (const d of this.dust){
          const age = t - d.t0, k = 1 - Math.exp(-2.5 * age), x = d.x + d.vx * k / 2.5, y = d.y + d.vy * k / 2.5, r = d.r * (1 + age), a = (1 - age / d.life) * 0.75;
          g.globalAlpha = a; g.fillStyle = d.col; g.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), Math.max(1, Math.round(r)), Math.max(1, Math.round(r)));
        }
        g.globalAlpha = 1;
      }
    }
  };

  G.Events.on('world:created', () => FX.reset());
  // A tree felled: it falls away from whatever brought it down. Dead wood cleared: splinters.
  G.Events.on('tree:changed', e => {
    if (G.TREES.KINDS.includes(e.was) && e.now !== e.was){
      let dx = e.from ? e.x - e.from.x : 0, dy = e.from ? e.y - e.from.y : 0, l = Math.hypot(dx, dy);
      if (l < 4){ const a = G.hashRandom3(e.x, e.y, 5) * TAU; dx = Math.cos(a); dy = Math.sin(a); l = 1; }
      const crown = G.TREES.species[e.was].crown[e.size];
      FX.falls.push({ x: e.x, y: e.y, dx: dx / l, dy: dy / l, kind: e.was, size: e.size, variant: e.variant, crown, H: crown * (HEIGHT[e.was] || 2.3), w: 2 + e.size * 1.5, t0: now() });
      FX.puff(e.x, e.y, 6, 4, 18, 2, e.how === 'cut' ? SAWDUST : DUST);
    } else FX.puff(e.x, e.y, 12, 8, 30, 2, e.how === 'cut' ? SAWDUST : DUST);
  });
  // An explosion: smoke and dust, and a scorch mark burnt into the ground.
  G.Events.on('blast', e => {
    FX.puff(e.x, e.y, 16, e.r * 0.2, e.r * 1.6, 3, FIRE, 0.35);
    FX.puff(e.x, e.y, 44, e.r * 0.35, e.r * 1.1, 5, SMOKE, 2);
    FX.puff(e.x, e.y, 20, e.r * 0.5, e.r * 0.8, 3, DUST, 1.4);
    FX.scorch.push({ x: Math.round(e.x), y: Math.round(e.y), r: Math.max(10, Math.round(e.r * 0.55)), seed: FX.scorch.length * 7919 + Math.round(e.x) });
    if (FX.scorch.length > MAX_SCORCH) FX.scorch.shift();
    const T = G.CONFIG.TILE, r = Math.ceil(e.r / T) + 1;
    if (G.TerrainCache && G.TerrainCache.grid) G.TerrainCache.invalidate({ x: Math.floor(e.x / T) - r, y: Math.floor(e.y / T) - r, w: 2 * r, h: 2 * r });
  });
})();
