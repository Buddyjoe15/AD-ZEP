/* Canvas art for units and structures, keyed by the `visual` field of a definition.
   Drawing reads simulation state and never changes it. Content without dedicated art
   uses the generic fallbacks, so new units and buildings are visible immediately. */
(function(){
  'use strict';
  const G = GW;
  const TAU = Math.PI * 2;

  G.Visuals = {
    units: {},
    buildings: {},
    // Animation frames baked into the GPU sprite atlas per visual: frames while idle and
    // while moving, spread over `period` seconds. Visuals not listed get one frame each.
    frames: {
      hero: { idle: 8, move: 8, period: 2 * Math.PI / 3.5 },
      utility: { idle: 1, move: 8, period: 2 * Math.PI / 9 }
    },
    registerUnit(key, fn){ this.units[key] = fn; },
    registerBuilding(key, fn){ this.buildings[key] = fn; },
    // Draws a unit in its local frame (origin at the unit, rotated to its heading unless
    // the visual sets `upright`).
    drawUnit(g, u, z, t){
      const def = G.Defs.units.get(u.type), fn = this.units[def?.visual] || this.units.generic;
      g.save();
      g.translate(u.x, u.y);
      if (!fn.upright) g.rotate(u.heading);
      g.fillStyle = G.CONFIG.COLORS[u.team] || '#ccc';
      fn(g, u, z, t, def);
      g.restore();
    },
    drawBuilding(g, b, z, t){
      if (G.PixelArt.buildingSprite(b.type)) return G.PixelArt.drawBuilding(g, b, z, t);
      const def = G.Defs.buildables.get(b.type);
      const fn = this.buildings[b.type] || (def && def.symbol ? this.buildings.symbol : this.buildings.generic);
      fn(g, b, z, t, def);
    }
  };
  const V = G.Visuals;

  // ---- Units ----
  V.registerUnit('generic', (g, u, z, t, def) => {
    const r = u.radius;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = '#0b1820'; g.lineWidth = 2 / z; g.stroke();
    g.fillStyle = '#0b1820'; g.fillRect(r * 0.3, -2, r * 0.8, 4);
  });

  const hero = (g, u, z, t) => {
    const moving = u.path.length > 0, lift = 13 + Math.sin(t * 3.5 + u.id) * 1.8, pulse = 1 + Math.sin(t * 23) * 0.12;
    g.fillStyle = '#06101855'; g.beginPath(); g.ellipse(0, 5, 23, 9, 0, 0, TAU); g.fill();
    const glow = g.createRadialGradient(0, 1, 0, 0, 1, 28);
    glow.addColorStop(0, '#67dfff55'); glow.addColorStop(1, '#67dfff00');
    g.fillStyle = glow; g.fillRect(-30, -25, 60, 54);
    g.translate(0, -lift);
    for (const x of [-10, 10]){
      const len = (moving ? 26 : 18) * pulse;
      g.fillStyle = '#36b8ef88'; g.beginPath(); g.moveTo(x - 6, -1); g.lineTo(x + 6, -1); g.lineTo(x + 3, len * 0.62); g.lineTo(x, len); g.lineTo(x - 3, len * 0.62); g.closePath(); g.fill();
      g.fillStyle = '#c8ffff'; g.beginPath(); g.moveTo(x - 3, 0); g.lineTo(x + 3, 0); g.lineTo(x, len * 0.65); g.closePath(); g.fill();
    }
    g.strokeStyle = '#172933'; g.lineWidth = 2;
    g.fillStyle = '#263d4a'; g.fillRect(-16, -8, 32, 10); g.fillStyle = '#536f7f'; g.fillRect(-15, -5, 10, 6); g.fillRect(5, -5, 10, 6);
    g.fillStyle = '#a9bec4'; g.beginPath(); g.moveTo(-16, -35); g.lineTo(16, -35); g.lineTo(13, -9); g.lineTo(0, -4); g.lineTo(-13, -9); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#486879'; g.fillRect(-24, -32, 10, 22); g.fillRect(14, -32, 10, 22); g.fillStyle = '#c5d8dc'; g.fillRect(-24, -33, 10, 6); g.fillRect(14, -33, 10, 6);
    g.fillStyle = '#dfebe7'; g.fillRect(-11, -48, 22, 16); g.strokeRect(-11, -48, 22, 16); g.fillStyle = '#16343e'; g.fillRect(-9, -44, 18, 7); g.fillStyle = '#87f4ff'; g.fillRect(-8, -43, 16, 3);
    g.fillStyle = '#e1bd76'; g.fillRect(-8, -29, 16, 12); g.fillStyle = '#1c4458'; g.fillRect(-3, -26, 6, 6);
    g.fillStyle = '#192c37'; g.fillRect(17, -19, 8, 25); g.fillStyle = '#7596a5'; g.fillRect(18, -18, 6, 8); g.fillStyle = '#69e8ff'; g.fillRect(18, 4, 6, 3);
  };
  hero.upright = true;
  V.registerUnit('hero', hero);

  V.registerUnit('utility', (g, u, z, t) => {
    const moving = u.path.length > 0, phase = t * 9 + u.id;
    g.fillStyle = '#07101855'; g.beginPath(); g.ellipse(0, 4, 28, 24, 0, 0, TAU); g.fill();
    g.lineCap = 'round';
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++){
      const hx = -12 + i * 8, hy = side * 7, swing = moving ? Math.sin(phase + i * Math.PI * 0.8 + side) * 5 : Math.sin(t * 1.4 + i) * 0.3;
      const kx = hx + (i - 1.5) * 7 + swing, ky = side * (18 + Math.cos(phase + i) * (moving ? 2 : 0)), fx = hx + (i - 1.5) * 10 + swing, fy = side * 28;
      g.strokeStyle = '#132630'; g.lineWidth = 5; g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
      g.strokeStyle = '#8cabb3'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
      g.fillStyle = '#d7b875'; g.beginPath(); g.arc(kx, ky, 2.5, 0, TAU); g.fill(); g.fillStyle = '#1a3543'; g.beginPath(); g.arc(fx, fy, 3, 0, TAU); g.fill();
    }
    g.fillStyle = '#243e4d'; g.strokeStyle = '#adc4c5'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 0, 19, 12, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#bca372'; g.fillRect(-12, -8, 15, 16); g.fillStyle = '#344d59'; g.fillRect(-9, -5, 9, 10);
    const cargo = Math.min(1, G.Units.cargoTotal(u) / (u.cargoCapacity || 600));
    g.fillStyle = '#213039'; g.fillRect(-12, 5, 23, 3); g.fillStyle = '#e5bf65'; g.fillRect(-12, 5, 23 * cargo, 3);
    g.fillStyle = '#728e9b'; g.fillRect(5, -5, 16, 10); g.fillStyle = '#143646'; g.fillRect(16, -4, 7, 8); g.fillStyle = '#96f5ff'; g.beginPath(); g.arc(21, 0, 3, 0, TAU); g.fill();
  });

  V.registerUnit('scout', (g, u, z) => {
    g.fillStyle = '#4e6975'; g.fillRect(-15, -9, 30, 18);
    g.fillStyle = '#171d1f'; g.fillRect(-18, -12, 7, 9); g.fillRect(11, -12, 7, 9); g.fillRect(-18, 3, 7, 9); g.fillRect(11, 3, 7, 9);
    g.fillStyle = '#7f99a4'; g.fillRect(-8, -7, 16, 10);
    g.fillStyle = '#93e4ff'; g.beginPath(); g.arc(8, 0, 3, 0, TAU); g.fill();
    g.strokeStyle = '#bcc7c8'; g.lineWidth = 2 / z; g.beginPath(); g.moveTo(-6, -7); g.lineTo(-10, -17); g.stroke();
  });

  V.registerUnit('rifle', (g, u) => {
    const hostile = u.team !== 'blue';
    g.fillStyle = hostile ? '#835450' : '#5f7583'; g.fillRect(-8, -10, 16, 18);
    g.fillStyle = '#263036'; g.fillRect(-9, 7, 6, 9); g.fillRect(3, 7, 6, 9);
    g.fillStyle = hostile ? '#ff8a7a' : '#87d8ff'; g.fillRect(-3, -13, 6, 4);
    g.fillStyle = '#1e2528'; g.fillRect(5, -3, 17, 5);
    g.fillStyle = hostile ? '#b08a86' : '#8ca2ac'; g.fillRect(-12, -4, 5, 10);
  });

  // The ship draws in world space (its footprint is grid-aligned).
  const ship = (g, u, z) => {
    const T = G.CONFIG.TILE, px = u.gx * T - u.x, py = u.gy * T - u.y, ww = u.w * T, hh = u.h * T;
    g.fillStyle = '#4d5559'; g.strokeStyle = '#aab6bc'; g.lineWidth = 3 / z; g.fillRect(px, py, ww, hh); g.strokeRect(px, py, ww, hh);
    g.fillStyle = '#2e383d'; g.fillRect(px + 18, py + 18, ww - 36, hh - 36);
    g.fillStyle = '#87969d'; g.fillRect(px + ww * 0.36, py + 18, ww * 0.28, hh * 0.42);
    g.fillStyle = '#c6d7df'; g.fillRect(px + ww * 0.44, py + hh * 0.76, ww * 0.12, hh * 0.16);
    g.fillStyle = '#252d31'; g.fillRect(px + 14, py + hh * 0.42, ww - 28, hh * 0.12);
    if (u.fabQueue && u.fabQueue.length){
      const q = u.fabQueue[0], r = G.Defs.recipes.get(q.recipe), pct = r ? 1 - q.left / r.time : 0;
      g.fillStyle = '#111'; g.fillRect(px + 20, py + hh - 14, ww - 40, 6);
      g.fillStyle = '#e0c15b'; g.fillRect(px + 21, py + hh - 13, (ww - 42) * G.clamp(pct, 0, 1), 4);
    }
  };
  ship.upright = true;
  V.registerUnit('ship', ship);

  // ---- Structures (world space) ----
  const bar = (g, x, y, w, pct, col = '#71c87a') => {
    g.fillStyle = '#111'; g.fillRect(x - w / 2, y, w, 4);
    g.fillStyle = col; g.fillRect(x - w / 2 + 1, y + 1, (w - 2) * G.clamp(pct, 0, 1), 2);
  };
  V.bar = bar;

  V.registerBuilding('wall', (g, b, z) => {
    const T = G.CONFIG.TILE, px = b.gx * T, py = b.gy * T;
    g.fillStyle = '#626963'; g.strokeStyle = '#272d29'; g.lineWidth = 2 / z;
    g.fillRect(px + 2, py + 5, T - 4, T - 10); g.strokeRect(px + 2, py + 5, T - 4, T - 10);
    g.fillStyle = '#7b837c'; for (let i = 0; i < 3; i++) g.fillRect(px + 5 + i * 14, py + 8, 10, T - 16);
    if (G.State.selected.size){ g.strokeStyle = 'rgba(120,200,255,.10)'; g.lineWidth = 1 / z; g.beginPath(); g.arc(b.x, b.y, T, 0, TAU); g.stroke(); }
    bar(g, b.x, py + 2, 38, b.hp / b.maxHp);
  });

  V.registerBuilding('symbol', (g, b, z, t, def) => {
    const T = G.CONFIG.TILE, w = b.w * T - 8, h = b.h * T - 8;
    g.fillStyle = def.color; g.fillRect(b.x - w / 2, b.y - h / 2, w, h);
    g.strokeStyle = '#0b1820'; g.lineWidth = 2 / z; g.strokeRect(b.x - w / 2, b.y - h / 2, w, h);
    g.fillStyle = '#0b1820'; g.font = `bold ${def.symbol.length > 1 ? 22 : 30}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(def.symbol, b.x, b.y + 1); g.textBaseline = 'alphabetic';
    if (b.fabQueue && b.fabQueue.length){
      const q = b.fabQueue[0], r = G.Defs.recipes.get(q.recipe);
      g.fillStyle = '#111'; g.fillRect(b.x - w / 2 + 4, b.y + h / 2 - 9, w - 8, 5);
      g.fillStyle = '#e0c15b'; g.fillRect(b.x - w / 2 + 5, b.y + h / 2 - 8, (w - 10) * (r ? G.clamp(1 - q.left / r.time, 0, 1) : 0), 3);
    }
    if (b.hp < b.maxHp) bar(g, b.x, b.y - h / 2 - 7, w * 0.8, b.hp / b.maxHp);
  });

  // Resource Extractor: 3×3 headframe over the deposit, with a turning wheel while it
  // extracts and a stockpile gauge. Its wheel and label follow the material underneath.
  V.registerBuilding('mine_building', (g, b, z, t, def) => {
    const T = G.CONFIG.TILE, px = b.gx * T, py = b.gy * T, w = b.w * T, h = b.h * T;
    const cap = (def.behaviors.find(x => x.type === 'extractor') || {}).stockCap || 300;
    const stock = G.Gather.stockTotal(b), full = stock >= cap - 0.01, working = !!b.nodeId && !full;
    const nd = G.Gather.def(G.Gather.node(b.nodeId)), res = nd && G.Defs.resources.get(nd.resource), ore = nd?.ore || '#e1cf9b';
    g.fillStyle = '#5a5143'; g.strokeStyle = '#1f1b16'; g.lineWidth = 2 / z;
    g.fillRect(px + 3, py + 3, w - 6, h - 6); g.strokeRect(px + 3, py + 3, w - 6, h - 6);
    g.fillStyle = '#7b6f5a'; g.fillRect(px + 10, py + 10, w - 20, h - 20);
    g.strokeStyle = '#b8a16a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(px + 18, py + h - 18); g.lineTo(b.x, py + 18); g.lineTo(px + w - 18, py + h - 18); g.stroke();
    const a = working ? t * 2.4 : 0;
    g.save(); g.translate(b.x, b.y - 6); g.rotate(a);
    g.strokeStyle = ore; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.stroke();
    for (let i = 0; i < 4; i++){ g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(-18, 0); g.lineTo(18, 0); g.stroke(); }
    g.restore();
    const label = res ? res.name.toUpperCase() : 'NO ORE';
    g.fillStyle = '#26221c'; g.fillRect(b.x - 26, py + h - 28, 52, 14);
    g.fillStyle = res ? ore : '#f2e6c4'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText(label, b.x, py + h - 17);
    bar(g, b.x, py + h - 9, w - 24, stock / cap, full ? '#e0c15b' : ore);
    if (b.hp < b.maxHp) bar(g, b.x, py - 6, w * 0.8, b.hp / b.maxHp);
  });

  V.registerBuilding('generic', (g, b, z, t, def) => {
    const T = G.CONFIG.TILE, px = b.gx * T, py = b.gy * T;
    g.fillStyle = def?.color || '#8a948d'; g.strokeStyle = '#1b2320'; g.lineWidth = 2 / z;
    g.fillRect(px + 3, py + 3, b.w * T - 6, b.h * T - 6); g.strokeRect(px + 3, py + 3, b.w * T - 6, b.h * T - 6);
    g.fillStyle = '#0b1820'; g.font = `bold 11px sans-serif`; g.textAlign = 'center'; g.fillText(G.initials(def?.name || b.type), b.x, b.y + 4);
  });

  // Mining / construction beams from Utility Spiders.
  V.laserTarget = function(u){
    if (u.hp <= 0 || !G.Units.can(u, 'build') && !G.Units.can(u, 'gather')) return null;
    if (u.command === 'gather' && u.haulState === 'collecting'){
      const n = G.Gather.node(u.nodeId), d = n && G.Defs.nodes.get(n.type);
      if (n && n.remaining > 0 && Math.hypot(u.x - n.x, u.y - n.y) <= d.range + 0.1) return { x: n.x, y: n.y, mode: 'mine' };
    }
    if (u.command === 'gather' && u.haulState === 'loading' && u.mineId){
      const b = G.State.buildings.find(x => x.id === u.mineId);
      if (b) return { x: b.x, y: b.y, mode: 'mine' };
    }
    if (u.command === 'build' && u.buildSiteId){
      const s = G.Construction.site(u.buildSiteId);
      if (s && s.remaining > 0 && G.Construction.inReach(u, s)) return { x: s.x, y: s.y, mode: 'build' };
    }
    return null;
  };
  V.lasers = function(g, units, t){
    for (const u of units){
      const target = this.laserTarget(u);
      if (!target) continue;
      const sx = u.x + Math.cos(u.heading) * 21, sy = u.y + Math.sin(u.heading) * 21;
      const tx = target.x + Math.sin(t * 7) * 4, ty = target.y + Math.cos(t * 11) * 4, col = target.mode === 'mine' ? '#72e9ff' : '#f1cc78';
      g.save();
      g.globalAlpha = 0.25; g.strokeStyle = col; g.lineWidth = 7; g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty); g.stroke();
      g.globalAlpha = 0.95; g.lineWidth = 1.8; g.stroke(); g.strokeStyle = '#efffff'; g.lineWidth = 0.7; g.stroke();
      for (let i = 0; i < 5; i++){
        const a = t * 5 + i * 1.256, r = 4 + (Math.sin(t * 13 + i) + 1) * 4;
        g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath(); g.moveTo(tx + Math.cos(a) * 3, ty + Math.sin(a) * 3); g.lineTo(tx + Math.cos(a) * r, ty + Math.sin(a) * r); g.stroke();
      }
      g.fillStyle = '#fffde4'; g.beginPath(); g.arc(tx, ty, 2.6, 0, TAU); g.fill();
      g.restore();
    }
  };
})();
