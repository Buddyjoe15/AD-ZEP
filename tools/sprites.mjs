// Builds the pixel-art test set into art/pixel-test/.
// Usage: node tools/sprites.mjs            write sheets, metadata, palette and sprites-data.js
//        node tools/sprites.mjs --capture  also render the scene and sheet previews (Playwright)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PALETTE, TEAMS, ALPHABET, C, Grid, rng, painter, rotate, finish, png, sheetRGBA } from './pixelart.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'art/pixel-test');

export const FACINGS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const DIAG = Math.PI / 4;
// World scale: one art pixel is 2 world px, so a 48 px tile is 24 art px.
const WORLD_PX_PER_ART_PX = 2, TILE_ART = 24;

// ---- Units: draw(p, anim, frame) in local coordinates, forward = -y ----

// Utility Spider, 25×25. Eight legs in a radial layout (front pair forward-diagonal, middle
// pairs sideways, back pair back-diagonal) so the up-right facing keeps an X of legs
// instead of turning into a plus sign.
const SPIDER_LEGS = [   // hip, knee, foot (right side; the left side mirrors x)
  { hip: [2.5, -4], knee: [5.5, -7], foot: [7, -9] },
  { hip: [3.5, -1.5], knee: [7.5, -2.5], foot: [10, -3] },
  { hip: [3.5, 1.5], knee: [7.5, 2.5], foot: [10, 3.5] },
  { hip: [2.5, 4.5], knee: [5.5, 7.5], foot: [7, 9] }
];
function spider(p, anim, f){
  for (const side of [-1, 1]) SPIDER_LEGS.forEach((L, i) => {
    let [kx, ky] = L.knee, [fx, fy] = L.foot;
    if (anim === 'walk'){
      // Alternating tetrapod gait: one diagonal set steps while the other pushes.
      const setA = (i + (side > 0 ? 1 : 0)) % 2 === 0, ph = (f + (setA ? 0 : 2)) % 4;
      const d = [-1.5, 0, 1.5, 0][ph];
      fy += d; ky += d * 0.5;
      if (ph === 1){ fx -= 1; kx -= 0.5; }        // lifted leg tucks in
    }
    if (anim === 'work' && i === 0){
      // Front pair become manipulators reaching forward to the work point.
      const reach = [0, 1, 0, -1][f];
      kx = 3.5; ky = -8; fx = 1.5; fy = -10 - reach * 0.5;
    }
    p.line(side * L.hip[0], L.hip[1], side * kx, ky, 'steel2');
    p.line(side * kx, ky, side * fx, fy, 'steel1');
    p.dot(side * kx, ky, 'gold1');
    p.dot(side * fx, fy, 'steel0');
  });
  p.ellipse(0, 3, 4.5, 5.5, 'steel2');           // abdomen / cargo hold
  p.ellipse(0, 3.5, 2.5, 3.5, 'team1');           // team plate
  p.rect(-2, 3, 2, 3, 'team0');                   // hatch seam
  p.ellipse(0, -4, 3.5, 3, 'plate1');             // head
  const eye = anim === 'idle' && f === 1 ? 'visor' : 'cyan2';
  p.rect(-1, -6, 1, -6, eye);
  if (anim === 'work'){
    p.dot(0, -11, ['amber2', 'white', 'amber1', 'white'][f]);
    if (f % 2) p.dot(f === 1 ? -1 : 1, -10, 'amber2');
  }
}

// Security / hostile drone, 17×17. Quad rotor; the rotors spin through four frames.
function drone(p, anim, f){
  const hubs = [[-4, -4], [4, -4], [-4, 4], [4, 4]];
  for (const [x, y] of hubs) p.line(0, 0, x, y, 'steel1');
  hubs.forEach(([x, y], i) => {
    const a = (i % 2 ? -1 : 1) * f * Math.PI / 4 + i * 0.4, dx = Math.cos(a) * 2.2, dy = Math.sin(a) * 2.2;
    p.line(x - dx, y - dy, x + dx, y + dy, 'blur');
    p.dot(x, y, 'steel0');
  });
  p.line(0, -2, 0, -6, 'steel0');                 // barrel
  p.ellipse(0, 0.5, 2.5, 3, 'steel2');            // body
  p.ellipse(0, 1, 1.5, 1.5, 'team1');             // team plate
  p.dot(0, -2, 'white');                          // sensor
}

// Commander Elias Vance, 25×25, straight down on a hovering suit.
function vance(p, anim, f){
  const flame = anim === 'walk' ? [4, 5, 4, 5][f] : [1, 2, 3, 2][f];
  for (const x of [-3, 3]){
    p.line(x, 7, x, 6 + flame, 'cyan1');
    p.line(x, 7, x, 6 + Math.ceil(flame / 2), 'cyan2');
  }
  const swing = anim === 'walk' ? [-1, 0, 1, 0][f] : 0;
  p.rect(-9, -3 + swing, -8, 2 + swing, 'steel1');     // left arm
  p.rect(8, -6, 9, 1, 'steel0');                       // right arm cannon
  p.rect(8, -7, 9, -7, 'cyan2');                       // muzzle
  p.ellipse(0, 1.5, 4.5, 4, 'steel1');                 // torso
  p.rect(-3, 2, 3, 5, 'steel2');                       // thruster pack
  p.rect(-4, 5, -2, 6, 'steel0'); p.rect(2, 5, 4, 6, 'steel0');
  p.rect(-1, 3, 1, 4, 'gold1');
  p.rect(-7, -2, 7, 1, 'steel2');                      // shoulders
  p.ellipse(-5.5, -0.5, 2.5, 2.5, 'plate1'); p.ellipse(5.5, -0.5, 2.5, 2.5, 'plate1');
  p.rect(-7, -1, -6, 0, 'team1'); p.rect(6, -1, 7, 0, 'team1');
  p.ellipse(0, -2, 3.5, 3.5, 'plate2');                // helmet
  p.rect(-2, -5, 2, -4, 'visor');
  p.rect(-1, -5, 1, -5, 'cyan2');
}

export const UNITS = {
  spider: { size: 25, draw: spider, anims: { idle: [2, 2], walk: [4, 8], work: [4, 6] }, shadow: [1, 2], elevation: 'ground' },
  drone: { size: 17, draw: drone, anims: { fly: [4, 16] }, shadow: [4, 5], elevation: 'air' },
  vance: { size: 25, draw: vance, anims: { idle: [4, 5], walk: [4, 8] }, shadow: [3, 4], elevation: 'hover' }
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

// ---- Repair station (2×2 tiles = 48×48 art px), no facings ----
const S = 48, MID = 23.5;
const sp = g => painter(g, 0, [0, 0]);
function foundation(p){
  p.rect(3, 3, 44, 44, 'plate0');
  p.rect(3, 23, 44, 24, 'char1'); p.rect(23, 3, 24, 44, 'char1');
  for (const [x, y] of [[5, 5], [40, 5], [5, 40], [40, 40]]) p.rect(x, y, x + 2, y + 2, 'steel0');
  for (let x = 9; x <= 37; x += 4) p.rect(x, 42, x + 1, 43, 'amber1');
}
function frame(p){
  foundation(p);
  p.line(7, 7, 40, 40, 'steel2'); p.line(40, 7, 7, 40, 'steel2');
  p.rect(5, 5, 42, 6, 'steel1'); p.rect(5, 41, 42, 42, 'steel1');
  p.rect(5, 5, 6, 42, 'steel1'); p.rect(41, 5, 42, 42, 'steel1');
  p.rect(20, 20, 27, 27, 'steel2');
}
function finished(p, { lights = 'cyan1', cross = true } = {}){
  p.rect(4, 4, 43, 43, 'steel2');
  p.rect(9, 9, 38, 38, 'steel1');
  for (let y = 13; y <= 34; y += 3){ p.rect(5, y, 7, y, 'steel0'); p.rect(40, y, 42, y, 'steel0'); }
  p.rect(12, 5, 35, 6, 'team1'); p.rect(12, 41, 35, 42, 'team1');
  p.ellipse(MID, MID, 10.5, 10.5, 'plate1');
  if (cross){
    p.rect(21, 15, 26, 32, 'green0'); p.rect(15, 21, 32, 26, 'green0');
    p.rect(22, 16, 25, 31, 'green1'); p.rect(16, 22, 31, 25, 'green1');
  }
  if (lights) for (const [x, y] of [[5, 5], [41, 5], [5, 41], [41, 41]]) p.rect(x, y, x + 1, y + 1, lights);
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
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!(x >= 24 && y < 24) && done.get(x, y)) g.set(x, y, done.get(x, y));
    for (let x = 26; x <= 42; x += 4) p.dot(x, 24, 'amber1');
    for (let y = 6; y <= 22; y += 4) p.dot(24, y, 'amber1');
  })]);
  out.push(['finished', paint(p => finished(p))]);
  for (let f = 0; f < 4; f++) out.push(['working', paint(p => {
    finished(p, { lights: null, cross: true });
    const a = f * Math.PI / 4, dx = Math.cos(a) * 9, dy = Math.sin(a) * 9;
    p.line(MID - dx, MID - dy, MID + dx, MID + dy, 'steel0');
    p.line(MID - dx + 1, MID - dy, MID + dx + 1, MID + dy, 'steel0');
    p.dot(MID + dx, MID + dy, 'cyan2'); p.dot(MID - dx, MID - dy, 'cyan2');
    p.ellipse(MID, MID, 2, 2, 'steel0');
    if (f % 2) p.rect(23, 23, 24, 24, 'green1');
    [[5, 5], [41, 5], [41, 41], [5, 41]].forEach(([x, y], k) => p.rect(x, y, x + 1, y + 1, k === f ? 'cyan2' : 'cyan0'));
  })]);
  out.push(['damaged', paint((p, g) => {
    finished(p, { lights: null });
    const r = rng(41);
    for (let i = 0; i < 7; i++) p.ellipse(8 + r() * 32, 8 + r() * 32, 1.5 + r() * 2.5, 1 + r() * 2, r() < 0.5 ? 'rust1' : 'rust2');
    for (let i = 0; i < 5; i++) p.ellipse(8 + r() * 32, 8 + r() * 32, 1 + r() * 2, 1 + r() * 2, 'char1');
    p.rect(29, 9, 37, 17, 'char0'); p.line(29, 17, 37, 9, 'steel0');   // torn-off plate
    p.rect(16, 21, 31, 26, 'green0'); p.rect(21, 15, 26, 32, 'green0');
    p.rect(5, 5, 6, 6, 'red1'); p.rect(41, 41, 42, 42, 'red0');
    for (let x = 43; x <= 44; x++) g.set(x, 20, 0);                   // chipped edge
  })]);
  out.push(['rubble', paint(p => {
    const r = rng(77);
    p.rect(3, 3, 22, 22, 'plate0'); p.rect(25, 26, 44, 44, 'plate0');      // cracked foundation slabs
    p.rect(3, 26, 12, 44, 'plate0'); p.line(4, 30, 20, 21, 'char0'); p.line(28, 43, 43, 30, 'char0');
    for (const [x, y] of [[5, 5], [40, 5], [5, 40], [40, 40]]) p.rect(x, y, x + 2, y + 2, 'steel0');
    for (let i = 0; i < 9; i++) p.ellipse(8 + r() * 32, 8 + r() * 32, 2 + r() * 3, 1.5 + r() * 2.5, 'char0');
    for (let i = 0; i < 6; i++){ const x = 8 + r() * 30, y = 8 + r() * 30; p.line(x, y, x + (r() - 0.5) * 14, y + (r() - 0.5) * 14, 'steel1'); }
    const cols = ['steel2', 'plate0', 'rust1', 'char1', 'steel1', 'plate1'];
    for (let i = 0; i < 16; i++) p.ellipse(7 + r() * 34, 7 + r() * 34, 1 + r() * 2.5, 1 + r() * 2, cols[i % cols.length]);
  })]);
  return out;
}

// ---- Dust plain terrain (24×24 tiles, seamless) ----
// `matched` (v2): every variant shares the lattice values on its border row and column, so
// any two variants meet without a seam, and its interior values are a permutation of one
// fixed set, so every variant has the same overall tone.
const SHARED = (() => { const r = rng(9001); return { border: Array.from({ length: 11 }, () => r()), interior: Array.from({ length: 25 }, () => r()) }; })();
function dustTile(seed, { speckles = 6, pebbles = 0, stones = 0, crack = false, matched = false } = {}){
  const r = rng(seed), g = new Grid(TILE_ART, TILE_ART), L = 6, cell = TILE_ART / L;
  let lat;
  if (matched){
    const inner = SHARED.interior.slice();
    for (let i = inner.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [inner[i], inner[j]] = [inner[j], inner[i]]; }
    lat = new Array(L * L);
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++)
      lat[y * L + x] = y === 0 ? SHARED.border[x] : x === 0 ? SHARED.border[L - 1 + y] : inner[(y - 1) * (L - 1) + x - 1];
  } else lat = Array.from({ length: L * L }, () => r());
  const at = (x, y) => lat[((y % L + L) % L) * L + ((x % L + L) % L)];
  const sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < TILE_ART; y++) for (let x = 0; x < TILE_ART; x++){
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = sm(gx - x0), ty = sm(gy - y0);
    const n = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
    const v = n * 0.8 + r() * 0.2;
    g.set(x, y, C[v < 0.36 ? 'dust1' : v < 0.64 ? 'dust2' : 'dust3']);
  }
  const put = (x, y, c) => g.set(((x % 24) + 24) % 24, ((y % 24) + 24) % 24, C[c]);   // wraps: seamless
  for (let i = 0; i < speckles; i++) put(Math.floor(r() * 24), Math.floor(r() * 24), r() < 0.5 ? 'dust0' : 'dust4');
  for (let i = 0; i < pebbles; i++){
    const x = Math.floor(r() * 24), y = Math.floor(r() * 24);
    put(x, y, 'dust4'); put(x + 1, y, 'dust4'); put(x, y + 1, 'dust3'); put(x + 1, y + 1, 'dust0'); put(x + 2, y + 1, 'dust1');
  }
  for (let i = 0; i < stones; i++){
    const x = Math.floor(r() * 24), y = Math.floor(r() * 24);
    for (const [dx, dy, c] of [[1, 0, 'dust5'], [2, 0, 'dust4'], [0, 1, 'dust5'], [1, 1, 'dust4'], [2, 1, 'dust4'], [3, 1, 'dust3'],
      [0, 2, 'dust4'], [1, 2, 'dust3'], [2, 2, 'dust3'], [3, 2, 'dust1'], [1, 3, 'dust1'], [2, 3, 'dust0']]) put(x + dx, y + dy, c);
  }
  if (crack){
    let x = Math.floor(r() * 24), y = Math.floor(r() * 24);
    for (let i = 0; i < 14; i++){ put(x, y, 'dust0'); x += r() < 0.6 ? 1 : 0; y += r() < 0.5 ? 1 : r() < 0.3 ? -1 : 0; }
  }
  return g;
}
// v1 is the tested set (4 variants, picked with a linear hash: forms diagonal bands at a
// distance). v2 is the fix: 8 weighted, edge-matched variants picked with a mixing integer hash.
export const TERRAIN = {
  v1: { hash: 'linear', formula: '(3*x + 5*y) & 3', weights: [1, 1, 1, 1],
    tiles: () => [dustTile(11), dustTile(12), dustTile(13, { speckles: 14 }), dustTile(14, { pebbles: 3 })] },
  v2: { hash: 'mix32', formula: 'fmix32(x * 0x9E3779B1 ^ y * 0x85EBCA77 ^ seed) mod total weight', weights: [6, 6, 6, 4, 3, 2, 1, 1],
    tiles: () => [{}, {}, {}, { speckles: 14 }, { pebbles: 2 }, { pebbles: 4, speckles: 10 }, { crack: true }, { stones: 1, pebbles: 1 }]
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
  return '/* Generated by tools/sprites.mjs. Do not edit; run `npm run sprites`. */\nwindow.PIXEL_TEST = ' + JSON.stringify(data) + ';\n';
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
  fs.writeFileSync(path.join(OUT, 'sprites-data.js'), dataScript(data));
  console.log(`Wrote ${Object.keys(sheets).length} sheets, palette (${PALETTE.length} colours) and sprites-data.js to ${path.relative(ROOT, OUT)}`);
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
