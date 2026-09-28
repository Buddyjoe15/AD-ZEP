// Sentry Turret: a 1 × 1 crew defence structure, a light rapid-fire gun on a bolted pad.
// Model space is world px: x east, y up, z south; the origin is the ground point under the
// centre of the footprint, and the gun points north (-z).
import { Model, mul, translate, scale, rotX, rotY, along, MAT, patterned, grime, near, piston, structureFrame } from '../../../tools/sprite-kit.mjs';
import { rng } from '../../../tools/pixelart.mjs';

const box = (m, c, s, mat, ry = 0, rx = 0) => m.box(mul(translate(...c), rotY(ry), rotX(rx), scale(...s)), mat);
const ball = (m, c, r, mat, seg = 10) => m.ball(mul(translate(...c), scale(...(Array.isArray(r) ? r : [r, r, r]))), mat, seg);
// A vertical drum: radius r, from y0 up h.
const drum = (m, [x, y0, z], r, h, mat, seg = 20) => m.tube(mul(translate(x, y0, z), scale(1, h, 1)), mat, r, r, seg);

const PAD = 16, PAD_H = 2, RING_R = 13.5, RING_H = 2.8, HEAD_Y = PAD_H + RING_H;
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

// The gun head, after the requester's reference art: a rotary cannon of six barrels under an
// arched cowling, a cream armoured housing behind it, ammunition belts feeding in down both
// sides, vented armour blocks at the front corners, amber lamps and blue capsule lights.
// It points north (-z) and turns about the origin. recoil pulls the barrels back (world px),
// spin turns the barrel cluster (radians), flash draws the muzzle flash. damage rusts the
// armour, bends the barrel cluster, drops cartridges and swaps the rear lamp for a red fault
// lamp. plated: false is the near-complete head, frame and cowling only; barrel: false leaves
// the barrels off.
// Lamps: amber or cyan with a hot white core, like the reference's glowing capsules.
const hot = (mat, cx, cz, w) => patterned(mat, p => Math.abs(p[0] - cx) < w && Math.abs(p[2] - cz) < w ? 0 : -1);
const armour = (damaged) => patterned(MAT.plate, p => {
  if (damaged && grime([p[0] + 9, p[1], p[2]], 0.5, 1.5)) return MAT.rust;
  // Amber wear streaks across the cream plates, like the reference's orange scuffs.
  if (grime([(p[0] + p[2]) * 0.6, p[1] * 3, (p[0] - p[2]) * 1.8], 0.72, 1.1)) return MAT.amber;
  if (grime([p[0] + 3, p[1], p[2] + 5], 0.8, 0.9)) return -1;                    // chips
  return 0;
});
// feed moves the belts toward the front (world px, one cartridge every 1.6).
function head(m, { recoil = 0, flash = false, damaged = false, frame = 0, plated = true, barrel = true, spin = 0, feed = 0, lampOn = frame === 0 } = {}){
  const y = HEAD_Y, by = y + 4.6, plate = plated ? armour(damaged) : MAT.steel;
  // Dark chassis under everything, and the raised hatch deck at the back.
  box(m, [0, y + 1.5, 2.5], [22, 3, 20], patterned(MAT.dark, p => near(p[2], [-3, 3, 9], 0.3) ? -1 : 0));
  // Rear housing: a cream armoured block with a dark hatch slot and a team stripe, amber
  // lamp at the back, and a shoulder block either side carrying a small amber lamp.
  const rear = patterned(plate, p => {
    if (p[1] > y + 7.6 && near(p[2], 7.3, 0.55)) return MAT.team;                  // team stripe across the roof
    if (p[1] > y + 7.6 && Math.abs(p[0]) < 3.2 && p[2] > 9 && p[2] < 11.4) return MAT.dark;   // hatch slot
    return plate.pattern ? plate.pattern(p) : 0;
  });
  box(m, [0, y + 4, 10], [12, 8, 7.5], rear);
  for (const s of [-1, 1]){
    box(m, [s * 3.8, y + 4, 13.3], [3, 7.2, 1.2], plate, 0);                     // chamfer the back corners
    box(m, [s * 8.8, y + 3.4, 9.6], [5.2, 6.8, 6.4], plate);
    box(m, [s * 8.8, y + 6.9, 7.6], [1.2, 0.4, 2.4], hot(MAT.lampAmber, s * 8.8, 7.6, 0.35));
  }
  box(m, [0, y + 6.6, 13.9], [5, 1.4, 1.2], damaged ? (lampOn ? hot(MAT.lampRed, 0, 13.9, 0.8) : MAT.red) : hot(MAT.lampAmber, 0, 13.9, 0.8));
  if (!plated){
    // Near-complete: the cowling frame and an open cable run where the belts will go.
    for (const s of [-1, 1]) m.tube(along([s * 4, y + 3, 6], [s * 11, y + 3.4, -6]), MAT.amber, 0.5, 0.5, 6);
    m.tube(along([0, by, 5], [0, by, -1]), MAT.steel, 5.6, 5.6, 16);
    return;
  }
  // Arched cowling over the barrel roots, two bands, a team stripe down its crown, and a
  // small sensor window.
  const cowl = patterned(plate, p => Math.abs(p[0]) < 1 && p[1] > by + 4.6 ? MAT.team : (plate.pattern ? plate.pattern(p) : 0));
  m.tube(along([0, by, 5.2], [0, by, -0.8]), cowl, 6, 6, 20);
  m.tube(along([0, by, -0.8], [0, by, -3]), plate, 5.2, 5.2, 18);
  box(m, [0, by + 5.9, 2.2], [3, 0.8, 2], MAT.dark);
  ball(m, [0, by + 6.3, 2.2], [0.8, 0.5, 0.6], damaged ? MAT.red : MAT.lampAmber, 8);
  // Ammunition belts down both sides: rows of brass cartridges, tips inward, on a dark link
  // strip. They come out from under the shoulder blocks and run forward under the vented
  // blocks into the feed; `feed` slides them along, and every 1.6 the belt looks the same.
  for (const s of [-1, 1]){
    box(m, [s * 11.6, y + 2.8, 0], [5, 1.2, 16], MAT.dark);
    for (let i = 0; i < 10; i++){
      const z = 7.9 - ((i * 1.6 + feed) % 16);
      if (damaged && (i === 2 || i === 6) && s > 0) continue;                    // lost rounds
      m.tube(along([s * 13.7, y + 3.9, z], [s * 10.3, y + 3.9, z]), MAT.gold, 0.62, 0.62, 8);
      ball(m, [s * 9.9, y + 3.9, z], [0.55, 0.5, 0.5], MAT.amber, 6);
    }
    // Tall cream side rail outside each belt, with a blue capsule light on its flank.
    box(m, [s * 15.3, y + 3.6, 1], [1.8, 7.2, 13], plate);
    box(m, [s * 16.6, y + 5.2, 1], [1.2, 1, 4.6], hot(MAT.glow, s * 16.6, 1, 0.3));
    box(m, [s * 16.6, y + 4.4, 1], [1.8, 1, 5.6], MAT.dark);
    // Vented armour block at each front corner.
    const vent = patterned(plate, p => p[1] > y + 6.4 && Math.abs(Math.abs(p[0]) - 12) < 2.2 && p[2] > -13.4 && p[2] < -8 ? (near(p[2], [-12.4, -11.3, -10.2, -9.1], 0.3) ? MAT.steel : MAT.dark) : (plate.pattern ? plate.pattern(p) : 0));
    box(m, [s * 12, y + 3.4, -10.6], [6.4, 6.8, 6.8], vent);
    // Amber lamps on struts flanking the barrels.
    box(m, [s * 6.4, y + 2.2, -9], [2, 4.4, 10], MAT.dark);
    for (const z of [-5.5, -11.5]) box(m, [s * 6.4, y + 4.6, z], [1.4, 0.6, 2.4], hot(MAT.lampAmber, s * 6.4, z, 0.35));
  }
  if (!barrel) return;
  // Rotary cannon: six chrome barrels round a spindle, with two clamp rings, slightly bent
  // off line when damaged. Spin turns the cluster so the barrels shift between frames.
  const tipZ = -19.4 + recoil, bend = damaged ? 2.4 : 0, z0 = -1 + recoil;
  // At rest one barrel is on top and two flank it, so from above three read side by side.
  for (let i = 0; i < 6; i++){
    const a = spin + Math.PI / 6 + i * Math.PI / 3, dx = Math.cos(a) * 2.6, dy = Math.sin(a) * 2.6;
    m.tube(along([dx, by + dy, z0], [dx + bend, by + dy - bend * 0.3, tipZ]), MAT.chrome, 0.85, 0.85, 10);
  }
  m.tube(along([0, by, z0], [bend, by - bend * 0.3, tipZ + 0.6]), MAT.dark, 1.6, 1.6, 10);                // spindle, dark between the barrels
  for (const [z, k] of [[-8 + recoil, 0.35], [-17 + recoil, 0.85]]) m.tube(along([bend * k, by, z], [bend * k, by, z - 1.4]), MAT.dark, 3.6, 3.6, 16);
  if (flash){
    // Muzzle flash: a fan of flame tongues from the barrels, kept inside the tile.
    const r = rng(40 + frame * 13);
    ball(m, [bend, by - bend * 0.3, tipZ - 1.3], [3, 1.4, 1.2], hot(MAT.lampAmber, bend, tipZ - 1.3, 0.9), 10);   // at the (bent) muzzles
    for (const x of [-2.4, 0, 2.4]) ball(m, [bend + x + (r() - 0.5) * 0.4, by - bend * 0.3, tipZ - 2.6 - r() * 0.3], [0.6, 0.6, 0.9], patterned(MAT.lampAmber, () => -1), 6);
  }
}

export default {
  key: 'sentry_turret',
  name: 'Sentry Turret',
  gameKey: 'sentry_turret',
  request: 'Sentry Turret (the existing 1 × 1 structure, drawn today as a placeholder). Revised: a smaller base, a bigger gun base (slewing ring) and a bigger gun turret. Then: engine work so the gun turret turns and tracks enemies. Then: a new look for the head, taking the requester\'s reference art (a six-barrel rotary gun with ammo belts) as inspiration. Then: when firing, the gatling barrels turn and the ammo belts on either side move, as if fed into the turret. Then: the same firing frames for the damaged turret.',
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
  // over which base state. While the turret has a target it plays `firing`: the barrels spin
  // (a quarter of the 60° between barrels each frame) and the ammo belts feed forward one
  // cartridge per loop. For a moment after each round it plays `flash`, the same frames with
  // the muzzle flash and recoil.
  head: {
    facings: 16,
    states: {
      idle: { frames: 1 }, firing: { frames: 4, fps: 16 }, flash: { frames: 4, fps: 16 },
      damaged: { frames: 2, fps: 3 }, 'damaged-firing': { frames: 4, fps: 16 }, 'damaged-flash': { frames: 4, fps: 16 }
    },
    // For each resting head state, the loop it plays while the turret has a target and the
    // matching frames with the muzzle flash (shown for flashTime after each round).
    firing: { idle: ['firing', 'flash'], damaged: ['damaged-firing', 'damaged-flash'] },
    flashTime: 0.12,             // seconds the flash frames show after each round
    on: { finished: 'idle', damaged: 'damaged' },
    turnRate: 2 * Math.PI,       // radians per second the head is drawn turning toward its aim
    build({ state, frame }){
      const m = new Model();
      if (/firing|flash/.test(state)){
        // The damaged gun spins and feeds too, its fault lamp blinking at 4 Hz.
        const flash = state.endsWith('flash'), damaged = state.startsWith('damaged');
        head(m, { recoil: flash ? 0.8 : 0, flash, damaged, spin: frame * Math.PI / 12, feed: frame * 0.4, frame, lampOn: frame < 2 });
      }
      else head(m, { damaged: state === 'damaged', frame });
      return m;
    }
  },
  fit: {
    lore: 'Fabricated on site by the crew for early perimeter defence: a light rapid-fire gun on a slewing ring, bolted to a steel pad the Spiders lay down. It fires automatically at ground targets within 260, the first line against the hostile machines.',
    style: 'Crew field engineering after the requester\'s reference: a riveted steel pad with amber hazard bands and gold anchor bolts, and a heavy gun head of pale armour plate scuffed with amber wear. A six-barrel rotary cannon under an arched cowling, brass ammunition belts feeding in down both sides, vented armour blocks at the front corners, amber lamps on struts beside the barrels, blue capsule lights on the flanks and an amber lamp at the back. Team colour runs as a stripe across the rear housing and down the cowling crown, seen from above.',
    silhouette: 'A square hazard-banded pad under a wide, boxy gun head: a bundle of barrels out front and ribbed brass ammo belts down both sides. Square, still and banded, unlike the Spider\'s X of legs, the drones\' rotors or Vance.',
    changes: [
      'The head is its own layer in 16 facings, drawn over the base and turned toward the target the game aims at, easing round at one turn a second. This is new engine work: structures had no turning layer before.',
      'Head redesigned after the reference art: a six-barrel rotary cannon instead of the single barrel, ammo belts, vented armour blocks, amber lamps and blue capsule lights, fitted inside the 1 × 1 tile so every one of the 16 facings clears the frame.',
      'The reference\'s cream armour is drawn in the palette\'s pale plate with amber scuffs; the palette has no cream, and adding a colour would change it for every asset.',
      'The reference\'s long flame fan is cut down to a short burst at the muzzles, so the flash stays inside the tile; while it is engaging a target (damaged or not) the barrels spin and the ammo belts feed forward into the gun (4 looping frames at 16 fps), with the muzzle flash and recoil shown for a moment after each round.',
      'Firing replaces the working state: the head spins its barrels and feeds its belts the whole time it has a target, not only for the shot.',
      'Damaged rusts the armour, bends the barrel cluster, drops a few rounds from a belt and turns the rear lamp into a blinking red fault lamp; the damaged head still tracks and fires, spinning its bent barrels and feeding its gappy belt.',
      'Revised: the pad shrank from 39 to 32 world px, leaving grass round it inside the tile; the slewing ring grew from 22 to 27 world px across with a gold bolt rim; the head is wider and now overhangs the ring.'
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
