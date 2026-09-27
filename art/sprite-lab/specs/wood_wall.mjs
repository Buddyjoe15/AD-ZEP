// Wood Wall: a palisade of sharpened logs with stakes angled out on both sides, the cheapest
// wall. Tiles join their neighbours into one continuous palisade.
import { wallSpec, armsOf, armAt, box, ball, drum, marker, scorch, along, MAT, patterned, grime, near } from './parts/fort.mjs';

const LOG_H = 13, STEP = 6;                // log height; one log every 6 px along the wall
// Bark down the sides, pale cut wood on the sharpened tips; charred when damaged.
const bark = (burnt) => patterned(MAT.log, p => burnt && grime([p[0], p[1] * 2, p[2]], 0.45, 1.4) ? MAT.dark : (near(((p[1] % 4) + 4) % 4, 0, 0.4) ? -1 : 0));
const tipWood = (burnt) => patterned(MAT.wood, p => burnt && grime([p[0] + 7, p[1], p[2]], 0.5, 1.2) ? MAT.dark : 1);

// One upright log at (x, z) with a cone tip. Logs alternate a little in size and height by
// their place along the wall (k), the same in every tile. A broken log is snapped off short.
function log(m, x, z, k, burnt, broken){
  const r = k & 1 ? 2.5 : 2.8, h = (k & 1 ? LOG_H - 1 : LOG_H) - (broken ? 6 : 0);
  drum(m, [x, 0, z], r, h, bark(burnt), 12);
  if (broken){ box(m, [x, h + 0.3, z], [r * 1.6, 0.6, r * 1.6], MAT.wood, k); return; }
  m.tube(along([x, h, z], [x, h + 3.2, z]), tipWood(burnt), r, 0.35, 12);
}
// A sharpened stake angled out from the base of the wall, pointing away on side s.
function stake(m, [x, z], [nx, nz], s, burnt){
  m.tube(along([x + nx * s * 2.4, 1, z + nz * s * 2.4], [x + nx * s * 8.5, 6.5, z + nz * s * 8.5]), bark(burnt), 0.95, 0.2, 8);
}

function piece(m, { mask, damaged }){
  const arms = mask ? armsOf(mask) : [[1, 0], [-1, 0]], reach = mask ? 32 : 13;
  for (const a of arms){
    // Logs along the arm, one every 6 px out from the centre post.
    for (let t = STEP; t <= reach; t += STEP){
      const k = t / STEP, [x, z] = armAt(a, t);
      log(m, x, z, k, damaged && k % 3 === 1, damaged && t === 18);
    }
    // Stakes out both sides, every 12 px, clear of the centre joint.
    for (let t = 9; t <= reach + 3; t += 12) for (const s of [-1, 1]) stake(m, armAt(a, t), [-a[1], a[0]], s, damaged && t === 21);
    // An iron band binding the logs low down on each face.
    for (const s of [-1, 1]){ const [x, z] = armAt(a, reach / 2, s * 2.9); box(m, [x, 4, z], a[0] ? [reach, 1, 0.5] : [0.5, 1, reach], MAT.dark); }
  }
  // The centre post: taller, with a team-painted collar under its tip, seen from above.
  drum(m, [0, 0, 0], 3.4, LOG_H + 2, bark(false), 14);
  ball(m, [0, LOG_H + 2.1, 0], [4.2, 0.6, 4.2], damaged ? MAT.rust : MAT.team, 14);
  m.tube(along([0, LOG_H + 2, 0], [0, LOG_H + 5.5, 0]), tipWood(false), 3.4, 0.4, 14);
}

export default wallSpec({
  key: 'wood_wall', name: 'Wood Wall', gameKey: 'wood_wall',
  request: 'new walls (delete old walls): a wood wall that looks like a logged, spiked wall. When walls are built next to each other the texture combines into one continuous wall, and walls join the gate; walls don\'t connect diagonally.',
  piece,
  foundation(m){
    box(m, [0, 0.3, 0], [30, 0.6, 8], patterned(MAT.dark, p => grime(p, 0.6, 1.2) ? 1 : 0));   // a dug trench
    marker(m, 0.8);
    for (const x of [-11, 11]) box(m, [x, 1.2, 0], [6, 1.6, 5], MAT.log, x * 0.1);        // logs laid ready
  },
  framing(m){
    box(m, [0, 0.3, 0], [30, 0.6, 8], MAT.dark); marker(m, 0.8);
    for (const x of [-12, 0, 12]) drum(m, [x, 0, 0], 2.6, LOG_H - 3, bark(false), 12);    // the first posts set
    box(m, [0, 7, 0], [28, 1.2, 1], MAT.wood);
  },
  nearComplete(m){
    const [x0] = [0];
    for (let t = -12; t <= 12; t += 6) if (t !== 6) log(m, t, 0, Math.abs(t / 6), false, false);
    drum(m, [x0, 0, 0], 3.4, LOG_H + 2, bark(false), 14);
    ball(m, [0, LOG_H + 2.1, 0], [4.2, 0.6, 4.2], MAT.team, 14);
  },
  rubble(m){
    const r = scorch(m, 32, 20, 71);
    for (let i = 0; i < 8; i++){
      const x = (r() - 0.5) * 28, z = (r() - 0.5) * 16, a = r() * Math.PI, l = 6 + r() * 8;
      m.tube(along([x - Math.cos(a) * l / 2, 1.8, z - Math.sin(a) * l / 2], [x + Math.cos(a) * l / 2, 1.8, z + Math.sin(a) * l / 2]), i % 3 ? bark(true) : bark(false), 1.6 + r() * 0.8, 1.4, 8);
    }
    ball(m, [3, 1.2, -3], [3.5, 0.5, 3.5], MAT.team, 10);
  },
  fit: {
    lore: 'A palisade the crew raise fast and cheap from felled timber, the way the abandoned logging camps of Woods World were fenced. Sharpened stakes angled out from its foot slow anything that tries to climb it. Weakest of the three walls.',
    style: 'Local timber worked by the crew: upright logs with bark sides and pale sharpened tips, bound low with iron bands, stakes angled out on both faces. The taller centre post of each tile carries a team-painted collar, so a palisade still shows whose it is.',
    silhouette: 'A beaded line of round log tops with spikes bristling out on both sides: rougher and wider than the metal walls, and nothing like a unit.',
    changes: [
      'A new wall (game key wood_wall). The game has no wood resource yet, so it costs a little metal for its bands and spikes; it is the cheapest and weakest wall.',
      'Team colour on the painted collar of each centre post; the rules want crew structures to show their team.',
      'Joins walls of any kind and gate ends, like the metal walls: 16 pieces by which sides touch.'
    ]
  }
});
