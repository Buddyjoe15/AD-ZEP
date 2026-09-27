/* Light and dark on Genesis maps (presentation only; nothing here affects the simulation).
   - Day and night: the game clock (S.time) runs through a day of DAY seconds, starting in the
     morning. At night the land darkens to a deep blue.
   - Lights cut through the dark: lamp posts in the villages glow warm, flickering a little;
     the ship, Vance and the other friendly units carry small lights; cave crystals glow
     cyan and hostile nests red.
   - Caves are dark by day too, lit only by what glows inside them.
   The dark is drawn at a quarter of the screen's resolution into its own canvas, lights are
   cut out of it, and it is laid over the map and units (under the selection and orders). */
(function(){
  'use strict';
  const G = GW;
  const DAY = 600;          // seconds of game time in a day
  const START = 8 / 24;     // the game begins at 08:00
  const SCALE = 4;          // the dark is drawn at 1/SCALE of the screen's resolution

  let cv = null, cx = null, glow = null;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  G.Lighting = {
    DAY,
    // Set to an hour (0–24) to hold the clock there, for testing and screenshots; null to follow the game.
    hold: null,
    enabled(){ const a = G.State.grid && G.State.grid.art; return !!(a && a.generator === 'genesis'); },
    // The time of day, 0–1 (0 midnight, 0.5 noon).
    phase(){ return this.hold != null ? (this.hold / 24) % 1 : (G.State.time / DAY + START) % 1; },
    hour(){ return this.phase() * 24; },
    // How dark it is: 0 by day, 1 in the middle of the night, with dusk and dawn between.
    darkness(){
      const p = this.phase();
      return Math.max(1 - smooth(0.21, 0.3, p), smooth(0.77, 0.86, p));
    },
    draw(g, cam, z, vw, vh, t){
      if (!this.enabled()) return;
      const S = G.State, dark = this.darkness(), T = G.CONFIG.TILE, art = S.grid.art;
      const caves = art.caverns && art.caverns.length;
      if (dark < 0.01 && !caves) return;
      const w = Math.ceil(vw / SCALE), h = Math.ceil(vh / SCALE);
      if (!cv || cv.width !== w || cv.height !== h){ cv = document.createElement('canvas'); cv.width = w; cv.height = h; cx = cv.getContext('2d'); }
      const k = z / SCALE, x0 = cam.x, y0 = cam.y, X = x => (x - x0) * k, Y = y => (y - y0) * k;
      const inView = (x, y, r) => x + r > x0 && y + r > y0 && x - r < x0 + vw / z && y - r < y0 + vh / z;
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.globalCompositeOperation = 'source-over';
      cx.clearRect(0, 0, w, h);
      // Night over everything, deep blue.
      if (dark > 0.01){ cx.fillStyle = `rgba(6,10,28,${(dark * 0.72).toFixed(3)})`; cx.fillRect(0, 0, w, h); }
      // Caves: dark by day as well, shaded tile by tile (the canvas is small, so it blurs).
      const lights = [];
      if (caves){
        const F = G.Defs.terrain.get('cave_floor').id, cols = S.grid.cols, tiles = S.grid.tiles;
        const gx0 = Math.max(0, Math.floor(x0 / T) - 1), gy0 = Math.max(0, Math.floor(y0 / T) - 1), gx1 = Math.min(cols - 1, Math.ceil((x0 + vw / z) / T) + 1), gy1 = Math.min(S.grid.rows - 1, Math.ceil((y0 + vh / z) / T) + 1);
        // Solid on a canvas of its own, then laid on at the cave's darkness (no seams where tiles overlap).
        if (!glow || glow.width !== w || glow.height !== h){ glow = document.createElement('canvas'); glow.width = w; glow.height = h; }
        const m = glow.getContext('2d');
        m.clearRect(0, 0, w, h); m.fillStyle = 'rgb(4,6,14)';
        for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) if (tiles[gy * cols + gx] === F) m.fillRect(Math.floor(X(gx * T)), Math.floor(Y(gy * T)), Math.ceil(T * k) + 1, Math.ceil(T * k) + 1);
        cx.globalAlpha = 0.6 - dark * 0.2; cx.drawImage(glow, 0, 0); cx.globalAlpha = 1;
      }
      // What glows.
      const tr = art.trees;
      if (tr && G.Trees.has()){
        const ALL = G.TREES.ALL, LAMP = ALL.indexOf('lamp'), CRY = ALL.indexOf('crystal');
        for (let q = 0; q < tr.count; q++){
          const kd = tr.kind[q];
          if ((kd !== LAMP && kd !== CRY) || !inView(tr.x[q], tr.y[q], 200) || !G.Trees.present(q)) continue;
          if (kd === LAMP){
            if (dark < 0.05) continue;
            const f = 0.9 + 0.1 * Math.sin(t * 7 + q) * Math.sin(t * 3.1 + q * 1.7);
            lights.push({ x: tr.x[q], y: tr.y[q], r: 150 * f, a: dark * f, col: [255, 196, 110], glow: 0.55 });
          } else lights.push({ x: tr.x[q], y: tr.y[q], r: 70 + tr.size[q] * 20, a: 0.75, col: [120, 230, 255], glow: 0.35 });
        }
      }
      for (const b of S.buildings){
        if (!inView(b.x, b.y, 200)) continue;
        if (b.type === 'cave_nest') lights.push({ x: b.x, y: b.y, r: 130, a: 0.85, col: [255, 70, 50], glow: 0.4 });
        else if (dark > 0.05 && b.team === 'blue') lights.push({ x: b.x, y: b.y, r: 90 + b.w * 25, a: dark * 0.7, col: [190, 215, 255], glow: 0.12 });
      }
      for (const u of S.units){
        if (u.team !== 'blue' || !inView(u.x, u.y, 400)) continue;
        if (u.isShip) lights.push({ x: u.x, y: u.y, r: 360, a: 0.9, col: [200, 225, 255], glow: 0.15 });
        else if (u.isHero) lights.push({ x: u.x, y: u.y, r: 170, a: 0.95, col: [255, 235, 200], glow: 0.1 });
        else lights.push({ x: u.x, y: u.y, r: 80, a: 0.7, col: [210, 230, 255], glow: 0.06 });
      }
      // Cut the lights out of the dark.
      cx.globalCompositeOperation = 'destination-out';
      for (const L of lights){
        const r = L.r * k, gr = cx.createRadialGradient(X(L.x), Y(L.y), 0, X(L.x), Y(L.y), r);
        gr.addColorStop(0, `rgba(0,0,0,${L.a.toFixed(3)})`); gr.addColorStop(0.5, `rgba(0,0,0,${(L.a * 0.6).toFixed(3)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = gr; cx.fillRect(X(L.x) - r, Y(L.y) - r, r * 2, r * 2);
      }
      cx.globalCompositeOperation = 'source-over';
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = g.canvas.width / vw;
      g.imageSmoothingEnabled = true;
      g.drawImage(cv, 0, 0, w * SCALE * dpr, h * SCALE * dpr);
      // Coloured light on top: a warm pool under each lamp, cyan by crystals, red round nests.
      g.globalCompositeOperation = 'lighter';
      for (const L of lights){
        if (!L.glow) continue;
        const sx = (L.x - x0) * z * dpr, sy = (L.y - y0) * z * dpr, r = L.r * 0.7 * z * dpr, a = L.glow * (L.col[0] > 250 && L.col[1] > 150 ? Math.max(dark, 0.3) : 1);
        const gr = g.createRadialGradient(sx, sy, 0, sx, sy, r);
        gr.addColorStop(0, `rgba(${L.col[0]},${L.col[1]},${L.col[2]},${(a * 0.5).toFixed(3)})`); gr.addColorStop(0.35, `rgba(${L.col[0]},${L.col[1]},${L.col[2]},${(a * 0.18).toFixed(3)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(sx - r, sy - r, r * 2, r * 2);
        if (L.col[0] > 250 && L.col[1] > 150){   // the lamp itself, bright
          g.fillStyle = `rgba(255,230,160,${(dark * 0.9).toFixed(3)})`; g.beginPath(); g.arc(sx, sy, Math.max(1.5, 3.5 * z * dpr), 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
    }
  };
})();
