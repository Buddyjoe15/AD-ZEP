// Builds the pixel-art test set into art/pixel-test/.
// Usage: node tools/sprites.mjs            write sheets, metadata, palette and src/render/pixel-data.js
//        node tools/sprites.mjs --capture  also render the scene and sheet previews (Playwright)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PALETTE, TEAMS, ALPHABET, C, Grid, rng, painter, rotate, finish, png, sheetRGBA } from './pixelart.mjs';
import { renderSprite, renderStructure, LIFT, OUTLINE, RES as KIT_RES } from './sprite-kit.mjs';
import salvageCrawler from '../art/sprite-lab/specs/salvage_crawler.mjs';
import { genesisTrees, rle } from './genesis-trees.mjs';
import sentryTurret from '../art/sprite-lab/specs/sentry_turret.mjs';
import laserTurret from '../art/sprite-lab/specs/laser_turret.mjs';
import woodWall from '../art/sprite-lab/specs/wood_wall.mjs';
import metalWall from '../art/sprite-lab/specs/metal_wall.mjs';
import reinforcedWall from '../art/sprite-lab/specs/reinforced_wall.mjs';
import gate2 from '../art/sprite-lab/specs/gate.mjs';
import gate3 from '../art/sprite-lab/specs/gate_3.mjs';
import gate4 from '../art/sprite-lab/specs/gate_4.mjs';
import gate2v from '../art/sprite-lab/specs/gate_v.mjs';
import gate3v from '../art/sprite-lab/specs/gate_3_v.mjs';
import gate4v from '../art/sprite-lab/specs/gate_4_v.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'art/pixel-test');
// The game loads the art from here (plain script, no build step); the preview page too.
export const DATA_FILE = path.join(ROOT, 'src/render/pixel-data.js');

export const FACINGS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const DIAG = Math.PI / 4;
// World scale. Terrain tiles are drawn at 2 art px per world px: a 48 world px tile is
// TILE_ART = 96 art px, and terrain features are sized in world px times K. Units and
// structures are drawn at SPRITE_RES (the sprite kit's RES, 4) art px per world px: their
// shapes are given in world px and drawn with four times the pixels across, so a Spider is
// 49 world px and 196 art px.
const TERRAIN_RES = 2, K = TERRAIN_RES, WORLD_PX_PER_ART_PX = 1 / TERRAIN_RES, TILE_ART = 48 * TERRAIN_RES, SPRITE_RES = KIT_RES;

// ---- Units: draw(p, anim, frame) in local coordinates, forward = -y ----

// Utility Spider, 49×49 world px. Eight legs in a radial layout (front pair forward-diagonal, middle
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

// Security / hostile drone, 33×33 world px. Quad rotor on four arms; the rotors spin through four frames.
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

// Commander Elias Vance, 49×49 world px, straight down on a hovering suit.
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

// `size` and `shadow` are in world px.
export const UNITS = {
  spider: { size: 49, draw: spider, anims: { idle: [2, 2], walk: [4, 8], work: [4, 6] }, shadow: [2, 4], elevation: 'ground' },
  drone: { size: 33, draw: drone, anims: { fly: [4, 16] }, shadow: [8, 10], elevation: 'air' },
  vance: { size: 49, draw: vance, anims: { idle: [4, 5], walk: [4, 8] }, shadow: [6, 8], elevation: 'hover' }
};

// Renders all eight facings of a unit: authored up and up-right, the rest rotated, then
// shaded and outlined in their final orientation.
function unitFrames(def){
  const N = def.size * SPRITE_RES;
  const authored = [0, DIAG].map(angle => {
    const frames = [];
    for (const [anim, [n]] of Object.entries(def.anims)) for (let f = 0; f < n; f++){
      const g = new Grid(N, N);
      def.draw(painter(g, angle, undefined, SPRITE_RES), anim, f);
      frames.push(g);
    }
    return frames;
  });
  return FACINGS.map((_, i) => authored[i % 2].map(g => finish(rotate(g, i >> 1))));
}

// Units modelled in 3D in the sprite lab (art/sprite-lab/specs/, rules section 5). Every facing
// is rendered from the model with the light staying top left, in the game's odd frame size.
// A spec with variants (the crawler's hopper fill) repeats its animations once per variant.
export const MODELLED = {
  salvage_crawler: { size: 49, spec: salvageCrawler, shadow: [2, 4], elevation: 'ground' }
};
function modelFrames(def){
  const N = def.size * SPRITE_RES, spec = def.spec, seq = [];
  for (const variant of spec.variants ? spec.variants.values : [null])
    for (const [anim, a] of Object.entries(spec.animations)) for (let frame = 0; frame < a.frames; frame++) seq.push({ anim, frame, frames: a.frames, variant });
  return FACINGS.map((_, i) => seq.map(s => {
    const { px } = renderSprite(spec.build(s), { w: N, h: N, ox: N / 2, oy: N / 2, res: SPRITE_RES, heading: i * DIAG, lift: LIFT, outline: OUTLINE });
    const g = new Grid(N, N); g.p.set(px); return g;
  }));
}

// Structures modelled in the sprite lab: one row of states (footprint × 96 art px, origin at
// the top-left of the footprint in the game), and, for a turret, a head layer that turns: one
// row per facing, clockwise from up, each rendered from the model about the footprint centre.
// Walls have connecting states (16 frames, one per neighbour mask); vertical gates are the
// horizontal model turned (spec.heading). Keyed by the game's buildable key.
const STRUCTURE = { shadow: [4, 4], elevation: 'structure' };
export const MODELLED_STRUCTURES = {
  sentry_turret: { spec: sentryTurret, ...STRUCTURE },
  laser_turret: { spec: laserTurret, ...STRUCTURE },
  wood_wall: { spec: woodWall, ...STRUCTURE },
  defensive_wall: { spec: metalWall, ...STRUCTURE },
  reinforced_wall: { spec: reinforcedWall, ...STRUCTURE },
  gate: { spec: gate2, ...STRUCTURE }, gate_3: { spec: gate3, ...STRUCTURE }, gate_4: { spec: gate4, ...STRUCTURE },
  gate_v: { spec: gate2v, ...STRUCTURE }, gate_3_v: { spec: gate3v, ...STRUCTURE }, gate_4_v: { spec: gate4v, ...STRUCTURE }
};
function structureFrames(spec){
  const F = spec.frame, render = (model, heading = spec.heading || 0) => {
    const { px } = renderStructure(model, F, { heading, bleed: (spec.bleed || 0) * SPRITE_RES / 2 });   // (bleed is given at 2 art px per world px)
    const g = new Grid(F.w, F.h); g.p.set(px); return g;
  };
  const cols = [], states = {};
  for (const [state, a] of Object.entries(spec.states)){
    states[state] = { start: cols.length, frames: a.frames, ...(a.fps ? { fps: a.fps } : {}), ...(a.connect ? { connect: true } : {}) };
    for (let frame = 0; frame < a.frames; frame++) cols.push(render(spec.build({ state, anim: state, frame, frames: a.frames })));
  }
  let head = null;
  if (spec.head){
    const H = spec.head, seq = [], hs = {};
    for (const [state, a] of Object.entries(H.states)){
      hs[state] = { start: seq.length, frames: a.frames, ...(a.fps ? { fps: a.fps } : {}) };
      for (let frame = 0; frame < a.frames; frame++) seq.push({ state, anim: state, frame, frames: a.frames });
    }
    const rows = Array.from({ length: H.facings }, (_, i) => seq.map(s => render(H.build(s), i * 2 * Math.PI / H.facings)));
    head = { facings: H.facings, states: hs, on: H.on, turnRate: H.turnRate, firing: H.firing, chargeTime: H.chargeTime, flashTime: H.flashTime, muzzle: H.muzzle, rows };
  }
  return { cols, states, head };
}

// ---- Repair station (2×2 tiles = 96×96 world px, 192×192 art px), no facings ----
// Drawn in world px like the units; S is the frame size in art px.
const S = 96 * SPRITE_RES, MID = 47.5, R0 = (SPRITE_RES - 1) / 2;
const sp = g => painter(g, 0, [R0, R0], SPRITE_RES);
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
    const half = 48 * SPRITE_RES;   // the finished top-right quarter shows through
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!(x >= half && y < half) && done.get(x, y)) g.set(x, y, done.get(x, y));
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
    for (let x = 86 * SPRITE_RES; x < 90 * SPRITE_RES; x++) for (let y = 38 * SPRITE_RES; y < 43 * SPRITE_RES; y++) g.set(x, y, 0);   // chipped edge
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

// ---- Dust plain terrain (96×96 tiles, seamless) ----
// Three octaves of value noise: a coarse lattice (8 world px cells, the same world scale as
// the first set), a fine one (4 world px) and a grain (2 world px). `matched` (v2): every
// variant shares the lattice values on its border row and column, so any two variants meet
// without a seam, and its interior values are a permutation of one fixed set, so every
// variant has the same overall tone. Feature sizes are in world px, times K.
const lattice = (L, seed) => { const r = rng(seed); return { L, border: Array.from({ length: 2 * L - 1 }, () => r()), interior: Array.from({ length: (L - 1) ** 2 }, () => r()) }; };
const SHARED = [lattice(6, 9001), lattice(12, 9002), lattice(24, 9003)];
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
// A shaded pebble or stone w × h art px, lit top-left, with a contact shadow along its
// lower right (terrain is never rotated, so its light can be drawn in).
function stoneAt(put, x, y, w, h, tones){
  for (let dy = 0; dy <= h; dy++) for (let dx = 0; dx <= w; dx++){
    const ex = (dx - w / 2) / (w / 2 + 0.3), ey = (dy - h / 2) / (h / 2 + 0.3), d = ex * ex + ey * ey;
    if (d > 1) continue;
    const lit = ex + ey;
    put(x + dx, y + dy, d > 0.62 ? (lit > 0.2 ? tones[4] : tones[1]) : lit < -0.7 ? tones[0] : lit < -0.1 ? tones[1] : lit < 0.5 ? tones[2] : tones[3]);
  }
  for (let dx = 1; dx <= w; dx++) put(x + dx, y + h + 1, tones[4]);
  for (let dy = Math.ceil(h / 3); dy <= h; dy++) put(x + w + 1, y + dy, tones[4]);
}
const DUST_STONE = ['dust5', 'dust4', 'dust3', 'dust1', 'dust0'];
function dustTile(seed, { speckles = 24, pebbles = 0, stones = 0, crack = false, matched = false } = {}){
  const r = rng(seed), g = new Grid(TILE_ART, TILE_ART), N = TILE_ART;
  const coarse = noise(r, SHARED[0], matched), fine = noise(r, SHARED[1], matched), grain = noise(r, SHARED[2], matched);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    const v = coarse(x, y) * 0.56 + fine(x, y) * 0.22 + grain(x, y) * 0.12 + r() * 0.1;
    g.set(x, y, C[v < 0.36 ? 'dust1' : v < 0.64 ? 'dust2' : 'dust3']);
  }
  const put = (x, y, c) => g.set(((x % N) + N) % N, ((y % N) + N) % N, C[c]);   // wraps: seamless
  // Speckles: single grains, and a few two-pixel grits.
  for (let i = 0; i < speckles * K * K; i++){ const x = Math.floor(r() * N), y = Math.floor(r() * N), c = r() < 0.5 ? 'dust0' : 'dust4'; put(x, y, c); if (r() < 0.2) put(x + 1, y, c); }
  for (let i = 0; i < pebbles; i++) stoneAt(put, Math.floor(r() * N), Math.floor(r() * N), 2 * K + Math.floor(r() * K), 2 * K - 1, DUST_STONE);
  for (let i = 0; i < stones; i++){
    const x = Math.floor(r() * N), y = Math.floor(r() * N);
    stoneAt(put, x, y, 7 * K, 6 * K, DUST_STONE);
    for (let k = 0; k < 3; k++) put(x + 2 + Math.floor(r() * 5 * K), y + 2 + Math.floor(r() * 3 * K), 'dust4');   // pits in the stone
  }
  if (crack){
    // A branching crack: one-pixel line, a lit lip on its upper side.
    let x = Math.floor(r() * N), y = Math.floor(r() * N);
    for (let i = 0; i < 30 * K; i++){
      put(x, y, 'dust0'); put(x, y - 1, 'dust4'); if (i % 4 === 0) put(x, y + 1, 'dust1');
      x += r() < 0.6 ? 1 : 0; y += r() < 0.45 ? 1 : r() < 0.3 ? -1 : 0;
      if (i === 14 * K){ let bx = x, by = y; for (let k = 0; k < 8 * K; k++){ put(bx, by, 'dust0'); bx -= r() < 0.5 ? 1 : 0; by += 1; } }   // branch
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

// ---- Woodlands terrain and tree props (96×96) ----
// Same method as the dust plain v2: three octaves of smooth value lattice whose border
// values are shared by every variant (edge-matched) and whose interior values are one
// shuffled set (tone-matched), then small features that wrap across the edges. Sizes are
// in world px times K; seams, joints and blades stay one art px wide.
const W_WEIGHTS = [6, 6, 6, 4, 3, 2, 1, 1], N = TILE_ART;
const wrap = v => ((v % N) + N) % N;
function latticeTile(seed, sharedSeed, pickColour){
  const shared = rng(sharedSeed), r = rng(seed), g = new Grid(N, N);
  const octave = L => {
    const border = Array.from({ length: 2 * L - 1 }, () => shared()), inner = Array.from({ length: (L - 1) ** 2 }, () => shared());
    for (let i = inner.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [inner[i], inner[j]] = [inner[j], inner[i]]; }
    const lat = new Array(L * L);
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++)
      lat[y * L + x] = y === 0 ? border[x] : x === 0 ? border[L - 1 + y] : inner[(y - 1) * (L - 1) + x - 1];
    const at = (x, y) => lat[((y % L + L) % L) * L + ((x % L + L) % L)], sm = t => t * t * (3 - 2 * t), cell = N / L;
    return (x, y) => {
      const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = sm(gx - x0), ty = sm(gy - y0);
      return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
    };
  };
  const coarse = octave(6), fine = octave(12), grain = octave(24);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.set(x, y, C[pickColour(coarse(x, y) * 0.56 + fine(x, y) * 0.2 + grain(x, y) * 0.12 + r() * 0.12)]);
  const put = (x, y, c) => g.set(wrap(x), wrap(y), C[c]);
  const at = () => [Math.floor(r() * N), Math.floor(r() * N)];
  return { g, r, put, at };
}
// A blade of grass from its root (x, y) upwards: `len` art px, bending `bend` art px sideways
// over its length, a dark root, the body in `body` and a lit tip.
function blade(put, x, y, len, bend, body = 'grass2', tip = 'grass3'){
  for (let k = 0; k < len; k++){
    const bx = x + Math.round(bend * (k / len) ** 2);
    put(bx, y - k, k === 0 ? 'grass0' : k >= len - 2 ? tip : body);
  }
  put(x + 1, y, 'grass0');   // shadow at the root
}
const GRASS_STONE = ['dust5', 'dust4', 'dust3', 'dust1', 'char1'];
function grassTile(seed, { speckles = 30, blades = 14, clover = 0, tufts = 0, pebble = 0, flowers = 0 } = {}){
  const { g, r, put, at } = latticeTile(seed, 7101, v => v < 0.36 ? 'grass0' : v < 0.66 ? 'grass1' : 'grass2');
  for (let i = 0; i < speckles * K * K; i++){ const [x, y] = at(); put(x, y, r() < 0.5 ? 'grass0' : 'grass3'); }
  // Short blades give the lawn a grain.
  for (let i = 0; i < blades * K * K; i++){ const [x, y] = at(); blade(put, x, y, (2 + Math.floor(r() * 3)) * K - Math.floor(r() * 2), (r() < 0.5 ? 0 : r() < 0.5 ? -1 : 1) * K); }
  for (let i = 0; i < clover * 2; i++){
    // Three round leaflets around a stem, each lit top-left and shaded bottom-right, with a pale vein.
    const [x, y] = at();
    for (const [lx, ly] of [[0, 0], [4, 0], [2, 3.4]]){
      const cx = x + lx * K, cy = y + ly * K, rr = 1.8 * K;
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++){
        const d = Math.hypot(dx, dy) / rr;
        if (d > 1) continue;
        put(Math.round(cx + dx), Math.round(cy + dy), d > 0.75 && dx + dy > 0 ? 'grass0' : dx + dy < -rr * 0.4 ? 'grass3' : 'grass2');
      }
      put(Math.round(cx), Math.round(cy), 'grass3');
    }
    for (let k = 0; k < 3 * K; k++) put(x + 2 * K + (k > K ? 1 : 0), y + 5 * K + k, 'grass0');
  }
  for (let i = 0; i < tufts * 2; i++){
    const [x, y] = at();
    for (let k = -3; k <= 3; k++) blade(put, x + k * K, y + Math.abs(k), (5 + Math.floor(r() * 4) - Math.abs(k)) * K, k * 1.4 * K);
  }
  for (let i = 0; i < flowers * 3; i++){
    // Four petals round a pale centre.
    const [x, y] = at(), petal = r() < 0.5 ? 'amber1' : 'amber2';
    for (const [dx, dy] of [[0, -K], [-K, 0], [K, 0], [0, K]]) for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) put(x + dx + a, y + dy + b, petal);
    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) put(x + a, y + b, 'dust5');
    put(x + K, y + 2 * K, 'grass0');
  }
  for (let i = 0; i < pebble * 2; i++){ const [x, y] = at(); stoneAt(put, x, y, 3 * K + Math.floor(r() * K), 2 * K + 1, GRASS_STONE); }
  return g;
}
function tallGrassTile(seed, { blades = 70, seedheads = 0 } = {}){
  const { g, r, put, at } = latticeTile(seed, 7202, v => v < 0.45 ? 'grass0' : 'grass1');
  for (let i = 0; i < blades * K * 1.6; i++){
    const [x, y] = at(), len = (6 + Math.floor(r() * 6)) * K, bend = ((r() < 0.3 ? 2 : r() < 0.4 ? -2 : 0) + (r() - 0.5)) * K;
    blade(put, x, y, len, bend, r() < 0.3 ? 'grass1' : 'grass2');
  }
  for (let i = 0; i < seedheads * 2; i++){
    const [x, y] = at(), h = 8 * K;
    blade(put, x, y, h, K, 'grass2', 'grass2');
    // A drooping seed head of small grains.
    for (let k = 0; k < 3 * K; k++){ put(x + K + (k & 1), y - h - k + K, k % 2 ? 'dust4' : 'dust5'); if (k % 2 === 0) put(x + K + 1 + (k & 1), y - h - k + K, 'dust3'); }
  }
  return g;
}
function waterTile(seed, { deep = false, ripples = 10, sparkle = 0 } = {}){
  const { g, r, put, at } = latticeTile(seed, deep ? 7404 : 7303, deep ? (v => v < 0.78 ? 'water0' : 'water1') : (v => v < 0.3 ? 'water0' : v < 0.78 ? 'water1' : 'water2'));
  // A ripple: a lit crest with a darker trough under it, thinning at both ends.
  for (let i = 0; i < ripples * K; i++){
    const [x, y] = at(), len = (5 + Math.floor(r() * 6)) * K;
    for (let k = 0; k < len; k++){
      const end = k < K || k >= len - K;
      if (!end || r() < 0.5) put(x + k, y, deep ? 'water1' : 'water2');
      if (!end) put(x + k + 1, y + 1, 'water0');
      if (!end && k % 3 === 1 && r() < 0.5) put(x + k, y - 1, deep ? 'water1' : 'water2');
    }
  }
  for (let i = 0; i < sparkle * 2; i++){
    const [x, y] = at();
    for (let k = -K; k <= K; k++){ put(x + k, y, Math.abs(k) < K ? 'water3' : 'water2'); put(x, y + k, Math.abs(k) < K ? 'water3' : 'water2'); }
  }
  return g;
}
// Shoreline: open water with a muddy bank and a broken foam line along each side that
// touches land. `mask` bits: 1 north, 2 east, 4 south, 8 west. Where two neighbouring
// sides are land, the corner is rounded.
function shoreTile(mask){
  const g = waterTile(31), R = 12 * K, pat = rng(5150 + mask);
  const noise = Array.from({ length: N * N }, () => pat());
  // A little wobble along the bank, the same on every tile so neighbouring pieces line up.
  const WOBBLE = [0, 0.4, 0.8, 1.2, 1.6, 1.2, 0.8, 0.4, 0, -0.3, -0.6, -0.3];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    const sides = [];
    if (mask & 1) sides.push(y); if (mask & 2) sides.push(N - 1 - x); if (mask & 4) sides.push(N - 1 - y); if (mask & 8) sides.push(x);
    if (!sides.length) continue;
    let d = Math.min(...sides);
    const corner = (a, b, cx, cy) => { if ((mask & a) && (mask & b) && Math.abs(x - cx) < R && Math.abs(y - cy) < R) d = Math.min(d, R - Math.hypot(R - Math.abs(x - cx) - 0.5, R - Math.abs(y - cy) - 0.5)); };
    corner(1, 8, 0, 0); corner(1, 2, N - 1, 0); corner(4, 2, N - 1, N - 1); corner(4, 8, 0, N - 1);
    const along = (mask & 5) && !(mask & 10) ? x : (mask & 10) && !(mask & 5) ? y : x + y;
    d = d / K + WOBBLE[Math.floor(along / K) % 12];        // in world px from here on
    const n = noise[y * N + x];
    if (d < 2.4) g.set(x, y, C[n < 0.5 ? 'dust1' : n < 0.9 ? 'dust0' : 'dust2']);          // wet mud
    else if (d < 5) g.set(x, y, C[n < 0.6 ? 'dust2' : n < 0.9 ? 'dust1' : 'dust3']);        // bank shallows
    else if (d < 6.8) g.set(x, y, C[n < 0.6 ? 'water3' : 'water2']);                         // foam line
    else if (d < 8.8 && n < 0.25) g.set(x, y, C.water2);                                     // broken foam
    else if (d < 11 && n < 0.07) g.set(x, y, C.water3);
  }
  return g;
}
// Cliffs, one tile tall. A south drop shows the whole rock face: a grassy lip with tufts
// hanging over, then irregular stone blocks (lit on their top-left edges, shaded bottom-right,
// darker further down, grained inside), cracks, moss and loose stones at the foot. A drop on
// another side shows the grass top with a ragged rock rim on that side; a corner drop a
// rounded rim. Every block band has a joint on column 0, and rims wobble with a period of one
// tile, so pieces line up with their neighbours. Rows and sizes are in world px times K.
const RIM = Array.from({ length: N }, (_, k) => Math.round((6 + Math.sin(k / N * Math.PI * 4) * 1.6 + Math.sin(k / N * Math.PI * 6 + 1) * 1.2) * K));
function cliffFace(variant){
  const g = new Grid(N, N), r = rng(6100 + variant * 53), set = (x, y, c) => g.set(x, y, C[c]);
  // Grassy lip.
  for (let y = 0; y < 8 * K; y++) for (let x = 0; x < N; x++)
    set(x, y, y >= 6 * K ? (y >= 8 * K - 1 ? 'char1' : 'grass0') : (x * 7 + y * 5 + variant * 3) % 13 === 0 ? 'grass3' : (x + y * 3) % 5 === 0 ? 'grass2' : 'grass1');
  // Stone blocks in bands; deeper bands are darker.
  const bands = [[8, 17], [18, 26], [27, 34], [35, 41]].map(([a, b]) => [a * K, (b + 1) * K - 1]);
  const tones = [['dust4', 'dust3', 'dust2'], ['dust3', 'dust2', 'dust1'], ['dust3', 'dust2', 'dust1'], ['dust2', 'dust1', 'dust0']];
  bands.forEach(([y0, y1], b) => {
    let x = b % 2 ? -Math.floor((4 + r() * 6) * K) : 0;
    while (x < N){
      const w = Math.floor((8 + r() * 10) * K), x0 = Math.max(0, x), x1 = Math.min(N - 1, x + w - 1), [hi, mid, lo] = tones[b];
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++){
        let c = mid;
        if (r() < 0.12) c = r() < 0.5 ? hi : lo;                                 // grain
        if (y === y0 || xx === x0 + 1) c = hi;                                   // lit top and left edges
        if ((y === y0 + 1 || y === y0 + 2) && xx > x0 + 1 && xx < x1 - 1 && r() < 0.5) c = hi;
        if (y === y1 || xx === x1) c = lo;                                       // shaded bottom and right edges
        if (y >= y1 - 1 && xx >= x1 - 1 && (y === y1 || xx === x1)) c = 'char1';
        if (xx === x0 && x > 0) c = 'char1';                                     // joint
        set(xx, y, c);
      }
      // A chip or two knocked out of the face.
      for (let k = 0; k < 3; k++) if (r() < 0.4){
        const px = x0 + 2 * K + Math.floor(r() * Math.max(1, x1 - x0 - 4 * K)), py = y0 + 2 * K + Math.floor(r() * Math.max(1, y1 - y0 - 3 * K));
        for (let a = 0; a < K; a++){ set(px + a, py, lo); set(px + a + 1, py + 1, lo); } set(px, py + 1, 'char1'); set(px + K, py - 1, hi);
      }
      x = x1 + 1;
    }
    for (let y = y0; y <= y1; y++) set(0, y, 'char1');                        // joint on column 0 in every band
  });
  // Cracks running down a block or two, with a lit edge on one side.
  for (let i = 0; i < 2 + (variant % 2); i++){
    let x = (6 + Math.floor(r() * 36)) * K, y = (10 + Math.floor(r() * 12)) * K;
    for (let k = 0; k < (10 + Math.floor(r() * 10)) * K && y < 41 * K; k++){
      set(x, y, 'char0'); if (g.get(x + 1, y) && r() < 0.6) set(x + 1, y, 'dust1'); if (r() < 0.5) set(x - 1, y, 'dust4');
      y++; if (r() < 0.25) x = Math.max(3 * K, Math.min(44 * K, x + (r() < 0.5 ? -1 : 1)));
    }
  }
  // Moss on a few ledges.
  for (let i = 0; i < 3 + variant % 3; i++){
    const x = (3 + Math.floor(r() * 40)) * K, y = [8, 18, 27][Math.floor(r() * 3)] * K, w = (3 + Math.floor(r() * 4)) * K;
    for (let k = 0; k < w; k++){
      set(x + k, y, k % 3 ? 'leaf1' : 'leaf2'); if (r() < 0.7) set(x + k, y + 1, 'leaf1');
      for (let d = 2; d < 2 * K + 1; d++) if (r() < 0.35 / d * 2) set(x + k, y + d, 'leaf0');
    }
  }
  // Grass tufts hanging over the lip.
  for (let i = 0; i < 5 * K; i++){
    const x = (2 + Math.floor(r() * 42)) * K + Math.floor(r() * K), len = (2 + Math.floor(r() * 5)) * K;
    for (let k = 0; k < len; k++) set(x, 8 * K + k, k === len - 1 ? 'grass0' : k === 0 ? 'grass3' : 'grass2');
    if (r() < 0.6){ const l2 = Math.max(1, len - 2 * K); for (let k = 0; k < l2; k++) set(x + 1, 8 * K + k, k === l2 - 1 ? 'grass0' : 'grass2'); }
    set(x + 1, 8 * K + len, 'char1');
  }
  // Foot: a shadow band and loose stones.
  for (let x = 0; x < N; x++){
    for (let y = 42 * K; y < 44 * K; y++) set(x, y, (x + y + variant) % 4 ? 'char1' : 'dust0');
    for (let y = 44 * K; y < N - 1; y++) set(x, y, (x * 3 + y + variant) % 11 === 0 ? 'char1' : 'char0');
    set(x, N - 1, (x * 5 + variant) % 7 === 0 ? 'char1' : 'char0');
  }
  for (let i = 0; i < 5 * K; i++){
    const x = K + Math.floor(r() * 44 * K), y = 41 * K + Math.floor(r() * 3 * K);
    stoneAt((px, py, c) => { if (px >= 0 && px < N && py >= 0 && py < N) set(px, py, c); }, x, y, K + 1 + Math.floor(r() * 2 * K), K + Math.floor(r() * K), ['dust4', 'dust3', 'dust2', 'dust1', 'char0']);
  }
  return g;
}
function cliffTile(key, variant = 0){
  const corner = key.startsWith('c') ? key.slice(1) : null;
  if (!corner && key.startsWith('S')){
    const g = cliffFace(variant);
    // The face turning away at an east or west end.
    const cols = 6 * K, side = xs => { for (let y = 8 * K; y < 42 * K; y++) xs.forEach((x, k) => g.set(x, y, C[k < 2 * K ? 'char1' : k < 4 * K ? 'dust1' : k < 5 * K ? 'dust4' : 'dust3'])); };
    if (key.includes('E')) side(Array.from({ length: cols }, (_, k) => N - 1 - k));
    if (key.includes('W')) side(Array.from({ length: cols }, (_, k) => k));
    return g;
  }
  const g = grassTile(21), r = rng(6200 + key.length * 13);
  // A ragged rim: dark drop edge, then rock shading inwards, a lit lip, and grass creeping over.
  const rim = (at) => {
    for (let k = 0; k < N; k++){
      const w = RIM[k];
      for (let d = 0; d < w + 1; d++){
        const [x, y] = at(k, d);
        g.set(x, y, C[d < 2 * K ? 'char1' : d < 3 * K ? 'dust0' : d < 4 * K ? 'dust1' : d < w - K ? (r() < 0.15 ? 'dust3' : 'dust2') : d < w ? 'dust4' : ((k * 3) % 5 ? 'dust5' : 'grass0')]);
      }
      if (r() < 0.12){ const [x, y] = at(k, w + 1); g.set(x, y, C.grass3); }
      if (r() < 0.08){ const [x, y] = at(k, w + 2); g.set(x, y, C.grass0); }
    }
  };
  if (corner){
    const [cx, cy] = { NE: [N, 0], SE: [N, N], SW: [0, N], NW: [0, 0] }[corner];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / K;
      if (d < 9.2) g.set(x, y, C[d < 3.2 ? 'char1' : d < 5.2 ? 'dust1' : d < 7.2 ? 'dust2' : d < 8.2 ? 'dust4' : 'dust5']);
    }
    return g;
  }
  if (key.includes('N')) rim((k, d) => [k, d]);
  if (key.includes('E')) rim((k, d) => [N - 1 - d, k]);
  if (key.includes('W')) rim((k, d) => [d, k]);
  return g;
}
// Cliff piece keys, and which piece each drop mask (1 N, 2 E, 4 S, 8 W; 16/32/64/128 corners) uses.
export const CLIFF_KEYS = ['S', 'S2', 'S3', 'S4', 'SE', 'SW', 'SEW', 'N', 'E', 'W', 'NE', 'NW', 'EW', 'NEW', 'cNE', 'cSE', 'cSW', 'cNW'];
function cliffPieces(){
  return CLIFF_KEYS.map(k => /^S\d$/.test(k) ? cliffTile('S', +k[1] - 1) : cliffTile(k));
}
// Tree canopy props, three kinds. Shapes are in world px, drawn with the painter at scale K,
// so crowns come out smooth at 96 × 96. Each variant has 9 frames: 3 leans (at rest, then 2
// and 4 world px downwind, east) × 3 leaf-rustle steps (frame = lean * 3 + rustle). The canopy
// sits 2 world px left of centre at rest so the furthest lean still keeps the 1 px outline
// margin. Outline and top-left light are added by the pipeline (the leaf ramp shades); the
// engine draws the shadow.
const TREE_LEAN = 2, TREE_CX = 21.5, TREE_CY = 23.5;       // world px, on a 48 px tile
const toArt = v => v * K + (K - 1) / 2;                    // a 48 px tile coordinate on the 96 px grid
const TREE_KINDS = {
  // Broadleaf: a round, lobed crown with lighter leaf clumps and dark gaps between them.
  oak(p, r){
    const lobes = 5 + Math.floor(r() * 3);
    p.ellipse(0, 0, 13.6, 13.6, 'leaf1');
    for (let i = 0; i < lobes; i++){ const a = (i / lobes) * Math.PI * 2 + r() * 0.6, d = 8.4 + r() * 2.4, rr = 6 + r() * 2.2; p.ellipse(Math.cos(a) * d, Math.sin(a) * d, rr, rr, 'leaf1'); }
    for (let i = 0; i < 7; i++) p.ellipse((r() - 0.5) * 18, (r() - 0.5) * 18, 1.4 + r() * 1.4, 1.2 + r() * 1.2, 'leaf0');
    for (let i = 0; i < 12; i++){ const x = (r() - 0.5) * 18, y = (r() - 0.5) * 18; p.ellipse(x, y, 2.2 + r() * 1.6, 2 + r() * 1.4, 'leaf2'); p.ellipse(x + 1, y + 1.2, 1.2, 1, 'leaf1'); }
    // Leaf texture at the finer scale: small clusters and dark gaps across the crown.
    for (let i = 0; i < 26; i++){ const a = r() * Math.PI * 2, d = r() * 12; p.ellipse(Math.cos(a) * d, Math.sin(a) * d, 0.7 + r() * 0.6, 0.6 + r() * 0.5, r() < 0.4 ? 'leaf0' : 'leaf2'); }
    p.ellipse(-3, -3, 4, 3.6, 'leaf2');
  },
  // Conifer: a dark star of needle points around a tight centre, needles along each spoke.
  pine(p, r){
    const spikes = 10 + Math.floor(r() * 3), turn = r();
    p.ellipse(0, 0, 10.4, 10.4, 'leaf0');
    for (let i = 0; i < spikes; i++){
      const a = ((i + turn) / spikes) * Math.PI * 2, len = 16.4 + r() * 2;
      for (let k = 0; k <= 20; k++){ const t = k / 20, w = (1 - t) * 3.2; p.ellipse(Math.cos(a) * len * t, Math.sin(a) * len * t, w + 0.5, w + 0.5, 'leaf0'); }
      // Needles: short strokes angled out from the spoke, half a world px wide.
      for (let k = 3; k < 16; k += 1.5) for (const s of [-1, 1]){
        const t = k / len, bx = Math.cos(a) * k, by = Math.sin(a) * k, na = a + s * 0.7;
        p.thick(bx, by, bx + Math.cos(na) * 2.4 * (1 - t * 0.5), by + Math.sin(na) * 2.4 * (1 - t * 0.5), 0.5, 'leaf0');
      }
    }
    for (let i = 0; i < spikes; i++){
      const a = ((i + turn + 0.5) / spikes) * Math.PI * 2;
      for (let k = 0; k <= 12; k++){ const t = k / 12; p.ellipse(Math.cos(a) * 10.4 * t, Math.sin(a) * 10.4 * t, (1 - t) * 2.2 + 0.5, (1 - t) * 2.2 + 0.5, 'leaf1'); }
    }
    p.ellipse(0, 0, 2.8, 2.8, 'leaf2');
    p.ellipse(-0.8, -0.8, 1.2, 1.2, 'grass3');
  },
  // Birch: a small, airy crown of separate light clusters with bright leaf tips.
  birch(p, r){
    const n = 7 + Math.floor(r() * 2);
    p.ellipse(0, 0, 6.8, 6.8, 'leaf2');
    for (let i = 0; i < n; i++){
      const a = (i / n) * Math.PI * 2 + r() * 0.5, d = 9.6 + r() * 3.2, rr = 4.4 + r() * 1.8, x = Math.cos(a) * d, y = Math.sin(a) * d;
      p.ellipse(x, y, rr, rr, 'leaf2');
      p.ellipse(x + rr * 0.35, y + rr * 0.35, rr * 0.45, rr * 0.45, 'leaf1');   // shade inside each cluster
      p.ellipse(x - rr * 0.4, y - rr * 0.4, 1, 1, 'grass3');                  // lit leaf tip
      for (let k = 0; k < 4; k++) p.ellipse(x + (r() - 0.5) * rr * 1.4, y + (r() - 0.5) * rr * 1.4, 0.6, 0.6, r() < 0.5 ? 'leaf1' : 'grass3');
    }
    for (let i = 0; i < 6; i++) p.ellipse((r() - 0.5) * 18, (r() - 0.5) * 18, 1.6, 1.6, 'leaf1');
    // Pale twigs showing through the gaps.
    for (let i = 0; i < 3; i++){ const a = r() * Math.PI * 2; p.thick(0, 0, Math.cos(a) * 7, Math.sin(a) * 7, 0.6, 'dust5'); }
  }
};
export const TREE_TYPES = Object.keys(TREE_KINDS), TREE_LEANS = 3, TREE_RUSTLES = 3, TREE_FRAMES = TREE_LEANS * TREE_RUSTLES;
// Leaf rustle: step 0 is the crown as drawn; steps 1 and 2 move a few leaf tips along the
// edge (some drop back, some poke out, in K × K clumps) and catch the light in different
// places. The same changes are used at every lean, so rustling and leaning combine smoothly.
function rustle(g, kind, seed, step, cx){
  if (!step) return;
  const r = rng(seed * 13 + step * 977), glint = kind === 'birch' ? C.grass3 : C.leaf2, leaf = kind === 'pine' ? C.leaf0 : kind === 'birch' ? C.leaf2 : C.leaf1;
  const edge = [], outside = [];
  for (let y = 3; y < N - 3; y++) for (let x = 3; x < N - 3; x++){
    const v = g.get(x, y), open = (a, b) => !g.get(a, b);
    if (v && (open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1))) edge.push([x, y]);
    else if (!v && (g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1))) outside.push([x, y]);
  }
  const pick = list => list[Math.floor(r() * list.length)], clump = (x, y, f) => { for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) f(x + a, y + b); };
  for (let i = 0; i < 9 * K; i++){ const [x, y] = pick(edge); clump(x, y, (a, b) => { if (edge.some(([p, q]) => p === a && q === b)) g.set(a, b, 0); }); }
  for (let i = 0; i < 9 * K; i++){ const [x, y] = pick(outside); clump(x, y, (a, b) => { if (!g.get(a, b) && a > 1 && b > 1 && a < N - 2 && b < N - 2) g.set(a, b, leaf); }); }
  for (let i = 0; i < 8 * K; i++){
    const x = Math.round(cx + (r() - 0.5) * 20 * K), y = Math.round(toArt(TREE_CY) + (r() - 0.5) * 20 * K);
    if (g.get(x, y) && g.get(x, y) !== C.leaf0){ g.set(x, y, glint); if (g.get(x + 1, y) && g.get(x + 1, y) !== C.leaf0) g.set(x + 1, y, glint); }
  }
}
function treeFrames(kind, seed){
  const out = [];
  for (let lean = 0; lean < TREE_LEANS; lean++) for (let step = 0; step < TREE_RUSTLES; step++){
    const g = new Grid(N, N), cx = toArt(TREE_CX + lean * TREE_LEAN), p = painter(g, 0, [cx, toArt(TREE_CY)], K);
    TREE_KINDS[kind](p, rng(seed));
    rustle(g, kind, seed, step, cx);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (x === 0 || y === 0 || x === N - 1 || y === N - 1) g.set(x, y, 0);
    out.push(finish(g));
  }
  return out;
}
// variants[kind] = [[frame0, frame1, frame2], ...]
function treeSet(){
  const out = {};
  TREE_TYPES.forEach((kind, k) => { out[kind] = [0, 1].map(v => treeFrames(kind, 301 + k * 17 + v * 5)); });
  return out;
}

export const WOODLANDS = {
  grass: () => [{}, {}, {}, { speckles: 60 }, { clover: 1 }, { tufts: 2 }, { pebble: 1, tufts: 1 }, { clover: 2, flowers: 1 }].map((o, i) => grassTile(41 + i, o)),
  tall_grass: () => [{}, {}, {}, { blades: 90 }, { seedheads: 3 }, { blades: 55 }, { seedheads: 6 }, { blades: 100, seedheads: 2 }].map((o, i) => tallGrassTile(61 + i, o)),
  water: () => [{}, {}, {}, { ripples: 16 }, { ripples: 6 }, { sparkle: 1 }, { ripples: 14, sparkle: 1 }, { sparkle: 2 }].map((o, i) => waterTile(81 + i, o)),
  deep_water: () => [{}, {}, {}, { ripples: 14 }, { ripples: 6 }, {}, { ripples: 12 }, { ripples: 4 }].map((o, i) => waterTile(101 + i, { ...o, deep: true })),
  shore: () => Array.from({ length: 16 }, (_, m) => m ? shoreTile(m) : waterTile(31)),
  cliff: cliffPieces,
};

// ---- Build everything in memory ----
export function build(){
  const sprites = {}, sheets = {};
  for (const [name, def] of Object.entries(UNITS)){
    const rows = unitFrames(def), animations = {};
    let start = 0;
    for (const [anim, [frames, fps]] of Object.entries(def.anims)){ animations[anim] = { start, frames, fps }; start += frames; }
    const N = def.size * SPRITE_RES;
    const meta = {
      name, frameWidth: N, frameHeight: N, origin: [(N - 1) / 2, (N - 1) / 2],
      worldPxPerArtPx: 1 / SPRITE_RES, rows: 'facing', facings: FACINGS, authoredFacings: ['up', 'up-right'],
      animations, shadow: { drawnBy: 'engine', offset: def.shadow.map(v => v * SPRITE_RES), elevation: def.elevation }, team: 'team0..team2 (magenta ramp)'
    };
    sprites[name] = { ...meta, frames: rows.map(r => r.map(g => rle(g.encode()))) };
    sheets[name] = { meta, rows };
  }
  for (const [name, def] of Object.entries(MODELLED)){
    const rows = modelFrames(def), animations = {}, V = def.spec.variants, N = def.size * SPRITE_RES;
    let start = 0;
    for (const [anim, { frames, fps }] of Object.entries(def.spec.animations)){ animations[anim] = { start, frames, fps }; start += frames; }
    const meta = {
      name, frameWidth: N, frameHeight: N, origin: [(N - 1) / 2, (N - 1) / 2],
      worldPxPerArtPx: 1 / SPRITE_RES, rows: 'facing', facings: FACINGS, renderedFacings: 'all 8, each from the model', model: 'art/sprite-lab/specs/' + def.spec.key + '.mjs',
      animations, ...(V ? { variants: { by: V.by, values: V.values, at: V.at, framesEach: start, column: 'variant index × framesEach + start + frame' } } : {}),
      shadow: { drawnBy: 'engine', offset: def.shadow.map(v => v * SPRITE_RES), elevation: def.elevation }, team: 'team0..team2 (magenta ramp)'
    };
    sprites[name] = { ...meta, frames: rows.map(r => r.map(g => rle(g.encode()))) };
    sheets[name] = { meta, rows };
  }
  for (const [name, def] of Object.entries(MODELLED_STRUCTURES)){
    const spec = def.spec, { cols, states, head } = structureFrames(spec), [fw, fh] = spec.footprint;
    const shadow = { drawnBy: 'engine', offset: def.shadow.map(v => v * SPRITE_RES), elevation: def.elevation };
    const meta = {
      name, frameWidth: spec.frame.w, frameHeight: spec.frame.h, origin: [0, 0], footprintTiles: [fw, fh],
      worldPxPerArtPx: 1 / SPRITE_RES, rows: head ? 'row 0 states; the head sheet has one row per facing' : 'single row', model: 'art/sprite-lab/specs/' + spec.key + '.mjs',
      states, shadow, team: 'team0..team2 (magenta ramp)'
    };
    const headMeta = head && { facings: head.facings, rows: 'facing, clockwise from up', pivot: 'footprint centre', states: head.states, on: head.on, turnRate: head.turnRate, firing: head.firing, chargeTime: head.chargeTime, flashTime: head.flashTime, muzzle: head.muzzle };
    sprites[name] = { ...meta, frames: [cols.map(g => rle(g.encode()))], ...(head ? { head: { ...headMeta, frames: head.rows.map(r => r.map(g => rle(g.encode()))) } } : {}) };
    sheets[name] = { meta: { ...meta, ...(head ? { head: { ...headMeta, image: name + '_head.png' } } : {}) }, rows: [cols] };
    if (head) sheets[name + '_head'] = { meta: { name: name + '_head', frameWidth: spec.frame.w, frameHeight: spec.frame.h, origin: [spec.frame.ox, spec.frame.oy], worldPxPerArtPx: 1 / SPRITE_RES, ...headMeta, shadow }, rows: head.rows };
  }
  const st = stationFrames(), states = {};
  st.forEach(([state], i) => { (states[state] ||= { start: i, frames: 0 }).frames++; });
  states.working.fps = 6;
  const stationMeta = {
    name: 'repair_station', frameWidth: S, frameHeight: S, origin: [0, 0], footprintTiles: [2, 2],
    worldPxPerArtPx: 1 / SPRITE_RES, rows: 'single row', states, shadow: { drawnBy: 'engine', offset: [2 * SPRITE_RES, 2 * SPRITE_RES], elevation: 'ground' },
    team: 'team0..team2 (magenta ramp)'
  };
  sprites.repair_station = { ...stationMeta, frames: [st.map(([, g]) => rle(g.encode()))] };
  sheets.repair_station = { meta: stationMeta, rows: [st.map(([, g]) => g)] };
  const terrain = {};
  for (const [v, T] of Object.entries(TERRAIN)){
    const tiles = T.tiles();
    terrain[v] = { hash: T.hash, formula: T.formula, weights: T.weights, tiles: tiles.map(g => g.encode()) };
    const meta = { name: 'dust_plain_' + v, frameWidth: TILE_ART, frameHeight: TILE_ART, variants: tiles.length, hash: T.hash, formula: T.formula, weights: T.weights };
    sheets['dust_plain_' + v] = { meta, rows: [tiles] };
  }
  // Woodlands: weighted terrain variants, 16 shoreline pieces by land mask, cliff pieces,
  // and tree canopy props (engine shadow at the prop offset).
  const woodlands = {};
  for (const [key, make] of Object.entries(WOODLANDS)){
    const tiles = make(), weights = ['grass', 'tall_grass', 'water', 'deep_water'].includes(key) ? W_WEIGHTS : null;
    woodlands[key] = { tiles: tiles.map(g => g.encode()), ...(weights ? { weights } : {}) };
    const meta = { name: 'woodlands_' + key, frameWidth: TILE_ART, frameHeight: TILE_ART, variants: tiles.length, ...(weights ? { weights, hash: 'mix32' } : {}) };
    if (key === 'shore') meta.index = 'land mask: 1 north, 2 east, 4 south, 8 west (0 = open water)';
    if (key === 'cliff'){ meta.pieces = CLIFF_KEYS; woodlands.cliff.pieces = CLIFF_KEYS; }
    sheets['woodlands_' + key] = { meta, rows: [tiles] };
  }
  // Trees: per kind, variants of 9 frames (lean * 3 + rustle). One sheet row per kind.
  const trees = treeSet(), shadow = { drawnBy: 'engine', offset: [4 * K, 4 * K], elevation: 'prop' };
  const animations = { lean: { frames: TREE_LEANS, fps: 'set by the weather' }, rustle: { frames: TREE_RUSTLES, fps: 'set by the weather' }, frame: 'lean * 3 + rustle' };
  woodlands.tree = { types: TREE_TYPES, animations, shadow, variants: Object.fromEntries(TREE_TYPES.map(k => [k, trees[k].map(fr => fr.map(g => g.encode()))])) };
  sheets.woodlands_tree = {
    meta: { name: 'woodlands_tree', frameWidth: TILE_ART, frameHeight: TILE_ART, origin: [0, 0], rows: TREE_TYPES, columns: 'variant 1 frames 0-8, variant 2 frames 0-8 (frame = lean * 3 + rustle)', animations, shadow },
    rows: TREE_TYPES.map(k => trees[k].flat())
  };
  // Genesis: free-standing trees in three sizes (tools/genesis-trees.mjs).
  const genesis = genesisTrees();
  Object.assign(sheets, genesis.sheets);
  const data = {
    alphabet: ALPHABET, palette: PALETTE.map(([name, hex]) => ({ name, hex })), teamIndex: [C.team0, C.team1, C.team2], teams: TEAMS,
    // Sprite frames are run-length encoded (a palette character, then its count when it repeats).
    spriteEncoding: 'rle', tileArt: TILE_ART, worldPxPerArtPx: WORLD_PX_PER_ART_PX, sprites, terrain, woodlands, genesis: { trees: genesis.data }
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
  for (const s of ['spider', 'salvage_crawler', 'drone', 'vance', 'repair_station', 'sentry_turret', 'walls', 'terrain', 'woodlands']) await shot(`view=sheets&only=${s}&hud=0`, `sheet-${s}.png`, desk);
  await browser.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  write();
  if (process.argv.includes('--capture')) await capture();
}
