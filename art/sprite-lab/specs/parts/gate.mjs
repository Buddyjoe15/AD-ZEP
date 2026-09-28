// Gates, 2, 3 or 4 tiles long, horizontal or vertical (the horizontal model turned 90°):
// a steel post at each end and two sliding leaves that meet in the middle. The posts sit at
// the gate's ends, where walls join it. Open, the leaves run back into the posts and the
// rail track shows; the post lamps turn from red to green.
import { Model, box, ball, drum, hot, marker, scorch, along, MAT, patterned, grime, near, structureFrame } from './fort.mjs';

const POST = 14, POST_H = 16, LEAF_W = 8, LEAF_H = 10;

function gateModel(n, state){
  const m = new Model(), L = n * 48, E = L / 2 - 1 - POST / 2;   // post centres
  const damaged = state === 'damaged', open = state === 'open';
  const rail = () => {
    box(m, [0, 0.3, 0], [L - 4, 0.6, 12], patterned(MAT.dark, p => near(((p[0] % 6) + 6) % 6, 0, 0.3) ? 1 : 0));
    for (const s of [-1, 1]) box(m, [0, 0.8, s * 3.2], [L - 6, 0.5, 0.8], MAT.chrome);
  };
  const post = (sx, lampOn = true) => {
    const x = sx * E, face = patterned(MAT.plate, p => {
      if (damaged && grime([p[0] + 3, p[1], p[2]], 0.55, 1.4)) return MAT.rust;
      if (p[1] < 5 && (Math.floor((p[0] + p[2] + p[1] + 60) / 1.6) & 1)) return MAT.dark;   // hazard band round the foot
      if (p[1] < 5) return MAT.amber;
      return near(p[1], [8.5, 12], 0.3) ? -1 : grime(p, 0.8);
    });
    box(m, [x, POST_H / 2, 0], [POST, POST_H, POST], face);
    box(m, [x, POST_H + 0.5, 0], [POST - 3, 1, POST - 3], MAT.steel);
    box(m, [x, POST_H + 1.1, 0], [4.4, 0.4, 4.4], damaged ? MAT.rust : MAT.team);
    // Status lamp on the inner edge: green open, red shut, dark on a damaged post's broken side.
    const lamp = !lampOn ? MAT.dark : open ? hot(MAT.lampGreen, x - sx * 3.4, 0, 0.4) : hot(MAT.lampRed, x - sx * 3.4, 0, 0.4);
    box(m, [x - sx * 3.4, POST_H + 1.2, 0], [1.6, 0.5, 3], lamp);
  };
  // One leaf running from the post on side sx toward the middle, `len` long.
  const leaf = (sx, len, bent) => {
    const x0 = sx * (E - POST / 2), cx = x0 - sx * len / 2;
    const face = patterned(MAT.steel, p => {
      if (damaged && grime([p[0] - 7, p[1] * 2, p[2] + 3], 0.5, 1.5)) return MAT.rust;
      if (near(((p[0] % 12) + 12) % 12, 0, 0.35)) return -2;                          // panel seams every 12
      if (p[1] > LEAF_H + 0.6 && near(((p[0] % 6) + 6) % 6, 3, 0.4)) return 1;           // ribs across the top
      return grime(p, 0.8);
    });
    box(m, [cx, LEAF_H / 2 + 1, 0], [len, LEAF_H, LEAF_W], face, bent ? 0.06 * sx : 0);
    box(m, [cx, LEAF_H + 1.3, 0], [len, 0.6, 1.2], MAT.dark, bent ? 0.06 * sx : 0);
    box(m, [cx, LEAF_H + 1.7, 0], [len, 0.4, 1], MAT.team, bent ? 0.06 * sx : 0);    // team stripe along the top
    // Hazard chevrons on the leading edge, where the leaves meet.
    const lead = x0 - sx * len;
    box(m, [lead + sx * 3, LEAF_H / 2 + 1.2, 0], [6, LEAF_H + 0.6, LEAF_W + 0.4], patterned(MAT.amber, p => (Math.floor((p[0] * sx + p[2] + 80) / 1.6) & 1) ? MAT.dark : 0));
    for (const r of [len * 0.25, len * 0.75]) ball(m, [x0 - sx * r, 1.2, 0], [1.4, 1, 1.4], MAT.dark, 8);   // rollers on the track
  };

  if (state === 'rubble'){
    const r = scorch(m, L - 6, 22, 90 + n);
    for (let i = 0; i < 6 + n * 3; i++) box(m, [(r() - 0.5) * (L - 10), 1.3 + r(), (r() - 0.5) * 16], [3 + r() * 8, 0.8 + r() * 1.5, 2 + r() * 4], [MAT.steel, MAT.rust, MAT.plate, MAT.dark, MAT.amber][i % 5], r() * 3, (r() - 0.5) * 0.6);
    box(m, [-E + 2, 2.4, 3], [4, 1.6, 4], MAT.team, 0.4);
    return m;
  }
  if (state === 'foundation'){
    rail();
    for (const sx of [-1, 1]){ box(m, [sx * E, 0.6, 0], [POST, 1.2, POST], MAT.dark); marker(m, 1.4); }
    for (const sx of [-1, 1]) box(m, [sx * E, 1.6, 0], [7, 0.8, 7], MAT.team);
    return m;
  }
  rail();
  if (state === 'frame'){
    for (const sx of [-1, 1]){
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(m, [sx * E + dx * 4.5, POST_H / 2, dz * 4.5], [2, POST_H, 2], MAT.steel);
      box(m, [sx * E, POST_H, 0], [POST, 1, POST], MAT.steel);
      box(m, [sx * E, 1.6, 0], [7, 0.8, 7], MAT.team);
    }
    return m;
  }
  for (const sx of [-1, 1]) post(sx, !(damaged && sx > 0));
  const span = E - POST / 2;                                                            // from a post to the middle
  if (state === 'near-complete'){ leaf(-1, span, false); return m; }                  // one leaf still to hang
  if (open) for (const sx of [-1, 1]) leaf(sx, Math.min(6, span * 0.25), false);       // run back into the posts
  else for (const sx of [-1, 1]) leaf(sx, span - 0.3, damaged && sx < 0);
  return m;
}

// The spec for an n-tile gate; vertical turns the horizontal model 90°.
export function gateSpec(n, vertical){
  const key = (n === 2 ? 'gate' : 'gate_' + n) + (vertical ? '_v' : '');
  const name = `Gate (1×${n}${vertical ? ', vertical' : ''})`;
  return {
    key, name, gameKey: key,
    request: 'a new gate, in 1×2, 1×3 and 1×4 versions; walls join the gate.',
    kind: 'structure', faction: 'crew', team: true, elevation: 'structure',
    footprint: vertical ? [1, n] : [n, 1], frame: vertical ? structureFrame(1, n) : structureFrame(n, 1),
    heading: vertical ? Math.PI / 2 : 0,
    states: {
      foundation: { frames: 1 }, frame: { frames: 1 }, 'near-complete': { frames: 1 },
      finished: { frames: 1 }, open: { frames: 1 }, damaged: { frames: 1 }, rubble: { frames: 1 }
    },
    fit: {
      lore: 'A sliding gate for the crew\'s walls. It opens by itself for friendly units within two tiles and stays shut while hostiles are within six; enemies never pass. The longer gates let convoys of Spiders and crawlers through at once.',
      style: 'Matches the Metal Wall: pale steel posts with amber hazard bands and gold-bolted caps, grey steel leaves in 12 px panels with hazard chevrons where they meet, a rail track underneath. Team colour on the post caps and along the top of each leaf; red lamps when shut, green when open.',
      silhouette: 'A long bar between two square posts, in the line of the wall; open, a gap with a striped track across it.',
      changes: [
        `${n} tiles long, ${vertical ? 'vertical (the horizontal gate turned 90°, with the light kept top left)' : 'horizontal'}. The game has horizontal and vertical versions of each length; the build menu rotates between them.`,
        'Open is its own state: the leaves run back into the posts and the lamps turn green. The engine shows it while the gate is open.',
        'Walls on either end join the posts; a wall beside the gate\'s long side doesn\'t join it.',
        n === 2 ? 'Replaces the old Gate\'s art; its game key stays gate, so existing saves keep their gates.' : 'A new gate length (game key ' + key + ').'
      ]
    },
    build({ state }){ return gateModel(n, state); }
  };
}
