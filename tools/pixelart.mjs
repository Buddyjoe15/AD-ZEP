// Pixel-art test set generator (art/pixel-test). No dependencies.
//
// Every sprite is drawn in code on a palette-indexed grid. Only the "up" and "up-right"
// facings are authored; the other six are lossless 90° rotations of those two. Shading
// (light from the top left) and the dark outline are applied after rotating, so the light
// direction is the same on every facing. Team colours are the magenta ramp (team0..team2),
// replaced at load time. Every pixel is fully opaque or fully transparent; shadows are
// drawn by the engine, never baked into sprites.
import zlib from 'node:zlib';

// ---- Palette (37 colours; index 0 in a grid means transparent) ----
export const PALETTE = [
  ['outline', '#0d1419'],
  ['steel0', '#1f2c34'], ['steel1', '#34495a'], ['steel2', '#557184'], ['steel3', '#8aa7b4'],
  ['plate0', '#7f8b86'], ['plate1', '#b3bdb5'], ['plate2', '#e3eae2'],
  ['team0', '#800080'], ['team1', '#c000c0'], ['team2', '#ff00ff'],
  ['amber0', '#7a4f1c'], ['amber1', '#c98a2e'], ['amber2', '#f2c66a'],
  ['cyan0', '#1c5f73'], ['cyan1', '#36b8ef'], ['cyan2', '#aef4ff'],
  ['rust0', '#4a2a1e'], ['rust1', '#7d4630'], ['rust2', '#a8653f'],
  ['dust0', '#5e4f3d'], ['dust1', '#6f5e48'], ['dust2', '#7f6c53'], ['dust3', '#8e7a5e'], ['dust4', '#9e896b'], ['dust5', '#b09c7e'],
  ['char0', '#231f1c'], ['char1', '#433a33'],
  ['green0', '#2f8a4c'], ['green1', '#6fe08e'],
  ['red0', '#8a2a2a'], ['red1', '#e85e55'],
  ['white', '#ffffff'],
  ['visor', '#16343e'],
  ['gold0', '#9a7a3e'], ['gold1', '#e1bd76'],
  ['blur', '#6d7c84']
];
export const C = Object.fromEntries(PALETTE.map(([n], i) => [n, i + 1]));
// Team ramps replacing team0..team2 (dark, mid, light).
export const TEAMS = {
  blue: ['#1f5a99', '#49a4ff', '#a8d6ff'],
  red: ['#8a2622', '#ef5b55', '#ffb0a6']
};
// One character per palette index in the text encoding ('.' is transparent).
export const ALPHABET = '.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk';

// Ramps that the shading pass may step along (emissive and terrain colours are left alone).
const RAMPS = [
  ['steel0', 'steel1', 'steel2', 'steel3'], ['plate0', 'plate1', 'plate2'], ['team0', 'team1', 'team2'],
  ['rust0', 'rust1', 'rust2'], ['gold0', 'gold1'], ['char0', 'char1'], ['amber0', 'amber1']
].map(r => r.map(n => C[n]));
const RAMP_OF = new Map();
for (const r of RAMPS) r.forEach((c, i) => RAMP_OF.set(c, [r, i]));
// Pixels that don't get a dark outline around them (rotor blur, flames, glows).
const NO_OUTLINE = new Set(['blur', 'cyan1', 'cyan2', 'amber2', 'white'].map(n => C[n]));

// ---- Grid ----
export class Grid {
  constructor(w, h){ this.w = w; this.h = h; this.p = new Uint8Array(w * h); }
  get(x, y){ return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.p[y * this.w + x]; }
  set(x, y, c){ if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; }
  clone(){ const g = new Grid(this.w, this.h); g.p.set(this.p); return g; }
  encode(){ let s = ''; for (const v of this.p) s += ALPHABET[v]; return s; }
}

// Seeded RNG (mulberry32), so the art is identical on every run.
export function rng(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A painter draws shapes in local coordinates: origin at the grid centre (or `origin`),
// "forward" is -y, and the whole local frame is turned clockwise by `angle` on screen.
// Shapes are rasterised by testing pixel centres, so the up-right facing is drawn at 45°
// directly rather than resampled from the up facing.
export function painter(g, angle = 0, origin = [(g.w - 1) / 2, (g.h - 1) / 2]){
  const [cx, cy] = origin, co = Math.cos(angle), si = Math.sin(angle), E = 1e-6;
  const toLocal = (x, y) => { const dx = x - cx, dy = y - cy; return [dx * co + dy * si, -dx * si + dy * co]; };
  const toGrid = (lx, ly) => [Math.round(cx + lx * co - ly * si + E), Math.round(cy + lx * si + ly * co + E)];
  const P = {
    fill(test, c){
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++){
        const [lx, ly] = toLocal(x, y);
        if (test(lx, ly)) g.set(x, y, C[c]);
      }
      return P;
    },
    ellipse(x, y, rx, ry, c){ return P.fill((lx, ly) => ((lx - x) / rx) ** 2 + ((ly - y) / ry) ** 2 <= 1 + E, c); },
    rect(x0, y0, x1, y1, c){ return P.fill((lx, ly) => lx >= x0 - 0.01 && lx <= x1 + 0.01 && ly >= y0 - 0.01 && ly <= y1 + 0.01, c); },
    dot(x, y, c){ const [gx, gy] = toGrid(x, y); g.set(gx, gy, C[c]); return P; },
    line(x0, y0, x1, y1, c){
      let [ax, ay] = toGrid(x0, y0); const [bx, by] = toGrid(x1, y1);
      const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
      let err = dx + dy;
      for (;;){
        g.set(ax, ay, C[c]);
        if (ax === bx && ay === by) break;
        const e2 = 2 * err;
        if (e2 >= dy){ err += dy; ax += sx; }
        if (e2 <= dx){ err += dx; ay += sy; }
      }
      return P;
    }
  };
  return P;
}

// Lossless clockwise quarter turn of a square grid.
export function rot90(g){
  const N = g.w, o = new Grid(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) o.p[y * N + x] = g.p[(N - 1 - x) * N + y];
  return o;
}
export function rotate(g, quarterTurns){ let o = g; for (let i = 0; i < quarterTurns; i++) o = rot90(o); return o; }

// Light from the top left: a pixel on a top or left silhouette edge steps one shade lighter
// along its ramp, one on a bottom or right edge one shade darker.
export function shade(g){
  const o = g.clone(), edge = (x, y) => { const v = g.get(x, y); return v === 0 || v === C.outline; };
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++){
    const v = g.get(x, y), r = RAMP_OF.get(v);
    if (!r) continue;
    const [ramp, i] = r;
    const step = edge(x, y - 1) || edge(x - 1, y) ? 1 : edge(x, y + 1) || edge(x + 1, y) ? -1 : 0;
    o.p[y * g.w + x] = ramp[Math.max(0, Math.min(ramp.length - 1, i + step))];
  }
  return o;
}
export function outline(g){
  const o = g.clone(), solid = (x, y) => { const v = g.get(x, y); return v !== 0 && v !== C.outline && !NO_OUTLINE.has(v); };
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++)
    if (!g.get(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) o.p[y * g.w + x] = C.outline;
  return o;
}
export const finish = g => outline(shade(g));

// ---- PNG (RGBA, no dependencies) ----
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function png(w, h, rgba){
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const RGB = PALETTE.map(([, hex]) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
// Lays grids out as a sheet (rows × cols of equal cells) in the raw magenta palette.
export function sheetRGBA(rows, cw, ch){
  const H = rows.length, W = Math.max(...rows.map(r => r.length)), w = W * cw, h = H * ch, out = new Uint8Array(w * h * 4);
  rows.forEach((row, ry) => row.forEach((g, rx) => {
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++){
      const v = g.p[y * cw + x];
      if (!v) continue;
      const p = ((ry * ch + y) * w + rx * cw + x) * 4, c = RGB[v - 1];
      out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = 255;
    }
  }));
  return { w, h, rgba: out };
}
