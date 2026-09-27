// Salvage Crawler: a tracked crew unit that cuts wrecks apart with two saw arms and hauls
// the scrap home as metal. Model space is world px: x east, y up, z south; it faces -z; the
// origin is the ground point under its centre.
import { Model, mix, mul, translate, scale, rotX, rotY, along, MAT, patterned, grime, near, piston, unitFrame } from '../../../tools/sprite-kit.mjs';
import { rng } from '../../../tools/pixelart.mjs';

const box = (m, c, s, mat, ry = 0, rx = 0) => m.box(mul(translate(...c), rotY(ry), rotX(rx), scale(...s)), mat);
const ball = (m, c, r, mat, seg = 10) => m.ball(mul(translate(...c), scale(...(Array.isArray(r) ? r : [r, r, r]))), mat, seg);
// A vertical drum: radius r, from y0 up h.
const drum = (m, [x, y0, z], r, h, mat, seg = 16) => m.tube(mul(translate(x, y0, z), scale(1, h, 1)), mat, r, r, seg);

const HULL_Y = 5.5, ARM_X = 6.6, BLADE_R = 4.8, BLADE_T = 1.5, REACH = 8.2;
// Hopper fill levels: the share of cargoCapacity aboard, and how many scrap pieces show.
const FILL = { empty: 0, quarter: 0.25, half: 0.5, full: 1 };
const hazard = patterned(MAT.amber, p => (Math.floor((p[0] + p[2] + p[1] + 60) / 1.1) & 1) ? MAT.dark : 0);
const hull = y0 => patterned(MAT.steel, p => {
  if (near(p[2], [-5, 1, 7], 0.28) && p[1] > y0 + 7.4) return -2;                       // plate seams across the deck
  if (near(Math.abs(p[0]), 6, 0.3) && p[1] > y0 + 7.4) return -1;
  if (near(Math.abs(p[0]), 5.1, 0.35) && near(p[2], [-4, 0, 6, 10], 0.35)) return 1;     // rivets
  return grime(p, 0.72, 1.6) || (grime([p[0] + 40, p[1], p[2]], 0.84, 1.1) ? MAT.rust : 0);   // grime and rust streaks
});

// One saw arm on side s (-1 left, +1 right), extended by e (0 retracted, 1 at full reach).
// The blade stands upright and spins on an axle across the arm, like a circular saw: from
// straight above the camera sees it edge-on, a long toothed chrome strip.
function sawArm(m, s, y0, e, spin, cutting, frame){
  const x = ARM_X * s, pivot = [x, y0 + 6.5, -2];
  const head = [x, 10 - 6 * e, -8 - REACH * e];                             // held high over the treads, then reaches forward and drops into the cut
  drum(m, [x, pivot[1] - 1.4, pivot[2]], 2, 2.4, MAT.dark);                 // pivot mount on the deck
  ball(m, pivot, 1.5, MAT.steel, 10);
  // Telescoping boom: a fixed outer sleeve aimed at the head, then the chrome inner section that slides out.
  const d = head.map((v, i) => v - pivot[i]), len = Math.hypot(...d), sleeveEnd = pivot.map((v, i) => v + d[i] / len * 3.6);
  m.tube(along(pivot, sleeveEnd), MAT.steel, 1.5, 1.3, 10);
  m.tube(along(sleeveEnd, head), MAT.chrome, 0.9, 0.9, 8);
  ball(m, sleeveEnd, 1.35, hazard, 10);                                      // hazard collar where the boom slides out
  piston(m, [x - 1.6 * s, y0 + 5.4, 0.6], mix(sleeveEnd, head, 0.6).map((v, i) => v + [-1.1 * s, 0.9, 0][i]), 0.55);
  // Fork either side of the blade, and the hubs of its axle.
  for (const k of [-1, 1]){
    const fx = x + k * (BLADE_T / 2 + 0.4);
    box(m, [fx, head[1] + 0.9, head[2] + 1.4], [0.55, 1, 3.4], MAT.dark);
    ball(m, [fx + k * 0.15, head[1], head[2]], [0.45, 1.2, 1.2], MAT.chrome, 8);
  }
  // The blade: chrome with a dark ring inside the rim, and teeth that turn with the spin.
  const blade = patterned(MAT.chrome, p => {
    const dy = p[1] - head[1], dz = p[2] - head[2], r = Math.hypot(dy, dz), a = Math.atan2(dy, dz) + spin;
    if (r < 1.2) return MAT.dark;                                            // hub
    if (r > BLADE_R - 0.8) return (Math.floor((a + 7) * 14 / Math.PI) & 1) ? MAT.dark : 1;
    if (near(r, BLADE_R - 1.4, 0.3)) return -2;
    return 0;
  });
  m.tube(along([x - BLADE_T / 2, head[1], head[2]], [x + BLADE_T / 2, head[1], head[2]]), blade, BLADE_R, BLADE_R, 32);
  // A small dark guard over the back of the blade, so the whole cutting edge shows from above.
  box(m, [x, head[1] + BLADE_R * 0.75, head[2] + BLADE_R * 0.55], [BLADE_T + 0.9, 0.7, BLADE_R * 0.9], MAT.dark, 0, -0.6);
  if (cutting){
    // Sparks thrown outward from where the blade bites.
    const sr = rng(90 + frame * 7 + (s > 0 ? 3 : 0));
    for (let i = 0; i < 7; i++){
      const z = head[2] - BLADE_R * (0.1 + sr() * 0.4), out = 1.2 + sr() * 1.4;
      ball(m, [x + s * out, 0.8 + sr() * 2.5, z + (sr() - 0.5) * 1.5], 0.4 + sr() * 0.3, sr() < 0.55 ? MAT.lampAmber : MAT.glow, 6);
    }
  }
}

export default {
  key: 'salvage_crawler',
  name: 'Salvage Crawler',
  request: 'a salvage crawler that strips wrecks for metal. Revised: a second working arm with a cutting disc; the discs stand vertical; the arms actuate and extend forward to cut the salvage. Then: the arms reach further, the blades are slightly bigger, and the hopper shows four fill levels (empty, a quarter, half, full) by the scrap aboard.',
  kind: 'unit',
  faction: 'crew',
  team: true,
  elevation: 'ground',
  frame: unitFrame('standard'),
  animations: { idle: { frames: 2, fps: 2 }, walk: { frames: 4, fps: 8 }, work: { frames: 6, fps: 8 } },
  variants: { label: 'Hopper', by: 'cargoTotal / cargoCapacity', values: Object.keys(FILL), at: Object.values(FILL), pick: 'empty only when nothing is aboard, otherwise the nearest of quarter, half and full' },
  fit: {
    lore: 'Fabricated by ARIA as crew field tech: it crawls out to wrecks and ruined settlements, saws them apart and hauls the scrap back as metal, the way a Scavenging Mine is worked by hand. Suited to salvage Earths such as Earth at War and the abandoned towns of Woods World.',
    style: 'Crew steel and plate, worn with grime and rust from the work. Two saw arms with chrome telescoping booms, hydraulic pistons and hazard-striped collars. Team colour rims the scrap hopper and marks the cab roof, both seen from above. Cyan sensor eye, amber beacon, sparks where the blades bite.',
    silhouette: 'A long boxy hull on twin treads with two saw arms reaching forward like mandibles and an open hopper of scrap behind: no legs, not round, unlike the Spider.',
    changes: [
      'Made a crew unit (team colour, fabricated by ARIA): the description didn\'t say who owns it, and the crew is who salvages.',
      'Sized as a one-tile ground unit in the standard 96 × 96 frame, inside the inscribed circle with both arms at full reach.',
      'The cab moved to the centre front to make room for the second arm.',
      'The discs stand upright, so from straight above each shows edge-on as a long toothed chrome strip in its fork, with only a small guard at the back.',
      'The hopper has four fill levels, empty, a quarter, half and full, each with every animation; the game would pick one from the cargo aboard.',
      'Work is 6 frames: the arms take turns telescoping forward about 8 world px and dropping into the cut, then pulling back, each blade spinning and throwing sparks while it cuts. Idle (beacon blinks) and walk (treads roll) keep the arms in.'
    ]
  },
  build({ anim, frame, frames, variant = 'full' }){
    const m = new Model(), t = frame / frames;
    const bob = anim === 'walk' ? (frame % 2) * 0.3 : 0, y0 = HULL_Y + bob;
    const roll = anim === 'walk' ? t * 2 : 0;
    // Treads, rounded at the ends; the grooves on top roll while walking.
    const tread = patterned(MAT.dark, p => p[1] > 4.4 && ((p[2] + roll + 100) % 2) < 0.7 ? -2 : (p[1] > 4.4 && near(Math.abs(p[0]), 9.5, 0.4) ? 1 : 0));
    for (const s of [-1, 1]){
      box(m, [9.5 * s, 2.5, 0], [5, 5, 26], tread);
      for (const z of [-13, 13]) m.tube(along([9.5 * s - 2.5, 2.5, z], [9.5 * s + 2.5, 2.5, z]), MAT.dark, 2.5, 2.5, 12);
    }
    // Hull and deck.
    box(m, [0, y0 + 1.5, 1], [13, 7, 25], hull(y0));
    box(m, [0, y0 - 0.5, 0], [19, 1.2, 20], MAT.steel);                                  // chassis between the treads
    // Scrap hopper at the back: an open bin rimmed in team colour, full of salvage.
    const H = y0 + 5, top = H + 4.2;
    const rim = patterned(MAT.steel, p => p[1] > top - 0.9 ? MAT.team : grime(p, 0.75));
    box(m, [0, H + 2.1, 12.6], [13, 4.2, 1], rim); box(m, [0, H + 2.1, 1.4], [13, 4.2, 1], rim);
    for (const s of [-1, 1]) box(m, [6 * s, H + 2.1, 7], [1, 4.2, 12.2], rim);
    // Hopper floor, dark with ribs so an empty bin reads as empty and the scrap stands out.
    box(m, [0, H + 0.3, 7], [11, 0.6, 10.2], patterned(MAT.dark, p => near(p[0], [-3.3, 0, 3.3], 0.35) ? 1 : 0));
    // Scrap: the same pieces at every level, so the pile grows in place and rises. Pieces are
    // added spread out (each the farthest from those already in), so a low load covers the floor.
    const f = FILL[variant], r = rng(77), SCRAP = [MAT.rust, MAT.rust, MAT.plate, MAT.rust, MAT.steel, MAT.amber, MAT.rust, MAT.gold], pieces = [];
    for (let i = 0; i < 16; i++){
      const x = (r() - 0.5) * 9, z = 3 + r() * 8.5, sx = 1.2 + r() * 2.8, sz = 1 + r() * 2.4, y = r(), sy = 0.8 + r() * 1.6, ry = r() * Math.PI, rx = (r() - 0.5) * 0.9;
      pieces.push({ x, z, sx, sz, y, sy, ry, rx, mat: SCRAP[i % SCRAP.length] });
    }
    const order = [pieces[0]], rest = pieces.slice(1);
    while (rest.length){
      const gap = q => Math.min(...order.map(o => Math.hypot(o.x - q.x, o.z - q.z)));
      order.push(rest.splice(rest.reduce((b, q, i) => gap(q) > gap(rest[b]) ? i : b, 0), 1)[0]);
    }
    for (const q of order.slice(0, Math.round(16 * f)))
      box(m, [q.x, H + 0.9 + (0.5 + q.y * 1.9) * f, q.z], [q.sx, q.sy, q.sz], q.mat, q.ry, q.rx * f);
    if (f >= 0.5) box(m, [-1, H + 1.2 + 2 * f, 7.5], [1, 0.9, 10], MAT.steel, 0.5, 0.2);   // a bent girder across the pile
    if (f >= 1) m.tube(along([2.5, H + 2.6, 4], [2.5, H + 3.8, 10.5]), MAT.chrome, 0.6, 0.6, 8);   // and a length of pipe on top
    // Cab, centre front, between the arms: visor, team plate on the roof, sensor eye, beacon.
    const cab = patterned(MAT.plate, p => {
      if (p[2] < -6.3 && p[1] > y0 + 7.5) return MAT.glass;
      if (p[1] > y0 + 10.4 && Math.abs(p[0]) < 1.5 && p[2] > -5.8) return MAT.team;
      if (near(p[2], -4.4, 0.25)) return -1;
      return grime(p, 0.8);
    });
    box(m, [0, y0 + 7.8, -4.5], [5.2, 5.2, 5.6], cab);
    ball(m, [0, y0 + 9.4, -7.6], 1.1, MAT.glow);
    const beaconOn = anim === 'work' || (anim === 'idle' ? frame === 0 : frame % 2 === 0);
    ball(m, [-1.9, y0 + 11, -2.4], 0.9, beaconOn ? MAT.lampAmber : MAT.amber);
    drum(m, [1.9, y0 + 7.8, -2.2], 0.7, 4.4, MAT.dark);                                  // exhaust stack beside the beacon
    ball(m, [1.9, y0 + 12.3, -2.2], [0.9, 0.35, 0.9], MAT.dark);
    // Two saw arms. At work they take turns: one reaches forward and cuts while the other pulls back.
    for (const s of [-1, 1]){
      const phase = anim === 'work' ? t + (s > 0 ? 0.5 : 0) : 0, e = anim === 'work' ? (1 - Math.cos(phase * Math.PI * 2)) / 2 : 0;
      const spin = anim === 'work' ? frame * Math.PI / 20 * (s > 0 ? 1 : -1) : 0;
      sawArm(m, s, y0, e, spin, anim === 'work' && e > 0.45, frame);
    }
    return m;
  }
};
