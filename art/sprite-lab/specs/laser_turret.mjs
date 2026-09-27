// Laser Turret: a 1 × 1 crew defence structure, a heavy laser rifle on a diamond pad, in the
// Sentry Turret's style. The rifle charges for 2.5 s before each shot, lighting the coils down
// its middle one by one from the breech to the muzzle.
// Model space is world px: x east, y up, z south; the origin is the ground point under the
// centre of the footprint, and the rifle points north (-z).
import { Model, mul, translate, scale, rotX, rotY, along, MAT, patterned, grime, near, structureFrame } from '../../../tools/sprite-kit.mjs';
import { rng } from '../../../tools/pixelart.mjs';

const box = (m, c, s, mat, ry = 0, rx = 0) => m.box(mul(translate(...c), rotY(ry), rotX(rx), scale(...s)), mat);
const ball = (m, c, r, mat, seg = 10) => m.ball(mul(translate(...c), scale(...(Array.isArray(r) ? r : [r, r, r]))), mat, seg);
// A vertical drum: radius r, from y0 up h.
const drum = (m, [x, y0, z], r, h, mat, seg = 20) => m.tube(mul(translate(x, y0, z), scale(1, h, 1)), mat, r, r, seg);

const SIDE = 31, HALF = SIDE / 2, PAD_H = 2, RING_R = 12.5, RING_H = 2.8, HEAD_Y = PAD_H + RING_H;
const COILS = 6, COIL_Z = [-5, -7.8, -10.6, -13.4, -16.2, -19];       // breech to muzzle
const CHARGE = 2.5;                                                 // seconds to charge a shot
// Diamond coordinates: u and v run along the diamond's edges (the pad is a square turned 45°).
const uv = p => [(p[0] + p[2]) / Math.SQRT2, (p[0] - p[2]) / Math.SQRT2];
const hazard = patterned(MAT.amber, p => { const [u, v] = uv(p); return (Math.floor((u - v + 80) / 1.6) & 1) ? MAT.dark : 0; });
// The pad: bolted steel plates with seams, hazard bands along all four edges of the diamond.
const pad = (worn) => patterned(MAT.steel, p => {
  const [u, v] = uv(p);
  if (p[1] > PAD_H - 0.2 && Math.max(Math.abs(u), Math.abs(v)) > HALF - 2) return hazard;
  if (near(u, [-5.5, 5.5], 0.25) || near(v, [-5.5, 5.5], 0.25)) return -2;     // plate seams
  return grime(p, worn ? 0.55 : 0.74, 1.8) || (worn && grime([p[0] + 30, p[1], p[2]], 0.7, 1.3) ? MAT.rust : 0);
});

// The diamond slab and an anchor at each point: every state starts from this.
function base(m, worn){
  box(m, [0, PAD_H / 2, 0], [SIDE, PAD_H, SIDE], pad(worn), Math.PI / 4);
  for (const [x, z] of [[0, -1], [1, 0], [0, 1], [-1, 0]]){
    const d = HALF * Math.SQRT2 - 5;
    box(m, [x * d, PAD_H + 0.5, z * d], [4.2, 1, 4.2], MAT.team, Math.PI / 4);   // team-coloured anchor plates, from the foundation on
    ball(m, [x * d, PAD_H + 1.2, z * d], [1, 0.6, 1], MAT.gold, 8);
  }
}

// The slewing ring the head turns on, as on the Sentry Turret.
function ring(m){
  const r = patterned(MAT.dark, p => {
    if (p[1] > PAD_H + RING_H - 0.4 && near(Math.hypot(p[0], p[2]), RING_R - 1, 0.45) && (Math.floor((Math.atan2(p[0], p[2]) + 7) * 16 / Math.PI) & 1)) return MAT.gold;
    return (Math.floor((Math.atan2(p[0], p[2]) + 7) * 12 / Math.PI) & 1) && p[1] > PAD_H + RING_H - 0.4 ? 1 : 0;
  });
  drum(m, [0, PAD_H, 0], RING_R, RING_H, r, 32);
}

// Lamps: amber, cyan or red with a hot white core; dim(mat) is the lamp at half strength.
const hot = (mat, cx, cz, w) => patterned(mat, p => Math.abs(p[0] - cx) < w && Math.abs(p[2] - cz) < w ? 0 : -1);
const dim = mat => patterned(mat, () => -2);
// Pale armour scuffed with amber wear, rust when damaged: the Sentry Turret's plating.
const armour = (damaged) => patterned(MAT.plate, p => {
  if (damaged && grime([p[0] + 9, p[1], p[2]], 0.5, 1.5)) return MAT.rust;
  if (grime([(p[0] + p[2]) * 0.6, p[1] * 3, (p[0] - p[2]) * 1.8], 0.72, 1.1)) return MAT.amber;
  if (grime([p[0] + 3, p[1], p[2] + 5], 0.8, 0.9)) return -1;
  return 0;
});

// The rifle head. lit: how many coils glow, from the breech (0 to COILS); hot: every coil at
// full brightness with the beam flare at the emitter (the shot); fading: coils dimmed after
// the shot. damaged: rusted, the barrel knocked off line, the fourth coil dead, and a red
// fault lamp (lampOn). plated: false is the near-complete head; barrel: false leaves the rifle off.
function head(m, { lit = 0, hot: shot = false, fading = false, damaged = false, plated = true, barrel = true, lampOn = true, recoil = 0 } = {}){
  const y = HEAD_Y, by = y + 5, plate = plated ? armour(damaged) : MAT.steel;
  const pp = p => plate.pattern ? plate.pattern(p) : 0;
  // Chassis and the armoured receiver the rifle sits in.
  box(m, [0, y + 1.5, 4], [18, 3, 17], patterned(MAT.dark, p => near(p[2], [-1, 5, 10], 0.3) ? -1 : 0));
  const rear = patterned(plate, p => {
    if (p[1] > y + 8 && near(p[2], 9.6, 0.55)) return MAT.team;                     // team stripe across the roof
    if (p[1] > y + 8 && Math.abs(p[0]) < 2.4 && p[2] > 3.5 && p[2] < 7.8) return MAT.dark;   // sight housing slot
    return pp(p);
  });
  box(m, [0, y + 4.2, 6.2], [10, 8.4, 9.5], rear);
  for (const s of [-1, 1]) box(m, [s * 3.6, y + 4, 11.3], [2.8, 7.6, 1], plate);   // chamfered back corners
  box(m, [0, y + 7, 11.7], [4.6, 1.2, 0.8], damaged ? (lampOn ? hot(MAT.lampRed, 0, 11.7, 0.8) : MAT.red) : hot(MAT.lampAmber, 0, 11.7, 0.8));
  if (!plated){
    for (const s of [-1, 1]) m.tube(along([s * 3, y + 3, 8], [s * 9, y + 3.4, -2]), MAT.amber, 0.5, 0.5, 6);
    return;
  }
  // Capacitor banks either side in place of the Sentry's ammo belts: four cells each, whose
  // cyan windows fill with the charge, joined to the receiver by cables; heat-sink fins outside.
  for (const s of [-1, 1]){
    box(m, [s * 9.2, y + 3.2, 3.5], [5, 6.4, 13], patterned(MAT.steel, p => near(p[2], [-1.4, 2.2, 5.8], 0.3) ? -2 : 0));
    for (let i = 0; i < 4; i++){
      const z = -1.6 + i * 3.6, on = damaged && s > 0 && i === 1 ? false : shot || fading || lit >= (4 - i) * COILS / 4;
      box(m, [s * 9.2, y + 6.5, z], [2.6, 0.5, 2.4], on ? (fading ? dim(MAT.glow) : hot(MAT.glow, s * 9.2, z, 0.4)) : MAT.dark);
    }
    m.tube(along([s * 6.6, y + 5.4, -1.5], [s * 3.4, by - 0.4, -2.5]), MAT.dark, 0.6, 0.6, 6);
    const fins = patterned(plate, p => p[1] > y + 5.6 && near((p[2] + 40) % 1.4, 0.7, 0.3) ? MAT.dark : pp(p));
    box(m, [s * 13.6, y + 3.1, 4], [2.6, 6.2, 12], fins);
    box(m, [s * 12.2, y + 3, -5.5], [5.2, 6, 5], plate);                           // front armour cheeks
    box(m, [s * 12.2, y + 6.1, -5.5], [2.6, 0.3, 1.4], hot(MAT.lampAmber, s * 12.2, -5.5, 0.35));
  }
  if (!barrel) return;
  // The rifle: a long squared barrel housing with a rail either side and the coils wound
  // round it down the middle, ending in a crystal emitter. Knocked off line when damaged.
  const bend = damaged ? 0.07 : 0, tip = -20.6 + recoil;
  const at = z => [Math.sin(bend) * (z - 0) * -1, 0, z];                            // barrel axis, turned by bend
  const rifle = (c, s, mat) => box(m, [c[0] + at(c[2])[0], c[1], c[2]], s, mat, bend);
  rifle([0, by, (tip + 1 + recoil) / 2], [4.6, 3.4, -tip - 1], patterned(MAT.steel, p => near(p[1], by + 1.7, 0.2) ? 1 : 0));
  for (const s of [-1, 1]) rifle([s * 2.9, by - 0.4, (tip + 2 + recoil) / 2], [1.2, 2.4, -tip - 2], MAT.dark);   // rails, below the coils
  COIL_Z.forEach((z0, i) => {
    const z = z0 + recoil, dead = damaged && i === 3, on = !dead && (shot || fading || i < lit);
    const mat = on ? (fading ? dim(MAT.glow) : shot ? MAT.glow : hot(MAT.glow, at(z)[0], z, 0.5)) : dead ? MAT.rust : MAT.gold;
    m.tube(mul(translate(at(z)[0], by, z), rotY(bend), rotX(Math.PI / 2), translate(0, -0.9, 0), scale(1, 1.8, 1)), mat, 3.7, 3.7, 16);
    rifle([0, by + 3.8, z], [1.4, 0.4, 2], on ? dim(MAT.glow) : MAT.dark);          // the coil's top clamp
  });
  rifle([0, by, tip - 0.4], [3, 2.6, 1.2], MAT.dark);                             // emitter collar
  rifle([0, by + 0.3, tip - 1.1], [1.6, 1.6, 0.8], shot ? MAT.glow : fading ? dim(MAT.glow) : MAT.glass);   // the crystal emitter
  if (shot){
    // Beam flare: a short cyan-white burst at the emitter, kept inside the tile.
    const e = at(tip)[0];
    ball(m, [e, by + 0.3, tip - 1.6], [2.6, 1.2, 0.9], hot(MAT.glow, e, tip - 1.6, 0.8), 10);
    for (const s of [-1, 1]) ball(m, [e + s * 2.2, by, tip - 1.3], [0.9, 0.5, 0.5], dim(MAT.glow), 6);
  }
}

export default {
  key: 'laser_turret',
  name: 'Laser Turret',
  request: 'a laser rifle turret. It uses the same aesthetic as the Turret. The base is turned to the shape of a diamond. The laser rifle is large and has coils going up the middle that light up as it fires. The laser rifle takes 2-3 seconds to charge before firing, the coils lighting up in sequence as it charges.',
  kind: 'structure',
  faction: 'crew',
  team: true,
  elevation: 'structure',
  footprint: [1, 1],
  frame: structureFrame(1, 1),
  // Base layer: the diamond pad and slewing ring. Built and damaged turrets draw the head on top.
  states: {
    foundation: { frames: 1 }, frame: { frames: 1 }, 'near-complete': { frames: 1 },
    finished: { frames: 1 }, damaged: { frames: 1 }, rubble: { frames: 1 }
  },
  // Head layer in 16 facings, like the Sentry Turret's. With a target it plays `charging`:
  // one more coil lights each frame, breech to muzzle, over chargeTime; then `flash`, the shot
  // (every coil white-hot, the beam flare) and the coils fading, before charging again.
  head: {
    facings: 16,
    states: {
      idle: { frames: 1 }, charging: { frames: COILS, fps: COILS / CHARGE }, flash: { frames: 2, fps: 8 },
      damaged: { frames: 2, fps: 3 }, 'damaged-charging': { frames: COILS, fps: COILS / CHARGE }, 'damaged-flash': { frames: 2, fps: 8 }
    },
    firing: { idle: ['charging', 'flash'], damaged: ['damaged-charging', 'damaged-flash'] },
    chargeTime: CHARGE,          // seconds from the start of charging to the shot; charging frames follow charge progress
    flashTime: 0.25,             // seconds the flash frames show after each shot
    on: { finished: 'idle', damaged: 'damaged' },
    turnRate: Math.PI,           // radians per second: a heavy rifle turns at half a turn a second
    build({ state, frame }){
      const m = new Model(), damaged = state.startsWith('damaged');
      if (state.endsWith('charging')) head(m, { lit: frame + 1, damaged, lampOn: frame % 2 === 0 });
      else if (state.endsWith('flash')) head(m, { hot: frame === 0, fading: frame === 1, recoil: frame === 0 ? 0.8 : 0.3, damaged });
      else head(m, { damaged, lampOn: frame === 0 });
      return m;
    }
  },
  fit: {
    lore: 'A crew defence the Spiders build and ARIA powers: a heavy laser rifle that trades the Sentry Turret\'s rapid fire for one charged, hard-hitting shot every few seconds, fed from capacitor banks on the ship\'s grid. Suited to picking off armoured hostile machines before they reach the wall.',
    style: 'The Sentry Turret\'s crew engineering: riveted steel pad with amber hazard bands and gold anchor bolts, pale armour plating scuffed with amber wear, a slewing ring with a gold bolt rim. The rifle is a long squared barrel between two rails with six copper coils wound round its middle and a crystal emitter; capacitor banks with cyan charge windows and heat-sink fins sit either side. Cyan is the laser\'s light, as for crew energy. Team colour: anchor plates and a stripe across the receiver roof.',
    silhouette: 'A diamond pad (a square turned 45°) with one long, banded barrel reaching to the tile\'s edge: a diamond with a spear, unlike the Sentry\'s square pad and rotary bundle, the Spider\'s X of legs, the drones\' rotors or Vance.',
    changes: [
      'Made a crew structure with team colour, 1 × 1 like the Sentry Turret; the rifle reaches almost the whole tile so it reads as large. A 2 × 2 version would allow a longer rifle.',
      'Charging takes 2.5 s: six coils light one after another from the breech to the muzzle, and the capacitor windows fill with them; then the shot (every coil white-hot, a cyan beam flare at the emitter) and the coils fading.',
      'The laser\'s light is cyan, the colour the rules give crew energy, with gold (copper) coils when unlit.',
      'Capacitor banks and heat-sink fins take the place of the Sentry\'s ammo belts; a laser has no ammunition.',
      'The head turns at half a turn a second, slower than the Sentry\'s, to feel heavy.',
      'Damaged: rusted armour, the barrel knocked off line, one coil burnt out (it never lights) and one capacitor window dead, with a blinking red fault lamp; it still charges and fires.',
      'Not in the game yet: there is no laser turret definition, and the engine would need to show the charging frames by the turret\'s charge progress (chargeTime) rather than a clock. The beam itself would be drawn by the game, like other shots.'
    ]
  },
  build({ state }){
    const m = new Model();
    if (state === 'rubble'){
      // Scorched diamond slab, the ring torn off, plates, coils and the barrel scattered.
      box(m, [0, 0.6, 0], [SIDE - 2, 1.2, SIDE - 3], patterned(MAT.dark, p => grime(p, 0.3, 2.5) ? -1 : (grime([p[0] + 5, 0, p[2]], 0.6, 2) ? MAT.rust : 0)), Math.PI / 4 + 0.05);
      const r = rng(47);
      for (let i = 0; i < 11; i++)
        box(m, [(r() - 0.5) * 24, 1.4 + r(), (r() - 0.5) * 24], [2 + r() * 4.5, 0.8 + r() * 1.5, 2 + r() * 4], [MAT.plate, MAT.rust, MAT.steel, MAT.dark][i % 4], r() * 3, (r() - 0.5) * 0.6);
      box(m, [-3, 2, 5], [3.4, 2.4, 16], MAT.steel, 0.9, 0.1);                        // the barrel housing
      for (const [x, z] of [[6, -6], [-8, -4], [9, 5]]) m.tube(mul(translate(x, 2.2, z), rotX(Math.PI / 2 - 0.3), translate(0, -0.7, 0), scale(1, 1.4, 1)), MAT.gold, 2.6, 2.6, 12);
      box(m, [-6, 2.4, 8], [3, 1.6, 3], MAT.team, 0.4);
      return m;
    }
    base(m, state === 'damaged');
    if (state === 'foundation') return m;
    ring(m);
    if (state === 'frame'){
      for (const a of [0, 1, 2, 3]){
        const ang = a * Math.PI / 2 + Math.PI / 4, x = Math.sin(ang) * 8.5, z = Math.cos(ang) * 8.5;
        m.tube(along([x, HEAD_Y, z + 2], [x * 0.5, HEAD_Y + 6.5, z * 0.5 + 2]), MAT.steel, 0.9, 0.9, 8);
      }
      box(m, [0, HEAD_Y + 7, 2], [10, 1, 10], MAT.steel);
      box(m, [0, HEAD_Y + 1, 2], [2.4, 1.4, 22], MAT.dark);                        // the rifle's cradle, already pointing out
      return m;
    }
    if (state === 'near-complete') head(m, { plated: false, barrel: false });
    return m;
  }
};
