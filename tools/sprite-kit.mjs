// Building blocks for three-quarter sprites (art/SPRITE_ART_RULES.md): the camera, the frame
// sizes, and materials on the game's 48-colour palette. Sprite specs in art/sprite-lab/specs/
// import this; tools/sprite-lab.mjs renders them with tools/render3d.mjs.
import { C } from './pixelart.mjs';
import { noise3, along, mix } from './render3d.mjs';
export * from './render3d.mjs';

export const LIFT = 0.6;          // screen px up per px of height: 60% face height
export const RES = 2;             // art px per world px: a 48 world px tile is 96 × 96 art px
export const TILE = 48;           // world px per tile
export const FACINGS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
export const ENGINE_ANIMS = ['idle', 'walk', 'work', 'fly'];
export const ENGINE_STATES = ['foundation', 'frame', 'near-complete', 'finished', 'working', 'damaged', 'rubble'];
export const OUTLINE = C.outline;

// Colour ramps, dark to light, as palette indices. Longer ramps give smoother shading; every
// colour is from the shared palette.
const r = (...names) => names.map(n => C[n]);
export const RAMP = {
  steel: r('char0', 'steel0', 'steel1', 'steel2', 'steel3', 'plate1'),
  dark: r('outline', 'char0', 'char1', 'steel0', 'steel1'),
  plate: r('steel1', 'steel2', 'plate0', 'plate1', 'plate2'),
  team: r('team0', 'team1', 'team2'),
  amber: r('rust0', 'amber0', 'amber1', 'amber2'),
  gold: r('rust0', 'gold0', 'gold1', 'amber2'),
  rust: r('char0', 'rust0', 'rust1', 'rust2'),
  red: r('rust0', 'red0', 'red1'),
  green: r('char1', 'green0', 'green1'),
  glass: r('visor', 'cyan0', 'cyan1'),
  glow: r('cyan1', 'cyan2', 'white'),
  lampAmber: r('amber1', 'amber2', 'white'),
  lampRed: r('red0', 'red1', 'white'),
  lampGreen: r('green0', 'green1', 'white'),
  wood: r('char0', 'char1', 'rust0', 'rust1', 'rust2'),
  log: r('char0', 'char1', 'rust0', 'dust0', 'dust2', 'dust4'),
  stone: r('char0', 'char1', 'dust1', 'dust3', 'dust4', 'dust5'),
  bark: r('char0', 'char1', 'rust0', 'dust0', 'dust2'),
  leaf: r('char0', 'leaf0', 'leaf1', 'leaf2', 'grass2', 'grass3'),
  pine: r('char0', 'leaf0', 'leaf1', 'leaf2', 'grass2'),
  water: r('water0', 'water1', 'water2', 'water3'),
  smoke: r('blur', 'plate0', 'plate1', 'plate2')
};

// Standard materials. spec/shine set the glint; emissive parts ignore the light.
export const MAT = {
  steel: { ramp: RAMP.steel, spec: 0.4, shine: 18 },
  dark: { ramp: RAMP.dark, spec: 0.25, shine: 16 },
  chrome: { ramp: RAMP.steel.slice(3), spec: 0.9, shine: 30 },
  plate: { ramp: RAMP.plate, spec: 0.45, shine: 24 },
  team: { ramp: RAMP.team, spec: 0.35, shine: 20 },
  amber: { ramp: RAMP.amber, spec: 0.45, shine: 22 },
  gold: { ramp: RAMP.gold, spec: 0.6, shine: 24 },
  rust: { ramp: RAMP.rust, spec: 0.1, shine: 10 },
  red: { ramp: RAMP.red, spec: 0.3, shine: 18 },
  green: { ramp: RAMP.green, spec: 0.3, shine: 18 },
  glass: { ramp: RAMP.glass, spec: 1.4, shine: 36 },
  glow: { ramp: RAMP.glow, emissive: true },
  lampAmber: { ramp: RAMP.lampAmber, emissive: true },
  lampRed: { ramp: RAMP.lampRed, emissive: true },
  lampGreen: { ramp: RAMP.lampGreen, emissive: true },
  wood: { ramp: RAMP.wood, spec: 0.05, shine: 8 },
  log: { ramp: RAMP.log, spec: 0.05, shine: 8 },
  stone: { ramp: RAMP.stone, spec: 0.08, shine: 8 },
  bark: { ramp: RAMP.bark },
  leaf: { ramp: RAMP.leaf },
  pine: { ramp: RAMP.pine },
  water: { ramp: RAMP.water, spec: 1, shine: 30 },
  smoke: { ramp: RAMP.smoke }
};

// A material with a surface pattern: pattern(p, n) returns ramp steps to add (-2 for a seam,
// +1 for a lit edge), another material to use at that point, or 0.
export const patterned = (mat, pattern) => ({ ...mat, pattern });
// Smooth grime: -1 where the noise at model position p passes `cut`.
export const grime = (p, cut = 0.78, size = 1.4) => noise3(p[0] / size + 11, p[1] / size + 3, p[2] / size + 7) > cut ? -1 : 0;
// True when v is within w of any of the values in `at`.
export const near = (v, at, w = 0.32) => (Array.isArray(at) ? at : [at]).some(a => Math.abs(v - a) < w);
// A hydraulic piston from p to q: the dark cylinder, then the chrome rod.
export function piston(m, p, q, r = 0.75){
  const k = mix(p, q, 0.58);
  m.tube(along(p, k), MAT.dark, r, r, 8);
  m.tube(along(k, q), MAT.chrome, r * 0.6, r * 0.6, 8);
}

// Frame sizes in art px (see "Frames" in the rules). The origin (ox, oy) is the model origin:
// the ground point under a unit, or the centre of a structure's footprint on the ground.
// A unit's ground reach (strides included) and height must fit its frame:
//   standard 96 × 96: reach 16 world px, height 24;  tall 96 × 128: reach 16, height 50;
//   small 64 × 64: reach 10, height 17.
export const UNIT_FRAMES = {
  standard: { w: 96, h: 96, ox: 48, oy: 62, reach: 16, height: 24 },
  tall: { w: 96, h: 128, ox: 48, oy: 94, reach: 16, height: 50 },
  small: { w: 64, h: 64, ox: 32, oy: 42, reach: 10, height: 17 }
};
export const unitFrame = (size = 'standard') => ({ ...UNIT_FRAMES[size], shadowPad: 32 });
// Structures and props: footprint × 96 art px wide, plus headroom above for their height.
export function structureFrame(fw, fh, height){
  const headroom = Math.max(16, Math.ceil((height * LIFT * RES + 2) / 16) * 16);
  return { w: fw * TILE * RES, h: fh * TILE * RES + headroom, ox: fw * TILE, oy: headroom + fh * TILE, headroom, height, shadowPad: 64 };
}
