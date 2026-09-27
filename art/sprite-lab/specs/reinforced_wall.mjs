// Reinforced Metal Wall: a thick armoured wall (game key reinforced_wall), dark steel faced
// with bolted armour plates, crenellated along the top, with a heavy pillar at every tile.
import { wallSpec, armsOf, armBox, armAt, along48, box, ball, marker, scorch, hot, MAT, patterned, grime, near } from './parts/fort.mjs';

const W = 15, H = 12, PIL = 19, PIL_H = 15;
// Dark steel core; armour plates 12 px long bolted on each face; scorch and gouges when damaged.
const core = (damaged) => patterned(MAT.dark, p => damaged && grime([p[0] + 5, p[1] * 2, p[2]], 0.55, 1.6) ? MAT.rust : 0);
const armourPlate = (damaged, axis) => patterned(MAT.steel, p => {
  const t = along48(axis ? p[2] : p[0]);
  if (damaged && grime([p[0] - 13, p[1] * 2, p[2] + 4], 0.5, 1.5)) return MAT.rust;
  if (damaged && grime([p[0] + 2, p[1] * 3, p[2] - 6], 0.74, 1.1)) return MAT.dark;
  if (near(t % 12, 0, 0.45)) return -2;
  if (near(t % 12, [2.5, 9.5], 0.5) && near(p[1] % 5, 2.5, 0.6)) return 1;     // bolt heads
  return grime(p, 0.8, 1.4);
});

function piece(m, { mask, damaged }){
  const arms = mask ? armsOf(mask) : [[1, 0], [-1, 0]], reach = mask ? 32 : 14;
  for (const a of arms){
    const axis = a[0] === 0;
    armBox(m, a, 0, reach, W - 4, 0, H, core(damaged));
    for (const s of [-1, 1]) armBox(m, a, 0, reach, 2, 0, H - 1, armourPlate(damaged, axis), s * (W / 2 - 1));
    // Walkway along the top between two rows of merlons, one every 12 px on each side.
    armBox(m, a, 0, reach, W - 4, H, 0.6, patterned(MAT.steel, p => near(along48(axis ? p[2] : p[0]) % 4, 0, 0.3) ? -1 : 0));
    armBox(m, a, 0, reach, 1.4, H + 0.6, 0.5, MAT.team);                              // team stripe down the walkway
    for (let t = 12; t <= reach + 2; t += 12){
      if (damaged && t === 24) continue;                                                // a merlon shot away
      for (const s of [-1, 1]){ const [x, z] = armAt(a, t - 3, s * (W / 2 - 1.5)); box(m, [x, H + 1.6, z], axis ? [3, 3.2, 5] : [5, 3.2, 3], armourPlate(damaged, axis)); }
    }
    // Buttresses at the foot on both faces, every 24 px.
    for (const s of [-1, 1]){ const [x, z] = armAt(a, 18, s * (W / 2 + 1.4)); box(m, [x, 2.5, z], axis ? [3, 5, 5] : [5, 5, 3], MAT.steel); }
  }
  // Heavy pillar: steel with chrome-capped corners, an armoured cap and a team square, and a
  // status lamp (green, or red when damaged).
  box(m, [0, PIL_H / 2, 0], [PIL, PIL_H, PIL], patterned(MAT.steel, p => damaged && grime(p, 0.55, 1.5) ? MAT.rust : (near(p[1], [5, 10], 0.35) ? -2 : 0)));
  box(m, [0, PIL_H + 0.6, 0], [PIL - 4, 1.2, PIL - 4], MAT.dark);
  box(m, [0, PIL_H + 1.4, 0], [6, 0.5, 6], damaged ? MAT.rust : MAT.team);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(m, [x * (PIL / 2 - 1.6), PIL_H + 0.8, z * (PIL / 2 - 1.6)], [3.2, 1.6, 3.2], MAT.chrome);
  box(m, [0, PIL_H + 1.5, -PIL / 2 + 3.2], [2.2, 0.6, 1.4], damaged ? hot(MAT.lampRed, 0, -PIL / 2 + 3.2, 0.4) : hot(MAT.lampGreen, 0, -PIL / 2 + 3.2, 0.4));
}

export default wallSpec({
  key: 'reinforced_wall', name: 'Reinforced Metal Wall', gameKey: 'reinforced_wall',
  request: 'new walls (delete old walls): a Reinforced Metal Wall. When walls are built next to each other the texture combines into one continuous wall, and walls join the gate; walls don\'t connect diagonally.',
  piece,
  foundation(m){ box(m, [0, 0.5, 0], [34, 1, 20], patterned(MAT.dark, p => near(along48(p[0]) % 12, 0, 0.3) ? 1 : 0)); marker(m, 1.2); },
  framing(m){
    box(m, [0, 0.5, 0], [34, 1, 20], MAT.dark); marker(m, 1.2);
    for (const [x, z] of [[-6, -6], [6, -6], [6, 6], [-6, 6]]) box(m, [x, PIL_H / 2, z], [2, PIL_H, 2], MAT.steel);
    for (const s of [-1, 1]) box(m, [s * 12, H / 2, 0], [8, H, W - 4], patterned(MAT.dark, p => near(p[1] % 3, 0, 0.4) ? 2 : 0));
  },
  nearComplete(m){
    piece(m, { mask: 0, damaged: false });
    for (const s of [-1, 1]) box(m, [9, H / 2, s * (W / 2 - 1)], [8, H - 1, 2.2], MAT.dark);   // armour not yet hung on one side
  },
  rubble(m){
    const r = scorch(m, 38, 26, 83);
    for (let i = 0; i < 10; i++) box(m, [(r() - 0.5) * 32, 1.4 + r() * 1.5, (r() - 0.5) * 22], [3 + r() * 7, 1 + r() * 2, 3 + r() * 5], [MAT.steel, MAT.dark, MAT.rust, MAT.chrome][i % 4], r() * 3, (r() - 0.5) * 0.7);
    box(m, [5, 2.6, -5], [5, 1.6, 5], MAT.team, 0.5);
  },
  fit: {
    lore: 'The crew\'s heaviest wall: a steel core faced with armour plate from the Ore Processor\'s steel, with a walkway and merlons along the top. Built where the hostile machines press hardest.',
    style: 'Crew field engineering at its heaviest: dark steel core, bolted armour plates in 12 px panels, merlons along both edges of the top, buttresses at the foot and a big pillar with chrome-capped corners and a green status lamp. Team colour down the walkway and on each pillar cap.',
    silhouette: 'A thick, crenellated band with big square pillars: plainly heavier than the Metal Wall and the palisade.',
    changes: [
      'Replaces the old Reinforced Wall\'s art and renames it Reinforced Metal Wall; the game key stays reinforced_wall, so existing saves keep their walls.',
      'Joins walls of any kind and gate ends: 16 pieces by which sides touch.',
      'Damaged: rust and gouges in the armour, one merlon shot away, and the status lamp turns red.'
    ]
  }
});
