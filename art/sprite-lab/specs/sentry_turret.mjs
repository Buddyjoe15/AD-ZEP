// Sentry Turret: a 1 × 1 crew defence structure, a light rapid-fire gun on a bolted pad.
// Model space is world px: x east, y up, z south; the origin is the ground point under the
// centre of the footprint, and the gun points north (-z).
import { Model, mul, translate, scale, rotX, rotY, along, MAT, patterned, grime, near, piston, structureFrame } from '../../../tools/sprite-kit.mjs';
import { rng } from '../../../tools/pixelart.mjs';

const box = (m, c, s, mat, ry = 0, rx = 0) => m.box(mul(translate(...c), rotY(ry), rotX(rx), scale(...s)), mat);
const ball = (m, c, r, mat, seg = 10) => m.ball(mul(translate(...c), scale(...(Array.isArray(r) ? r : [r, r, r]))), mat, seg);
// A vertical drum: radius r, from y0 up h.
const drum = (m, [x, y0, z], r, h, mat, seg = 20) => m.tube(mul(translate(x, y0, z), scale(1, h, 1)), mat, r, r, seg);

const PAD = 19.5, PAD_H = 2, RING_R = 11, RING_H = 2.4, HEAD_Y = PAD_H + RING_H;
const hazard = patterned(MAT.amber, p => (Math.floor((p[0] + p[2] + 80) / 1.6) & 1) ? MAT.dark : 0);
// The pad: bolted steel plates with seams, hazard bands along the front and back edges.
const pad = (worn) => patterned(MAT.steel, p => {
  if (p[1] > PAD_H - 0.2 && Math.abs(p[2]) > PAD - 2.2) return hazard;
  if (near(p[0], [-7, 7], 0.25) || near(p[2], [-7, 7], 0.25)) return -2;           // plate seams
  if (near(Math.abs(p[0]), PAD - 1.3, 0.45) && near(Math.abs(p[2]), [4, 11], 0.45)) return 1;   // rivets
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

// The slewing ring the head turns on.
function ring(m){
  const r = patterned(MAT.dark, p => (Math.floor((Math.atan2(p[0], p[2]) + 7) * 12 / Math.PI) & 1) && p[1] > PAD_H + RING_H - 0.4 ? 1 : 0);
  drum(m, [0, PAD_H, 0], RING_R, RING_H, r, 28);
}

// The gun head. recoil pulls the barrel back (world px); flash draws the muzzle flash.
// damage bends the barrel, scorches the plating and swaps the sensor for a red fault lamp.
function head(m, { recoil = 0, flash = false, damaged = false, frame = 0, plated = true, barrel = true } = {}){
  const y = HEAD_Y;
  const shell = patterned(MAT.plate, p => {
    if (p[1] > y + 5.6 && Math.hypot(p[0], p[2] - 1) > 6.2) return MAT.team;         // team ring round the top
    if (near(p[2], 3.5, 0.25) && p[1] > y + 4) return -1;                            // hatch seam
    if (damaged && grime([p[0] + 9, p[1], p[2]], 0.5, 1.6)) return MAT.rust;
    return grime(p, damaged ? 0.6 : 0.8);
  });
  // Rounded housing: a low drum with a domed cap.
  drum(m, [0, y, 1], 9, 4.2, plated ? shell : MAT.steel, 24);
  m.ball(mul(translate(0, y + 4.2, 1), scale(9, 2.2, 9)), plated ? shell : MAT.steel, 20);
  if (!plated){
    // Near-complete: one side panel still open, the dark interior and a cable showing.
    box(m, [5.5, y + 4.8, 3], [5, 2.6, 7], MAT.dark);
    m.tube(along([3, y + 5.4, 0], [7, y + 5.6, 6]), MAT.amber, 0.5, 0.5, 6);
  }
  // Ammo drum on the right, fed across into the breech.
  const ammo = patterned(MAT.steel, p => near(p[2], [-1, 3], 0.3) ? -2 : (p[1] > y + 5.2 && p[2] > 4 ? MAT.amber : 0));
  box(m, [11, y + 2.8, 1.5], [4.5, 5, 8], ammo);
  box(m, [8, y + 4.8, -1], [3, 1.2, 2], MAT.gold);
  // Counterweight block at the back.
  box(m, [0, y + 3, 10.2], [9, 4, 3], patterned(MAT.dark, p => near(p[0], [-2.5, 0, 2.5], 0.3) ? 1 : 0));
  // Sensor: a cyan eye front left, or a red fault lamp when damaged.
  ball(m, [-4.5, y + 6, -6.2], 1.3, damaged ? (frame === 0 ? MAT.lampRed : MAT.red) : MAT.glow, 10);
  box(m, [-4.5, y + 6.2, -4.9], [3.4, 1.4, 1.4], MAT.dark);
  if (!barrel) return;
  // Barrel: breech, a vented cooling jacket, the bare barrel and a muzzle brake.
  const by = y + 4.6, z0 = -7 + recoil, bend = damaged ? 0.35 : 0;
  const tip = [damaged ? 3.5 : 0, by - (damaged ? 1.5 : 0), -19 + recoil];
  box(m, [0, by, z0 + 1], [4, 3.2, 4], MAT.steel);
  const jacket = patterned(MAT.dark, p => near(p[2], [-9, -10.6, -12.2, -13.8].map(v => v + recoil), 0.35) ? 2 : 0);
  m.tube(along([0, by, z0], [0, by, z0 - 8]), jacket, 1.9, 1.9, 12);
  m.tube(along([0, by, z0 - 8], tip), MAT.chrome, 1.1, 1.1, 10);
  box(m, [tip[0], tip[1], tip[2] - 0.2], [2.8, 1.8, 1.6], MAT.dark, bend);
  piston(m, [2.2, y + 2.5, 2], [2.2, by - 0.8, z0 - 2], 0.55);                   // elevation ram
  if (flash){
    // Muzzle flash: a short star of light that changes shape each shot.
    const r = rng(40 + frame * 13);
    ball(m, [0, by, tip[2] - 2], [1.8, 1.4, 1.8], MAT.lampAmber, 8);
    ball(m, [0, by + 0.4, tip[2] - 2.2], 0.9, MAT.glow, 6);
    for (const s of [-1, 1]) ball(m, [s * (1.8 + r()), by, tip[2] - 1.2 - r()], [1, 0.8, 0.7], MAT.lampAmber, 6);
    ball(m, [0, by, tip[2] - 3.4 - r() * 0.6], [0.8, 0.7, 1], MAT.lampAmber, 6);
  }
}

export default {
  key: 'sentry_turret',
  name: 'Sentry Turret',
  gameKey: 'sentry_turret',
  request: 'Sentry Turret (the existing 1 × 1 structure, drawn today as a placeholder).',
  kind: 'structure',
  faction: 'crew',
  team: true,
  elevation: 'structure',
  footprint: [1, 1],
  frame: structureFrame(1, 1),
  states: {
    foundation: { frames: 1 }, frame: { frames: 1 }, 'near-complete': { frames: 1 },
    finished: { frames: 2, fps: 2 }, working: { frames: 4, fps: 12 }, damaged: { frames: 2, fps: 3 }, rubble: { frames: 1 }
  },
  fit: {
    lore: 'Fabricated on site by the crew for early perimeter defence: a light rapid-fire gun on a slewing ring, bolted to a steel pad the Spiders lay down. It fires automatically at ground targets within 260, the first line against the hostile machines.',
    style: 'Crew field engineering: a riveted steel pad with amber hazard bands and gold anchor bolts, a rounded plate housing, a side ammo drum, a vented cooling jacket and an exposed elevation ram. Team colour rings the top of the housing, seen from above; a cyan sensor eye sits beside the barrel.',
    silhouette: 'A square hazard-banded pad with a round head and one long barrel poking north past it: a keyhole shape, square and still, unlike the Spider\'s X of legs, the drones\' rotors or Vance.',
    changes: [
      'The game turns the turret head toward its target; the engine can\'t yet draw a separate rotating layer, so the head is drawn aiming north. Aiming would need engine work (a head layer in 8 facings).',
      'Kept the single barrel of today\'s placeholder; the Anti-Air Turret keeps the twin barrels.',
      'Working is firing: 4 frames at 12 fps, the barrel recoiling with a muzzle flash on alternate frames.',
      'Finished blinks the sensor eye; damaged bends the barrel, rusts the plating and shows a blinking red fault lamp.',
      'The muzzle flash stays inside the tile, so it may read short at close zoom.'
    ]
  },
  build({ state, frame }){
    const m = new Model();
    if (state === 'rubble'){
      // Scorched slab, the ring torn off, plates and the barrel scattered.
      box(m, [0, 0.6, 0], [PAD * 2 - 4, 1.2, PAD * 2 - 6], patterned(MAT.dark, p => grime(p, 0.3, 2.5) ? -1 : (grime([p[0] + 5, 0, p[2]], 0.6, 2) ? MAT.rust : 0)), 0.05);
      const r = rng(31);
      for (let i = 0; i < 11; i++)
        box(m, [(r() - 0.5) * 30, 1.4 + r(), (r() - 0.5) * 30], [2 + r() * 5, 0.8 + r() * 1.5, 2 + r() * 4], [MAT.plate, MAT.rust, MAT.steel, MAT.dark][i % 4], r() * 3, (r() - 0.5) * 0.6);
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
        const ang = a * Math.PI / 2 + Math.PI / 4, x = Math.sin(ang) * 7, z = Math.cos(ang) * 7;
        m.tube(along([x, HEAD_Y, z + 1], [x * 0.5, HEAD_Y + 6, z * 0.5 + 1]), MAT.steel, 0.9, 0.9, 8);
      }
      box(m, [0, HEAD_Y + 6, 1], [9, 1, 9], MAT.steel);
      box(m, [0, HEAD_Y + 1, 1], [14, 1.4, 2], MAT.dark);
      box(m, [0, HEAD_Y + 1, 1], [2, 1.4, 14], MAT.dark);
      return m;
    }
    if (state === 'near-complete'){ head(m, { plated: false, barrel: false }); return m; }
    if (state === 'working'){ head(m, { recoil: frame % 2 === 0 ? 1.4 : 0, flash: frame % 2 === 0, frame }); return m; }
    if (state === 'damaged'){ head(m, { damaged: true, frame }); return m; }
    head(m, { frame });
    if (frame === 1) ball(m, [-4.5, HEAD_Y + 7.4, -6.2], 0.6, MAT.glow, 6);         // finished: the eye brightens
    return m;
  }
};
