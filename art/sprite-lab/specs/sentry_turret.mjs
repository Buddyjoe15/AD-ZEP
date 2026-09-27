// Sentry Turret: a 1 × 1 crew defence structure, a light rapid-fire gun on a bolted pad.
// Model space is world px: x east, y up, z south; the origin is the ground point under the
// centre of the footprint, and the gun points north (-z).
import { Model, mul, translate, scale, rotX, rotY, along, MAT, patterned, grime, near, piston, structureFrame } from '../../../tools/sprite-kit.mjs';
import { rng } from '../../../tools/pixelart.mjs';

const box = (m, c, s, mat, ry = 0, rx = 0) => m.box(mul(translate(...c), rotY(ry), rotX(rx), scale(...s)), mat);
const ball = (m, c, r, mat, seg = 10) => m.ball(mul(translate(...c), scale(...(Array.isArray(r) ? r : [r, r, r]))), mat, seg);
// A vertical drum: radius r, from y0 up h.
const drum = (m, [x, y0, z], r, h, mat, seg = 20) => m.tube(mul(translate(x, y0, z), scale(1, h, 1)), mat, r, r, seg);

const PAD = 16, PAD_H = 2, RING_R = 13.5, RING_H = 2.8, HEAD_Y = PAD_H + RING_H, K = 1.25;   // K: head scale
const hazard = patterned(MAT.amber, p => (Math.floor((p[0] + p[2] + 80) / 1.6) & 1) ? MAT.dark : 0);
// The pad: bolted steel plates with seams, hazard bands along the front and back edges.
const pad = (worn) => patterned(MAT.steel, p => {
  if (p[1] > PAD_H - 0.2 && Math.abs(p[2]) > PAD - 2.2) return hazard;
  if (near(p[0], [-7, 7], 0.25) || near(p[2], [-7, 7], 0.25)) return -2;           // plate seams
  if (near(Math.abs(p[0]), PAD - 1.3, 0.45) && near(Math.abs(p[2]), [4, 10], 0.45)) return 1;   // rivets
  return grime(p, worn ? 0.55 : 0.74, 1.8) || (worn && grime([p[0] + 30, p[1], p[2]], 0.7, 1.3) ? MAT.rust : 0);
});

// The slab and its four corner anchors: every state starts from this.
function base(m, worn){
  box(m, [0, PAD_H / 2, 0], [PAD * 2, PAD_H, PAD * 2], pad(worn));
  for (const x of [-1, 1]) for (const z of [-1, 1]){
    box(m, [x * (PAD - 3), PAD_H + 0.5, z * (PAD - 3)], [4.4, 1, 4.4], MAT.team);          // team-coloured anchor plates, from the foundation on
    ball(m, [x * (PAD - 3), PAD_H + 1.2, z * (PAD - 3)], [1, 0.6, 1], MAT.gold, 8);
  }
}

// The slewing ring the head turns on: a wide toothed drum with a lit rim of bolts.
function ring(m){
  const r = patterned(MAT.dark, p => {
    if (p[1] > PAD_H + RING_H - 0.4 && near(Math.hypot(p[0], p[2]), RING_R - 1, 0.45) && (Math.floor((Math.atan2(p[0], p[2]) + 7) * 16 / Math.PI) & 1)) return MAT.gold;
    return (Math.floor((Math.atan2(p[0], p[2]) + 7) * 12 / Math.PI) & 1) && p[1] > PAD_H + RING_H - 0.4 ? 1 : 0;
  });
  drum(m, [0, PAD_H, 0], RING_R, RING_H, r, 32);
}

// The gun head, K times the first draft's size. recoil pulls the barrel back (world px);
// flash draws the muzzle flash. damage bends the barrel, scorches the plating and swaps the
// sensor for a red fault lamp.
function head(m, { recoil = 0, flash = false, damaged = false, frame = 0, plated = true, barrel = true } = {}){
  const y = HEAD_Y, R = 9 * K;
  const shell = patterned(MAT.plate, p => {
    if (p[1] > y + 6.4 && Math.hypot(p[0], p[2] - 1) > 6.2 * K) return MAT.team;     // team ring round the top
    if (near(p[2], 3.5 * K, 0.25) && p[1] > y + 4.5) return -1;                      // hatch seam
    if (damaged && grime([p[0] + 9, p[1], p[2]], 0.5, 1.6)) return MAT.rust;
    return grime(p, damaged ? 0.6 : 0.8);
  });
  // Rounded housing: a low drum with a domed cap.
  drum(m, [0, y, 1], R, 4.8, plated ? shell : MAT.steel, 28);
  m.ball(mul(translate(0, y + 4.8, 1), scale(R, 2.6, R)), plated ? shell : MAT.steel, 24);
  if (!plated){
    // Near-complete: one side panel still open, the dark interior and a cable showing.
    box(m, [5.5 * K, y + 5.4, 3 * K], [5 * K, 2.8, 7 * K], MAT.dark);
    m.tube(along([3 * K, y + 6, 0], [7 * K, y + 6.2, 6 * K]), MAT.amber, 0.5, 0.5, 6);
  }
  // Ammo drum on the right, fed across into the breech.
  const ammo = patterned(MAT.steel, p => near(p[2], [-1.5, 3.5], 0.3) ? -2 : (p[1] > y + 5.8 && p[2] > 4.5 ? MAT.amber : 0));
  box(m, [13, y + 3.1, 1.9], [5, 5.6, 10], ammo);
  box(m, [9.8, y + 5.4, -1.2], [3.6, 1.3, 2.5], MAT.gold);
  // Counterweight block at the back.
  box(m, [0, y + 3.3, 10.2 * K], [9 * K, 4.4, 3.4], patterned(MAT.dark, p => near(p[0], [-3, 0, 3], 0.3) ? 1 : 0));
  // Sensor: a cyan eye front left, or a red fault lamp when damaged.
  ball(m, [-4.5 * K, y + 6.6, -6.2 * K], 1.5, damaged ? (frame === 0 ? MAT.lampRed : MAT.red) : MAT.glow, 10);
  box(m, [-4.5 * K, y + 6.8, -4.9 * K], [3.8, 1.5, 1.6], MAT.dark);
  if (!barrel) return;
  // Barrel: breech, a vented cooling jacket, the bare barrel and a muzzle brake.
  const by = y + 5.2, z0 = -7 * K + recoil, bend = damaged ? 0.35 : 0;
  const tip = [damaged ? 3.5 : 0, by - (damaged ? 1.5 : 0), -20.3 + recoil];
  box(m, [0, by, z0 + 1.2], [5, 3.6, 5], MAT.steel);
  const jacket = patterned(MAT.dark, p => near(p[2], [-11, -12.8, -14.6, -16.4].map(v => v + recoil), 0.35) ? 2 : 0);
  m.tube(along([0, by, z0], [0, by, z0 - 8.5]), jacket, 2.2, 2.2, 12);
  m.tube(along([0, by, z0 - 8.5], tip), MAT.chrome, 1.3, 1.3, 10);
  box(m, [tip[0], tip[1], tip[2] - 0.2], [3.2, 2, 1.6], MAT.dark, bend);
  piston(m, [2.6, y + 2.8, 2.5], [2.6, by - 0.9, z0 - 2.5], 0.6);                 // elevation ram
  if (flash){
    // Muzzle flash: a short star of light that changes shape each shot, kept inside the tile.
    const r = rng(40 + frame * 13);
    ball(m, [0, by, tip[2] - 1.2], [1.8, 1.4, 1.2], MAT.lampAmber, 8);
    ball(m, [0, by + 0.4, tip[2] - 1.3], 0.8, MAT.glow, 6);
    for (const s of [-1, 1]) ball(m, [s * (2 + r()), by, tip[2] - 0.8 - r() * 0.4], [1.1, 0.8, 0.6], MAT.lampAmber, 6);
  }
}

export default {
  key: 'sentry_turret',
  name: 'Sentry Turret',
  gameKey: 'sentry_turret',
  request: 'Sentry Turret (the existing 1 × 1 structure, drawn today as a placeholder). Revised: a smaller base, a bigger gun base (slewing ring) and a bigger gun turret. Then: engine work so the gun turret turns and tracks enemies.',
  kind: 'structure',
  faction: 'crew',
  team: true,
  elevation: 'structure',
  footprint: [1, 1],
  frame: structureFrame(1, 1),
  // Base layer: the pad and slewing ring. Built and damaged turrets draw the head on top.
  states: {
    foundation: { frames: 1 }, frame: { frames: 1 }, 'near-complete': { frames: 1 },
    finished: { frames: 1 }, damaged: { frames: 1 }, rubble: { frames: 1 }
  },
  // Head layer: turns on the ring to track its target, drawn in 16 facings (every 22.5°),
  // each rendered from the model with the light top left. `on` says which head state goes
  // over which base state; firing plays for one shot (flash, then recoil) after each round.
  head: {
    facings: 16,
    states: { idle: { frames: 1 }, firing: { frames: 2, fps: 16 }, damaged: { frames: 2, fps: 3 } },
    on: { finished: 'idle', damaged: 'damaged' },
    turnRate: 2 * Math.PI,       // radians per second the head is drawn turning toward its aim
    build({ state, frame }){
      const m = new Model();
      if (state === 'firing') head(m, { recoil: frame === 0 ? 1.4 : 0.6, flash: frame === 0, frame });
      else head(m, { damaged: state === 'damaged', frame });
      return m;
    }
  },
  fit: {
    lore: 'Fabricated on site by the crew for early perimeter defence: a light rapid-fire gun on a slewing ring, bolted to a steel pad the Spiders lay down. It fires automatically at ground targets within 260, the first line against the hostile machines.',
    style: 'Crew field engineering: a riveted steel pad with amber hazard bands and gold anchor bolts, a rounded plate housing, a side ammo drum, a vented cooling jacket and an exposed elevation ram. Team colour rings the top of the housing, seen from above; a cyan sensor eye sits beside the barrel.',
    silhouette: 'A square hazard-banded pad with a round head and one long barrel poking north past it: a keyhole shape, square and still, unlike the Spider\'s X of legs, the drones\' rotors or Vance.',
    changes: [
      'The head is its own layer in 16 facings, drawn over the base and turned toward the target the game aims at, easing round at one turn a second. This is new engine work: structures had no turning layer before.',
      'Kept the single barrel of today\'s placeholder; the Anti-Air Turret keeps the twin barrels.',
      'Firing replaces the working state: after each round the head shows a muzzle flash and recoil (2 frames at 16 fps), then settles back to idle until the next shot.',
      'Damaged bends the barrel, rusts the plating and shows a blinking red fault lamp; the damaged head still tracks and fires.',
      'The muzzle flash stays inside the tile, so it may read short at close zoom.',
      'Revised: the pad shrank from 39 to 32 world px, leaving grass round it inside the tile; the slewing ring grew from 22 to 27 world px across with a gold bolt rim; the head and barrel are a quarter bigger and now overhang the ring.'
    ]
  },
  build({ state, frame }){
    const m = new Model();
    if (state === 'rubble'){
      // Scorched slab, the ring torn off, plates and the barrel scattered.
      box(m, [0, 0.6, 0], [PAD * 2 - 2, 1.2, PAD * 2 - 4], patterned(MAT.dark, p => grime(p, 0.3, 2.5) ? -1 : (grime([p[0] + 5, 0, p[2]], 0.6, 2) ? MAT.rust : 0)), 0.05);
      const r = rng(31);
      for (let i = 0; i < 11; i++)
        box(m, [(r() - 0.5) * 26, 1.4 + r(), (r() - 0.5) * 26], [2 + r() * 5, 0.8 + r() * 1.5, 2 + r() * 4], [MAT.plate, MAT.rust, MAT.steel, MAT.dark][i % 4], r() * 3, (r() - 0.5) * 0.6);
      m.tube(along([-10, 1.8, 8], [4, 1.4, 14]), MAT.chrome, 1.1, 1.1, 8);
      box(m, [3, 2, -2], [9, 2.5, 7], patterned(MAT.plate, p => grime(p, 0.4) ? MAT.rust : 0), 0.6, 0.3);   // a piece of the housing
      box(m, [-5, 2.4, -7], [3, 1.6, 3], MAT.team, 0.9);                                               // and a scrap of its team ring
      return m;
    }
    base(m, state === 'damaged');
    if (state === 'foundation') return m;
    ring(m);
    if (state === 'frame'){
      // The ring mount and girders of the head, no plating yet.
      for (const a of [0, 1, 2, 3]){
        const ang = a * Math.PI / 2 + Math.PI / 4, x = Math.sin(ang) * 9, z = Math.cos(ang) * 9;
        m.tube(along([x, HEAD_Y, z + 1], [x * 0.5, HEAD_Y + 6, z * 0.5 + 1]), MAT.steel, 0.9, 0.9, 8);
      }
      box(m, [0, HEAD_Y + 6.5, 1], [11, 1, 11], MAT.steel);
      box(m, [0, HEAD_Y + 1, 1], [18, 1.4, 2.4], MAT.dark);
      box(m, [0, HEAD_Y + 1, 1], [2.4, 1.4, 18], MAT.dark);
      return m;
    }
    if (state === 'near-complete') head(m, { plated: false, barrel: false });   // finished and damaged: the head is its own layer
    return m;
  }
};
