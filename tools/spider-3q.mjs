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
import { Model, renderSprite, noise3, H, add, sub, mulv, norm, cross, dot, len, lerp, mix, mul, translate, scale, rotX, along } from './render3d.mjs';

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

// ---- Materials ----
// Patterns take the model position, with the body's bob taken out, so seams and grime stay put
// on the body while it walks. Legs move against the body, so they get no patterns.
const grime = (p, cut) => noise3(p[0] / 1.4 + 11, p[1] / 1.4 + 3, p[2] / 1.4 + 7) > cut ? -1 : 0;
const near = (v, at, w = 0.32) => at.some(a => Math.abs(v - a) < w);
function materials(bob){
  const body = f => (p, n) => f([p[0], p[1] - bob, p[2]], n);
  const M = {
    dark: { ramp: RAMP.dark, spec: 0.25, shine: 16 },
    steel: { ramp: RAMP.steel, spec: 0.4, shine: 18 },
    chrome: { ramp: RAMP.steel.slice(2), spec: 0.9, shine: 30 },
    plate: { ramp: RAMP.plate, spec: 0.45, shine: 24 },
    amber: { ramp: RAMP.amber, spec: 0.45, shine: 22 },
    glass: { ramp: RAMP.dark, spec: 1.4, shine: 36 },
    glow: { ramp: RAMP.cyan, emissive: true },
    glowDim: { ramp: RAMP.cyan.slice(0, 2), emissive: true },
    tail: { ramp: RAMP.amber.slice(4), emissive: true }
  };
  Object.assign(M, {
    chassis: { ...M.steel, pattern: body(p => grime(p, 0.74)) },
    head: { ...M.plate, spec: 0.5, pattern: body(p => near(p[2], [-2.4]) || (Math.abs(p[0]) < 0.35 && p[1] > 15.8) ? -2 : grime(p, 0.8)) },
    hull: { ramp: RAMP.team, spec: 0.35, shine: 20, pattern: body(p => near(p[2], [7, 10.6]) ? -2 : grime(p, 0.8)) },
    team: { ramp: RAMP.team, spec: 0.35, shine: 20 },
    bodyPlate: { ...M.plate, pattern: body(p => grime(p, 0.78)) },
    turret: { ...M.amber, pattern: body(p => grime(p, 0.8)) },
    hazard: { ...M.amber, pattern: body(p => (Math.floor((p[0] + p[1] + 50) / 1.3) & 1) ? M.dark : 0) }
  });
  return M;
}

// ---- The model: forward is -z; the origin is the ground point under the body ----
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
// A hydraulic piston from p to q: the cylinder, then the chrome rod.
function piston(m, M, p, q, r = 0.75){
  const k = mix(p, q, 0.58);
  m.tube(along(p, k), M.dark, r, r, 8);
  m.tube(along(k, q), M.chrome, r * 0.6, r * 0.6, 8);
}

// pose: { walk: 0..1 phase or null, bob, work: 0..1 or null }
function spider(pose){
  const m = new Model(), bob = pose.bob || 0, M = materials(bob);
  const B = (...ms) => mul(translate(0, bob, 0), ...ms);
  const at = (p, ...ms) => mul(translate(p[0], p[1] + bob, p[2]), ...ms);
  const pt = p => [p[0], p[1] + bob, p[2]];
  // Lathed and tube parts that run along the body: backward (+z) or forward (-z), flattened.
  const aft = (z, y, flat, length = 1) => B(translate(0, y, z), scale(1, flat, 1), rotX(Math.PI / 2), scale(1, length, 1));
  const fore = (z, y, flat) => B(translate(0, y, z), scale(1, flat, 1), rotX(-Math.PI / 2));

  // Chassis under the body.
  m.box(B(translate(0, 6.6, 0.5), scale(9.5, 2.6, 15)), M.chassis);
  m.box(B(translate(0, 5.4, 0.5), scale(6, 1.2, 11)), M.dark);

  // Cargo hull behind, in team colour: seams, a plate band behind the neck, a hazard band
  // near the tail, side vents, a top hatch, tail lights and an antenna.
  m.lathe(aft(1.2, 11, 0.74), M.hull, [[5.4, 0], [8.4, 1.6], [9.5, 4], [9.8, 8], [9.3, 12], [8, 14.6], [6.2, 16.4], [3.6, 17.5], [0, 17.9]], 20);
  m.tube(aft(2.4, 11, 0.74, 1.6), M.bodyPlate, 9.0, 9.4, 20);
  m.tube(aft(14.4, 11, 0.74, 1.1), M.hazard, 9.0, 8.5, 20);
  for (const s of [-1, 1]){
    m.box(at([s * 9.4, 11, 8.6], scale(1.4, 3.4, 4.6)), M.dark);
    for (const y of [10.3, 11.7]) m.box(at([s * 9.9, y, 8.6], scale(0.8, 0.6, 4.2)), M.steel);
    m.box(at([s * 2.6, 11.4, 19.0], scale(1.6, 1.1, 0.8)), M.tail);
  }
  m.box(at([0, 18.1, 8.6], scale(5, 1, 6)), M.bodyPlate);
  m.box(at([0, 18.7, 6.2], scale(2.2, 0.7, 0.9)), M.amber);
  m.tube(along(pt([-4.5, 16.5, 13]), pt([-5.5, 25, 15.5])), M.steel, 0.42, 0.34, 6);
  m.ball(at([-5.5, 25, 15.5], scale(0.8)), M.glowDim, 8);

  // Neck: a dark joint with a steel collar.
  m.tube(aft(-1.8, 10.8, 0.8, 3.4), M.dark, 6.2, 6.2, 18);
  m.tube(aft(-0.6, 10.8, 0.8, 0.8), M.steel, 6.7, 6.7, 18);

  // Head in front: a plate cab with team cheek plates, a glass visor and three eyes.
  m.lathe(fore(-1, 11.2, 0.8), M.head, [[6.6, 0], [7.9, 1.4], [8.1, 4], [7.5, 6.8], [6.2, 8.8], [4, 10], [0, 10.6]], 20);
  for (const s of [-1, 1]) m.box(at([s * 7.9, 11, -4.2], scale(1.4, 3.2, 5.6)), M.team);
  m.box(at([0, 10.4, -10.2], scale(8.8, 3.2, 2.6)), M.glass);
  m.ball(at([0, 10.6, -11.7], scale(1.3)), M.glow, 10);
  for (const s of [-1, 1]) m.ball(at([s * 2.8, 10.4, -11.4], scale(0.9)), M.glow, 8);

  // Laser arm on the head: turret, upper arm with its piston, elbow hinge, forearm and emitter.
  m.tube(at([0, 17.2, -4.4]), M.dark, 3.9, 3.9, 16);
  m.lathe(at([0, 17.6, -4.4]), M.turret, [[3.4, 0, 1], [3.4, 1.2], [2.8, 1.9], [1.8, 2.3], [0, 2.4]], 16);
  const work = pose.work, shoulder = [0, 19.6, -4.4];
  const elbow = work == null ? [0, 24, -6.8] : [0, 23.5, -9.5 - Math.sin(work * Math.PI * 2) * 0.8];
  const tip = work == null ? [0, 21, -12.6] : [0, 15.5 + Math.sin(work * Math.PI * 2), -17.5];
  m.tube(along(pt(shoulder), pt(elbow)), M.amber, 1.4, 1.2, 10);
  piston(m, M, pt(add(shoulder, [1.5, -0.8, 0.6])), pt(add(mix(shoulder, elbow, 0.78), [1.5, 0, 0])), 0.6);
  m.tube(along(pt(add(elbow, [-1.6, 0, 0])), pt(add(elbow, [1.6, 0, 0]))), M.dark, 1.5, 1.5, 12);
  const base = mix(elbow, tip, 0.72);
  m.tube(along(pt(elbow), pt(base)), M.amber, 1.1, 0.95, 10);
  m.tube(along(pt(base), pt(tip)), M.dark, 1.35, 1.15, 10);
  m.ball(at(tip, scale(work == null ? 1.0 : 1.4)), work == null ? M.glowDim : M.glow, 10);

  // Legs: hip actuator, armoured upper leg with a piston, amber knee hinge, steel lower leg
  // with a shin guard, and a foot with two claws. Alternating groups of four: one pushes back
  // on the ground while the other swings forward in the air.
  LEGS.forEach((leg, i) => {
    for (const s of [-1, 1]){
      const hip = pt([leg.hip[0] * s, leg.hip[1], leg.hip[2]]);
      const a = leg.foot[0] * Math.PI / 180;
      let foot = [Math.sin(a) * leg.foot[1] * s, 0.8, -Math.cos(a) * leg.foot[1]];
      if (pose.walk != null){
        const p = (pose.walk + ((i + (s > 0 ? 0 : 1)) % 2) * 0.5) % 1;
        const stance = p < 0.5, t = stance ? p / 0.5 : (p - 0.5) / 0.5;
        foot = [foot[0], foot[1] + (stance ? 0 : LIFT * Math.sin(Math.PI * t)), foot[2] + (stance ? lerp(-STRIDE, STRIDE, t) : lerp(STRIDE, -STRIDE, t))];
      }
      const k = knee(hip, foot), out = norm([foot[0], 0, foot[2]]), down = norm(sub(foot, k));
      m.tube(along(sub(hip, mulv(out, 1.4)), add(hip, mulv(out, 1.0))), M.dark, 2.8, 2.8, 12);
      m.tube(along(add(hip, mulv(out, 1.0)), add(hip, mulv(out, 1.5))), M.amber, 1.6, 1.4, 10);
      m.tube(along(hip, k), M.plate, 2.2, 1.7, 12);
      piston(m, M, add(add(hip, [0, -1.8, 0]), mulv(out, 0.6)), add(mix(hip, k, 0.72), [0, -1.4, 0]), 0.75);
      const axis = norm(cross(sub(k, hip), sub(foot, k)));
      m.tube(along(sub(k, mulv(axis, 1.7)), add(k, mulv(axis, 1.7))), M.amber, 1.8, 1.8, 12);
      m.ball(mul(translate(k), scale(1.4)), M.dark, 10);
      m.tube(along(k, foot), M.steel, 1.6, 0.95, 10);
      m.tube(along(add(k, mulv(down, 1.2)), add(k, mulv(down, 4.6))), M.plate, 1.8, 1.6, 10);
      m.ball(mul(translate(foot), scale(1.3)), M.dark, 10);
      for (const turn of [-0.5, 0.5]){
        const c = Math.cos(turn), sn = Math.sin(turn), dir = [out[0] * c - out[2] * sn, 0, out[0] * sn + out[2] * c];
        m.tube(along(foot, add(foot, add(mulv(dir, 2), [0, -0.6, 0]))), M.steel, 0.45, 0.25, 6);
      }
    }
  });
  return m;
}

// ---- Rendering all facings and frames ----
const BUF_W = 220, BUF_H = 220, OX = 95, OY = 120;
function frames(){
  const poses = [];
  for (let i = 0; i < ANIMS.idle.frames; i++) poses.push({ bob: i ? 0.5 : 0 });
  for (let i = 0; i < ANIMS.walk.frames; i++) poses.push({ walk: i / ANIMS.walk.frames, bob: 0.4 * Math.cos(i / ANIMS.walk.frames * Math.PI * 4) });
  for (let i = 0; i < ANIMS.work.frames; i++) poses.push({ work: i / ANIMS.work.frames });
  const models = poses.map(spider);
  return FACINGS.map((_, f) => models.map(model =>
    renderSprite(model, { w: BUF_W, h: BUF_H, ox: OX, oy: OY, res: RES, heading: f * Math.PI / 4, outline: RAMP.outline[0] })));
}

// Crops every frame to the box that holds all sprites and shadows.
function crop(all){
  let x0 = BUF_W, y0 = BUF_H, x1 = 0, y1 = 0;
  for (const row of all) for (const f of row) for (let i = 0; i < BUF_W * BUF_H; i++){
    if (!f.px[i] && !f.shadow[i]) continue;
    const x = i % BUF_W, y = (i / BUF_W) | 0;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cut = a => { const o = new Uint8Array(w * h); for (let y = 0; y < h; y++) o.set(a.subarray((y0 + y) * BUF_W + x0, (y0 + y) * BUF_W + x0 + w), y * w); return o; };
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
