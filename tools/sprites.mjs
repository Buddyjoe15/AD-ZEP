// Builds the pixel-art test set into art/pixel-test/.
// Usage: node tools/sprites.mjs            write sheets, metadata, palette and src/render/pixel-data.js
//        node tools/sprites.mjs --capture  also render the scene and sheet previews (Playwright)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PALETTE, TEAMS, ALPHABET, C, Grid, rng, painter, rotate, finish, png, sheetRGBA } from './pixelart.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'art/pixel-test');
// The game loads the art from here (plain script, no build step); the preview page too.
export const DATA_FILE = path.join(ROOT, 'src/render/pixel-data.js');

export const FACINGS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const DIAG = Math.PI / 4;
// World scale: one art pixel is 1 world px, so a 48 px tile is 48 art px.
const WORLD_PX_PER_ART_PX = 1, TILE_ART = 48;

// ---- Units: draw(p, anim, frame) in local coordinates, forward = -y ----

// Utility Spider, 49×49. Eight legs in a radial layout (front pair forward-diagonal, middle
// pairs sideways, back pair back-diagonal) so the up-right facing keeps an X of legs
// instead of turning into a plus sign. Each leg has a hip actuator, a thick upper segment,
// a gold knee joint, a thinner lower segment and a clawed foot.
const SPIDER_LEGS = [   // hip, knee, foot (right side; the left side mirrors x)
  { hip: [5, -8], knee: [10, -12.5], foot: [12, -15] },
  { hip: [7, -3], knee: [14, -4.5], foot: [18.5, -5.5] },
  { hip: [7, 3], knee: [14, 4.5], foot: [18.5, 6] },
  { hip: [5, 9], knee: [10, 13], foot: [11.5, 15] }
];
function spider(p, anim, f){
  for (const side of [-1, 1]) SPIDER_LEGS.forEach((L, i) => {
    let [kx, ky] = L.knee, [fx, fy] = L.foot;
    if (anim === 'walk'){
      // Alternating tetrapod gait: one diagonal set steps while the other pushes.
      const setA = (i + (side > 0 ? 1 : 0)) % 2 === 0, ph = (f + (setA ? 0 : 2)) % 4;
      const d = [-2.5, 0, 2.5, 0][ph];
      fy += d; ky += d * 0.5;
      if (ph === 1){ fx -= 2; kx -= 1; }          // lifted leg tucks in
    }
    if (anim === 'work' && i === 0){
      // Front pair become manipulators reaching forward to the work point.
      const reach = [0, 1, 0, -1][f];
      kx = 7; ky = -15; fx = 3; fy = -19 - reach;
    }
    const hx = side * L.hip[0], hy = L.hip[1];
    p.thick(hx, hy, side * kx, ky, 3, 'steel2');
    p.thick(side * kx, ky, side * fx, fy, 2, 'steel1');
    p.line(side * fx, fy, side * (fx + (fx - kx) * 0.15), fy + (fy - ky) * 0.15, 'steel0');   // claw
    p.ellipse(side * kx, ky, 1.6, 1.6, 'gold1');
    p.ellipse(hx, hy, 2, 2, 'steel1');
    p.dot(hx, hy, 'steel3');
  });
  // Abdomen / cargo hold with the team plate, hatch seams, rivets and side vents.
  p.ellipse(0, 6, 9, 11, 'steel2');
  p.ellipse(0, 7, 6, 8, 'team1');
  p.rect(-4, 3, 4, 3, 'team0'); p.rect(-4, 10, 4, 10, 'team0'); p.rect(0, 3, 0, 10, 'team0');
  p.ellipse(0, 13, 3, 1.5, 'team2');
  for (const y of [-1, 2, 5, 8, 11]) for (const x of [-8, 8]) p.dot(x * (1 - Math.abs(y - 6) / 18), y, 'steel0');
  for (const [x, y] of [[-5, 0], [5, 0], [-5, 14], [5, 14]]) p.dot(x, y, 'steel3');
  p.rect(-3, -3, 3, -1, 'steel1');                   // neck joint
  p.dot(-2, -2, 'gold1'); p.dot(2, -2, 'gold1');
  // Head: sensor dome, visor band with twin eyes, mandibles.
  p.ellipse(0, -8, 7, 6, 'plate1');
  p.ellipse(-2, -9, 2.5, 2, 'plate2');
  p.rect(-4, -12, 4, -11, 'visor');
  const eye = anim === 'idle' && f === 1 ? 'visor' : 'cyan2';
  p.rect(-3, -12, -2, -11, eye); p.rect(2, -12, 3, -11, eye);
  p.dot(0, -12, 'cyan0');
  p.line(-2, -14, -3, -16, 'steel1'); p.line(2, -14, 3, -16, 'steel1');
  p.dot(0, -6, 'steel2');
  if (anim === 'work'){
    p.ellipse(0, -21, 1.2, 1.2, ['amber2', 'white', 'amber1', 'white'][f]);
    if (f % 2){ p.dot(f === 1 ? -2 : 2, -19, 'amber2'); p.dot(f === 1 ? 2 : -2, -22, 'amber2'); }
  }
}

// Security / hostile drone, 33×33. Quad rotor on four arms; the rotors spin through four frames.
function drone(p, anim, f){
  const hubs = [[-7, -7], [7, -7], [-7, 7], [7, 7]];
  for (const [x, y] of hubs) p.thick(0, 0, x, y, 2, 'steel1');
  hubs.forEach(([x, y], i) => {
    const a = (i % 2 ? -1 : 1) * f * Math.PI / 4 + i * 0.4;
    for (const off of [0, Math.PI / 2]){                 // two-blade rotor, motion-blurred
      const dx = Math.cos(a + off) * 4.5, dy = Math.sin(a + off) * 4.5;
      p.line(x - dx, y - dy, x + dx, y + dy, 'blur');
    }
    p.ellipse(x, y, 1.6, 1.6, 'steel0');
    p.dot(x, y, 'steel2');
  });
  p.thick(0, -4, 0, -11, 2, 'steel0');                 // barrel
  p.rect(-1, -12, 1, -12, 'steel1');                   // muzzle brake
  p.ellipse(0, 1, 5, 6, 'steel2');                     // body
  p.rect(-4, 1, 4, 1, 'steel1');                       // panel seam
  p.ellipse(0, 3, 3, 3, 'team1');                      // team plate
  p.dot(0, 3, 'team2');
  p.ellipse(0, -3, 1.6, 1.6, 'white');                 // sensor
  p.dot(-3, -2, 'cyan1'); p.dot(3, -2, 'cyan1');       // running lights
  p.line(0, 7, 0, 9, 'steel1'); p.dot(0, 10, 'red1');  // antenna
}

// Commander Elias Vance, 49×49, straight down on a hovering suit.
function vance(p, anim, f){
  const flame = anim === 'walk' ? [7, 9, 7, 9][f] : [2, 4, 6, 4][f];
  for (const x of [-6, 6]){
    p.thick(x, 13, x, 12 + flame, 2.5, 'cyan1');
    p.line(x, 13, x, 12 + Math.ceil(flame / 2), 'cyan2');
  }
  const swing = anim === 'walk' ? [-2, 0, 2, 0][f] : 0;
  p.rect(-18, -6 + swing, -16, 4 + swing, 'steel1');    // left arm
  p.ellipse(-17, 6 + swing, 2, 2, 'steel2');           // fist
  p.rect(15, -11, 18, 2, 'steel0');                    // right arm cannon
  p.rect(16, -11, 17, 0, 'steel1');
  p.rect(15, -13, 18, -12, 'cyan2');                   // muzzle
  p.dot(16, -5, 'amber2');
  p.ellipse(0, 3, 9, 8, 'steel1');                     // torso
  p.rect(-6, 4, 6, 10, 'steel2');                      // thruster pack
  p.rect(-6, 7, 6, 7, 'steel1');
  p.rect(-8, 10, -4, 12, 'steel0'); p.rect(4, 10, 8, 12, 'steel0');   // nozzles
  p.rect(-7, 11, -5, 11, 'cyan0'); p.rect(5, 11, 7, 11, 'cyan0');
  p.rect(-2, 5, 2, 8, 'gold1');                        // power core
  p.rect(-1, 6, 1, 7, 'amber2');
  p.rect(-14, -4, 14, 2, 'steel2');                    // shoulders
  for (const x of [-9, -7, 7, 9]) p.rect(x, -3, x, 1, 'steel1');   // vents
  p.ellipse(-11, -1, 5, 5, 'plate1'); p.ellipse(11, -1, 5, 5, 'plate1');   // pauldrons
  p.ellipse(-11, -1, 3, 3, 'team1'); p.ellipse(11, -1, 3, 3, 'team1');
  p.dot(-12, -2, 'team2'); p.dot(10, -2, 'team2');
  p.ellipse(0, -4, 7, 7, 'plate2');                    // helmet
  p.ellipse(0, -3, 5, 5, 'plate1');
  p.rect(-4, -10, 4, -8, 'visor');
  p.rect(-2, -10, 2, -10, 'cyan2');
  p.dot(3, -9, 'cyan1');
  p.line(4, -6, 6, -12, 'steel0'); p.dot(6, -13, 'red1');   // comms antenna
}

export const UNITS = {
  spider: { size: 49, draw: spider, anims: { idle: [2, 2], walk: [4, 8], work: [4, 6] }, shadow: [2, 4], elevation: 'ground' },
  drone: { size: 33, draw: drone, anims: { fly: [4, 16] }, shadow: [8, 10], elevation: 'air' },
  vance: { size: 49, draw: vance, anims: { idle: [4, 5], walk: [4, 8] }, shadow: [6, 8], elevation: 'hover' }
};

// Renders all eight facings of a unit: authored up and up-right, the rest rotated, then
// shaded and outlined in their final orientation.
function unitFrames(def){
  const authored = [0, DIAG].map(angle => {
    const frames = [];
    for (const [anim, [n]] of Object.entries(def.anims)) for (let f = 0; f < n; f++){
      const g = new Grid(def.size, def.size);
      def.draw(painter(g, angle), anim, f);
      frames.push(g);
    }
    return frames;
  });
  return FACINGS.map((_, i) => authored[i % 2].map(g => finish(rotate(g, i >> 1))));
}

// ---- Repair station (2×2 tiles = 96×96 art px), no facings ----
const S = 96, MID = 47.5;
const sp = g => painter(g, 0, [0, 0]);
const CORNERS = [[10, 10], [80, 10], [10, 80], [80, 80]];
function foundation(p){
  p.rect(6, 6, 89, 89, 'plate0');
  for (let v = 20; v <= 76; v += 14){ p.rect(7, v, 88, v, 'plate1'); p.rect(v, 7, v, 88, 'plate1'); }   // slab joints
  p.rect(6, 46, 89, 49, 'char1'); p.rect(46, 6, 49, 89, 'char1');   // service trenches
  p.rect(6, 47, 89, 48, 'char0'); p.rect(47, 6, 48, 89, 'char0');
  for (const [x, y] of CORNERS) { p.rect(x, y, x + 5, y + 5, 'steel0'); p.rect(x + 2, y + 2, x + 3, y + 3, 'steel2'); }   // anchor bolts
  for (let x = 18; x <= 74; x += 8) p.rect(x, 84, x + 3, 86, 'amber1');   // hazard strip
  for (let x = 22; x <= 78; x += 8) p.rect(x, 84, x + 3, 86, 'char0');
}
function frame(p){
  foundation(p);
  p.thick(14, 14, 81, 81, 2, 'steel2'); p.thick(81, 14, 14, 81, 2, 'steel2');   // cross bracing
  for (const [a, b, c, d] of [[10, 10, 85, 13], [10, 82, 85, 85], [10, 10, 13, 85], [82, 10, 85, 85]]) p.rect(a, b, c, d, 'steel1');   // girders
  for (let v = 18; v <= 78; v += 12){ p.dot(v, 11, 'steel3'); p.dot(v, 84, 'steel3'); p.dot(11, v, 'steel3'); p.dot(84, v, 'steel3'); }   // rivets
  p.rect(40, 40, 55, 55, 'steel2'); p.rect(44, 44, 51, 51, 'steel1');   // core mount
  for (const [x, y] of CORNERS) p.ellipse(x + 2.5, y + 2.5, 3, 3, 'steel0');
}
function finished(p, { lights = 'cyan1', cross = true } = {}){
  p.rect(8, 8, 87, 87, 'steel2');
  p.rect(18, 18, 77, 77, 'steel1');
  for (let v = 30; v <= 66; v += 12){ p.rect(19, v, 76, v, 'steel0'); p.rect(v, 19, v, 76, 'steel0'); }   // deck plating
  for (let y = 26; y <= 70; y += 4){ p.rect(10, y, 15, y + 1, 'steel0'); p.rect(80, y, 85, y + 1, 'steel0'); }   // side vents
  for (let v = 14; v <= 82; v += 8){ p.dot(v, 10, 'steel3'); p.dot(v, 85, 'steel3'); }   // rivets
  p.rect(24, 10, 71, 13, 'team1'); p.rect(24, 82, 71, 85, 'team1');   // team stripes
  p.rect(24, 12, 71, 12, 'team2'); p.rect(24, 83, 71, 83, 'team2');
  p.ellipse(MID, MID, 21, 21, 'plate0');
  p.ellipse(MID, MID, 19.5, 19.5, 'plate1');
  if (cross){
    p.rect(42, 30, 53, 65, 'green0'); p.rect(30, 42, 65, 53, 'green0');
    p.rect(44, 32, 51, 63, 'green1'); p.rect(32, 44, 63, 51, 'green1');
    p.rect(45, 33, 46, 40, 'white'); p.rect(33, 45, 40, 46, 'white');
  }
  if (lights) for (const [x, y] of CORNERS) p.rect(x, y, x + 3, y + 3, lights);
}
function paint(fn){ const g = new Grid(S, S); fn(sp(g), g); return finish(g); }
export const STATION_STATES = ['foundation', 'frame', 'near-complete', 'finished', 'working', 'damaged', 'rubble'];
function stationFrames(){
  const out = [];
  out.push(['foundation', paint(foundation)]);
  out.push(['frame', paint(frame)]);
  out.push(['near-complete', paint((p, g) => {
    const done = new Grid(S, S); finished(sp(done), { lights: null });
    frame(p);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!(x >= 48 && y < 48) && done.get(x, y)) g.set(x, y, done.get(x, y));
    for (let x = 52; x <= 86; x += 6) p.rect(x, 47, x + 1, 48, 'amber1');
    for (let y = 10; y <= 44; y += 6) p.rect(47, y, 48, y + 1, 'amber1');
  })]);
  out.push(['finished', paint(p => finished(p))]);
  for (let f = 0; f < 4; f++) out.push(['working', paint(p => {
    finished(p, { lights: null, cross: true });
    const a = f * Math.PI / 4, dx = Math.cos(a) * 18, dy = Math.sin(a) * 18;
    p.thick(MID - dx, MID - dy, MID + dx, MID + dy, 3, 'steel0');   // rotating repair arm
    p.ellipse(MID + dx, MID + dy, 2, 2, 'cyan2'); p.ellipse(MID - dx, MID - dy, 2, 2, 'cyan2');
    p.ellipse(MID, MID, 4, 4, 'steel0'); p.ellipse(MID, MID, 2, 2, 'steel2');
    if (f % 2) p.rect(46, 46, 49, 49, 'green1');
    [[10, 10], [80, 10], [80, 80], [10, 80]].forEach(([x, y], k) => p.rect(x, y, x + 3, y + 3, k === f ? 'cyan2' : 'cyan0'));
  })]);
  out.push(['damaged', paint((p, g) => {
    finished(p, { lights: null });
    const r = rng(41);
    for (let i = 0; i < 9; i++) p.ellipse(16 + r() * 64, 16 + r() * 64, 3 + r() * 5, 2 + r() * 4, r() < 0.5 ? 'rust1' : 'rust2');
    for (let i = 0; i < 6; i++) p.ellipse(16 + r() * 64, 16 + r() * 64, 2 + r() * 4, 2 + r() * 4, 'char1');
    for (let i = 0; i < 14; i++) p.dot(16 + r() * 64, 16 + r() * 64, 'rust0');   // pitting
    p.rect(58, 18, 74, 34, 'char0'); p.thick(58, 34, 74, 18, 2, 'steel0');       // torn-off plate
    p.line(58, 18, 62, 22, 'steel1');
    p.rect(32, 42, 63, 53, 'green0'); p.rect(42, 30, 53, 65, 'green0');
    p.rect(10, 10, 13, 13, 'red1'); p.rect(80, 80, 83, 83, 'red0');
    for (let x = 86; x <= 89; x++) for (let y = 38; y <= 42; y++) g.set(x, y, 0);   // chipped edge
  })]);
  out.push(['rubble', paint(p => {
    const r = rng(77);
    p.rect(6, 6, 44, 44, 'plate0'); p.rect(50, 52, 89, 89, 'plate0');     // cracked foundation slabs
    p.rect(6, 52, 24, 89, 'plate0'); p.line(8, 60, 40, 42, 'char0'); p.line(56, 87, 87, 60, 'char0');
    p.line(9, 61, 41, 43, 'char1');
    for (const [x, y] of CORNERS) p.rect(x, y, x + 5, y + 5, 'steel0');
    for (let i = 0; i < 12; i++) p.ellipse(16 + r() * 64, 16 + r() * 64, 4 + r() * 6, 3 + r() * 5, 'char0');
    for (let i = 0; i < 8; i++){ const x = 16 + r() * 60, y = 16 + r() * 60; p.thick(x, y, x + (r() - 0.5) * 28, y + (r() - 0.5) * 28, 2, 'steel1'); }   // bent girders
    const cols = ['steel2', 'plate0', 'rust1', 'char1', 'steel1', 'plate1'];
    for (let i = 0; i < 26; i++) p.ellipse(14 + r() * 68, 14 + r() * 68, 1.5 + r() * 4, 1.5 + r() * 3, cols[i % cols.length]);
    for (let i = 0; i < 30; i++) p.dot(12 + r() * 72, 12 + r() * 72, i % 2 ? 'char1' : 'plate1');   // grit
  })]);
  return out;
}

// ---- Dust plain terrain (48×48 tiles, seamless) ----
// Two octaves of value noise: a coarse lattice (8 px cells, the same world scale as the
// first set) and a fine one (4 px cells) for grain. `matched` (v2): every variant shares
// the lattice values on its border row and column, so any two variants meet without a
// seam, and its interior values are a permutation of one fixed set, so every variant has
// the same overall tone.
const lattice = (L, seed) => { const r = rng(seed); return { L, border: Array.from({ length: 2 * L - 1 }, () => r()), interior: Array.from({ length: (L - 1) ** 2 }, () => r()) }; };
const SHARED = [lattice(6, 9001), lattice(12, 9002)];
function noise(r, shared, matched){
  const L = shared.L, cell = TILE_ART / L;
  let lat;
  if (matched){
    const inner = shared.interior.slice();
    for (let i = inner.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [inner[i], inner[j]] = [inner[j], inner[i]]; }
    lat = new Array(L * L);
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++)
      lat[y * L + x] = y === 0 ? shared.border[x] : x === 0 ? shared.border[L - 1 + y] : inner[(y - 1) * (L - 1) + x - 1];
  } else lat = Array.from({ length: L * L }, () => r());
  const at = (x, y) => lat[((y % L + L) % L) * L + ((x % L + L) % L)];
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = sm(gx - x0), ty = sm(gy - y0);
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
}
function dustTile(seed, { speckles = 24, pebbles = 0, stones = 0, crack = false, matched = false } = {}){
  const r = rng(seed), g = new Grid(TILE_ART, TILE_ART), N = TILE_ART;
  const coarse = noise(r, SHARED[0], matched), fine = noise(r, SHARED[1], matched);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    const v = coarse(x, y) * 0.62 + fine(x, y) * 0.26 + r() * 0.12;
    g.set(x, y, C[v < 0.36 ? 'dust1' : v < 0.64 ? 'dust2' : 'dust3']);
  }
  const put = (x, y, c) => g.set(((x % N) + N) % N, ((y % N) + N) % N, C[c]);   // wraps: seamless
  for (let i = 0; i < speckles; i++) put(Math.floor(r() * N), Math.floor(r() * N), r() < 0.5 ? 'dust0' : 'dust4');
  // Pebble: lit top-left, shadowed bottom-right (terrain is never rotated).
  const PEBBLE = [[1, 0, 'dust4'], [2, 0, 'dust4'], [0, 1, 'dust4'], [1, 1, 'dust5'], [2, 1, 'dust4'], [3, 1, 'dust3'],
    [0, 2, 'dust3'], [1, 2, 'dust3'], [2, 2, 'dust3'], [3, 2, 'dust1'], [1, 3, 'dust0'], [2, 3, 'dust0'], [3, 3, 'dust1']];
  for (let i = 0; i < pebbles; i++){ const x = Math.floor(r() * N), y = Math.floor(r() * N); for (const [dx, dy, c] of PEBBLE) put(x + dx, y + dy, c); }
  for (let i = 0; i < stones; i++){
    const x = Math.floor(r() * N), y = Math.floor(r() * N), w = 7, h = 6;
    for (let dy = 0; dy <= h; dy++) for (let dx = 0; dx <= w; dx++){
      const ex = (dx - w / 2) / (w / 2), ey = (dy - h / 2) / (h / 2), d = ex * ex + ey * ey;
      if (d > 1) continue;
      const lit = ex + ey;   // -2 at the top-left, +2 at the bottom-right
      put(x + dx, y + dy, d > 0.7 ? (lit > 0 ? 'dust0' : 'dust3') : lit < -0.6 ? 'dust5' : lit < 0.3 ? 'dust4' : 'dust3');
    }
    for (let dx = 1; dx < w; dx++) put(x + dx, y + h + 1, 'dust0');   // contact shadow
  }
  if (crack){
    let x = Math.floor(r() * N), y = Math.floor(r() * N);
    for (let i = 0; i < 30; i++){
      put(x, y, 'dust0'); if (i % 3 === 0) put(x, y + 1, 'dust1');
      x += r() < 0.6 ? 1 : 0; y += r() < 0.5 ? 1 : r() < 0.3 ? -1 : 0;
      if (i === 14){ let bx = x, by = y; for (let k = 0; k < 8; k++){ put(bx, by, 'dust0'); bx -= r() < 0.5 ? 1 : 0; by += 1; } }   // branch
    }
  }
  return g;
}
// v1 is the tested set (4 variants, picked with a linear hash: forms diagonal bands at a
// distance). v2 is the fix: 8 weighted, edge-matched variants picked with a mixing integer hash.
export const TERRAIN = {
  v1: { hash: 'linear', formula: '(3*x + 5*y) & 3', weights: [1, 1, 1, 1],
    tiles: () => [dustTile(11), dustTile(12), dustTile(13, { speckles: 56 }), dustTile(14, { pebbles: 6 })] },
  v2: { hash: 'mix32', formula: 'fmix32(x * 0x9E3779B1 ^ y * 0x85EBCA77 ^ seed) mod total weight', weights: [6, 6, 6, 4, 3, 2, 1, 1],
    tiles: () => [{}, {}, {}, { speckles: 56 }, { pebbles: 4 }, { pebbles: 8, speckles: 40 }, { crack: true }, { stones: 1, pebbles: 2 }]
      .map((o, i) => dustTile(21 + i, { ...o, matched: true })) }
};

// ---- Build everything in memory ----
export function build(){
  const sprites = {}, sheets = {};
  for (const [name, def] of Object.entries(UNITS)){
    const rows = unitFrames(def), animations = {};
    let start = 0;
    for (const [anim, [frames, fps]] of Object.entries(def.anims)){ animations[anim] = { start, frames, fps }; start += frames; }
    const meta = {
      name, frameWidth: def.size, frameHeight: def.size, origin: [(def.size - 1) / 2, (def.size - 1) / 2],
      worldPxPerArtPx: WORLD_PX_PER_ART_PX, rows: 'facing', facings: FACINGS, authoredFacings: ['up', 'up-right'],
      animations, shadow: { drawnBy: 'engine', offset: def.shadow, elevation: def.elevation }, team: 'team0..team2 (magenta ramp)'
    };
    sprites[name] = { ...meta, frames: rows.map(r => r.map(g => g.encode())) };
    sheets[name] = { meta, rows };
  }
  const st = stationFrames(), states = {};
  st.forEach(([state], i) => { (states[state] ||= { start: i, frames: 0 }).frames++; });
  states.working.fps = 6;
  const stationMeta = {
    name: 'repair_station', frameWidth: S, frameHeight: S, origin: [0, 0], footprintTiles: [2, 2],
    worldPxPerArtPx: WORLD_PX_PER_ART_PX, rows: 'single row', states, shadow: { drawnBy: 'engine', offset: [2, 2], elevation: 'ground' },
    team: 'team0..team2 (magenta ramp)'
  };
  sprites.repair_station = { ...stationMeta, frames: [st.map(([, g]) => g.encode())] };
  sheets.repair_station = { meta: stationMeta, rows: [st.map(([, g]) => g)] };
  const terrain = {};
  for (const [v, T] of Object.entries(TERRAIN)){
    const tiles = T.tiles();
    terrain[v] = { hash: T.hash, formula: T.formula, weights: T.weights, tiles: tiles.map(g => g.encode()) };
    const meta = { name: 'dust_plain_' + v, frameWidth: TILE_ART, frameHeight: TILE_ART, variants: tiles.length, hash: T.hash, formula: T.formula, weights: T.weights };
    sheets['dust_plain_' + v] = { meta, rows: [tiles] };
  }
  const data = {
    alphabet: ALPHABET, palette: PALETTE.map(([name, hex]) => ({ name, hex })), teamIndex: [C.team0, C.team1, C.team2], teams: TEAMS,
    tileArt: TILE_ART, worldPxPerArtPx: WORLD_PX_PER_ART_PX, sprites, terrain
  };
  return { data, sheets };
}

export function dataScript(data){
  return '/* Pixel-art sprites, terrain and palette as palette-indexed text. Generated by tools/sprites.mjs;\n   do not edit, run `npm run sprites`. Read by src/render/pixelart.js and art/pixel-test/preview.html. */\nwindow.PIXEL_ART = ' + JSON.stringify(data) + ';\n';
}

function write(){
  const { data, sheets } = build();
  fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true });
  for (const [name, { meta, rows }] of Object.entries(sheets)){
    const s = sheetRGBA(rows, meta.frameWidth, meta.frameHeight);
    fs.writeFileSync(path.join(OUT, 'sheets', name + '.png'), png(s.w, s.h, s.rgba));
    fs.writeFileSync(path.join(OUT, 'sheets', name + '.json'), JSON.stringify({ ...meta, image: name + '.png', sheetWidth: s.w, sheetHeight: s.h }, null, 2) + '\n');
  }
  // Palette: JSON plus an 8 px swatch strip.
  fs.writeFileSync(path.join(OUT, 'sheets', 'palette.json'), JSON.stringify({ colors: data.palette, teams: TEAMS, teamPlaceholders: ['team0', 'team1', 'team2'] }, null, 2) + '\n');
  const sw = PALETTE.map((_, i) => { const g = new Grid(8, 8); g.p.fill(i + 1); return g; });
  const ps = sheetRGBA([sw], 8, 8);
  fs.writeFileSync(path.join(OUT, 'sheets', 'palette.png'), png(ps.w, ps.h, ps.rgba));
  fs.writeFileSync(DATA_FILE, dataScript(data));
  console.log(`Wrote ${Object.keys(sheets).length} sheets and palette (${PALETTE.length} colours) to ${path.relative(ROOT, OUT)}, game data to ${path.relative(ROOT, DATA_FILE)}`);
}

async function capture(){
  const { createRequire } = await import('node:module');
  const { execSync } = await import('node:child_process');
  const require = createRequire(import.meta.url), tries = ['playwright', process.env.PLAYWRIGHT_MODULE];
  try { tries.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e){ /* no npm */ }
  let pw = null;
  for (const t of tries.filter(Boolean)){ try { pw = require(t); break; } catch (e){ /* next */ } }
  if (!pw){ console.error('Playwright is not installed; skipping previews.'); process.exitCode = 1; return; }
  const browser = await pw.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const dir = path.join(OUT, 'previews'), page0 = pathToFileURL(path.join(OUT, 'preview.html')).href;
  fs.mkdirSync(dir, { recursive: true });
  const shot = async (query, file, opts) => {
    const page = await browser.newPage(opts);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(page0 + '?' + query);
    await page.waitForFunction(() => window.PREVIEW_READY === true);
    await page.screenshot({ path: path.join(dir, file), fullPage: !!opts.fullPage });
    await page.close();
    if (errors.length) throw new Error(file + ': ' + errors.join('; '));
    console.log('  ' + path.relative(ROOT, path.join(dir, file)));
  };
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  for (const [z, tag] of [['0.333', '033'], ['0.667', '067'], ['1', '100']]) await shot(`zoom=${z}&t=0.4&hud=0`, `scene-zoom-${tag}.png`, phone);
  await shot('zoom=0.333&t=0.4&hud=0&tiles=v1', 'scene-zoom-033-tiles-v1.png', phone);
  const desk = { viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1, fullPage: true };
  for (const s of ['spider', 'drone', 'vance', 'repair_station', 'terrain']) await shot(`view=sheets&only=${s}&hud=0`, `sheet-${s}.png`, desk);
  await browser.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  write();
  if (process.argv.includes('--capture')) await capture();
}
