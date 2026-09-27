// Worked example: a Spider-sized crew unit built as a 3D model and rendered straight top-down
// at 96 × 96. Copy its structure for new specs. (The lab compares every unit with the real
// in-game Utility Spider, so this one skips that check.) Model space is world px: x east,
// y up, z south; the unit faces -z; the origin is the ground point under it.
import { Model, mul, translate, scale, along, MAT, RAMP, patterned, grime, near, piston, unitFrame } from '../../../tools/sprite-kit.mjs';

const LEGS = [   // right side (x > 0); the left mirrors x. [x, z] on the ground plan.
  { hip: [5, -8], knee: [10, -12.5], foot: [11, -14] },
  { hip: [7, -3], knee: [14, -4.5], foot: [17, -5] },
  { hip: [7, 3], knee: [14, 4.5], foot: [17, 5.5] },
  { hip: [5, 9], knee: [10, 13], foot: [10.5, 14] }
];
const STRIDE = 2, LIFT = 2.6, HIP_Y = 9, KNEE_Y = 15;

const ball = (m, c, r, mat, seg = 12) => m.ball(mul(translate(...c), scale(...(Array.isArray(r) ? r : [r, r, r]))), mat, seg);
function limb(m, p, q, r, mat){ m.tube(along(p, q), mat, r, r, 8, false); ball(m, p, r, mat, 8); ball(m, q, r, mat, 8); }

const visor = { ramp: [RAMP.glass[0], RAMP.glass[1]], spec: 1.2, shine: 34 };
const hull = patterned(MAT.steel, p => {
  if (Math.abs(p[0]) < 2.6 && p[1] > 13.5) return MAT.team;                  // team stripe along the back
  if (near(Math.abs(p[0]), 3, 0.3) && p[1] > 13.5) return -2;
  if (near(p[2], 0.8)) return -2;                                             // hatch seam
  if (p[1] > 15 && Math.abs(p[0]) < 5 && p[2] > -4 && p[2] < 0.4) return MAT.plate;
  if (p[2] > 10 && Math.abs(p[0]) < 3.6 && p[1] > 8 && Math.floor(p[1] * 2) % 2 === 0) return -2;   // rear vents
  return grime(p, 0.8);
});
const head = patterned(MAT.steel, p => {
  if (p[2] < -10.5 && near(p[1], 11.2, 1.2)) return visor;                        // sensor band
  if (p[1] > 13.5) return near(p[0], 0, 0.3) ? -1 : MAT.plate;
  return 0;
});

export default {
  key: 'example_spider',
  name: 'Utility Spider (lab model)',
  gameKey: 'utility_spider',
  request: 'Worked example: the crew\'s mining, hauling and building unit, built as a model.',
  kind: 'unit',
  faction: 'crew',
  team: true,
  elevation: 'ground',
  frame: unitFrame('standard'),
  animations: { idle: { frames: 2, fps: 2 }, walk: { frames: 4, fps: 8 }, work: { frames: 4, fps: 6 } },
  fit: {
    lore: 'Fabricated aboard the UES Aster Vale from metal; mines, carries 250 cargo and builds with a cutting laser. Crew tech: steel hull, plate armour, team stripe.',
    style: 'Steel and plate with gold knee joints, cyan sensor eyes, dark legs. Team colour runs along the back where the camera sees it.',
    silhouette: 'A round body on eight arched legs: an X of legs in every facing.',
    changes: ['A 48 world px frame (96 × 96 art px) instead of the in-game Spider\'s 49 (98 × 98).']
  },
  build({ anim, frame, frames }){
    const m = new Model(), t = frame / frames * Math.PI * 2;
    const bob = anim === 'idle' ? (frame % 2) * 0.4 : anim === 'walk' ? Math.abs(Math.sin(t)) * 0.5 : 0;
    LEGS.forEach((L, i) => [-1, 1].forEach(side => {
      const group = (i + (side > 0 ? 0 : 1)) % 2, sw = anim === 'walk' ? Math.sin(t + group * Math.PI) : 0, lift = sw > 0 ? LIFT * sw : 0;
      const hip = [L.hip[0] * side, HIP_Y + bob, L.hip[1]], knee = [L.knee[0] * side, KNEE_Y + bob + lift * 0.5, L.knee[1] - 1.2 * sw];
      const foot = [L.foot[0] * side, lift + 0.9, L.foot[1] - STRIDE * sw];
      ball(m, hip, 2.1, MAT.steel);
      limb(m, hip, knee, 1.7, MAT.steel);
      piston(m, [hip[0], hip[1] + 1.4, hip[2]], [hip[0] + (knee[0] - hip[0]) * 0.7, hip[1] + (knee[1] - hip[1]) * 0.7 + 1.3, hip[2] + (knee[2] - hip[2]) * 0.7], 0.5);
      ball(m, knee, 2, MAT.gold);
      limb(m, knee, foot, 1.2, MAT.dark);
      limb(m, foot, [foot[0] + side * 1, foot[1] - 0.6, foot[2] - 0.6], 0.5, MAT.steel);
    }));
    ball(m, [0, 11 + bob, 4], [9.5, 7, 11], hull, 20);                    // cargo hull
    ball(m, [0, 11.2 + bob, -7.5], [7.5, 5.5, 6.5], head, 18);                     // head
    for (const s of [-1, 1]){
      ball(m, [2.7 * s, 11.8 + bob, -13.2], 1.6, MAT.glow, 10);                // eyes
      limb(m, [1.9 * s, 8.5 + bob, -12.5], [1.2 * s, 6 + bob, -14.8], 0.5, MAT.dark);   // mandibles
    }
    // Cutting laser under the head; it glows while working.
    limb(m, [0, 7.5 + bob, -9], [0, 6 + bob, -14], 0.8, MAT.dark);
    if (anim === 'work') ball(m, [0, 6 + bob, -14.8], frame % 2 ? 1.6 : 1.1, MAT.glow, 10);
    m.tube(along([2, 16.5 + bob, 6], [2, 21.5 + bob, 6]), MAT.steel, 0.45, 0.45, 6);   // antenna
    ball(m, [2, 22 + bob, 6], 0.8, MAT.lampRed, 8);
    return m;
  }
};
