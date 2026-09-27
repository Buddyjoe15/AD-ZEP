// Shared parts for walls and gates (art/sprite-lab/specs/*_wall.mjs, gate*.mjs).
// Model space is world px: x east, y up, z south; the origin is the ground point under the
// centre of the footprint. A wall tile is 48 world px; its arms run from the centre to the
// tile edge (and on past it, into the render bleed, so neighbouring tiles meet seamlessly).
// Patterns along a wall repeat every 6, 12 or 24 world px, which divide the 48 px tile, so
// they carry on unbroken from one tile to the next.
import { Model, mul, translate, scale, rotX, rotY, along, MAT, patterned, grime, near, structureFrame, CONNECT } from '../../../../tools/sprite-kit.mjs';
import { rng } from '../../../../tools/pixelart.mjs';

export { Model, mul, translate, scale, rotX, rotY, along, MAT, patterned, grime, near, structureFrame, CONNECT, rng };
export const box = (m, c, s, mat, ry = 0, rx = 0) => m.box(mul(translate(...c), rotY(ry), rotX(rx), scale(...s)), mat);
export const ball = (m, c, r, mat, seg = 10) => m.ball(mul(translate(...c), scale(...(Array.isArray(r) ? r : [r, r, r]))), mat, seg);
// A vertical drum: radius r, from y0 up h.
export const drum = (m, [x, y0, z], r, h, mat, seg = 16) => m.tube(mul(translate(x, y0, z), scale(1, h, 1)), mat, r, r, seg);
// Lamps with a hot white core, and lamps at half strength.
export const hot = (mat, cx, cz, w) => patterned(mat, p => Math.abs(p[0] - cx) < w && Math.abs(p[2] - cz) < w ? 0 : -1);
export const dim = mat => patterned(mat, () => -2);

export const HALF = 24, REACH = 32;              // half a tile; how far arms run (past the edge, into the bleed)
export const BLEED = 16;                         // art px rendered past each frame edge, then cropped
// The four sides as unit steps, with their mask bits.
export const SIDES = [[CONNECT.N, 0, -1], [CONNECT.E, 1, 0], [CONNECT.S, 0, 1], [CONNECT.W, -1, 0]];
export const armsOf = mask => SIDES.filter(([bit]) => mask & bit).map(([, dx, dz]) => [dx, dz]);
// A box along an arm in direction (dx, dz): from t0 to t1 out from the centre, `across` wide,
// from y0 up h, offset `side` across the arm.
export function armBox(m, [dx, dz], t0, t1, across, y0, h, mat, side = 0){
  const t = (t0 + t1) / 2, len = t1 - t0, nx = -dz, nz = dx;
  box(m, [dx * t + nx * side, y0 + h / 2, dz * t + nz * side], dx ? [len, h, across] : [across, h, len], mat);
}
// Position `t` along an arm, `side` across it: [x, z].
export const armAt = ([dx, dz], t, side = 0) => [dx * t - dz * side, dz * t + dx * side];
// Distance along the wall line (x for east-west arms, z for north-south), for patterns that
// must continue across tiles.
export const along48 = v => ((v % 48) + 48) % 48;

// A survey marker in team colour at the centre of a foundation, so a site shows whose it is.
export function marker(m, y = 0.6){
  box(m, [0, y, 0], [7, 0.8, 7], MAT.team);
  box(m, [0, y + 0.3, 0], [2.4, 1.4, 2.4], MAT.dark);
}
// Scorched ground and scattered pieces, for rubble.
export function scorch(m, w, h, seed){
  box(m, [0, 0.4, 0], [w, 0.8, h], patterned(MAT.dark, p => grime(p, 0.3, 2.5) ? -1 : (grime([p[0] + 5, 0, p[2]], 0.6, 2) ? MAT.rust : 0)));
  return rng(seed);
}
// A wall spec from its parts. `piece(m, { mask, damaged, frame })` draws one finished tile
// joined on the mask's sides; the construction states and rubble are single, unjoined tiles.
export function wallSpec({ key, name, gameKey, request, fit, piece, foundation, framing, nearComplete, rubble, joins = 'walls of any kind, and the ends of gates' }){
  return {
    key, name, gameKey, request, kind: 'structure', faction: 'crew', team: true, elevation: 'structure',
    footprint: [1, 1], frame: structureFrame(1, 1), bleed: BLEED, connect: joins,
    states: {
      foundation: { frames: 1 }, frame: { frames: 1 }, 'near-complete': { frames: 1 },
      finished: { frames: 16, connect: true }, damaged: { frames: 16, connect: true }, rubble: { frames: 1 }
    },
    fit,
    build({ state, frame }){
      const m = new Model();
      if (state === 'foundation') foundation(m);
      else if (state === 'frame') framing(m);
      else if (state === 'near-complete') nearComplete(m);
      else if (state === 'rubble') rubble(m);
      else piece(m, { mask: frame, damaged: state === 'damaged' });
      return m;
    }
  };
}
