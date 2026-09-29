// Units drawn from image parts (the adzep-asset pipeline, .claude/skills/adzep-asset): a body
// (core.png), legs (leg*.png) and a turret (turret.png), each a square transparent PNG whose
// centre is the unit's pivot, plus meta.json (leg hips and gait groups) and unit.json (swing,
// idle lift, muzzles). Frames are composed here the way the animation demo draws them, fitted
// to the frame's inscribed circle, and mapped onto the shared palette. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PALETTE, Grid, outline } from './pixelart.mjs';

const SHARPEN = 0.6;   // unsharp amount after downsampling

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

// Frames for facings `angles` (radians, clockwise from up) of the unit in `dir`, in an n × n
// frame. Uses the high-resolution cut in `dir/hires` when there is one (same cut as `parts/`,
// cut at a larger size), so each frame is one area-averaged downsample of the source art.
// Returns { anims: { name: { start, frames, fps } }, facings: [[Grid per frame]], muzzle, scale }:
// `muzzle` is the first muzzle's distance ahead of the pivot in frame px, `scale` frame px per
// part px. Every pose of every facing fits in the frame less `margin` frame px on each side,
// plus the 1 px outline added round the silhouette.
export function imageUnitFrames(dir, n, angles, margin){
  const unit = JSON.parse(fs.readFileSync(path.join(dir, 'unit.json'), 'utf8'));
  const demoSize = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).size;   // unit.json is in the demo parts' px
  const src = fs.existsSync(path.join(dir, 'hires', 'meta.json')) ? path.join(dir, 'hires') : dir;
  const meta = JSON.parse(fs.readFileSync(path.join(src, 'meta.json'), 'utf8'));
  const S = meta.size, P = f => readPNG(path.join(src, 'parts', f)), has = f => fs.existsSync(path.join(src, 'parts', f));
  const core = P(has('core.png') ? 'core.png' : 'body.png'), turret = has('turret.png') ? P('turret.png') : null;
  const legs = (meta.legs || []).map(l => ({ ...l, img: P(l.n + '.png'), side: l.px > S / 2 ? 1 : -1 }));
  const swing = unit.swing ?? 0.24, lift = unit.idleLift ?? 0, muzzle = (unit.muzzles || [[0, 0]])[0].map(v => v * S / demoSize);
  const at = (im, x, y) => { const xi = Math.floor(x), yi = Math.floor(y); return xi < 0 || yi < 0 || xi >= S || yi >= S ? -1 : (yi * S + xi) * 4; };
  const legPose = (swingA, bs) => legs.map(l => { const r = -l.side * swingA * (l.g === 'A' ? 1 : -1); return { l, r, c: Math.cos(-r), s: Math.sin(-r), hx: (l.px - S / 2) * bs, hy: (l.py - S / 2) * bs }; });

  // Fit: the widest reach, over the facings, of any opaque part pixel in any pose (body at
  // full breath, legs swung both ways), measured along the frame's axes.
  const pts = [];
  const opaque = (im, fn) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (im.rgba[(y * S + x) * 4 + 3] > 127) fn(x + 0.5 - S / 2, y + 0.5 - S / 2); };
  for (const im of [core, turret]) if (im) opaque(im, (x, y) => pts.push(x * (1 + lift), y * (1 + lift)));
  for (const w of [swing, -swing]) for (const t of legPose(w, 1 + lift)){
    const c = Math.cos(t.r), s = Math.sin(t.r), px = t.l.px - S / 2, py = t.l.py - S / 2;
    opaque(t.l.img, (x, y) => { const vx = x - px, vy = y - py; pts.push(vx * c - vy * s + t.hx, vx * s + vy * c + t.hy); });
  }
  let reach = 0;
  for (const a of angles){
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < pts.length; i += 2){ const x = pts[i] * ca - pts[i + 1] * sa, y = pts[i] * sa + pts[i + 1] * ca; reach = Math.max(reach, Math.abs(x) + 0.5, Math.abs(y) + 0.5); }
  }
  const k = (n / 2 - margin - 1) / reach, SS = Math.max(2, Math.min(6, Math.ceil(1.5 / k)));   // samples per axis per frame px

  // One pose: body scale `bs` (idle breathing), leg swing per gait group. Each frame pixel
  // averages the part pixels under it; the result is sharpened a little (the average softens
  // edges inside the art), mapped onto the palette and outlined like the rest of the game's art.
  function pose(angle, bs, swingA){
    const ca = Math.cos(angle), sa = Math.sin(angle), legT = legPose(swingA, bs), rgb = new Float32Array(n * n * 3), on = new Uint8Array(n * n);
    for (let oy = 0; oy < n; oy++) for (let ox = 0; ox < n; ox++){
      let r = 0, gg = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++){
        const dx = ox + (sx + 0.5) / SS - n / 2, dy = oy + (sy + 0.5) / SS - n / 2;
        const ux = (dx * ca + dy * sa) / k, uy = (-dx * sa + dy * ca) / k;   // part px about the pivot, unit facing up
        let i = -1, im = null;
        for (const s of [turret, core]) if (s && i < 0){ const j = at(s, ux / bs + S / 2, uy / bs + S / 2); if (j >= 0 && s.rgba[j + 3] > 127){ i = j; im = s; } }
        if (i < 0) for (const t of legT){
          const vx = ux - t.hx, vy = uy - t.hy, j = at(t.l.img, vx * t.c - vy * t.s + t.l.px, vx * t.s + vy * t.c + t.l.py);
          if (j >= 0 && t.l.img.rgba[j + 3] > 127){ i = j; im = t.l.img; break; }
        }
        if (i >= 0){ r += im.rgba[i]; gg += im.rgba[i + 1]; b += im.rgba[i + 2]; hits++; }
      }
      const o = oy * n + ox;
      if (hits * 2 >= SS * SS){ on[o] = 1; rgb[o * 3] = r / hits; rgb[o * 3 + 1] = gg / hits; rgb[o * 3 + 2] = b / hits; }
    }
    const g = new Grid(n, n);
    for (let o = 0; o < n * n; o++) if (on[o]){
      const x = o % n, near = [o - 1, o + 1, o - n, o + n].filter((q, j) => q >= 0 && q < n * n && on[q] && (j > 1 || Math.floor(q / n) === Math.floor(o / n)));
      const c = [0, 1, 2].map(ch => { const v = rgb[o * 3 + ch], m = near.length ? near.reduce((s, q) => s + rgb[q * 3 + ch], 0) / near.length : v; return Math.max(0, Math.min(255, v + SHARPEN * (v - m))); });
      g.p[o] = nearest(c[0], c[1], c[2]);
    }
    return outline(g);
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
