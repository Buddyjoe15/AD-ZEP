// Utility Spider, three-quarter prototype (art/proto-3q). No dependencies.
// Usage: node tools/spider-3q.mjs            write art/proto-3q/spider-3q.js and the sheet PNG
//        node tools/spider-3q.mjs --capture  also screenshot preview.html into previews/ (Playwright)
//
// The Spider is a 3D model built in code and rendered by tools/render3d.mjs from 8 headings at
// 2 art px per world px. Unlike tools/sprites.mjs, no facing is a rotated copy of another: each
// one is its own render, so the three-quarter view, the lighting and the shadow match on all 8.
// It has its own palette (longer ramps than the game's), so it changes nothing the game uses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { png } from './pixelart.mjs';
import { Model, render, toPixels, H, add, sub, mulv, norm, dot, len, lerp, mul, translate, scale, rotY, along } from './render3d.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'art/proto-3q');
const RES = 2;                                   // art px per world px (the game's art is 1)
const FACINGS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const ANIMS = { idle: { frames: 2, fps: 2 }, walk: { frames: 8, fps: 10 }, work: { frames: 4, fps: 6 } };

// ---- Palette: index 0 is transparent. Ramps run dark to light. ----
const RAMPS = {
  outline: ['#0d1419'],
  steel: ['#141c22', '#1f2c34', '#2c3c48', '#3e5566', '#557184', '#7896a6'],
  dark: ['#0d1419', '#162027', '#1f2c34', '#2c3a44'],
  plate: ['#4f5a5c', '#707c7c', '#939e9b', '#b3bdb5', '#d3dad2', '#eef3ec'],
  team: ['#300030', '#580058', '#800080', '#a800a8', '#d000d0', '#ff40ff'],   // magenta placeholders, swapped per team
  amber: ['#4a2e10', '#7a4f1c', '#a8702a', '#c98a2e', '#e8ae48', '#f7d27a'],
  cyan: ['#1c5f73', '#36b8ef', '#aef4ff']
};
const TEAMS = {
  blue: ['#0b2447', '#133a70', '#1f5a99', '#3280d0', '#49a4ff', '#a8d6ff'],
  red: ['#3d0f0e', '#5e1a18', '#8a2622', '#b83a35', '#ef5b55', '#ffb0a6']
};
const PALETTE = [], RAMP = {};
for (const [name, hexes] of Object.entries(RAMPS)) RAMP[name] = hexes.map(hex => PALETTE.push(hex));
const MAT = {
  steel: { ramp: RAMP.steel }, dark: { ramp: RAMP.dark }, plate: { ramp: RAMP.plate }, team: { ramp: RAMP.team },
  amber: { ramp: RAMP.amber }, glow: { ramp: RAMP.cyan, emissive: true }, glowDim: { ramp: RAMP.cyan.slice(0, 2), emissive: true }
};

// ---- The model: body-local, forward is -z, the ground point under the body is the origin ----
const LEGS = [   // per side: hip (x, y, z) and where the foot rests (angle from forward, distance)
  { hip: [5.5, 8, -5], foot: [36, 19] },
  { hip: [6.5, 8, -1.5], foot: [74, 20] },
  { hip: [6.5, 8, 2.5], foot: [108, 20] },
  { hip: [5.5, 8, 6], foot: [146, 19] }
];
const UPPER = 10, LOWER = 11.5, STRIDE = 3.2, LIFT = 3.5;

// Knee of a two-segment leg, bent up and outward.
function knee(hip, foot){
  const d = sub(foot, hip), dist = Math.min(len(d), UPPER + LOWER - 0.01), u = norm(d);
  const out = norm([foot[0], 0, foot[2]]), bend = add([0, 1, 0], mulv(out, 0.9));
  const w = norm(sub(bend, mulv(u, dot(bend, u))));
  const a = Math.acos(Math.max(-1, Math.min(1, (UPPER * UPPER + dist * dist - LOWER * LOWER) / (2 * UPPER * dist))));
  return add(hip, add(mulv(u, UPPER * Math.cos(a)), mulv(w, UPPER * Math.sin(a))));
}

// pose: { walk: 0..1 phase or null, bob, work: 0..1 or null }
function spider(heading, pose){
  const m = new Model(), R = rotY(heading);
  const at = (...ms) => mul(R, ms.reduce((a, b) => mul(a, b)));
  const P = p => mul(R, translate(...p));
  const pt = p => { const t = mul(R, translate(...p)); return [t[3], t[7], t[11]]; };
  const bob = pose.bob || 0;

  // Body: plate head in front, team-coloured cargo abdomen behind, a steel chassis under both,
  // and a dark neck ring between them.
  m.box(at(translate(0, 6.8 + bob, 0.5), scale(10, 3, 16)), MAT.steel);
  m.ball(at(translate(0, 11 + bob, 7.5), scale(9.2, 6.6, 9.6)), MAT.team, 16);
  m.box(at(translate(0, 17.4 + bob, 7.5), scale(2.4, 1.4, 12)), MAT.plate);          // spine plate
  for (const s of [-1, 1]) m.box(at(translate(s * 7.4, 12 + bob, 10), scale(2.2, 2.6, 6.5)), MAT.plate);   // cargo latches
  m.box(at(translate(0, 12.5 + bob, 17), scale(4, 1.6, 1.2)), MAT.amber);              // tail light
  m.box(at(translate(0, 10.8 + bob, 1.6), scale(10.5, 7, 3)), MAT.dark);               // neck ring
  m.ball(at(translate(0, 11.2 + bob, -4.5), scale(7.8, 6.2, 7.6)), MAT.plate, 16);
  for (const s of [-1, 1]) m.box(at(translate(s * 6.4, 11.4 + bob, -4.8), scale(1.6, 3.2, 5.2)), MAT.team);   // cheek plates
  m.box(at(translate(0, 10.8 + bob, -10.9), scale(8.4, 3.6, 2.8)), MAT.dark);          // sensor visor
  for (const s of [-1, 1]) m.ball(at(translate(s * 2.4, 11.2 + bob, -12.4), scale(1.3)), MAT.glow, 6);

  // Laser arm on top of the head: turret, upper arm, forearm and emitter.
  const work = pose.work;
  const elbow = work == null ? [0, 23 + bob, -6.5] : [0, 22.5 + bob, -9 - Math.sin(work * Math.PI * 2) * 0.8];
  const tip = work == null ? [0, 20 + bob, -12] : [0, 15 + bob + Math.sin(work * Math.PI * 2), -17];
  m.tube(at(translate(0, 16.4 + bob, -4.5), scale(2.6, 1.8, 2.6)), MAT.amber, 1, 1, 10);
  m.tube(along(pt([0, 18 + bob, -4.5]), pt(elbow)), MAT.amber, 1.5, 1.3, 8);
  m.ball(at(translate(...elbow), scale(1.6)), MAT.dark, 8);
  m.tube(along(pt(elbow), pt(tip)), MAT.amber, 1.2, 1.0, 8);
  m.ball(at(translate(...tip), scale(work == null ? 1.2 : 1.6)), work == null ? MAT.glowDim : MAT.glow, 8);

  // Legs. Alternating groups of four: one pushes back on the ground while the other swings
  // forward in the air.
  LEGS.forEach((leg, i) => {
    for (const s of [-1, 1]){
      const hip = [leg.hip[0] * s, leg.hip[1] + bob, leg.hip[2]];
      const a = leg.foot[0] * Math.PI / 180;
      let foot = [Math.sin(a) * leg.foot[1] * s, 0.8, -Math.cos(a) * leg.foot[1]];
      if (pose.walk != null){
        const p = (pose.walk + ((i + (s > 0 ? 0 : 1)) % 2) * 0.5) % 1;
        const stance = p < 0.5, t = stance ? p / 0.5 : (p - 0.5) / 0.5;
        foot = [foot[0], foot[1] + (stance ? 0 : LIFT * Math.sin(Math.PI * t)), foot[2] + (stance ? lerp(-STRIDE, STRIDE, t) : lerp(STRIDE, -STRIDE, t))];
      }
      const k = knee(hip, foot), H0 = pt(hip), K = pt(k), F = pt(foot);
      m.ball(mul(P(hip), scale(2.8)), MAT.dark, 8);
      m.tube(along(H0, K), MAT.plate, 2.4, 1.9, 8);          // armoured upper leg
      m.ball(mul(P(k), scale(2.1)), MAT.amber, 8);
      m.tube(along(K, F), MAT.steel, 1.6, 1.0, 8);
      m.ball(mul(P(foot), scale(1.3)), MAT.dark, 6);
    }
  });
  return m;
}

// ---- Rendering all facings and frames ----
const BUF = 320, OX = 160, OY = 176;
function frames(){
  const out = [];
  FACINGS.forEach((_, f) => {
    const heading = f * Math.PI / 4, row = [];
    for (let i = 0; i < ANIMS.idle.frames; i++) row.push(spider(heading, { bob: i ? 0.5 : 0 }));
    for (let i = 0; i < ANIMS.walk.frames; i++) row.push(spider(heading, { walk: i / ANIMS.walk.frames, bob: 0.4 * Math.cos(i / ANIMS.walk.frames * Math.PI * 4) }));
    for (let i = 0; i < ANIMS.work.frames; i++) row.push(spider(heading, { work: i / ANIMS.work.frames }));
    out.push(row.map(model => {
      const r = render(model, { w: BUF, h: BUF, ox: OX, oy: OY, res: RES });
      return { px: toPixels(r, { outline: RAMP.outline[0] }), shadow: r.shadow };
    }));
  });
  return out;
}

// Crops every frame to the box that holds all sprites and shadows.
function crop(all){
  let x0 = BUF, y0 = BUF, x1 = 0, y1 = 0;
  for (const row of all) for (const f of row) for (let i = 0; i < BUF * BUF; i++){
    if (!f.px[i] && !f.shadow[i]) continue;
    const x = i % BUF, y = (i / BUF) | 0;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, cut = a => { const o = new Uint8Array(w * h); for (let y = 0; y < h; y++) o.set(a.subarray((y0 + y) * BUF + x0, (y0 + y) * BUF + x0 + w), y * w); return o; };
  return { w, h, origin: [OX - x0, OY - y0], rows: all.map(row => row.map(f => ({ px: cut(f.px), shadow: cut(f.shadow) }))) };
}

// Run-length text: a value character then a length character (1..64), both from CH.
const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function rle(a){
  let s = '';
  for (let i = 0; i < a.length;){
    let n = 1;
    while (i + n < a.length && a[i + n] === a[i] && n < CH.length) n++;
    s += CH[a[i]] + CH[n - 1]; i += n;
  }
  return s;
}

function sheetPNG(c){
  const cols = c.rows[0].length, W = cols * c.w, Hh = c.rows.length * c.h, rgba = new Uint8Array(W * Hh * 4);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgb = PALETTE.map(hex), team = new Map(RAMP.team.map((idx, i) => [idx, hex(TEAMS.blue[i])]));
  c.rows.forEach((row, ry) => row.forEach((f, rx) => {
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++){
      const i = y * c.w + x, v = f.px[i], p = ((ry * c.h + y) * W + rx * c.w + x) * 4;
      if (v){ const col = team.get(v) || rgb[v - 1]; rgba.set([col[0], col[1], col[2], 255], p); }
      else if (f.shadow[i]) rgba.set([0, 0, 0, 140], p);
    }
  }));
  return png(W, Hh, rgba);
}

function write(){
  const c = crop(frames());
  let start = 0;
  const animations = Object.fromEntries(Object.entries(ANIMS).map(([k, a]) => { const o = { start, frames: a.frames, fps: a.fps }; start += a.frames; return [k, o]; }));
  const data = {
    name: 'spider-3q', view: 'three-quarter (oblique)', heightScale: H, artPxPerWorldPx: RES,
    frameWidth: c.w, frameHeight: c.h, origin: c.origin, facings: FACINGS, animations,
    palette: PALETTE, teamIndex: RAMP.team, teams: TEAMS, encoding: 'rle: value char + (length - 1) char, alphabet ' + CH,
    frames: c.rows.map(row => row.map(f => rle(f.px))), shadows: c.rows.map(row => row.map(f => rle(f.shadow)))
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'spider-3q.js'), '/* Utility Spider, three-quarter prototype. Generated by tools/spider-3q.mjs; do not edit. */\nwindow.PROTO_3Q = ' + JSON.stringify(data) + ';\n');
  fs.writeFileSync(path.join(OUT, 'spider-3q-sheet.png'), sheetPNG(c));
  console.log(`spider-3q: ${FACINGS.length} facings × ${start} frames, ${c.w}×${c.h} art px (origin ${c.origin}), ${PALETTE.length} colours`);
}

async function capture(){
  const require = createRequire(import.meta.url), tries = ['playwright', process.env.PLAYWRIGHT_MODULE];
  try { tries.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e){ /* no npm */ }
  let pw = null;
  for (const t of tries.filter(Boolean)){ try { pw = require(t); break; } catch (e){ /* next */ } }
  if (!pw){ console.log('Playwright not found; skipping previews'); return; }
  const browser = await pw.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(OUT, 'preview.html')).href + '?t=0.35');
    await page.waitForFunction(() => window.PREVIEW_READY === true);
    const dir = path.join(OUT, 'previews'); fs.mkdirSync(dir, { recursive: true });
    for (const id of ['compare', 'ring', 'sheet']){
      await page.locator('#' + id).screenshot({ path: path.join(dir, id + '.png') });
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('previews written to art/proto-3q/previews');
  } finally { await browser.close(); }
}

write();
if (process.argv.includes('--capture')) await capture();
