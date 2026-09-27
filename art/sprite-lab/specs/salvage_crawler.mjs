// Salvage Crawler: a tracked crew unit that cuts wrecks apart and hauls the scrap home as
// metal. Model space is world px: x east, y up, z south; it faces -z; the origin is the
// ground point under its centre.
import { Model, mul, translate, scale, rotX, rotY, along, MAT, patterned, grime, near, piston, unitFrame } from '../../../tools/sprite-kit.mjs';
import { rng } from '../../../tools/pixelart.mjs';

const box = (m, c, s, mat, ry = 0, rx = 0) => m.box(mul(translate(...c), rotY(ry), rotX(rx), scale(...s)), mat);
const ball = (m, c, r, mat, seg = 10) => m.ball(mul(translate(...c), scale(...(Array.isArray(r) ? r : [r, r, r]))), mat, seg);
// A vertical disc or drum: radius r, from y0 up h.
const drum = (m, [x, y0, z], r, h, mat, seg = 16) => m.tube(mul(translate(x, y0, z), scale(1, h, 1)), mat, r, r, seg);

const HULL_Y = 5.5, GRINDER = [4, 0, -16];
const hazard = patterned(MAT.amber, p => (Math.floor((p[0] + p[2] + 60) / 1.1) & 1) ? MAT.dark : 0);
const hull = y0 => patterned(MAT.steel, p => {
  if (near(p[2], [-5, 1, 7], 0.28) && p[1] > y0 + 7.4) return -2;                       // plate seams across the deck
  if (near(Math.abs(p[0]), 6, 0.3) && p[1] > y0 + 7.4) return -1;
  if (near(Math.abs(p[0]), 5.1, 0.35) && near(p[2], [-4, 0, 6, 10], 0.35)) return 1;     // rivets
  return grime(p, 0.72, 1.6) || (grime([p[0] + 40, p[1], p[2]], 0.84, 1.1) ? MAT.rust : 0);   // grime and rust streaks
});

export default {
  key: 'salvage_crawler',
  name: 'Salvage Crawler',
  request: 'a salvage crawler that strips wrecks for metal',
  kind: 'unit',
  faction: 'crew',
  team: true,
  elevation: 'ground',
  frame: unitFrame('standard'),
  animations: { idle: { frames: 2, fps: 2 }, walk: { frames: 4, fps: 8 }, work: { frames: 4, fps: 8 } },
  fit: {
    lore: 'Fabricated by ARIA as crew field tech: it crawls out to wrecks and ruined settlements, grinds them apart and hauls the scrap back as metal, the way a Scavenging Mine is worked by hand. Suited to salvage Earths such as Earth at War and the abandoned towns of Woods World.',
    style: 'Crew steel and plate, worn with grime and rust from the work. Hazard-striped grinder guard, gold-free and plain: a working machine. Team colour rims the scrap hopper and marks the cab roof, both seen from above. Cyan sensor eye, amber beacon, sparks from the grinder while working.',
    silhouette: 'A long boxy hull on twin treads with a grinder arm reaching forward and an open hopper of scrap behind: no legs, not round, unlike the Spider.',
    changes: [
      'Made a crew unit (team colour, fabricated by ARIA): the description didn\'t say who owns it, and the crew is who salvages.',
      'Sized as a one-tile ground unit in the standard 96 × 96 frame, inside the inscribed circle with the arm at full reach.',
      'Animations: idle (beacon blinks), walk (treads roll) and work (grinder spins, sparks fly), all names the engine already plays.'
    ]
  },
  build({ anim, frame, frames }){
    const m = new Model(), t = frame / frames;
    const bob = anim === 'walk' ? (frame % 2) * 0.3 : 0, y0 = HULL_Y + bob;
    const roll = anim === 'walk' ? t * 2 : 0, spin = anim === 'work' ? t * Math.PI / 2 : 0;
    // Treads, rounded at the ends; the grooves on top roll while walking.
    const tread = patterned(MAT.dark, p => p[1] > 4.4 && ((p[2] + roll + 100) % 2) < 0.7 ? -2 : (p[1] > 4.4 && near(Math.abs(p[0]), 9.5, 0.4) ? 1 : 0));
    for (const s of [-1, 1]){
      box(m, [9.5 * s, 2.5, 0], [5, 5, 26], tread);
      for (const z of [-13, 13]) m.tube(along([9.5 * s - 2.5, 2.5, z], [9.5 * s + 2.5, 2.5, z]), MAT.dark, 2.5, 2.5, 12);
      box(m, [9.5 * s, 5.4, -10.5], [5.6, 0.8, 6], hazard);                            // front fenders
    }
    // Hull and deck.
    box(m, [0, y0 + 1.5, 1], [13, 7, 25], hull(y0));
    box(m, [0, y0 - 0.5, 0], [19, 1.2, 20], MAT.steel);                                  // chassis between the treads
    // Scrap hopper at the back: an open bin rimmed in team colour, full of salvage.
    const H = y0 + 5, top = H + 4.2;
    const rim = patterned(MAT.steel, p => p[1] > top - 0.9 ? MAT.team : grime(p, 0.75));
    box(m, [0, H + 2.1, 12.6], [13, 4.2, 1], rim); box(m, [0, H + 2.1, 1.4], [13, 4.2, 1], rim);
    for (const s of [-1, 1]) box(m, [6, H + 2.1, 7], [1, 4.2, 12.2], rim);
    box(m, [0, H + 0.3, 7], [11, 0.6, 10.2], MAT.dark);                                  // hopper floor, dark so the scrap stands out
    const r = rng(77), SCRAP = [MAT.rust, MAT.rust, MAT.plate, MAT.rust, MAT.steel, MAT.amber, MAT.rust, MAT.gold];
    for (let i = 0; i < 16; i++){
      const x = (r() - 0.5) * 9, z = 3 + r() * 8.5, sx = 1.2 + r() * 2.8, sz = 1 + r() * 2.4;
      box(m, [x, H + 1.4 + r() * 2.4, z], [sx, 0.8 + r() * 1.6, sz], SCRAP[i % SCRAP.length], r() * Math.PI, (r() - 0.5) * 0.9);
    }
    box(m, [-1, H + 3.2, 7.5], [1, 0.9, 10], MAT.steel, 0.5, 0.2);                       // a bent girder across the pile
    m.tube(along([2.5, H + 2.6, 4], [2.5, H + 3.8, 10.5]), MAT.chrome, 0.6, 0.6, 8);     // and a length of pipe
    // Cab, front left: visor at the front, team plate on the roof, sensor eye, beacon.
    const cab = patterned(MAT.plate, p => {
      if (p[2] < -7.3 && p[1] > y0 + 7.5) return MAT.glass;
      if (p[1] > y0 + 10.4 && Math.abs(p[0] + 3.5) < 1.6 && p[2] > -6.8) return MAT.team;
      if (near(p[2], -5.4, 0.25)) return -1;
      return grime(p, 0.8);
    });
    box(m, [-3.5, y0 + 7.8, -5.5], [5.4, 5.2, 5.6], cab);
    ball(m, [-3.5, y0 + 9.4, -8.6], 1.1, MAT.glow);
    const beaconOn = anim === 'work' || (anim === 'idle' ? frame === 0 : frame % 2 === 0);
    ball(m, [-1.5, y0 + 11, -3.6], 0.95, beaconOn ? MAT.lampAmber : MAT.amber);
    drum(m, [5, y0 + 5, 0], 0.9, 5.5, MAT.dark);                                         // exhaust stack
    ball(m, [5, y0 + 10.6, 0], [1.1, 0.4, 1.1], MAT.dark);
    // Grinder arm, front right: a boom on a pivot with a hydraulic piston, and a spinning
    // cutting disc under a hazard-striped guard.
    const pivot = [3.8, y0 + 6, -8], head = [GRINDER[0], y0 + 4.2, GRINDER[2]];
    drum(m, [pivot[0], pivot[1] - 1, pivot[2]], 1.8, 2, MAT.dark);
    m.tube(along(pivot, head), MAT.steel, 1.2, 1.2, 10);
    piston(m, [pivot[0] + 1.3, pivot[1] + 1.2, pivot[2] + 1], [head[0] + 1.2, head[1] + 1.4, head[2] + 2.5], 0.55);
    drum(m, [head[0], head[1] - 1.6, head[2]], 4, 1.8, hazard, 18);                      // guard
    const disc = patterned(MAT.chrome, p => {
      const dx = p[0] - head[0], dz = p[2] - head[2], a = Math.atan2(dz, dx) + spin, d = Math.hypot(dx, dz);
      if (d < 0.9) return MAT.dark;                                                      // hub
      if (d > 2.9) return (Math.floor((a + 7) * 12 / Math.PI) & 1) ? -2 : 1;            // teeth
      return near(d, 1.8, 0.25) ? -1 : 0;
    });
    drum(m, [head[0], head[1] + 0.2, head[2]], 3.4, 0.5, disc, 24);
    if (anim === 'work'){
      const sr = rng(90 + frame);
      for (let i = 0; i < 5; i++){ const a = -Math.PI / 2 - 0.9 + sr() * 1.8, d = 3.6 + sr() * 2; ball(m, [head[0] + Math.cos(a) * d, head[1] + 0.6, head[2] + Math.sin(a) * d * 0.6], 0.45 + sr() * 0.3, sr() < 0.5 ? MAT.lampAmber : MAT.glow, 6); }
    }
    return m;
  }
};
