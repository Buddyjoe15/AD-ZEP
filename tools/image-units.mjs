// Units drawn from image parts (the adzep-asset pipeline, .claude/skills/adzep-asset): a body
// (core.png), legs (leg*.png) and a turret (turret.png), each a square transparent PNG whose
// centre is the unit's pivot, plus meta.json (leg hips and gait groups) and unit.json (swing,
// idle lift, muzzles). Frames are composed here the way the animation demo draws them, fitted
// to the frame's inscribed circle, and mapped onto the shared palette. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PALETTE, Grid } from './pixelart.mjs';

// Minimal PNG reader: 8-bit RGB or RGBA, not interlaced (what the pipeline writes).
export function readPNG(file){
  const buf = fs.readFileSync(file), idat = [];
  let o = 8, w = 0, h = 0, type = 0;
  while (o < buf.length){
    const len = buf.readUInt32BE(o), kind = buf.toString('ascii', o + 4, o + 8), body = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR'){
      w = body.readUInt32BE(0); h = body.readUInt32BE(4); type = body[9];
      if (body[8] !== 8 || (type !== 2 && type !== 6) || body[12]) throw new Error(`${file}: only 8-bit RGB/RGBA, non-interlaced PNGs`);
    }
    if (kind === 'IDAT') idat.push(body);
    o += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * h), rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++){
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, at = y * stride;
    for (let x = 0; x < stride; x++){
      const a = x >= bpp ? px[at + x - bpp] : 0, b = y ? px[at - stride + x] : 0, c = x >= bpp && y ? px[at - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4){ const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[at + x] = v & 255;
    }
  }
  for (let i = 0; i < w * h; i++){ rgba[i * 4] = px[i * bpp]; rgba[i * 4 + 1] = px[i * bpp + 1]; rgba[i * 4 + 2] = px[i * bpp + 2]; rgba[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255; }
  return { w, h, rgba };
}

// Colours image art may use: hardware and lights, never team, terrain, blur or white.
const ALLOWED = ['outline', 'steel0', 'steel1', 'steel2', 'steel3', 'plate0', 'plate1', 'plate2', 'amber0', 'amber1', 'amber2',
  'cyan0', 'cyan1', 'cyan2', 'char0', 'char1', 'gold0', 'gold1', 'visor', 'olive0', 'olive1', 'olive2', 'olive3'];
const CHOICES = ALLOWED.map(n => { const i = PALETTE.findIndex(([k]) => k === n); return [i + 1, [1, 3, 5].map(j => parseInt(PALETTE[i][1].slice(j, j + 2), 16))]; });
function nearest(r, g, b){
  let best = 0, bd = Infinity;
  for (const [i, [pr, pg, pb]] of CHOICES){ const d = 0.3 * (r - pr) ** 2 + 0.59 * (g - pg) ** 2 + 0.11 * (b - pb) ** 2; if (d < bd){ bd = d; best = i; } }
  return best;
}

const SS = 4;   // samples per axis per frame pixel

// Frames for facings `angles` (radians, clockwise from up) of the unit in `dir`, in an n × n
// frame. Returns { anims: { name: { start, frames, fps } }, facings: [[Grid per frame]], muzzle, scale }:
// `muzzle` is the first muzzle's distance ahead of the pivot in frame px, `scale` frame px per
// part px. Art stays inside the inscribed circle less `margin` frame px.
export function imageUnitFrames(dir, n, angles, margin){
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const unit = JSON.parse(fs.readFileSync(path.join(dir, 'unit.json'), 'utf8'));
  const S = meta.size, P = f => readPNG(path.join(dir, 'parts', f));
  const core = P(fs.existsSync(path.join(dir, 'parts', 'core.png')) ? 'core.png' : 'body.png');
  const turret = fs.existsSync(path.join(dir, 'parts', 'turret.png')) ? P('turret.png') : null;
  const legs = (meta.legs || []).map(l => ({ ...l, img: P(l.n + '.png'), side: l.px > S / 2 ? 1 : -1 }));
  const swing = unit.swing ?? 0.24, lift = unit.idleLift ?? 0, muzzle = (unit.muzzles || [[0, 0]])[0];
  // Fit: the farthest opaque part pixel (legs swung out included) lands inside the circle.
  let far = 0;
  for (const im of [core, turret, ...legs.map(l => l.img)]) if (im)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (im.rgba[(y * S + x) * 4 + 3] > 127) far = Math.max(far, Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2));
  const k = (n / 2 - margin) / (far * (1 + lift) + 1);
  const at = (im, x, y) => { const xi = Math.floor(x), yi = Math.floor(y); return xi < 0 || yi < 0 || xi >= S || yi >= S ? -1 : (yi * S + xi) * 4; };

  // One pose: body scale `bs` (idle breathing), leg swing per gait group.
  function pose(angle, bs, swingA){
    const ca = Math.cos(angle), sa = Math.sin(angle), g = new Grid(n, n);
    const legT = legs.map(l => { const r = -l.side * swingA * (l.g === 'A' ? 1 : -1); return { l, c: Math.cos(-r), s: Math.sin(-r), hx: (l.px - S / 2) * bs, hy: (l.py - S / 2) * bs }; });
    for (let oy = 0; oy < n; oy++) for (let ox = 0; ox < n; ox++){
      let r = 0, gg = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++){
        const dx = ox + (sx + 0.5) / SS - n / 2, dy = oy + (sy + 0.5) / SS - n / 2;
        const ux = (dx * ca + dy * sa) / k, uy = (-dx * sa + dy * ca) / k;   // part px about the pivot, unit facing up
        let i = -1, im = null;
        for (const src of [turret, core]) if (src && i < 0){ const j = at(src, ux / bs + S / 2, uy / bs + S / 2); if (j >= 0 && src.rgba[j + 3] > 127){ i = j; im = src; } }
        if (i < 0) for (const t of legT){
          const vx = ux - t.hx, vy = uy - t.hy, j = at(t.l.img, vx * t.c - vy * t.s + t.l.px, vx * t.s + vy * t.c + t.l.py);
          if (j >= 0 && t.l.img.rgba[j + 3] > 127){ i = j; im = t.l.img; break; }
        }
        if (i >= 0){ r += im.rgba[i]; gg += im.rgba[i + 1]; b += im.rgba[i + 2]; hits++; }
      }
      if (hits * 2 >= SS * SS) g.p[oy * n + ox] = nearest(r / hits, gg / hits, b / hits);
    }
    return g;
  }

  const breath = f => 1 + lift * (0.5 + 0.5 * Math.sin(f / 4 * Math.PI * 2));
  // Idle: the frame rises and settles (legs planted). Walk: the gait groups swing in turn.
  // Work (beaming) plays the idle breath; the engine draws the beam.
  const anims = { idle: { start: 0, frames: 4, fps: 2.2 }, walk: { start: 4, frames: 6, fps: 12 }, work: { start: 0, frames: 4, fps: 2.2 } };
  const facings = angles.map(a => [
    ...[0, 1, 2, 3].map(f => pose(a, breath(f), 0)),
    ...[0, 1, 2, 3, 4, 5].map(f => pose(a, 1, Math.sin(f / 6 * Math.PI * 2) * swing))
  ]);
  return { anims, facings, muzzle: -muzzle[1] * k, scale: k };
}
