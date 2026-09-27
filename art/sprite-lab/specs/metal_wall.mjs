// Metal Wall: the crew's standard wall (game key defensive_wall), a run of bolted steel plate
// on a square pillar at every tile, joining its neighbours into one continuous wall.
import { wallSpec, armsOf, armBox, armAt, along48, box, ball, marker, scorch, MAT, patterned, grime, near } from './parts/fort.mjs';

const W = 10, H = 11, PIL = 13, PIL_H = 13.5;   // wall thickness and height; pillar size and height
// Plate: panels 12 px long with seams, rivets along the top edges, grime; dents and rust when damaged.
const plate = (damaged, axis) => patterned(MAT.steel, p => {
  const t = along48(axis ? p[2] : p[0]), s = axis ? p[0] : p[2];
  if (damaged && grime([p[0] + 17, p[1] * 2, p[2]], 0.5, 1.6)) return MAT.rust;
  if (damaged && grime([p[0] - 4, p[1] * 2, p[2] + 9], 0.72, 1.2)) return MAT.dark;          // holes punched through
  if (near(t % 12, 0, 0.35)) return -2;                                                         // panel seams
  if (p[1] > H - 0.3 && near(Math.abs(s), W / 2 - 1, 0.4) && near(t % 6, 3, 0.45)) return 1;    // rivets
  return grime(p, 0.76, 1.5);
});
const TEAM_Y = H + 0.8;

function piece(m, { mask, damaged }){
  const arms = mask ? armsOf(mask) : [[1, 0], [-1, 0]], reach = mask ? 32 : 13;
  for (const a of arms){
    const axis = a[0] === 0;                       // north-south arm
    armBox(m, a, 0, reach, W, 0, H, plate(damaged, axis));
    // Top rail with the team stripe down its middle, and a hazard-striped kick plate at the base.
    armBox(m, a, 0, reach, W - 3, H, 1, MAT.dark);
    armBox(m, a, 0, reach, 1.6, H + 0.4, 0.8, MAT.team);
    for (const s of [-1, 1]) armBox(m, a, 0, reach, 1.2, 0, 2.4, patterned(MAT.amber, p => (Math.floor(along48(axis ? p[2] : p[0]) / 3) & 1) ? MAT.dark : 0), s * (W / 2 + 0.4));
    if (damaged){
      // A buckled plate leaning out of the line, part way along.
      const [x, z] = armAt(a, 15, W / 2 + 0.8);
      box(m, [x, H / 2 - 1, z], axis ? [1.2, H - 3, 6] : [6, H - 3, 1.2], MAT.rust, 0, axis ? 0 : 0.25);
    }
  }
  // Pillar at the tile centre: a steel post with a capped top, bolts and a team square.
  const pil = patterned(MAT.plate, p => damaged && grime([p[0] + 3, p[1], p[2]], 0.55, 1.4) ? MAT.rust : (near(p[1], [4, 8.5], 0.3) ? -1 : grime(p, 0.8)));
  box(m, [0, PIL_H / 2, 0], [PIL, PIL_H, PIL], pil);
  box(m, [0, PIL_H + 0.5, 0], [PIL - 3, 1, PIL - 3], MAT.steel);
  box(m, [0, PIL_H + 1.1, 0], [4.4, 0.4, 4.4], damaged ? MAT.rust : MAT.team);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ball(m, [x * (PIL / 2 - 2), PIL_H + 1.1, z * (PIL / 2 - 2)], [0.8, 0.4, 0.8], MAT.gold, 6);
}

export default wallSpec({
  key: 'metal_wall', name: 'Metal Wall', gameKey: 'defensive_wall',
  request: 'new walls (delete old walls): a Metal Wall. When walls are built next to each other the texture combines into one continuous wall, and walls join the gate; walls don\'t connect diagonally.',
  piece,
  foundation(m){ box(m, [0, 0.4, 0], [30, 0.8, 14], patterned(MAT.dark, p => near(along48(p[0]) % 12, 0, 0.3) ? 1 : 0)); marker(m, 1); },
  framing(m){
    box(m, [0, 0.4, 0], [30, 0.8, 14], MAT.dark); marker(m, 1);
    box(m, [0, PIL_H / 2, 0], [3, PIL_H, 3], MAT.steel);
    for (const s of [-1, 1]){ box(m, [s * 12, H / 2, 0], [2, H, 2], MAT.steel); box(m, [s * 6, H - 1, 0], [12, 1.2, 1.6], MAT.steel); }
  },
  nearComplete(m){
    piece(m, { mask: 0, damaged: false });
    box(m, [8, H / 2, 0], [8, H + 0.2, W + 0.2], MAT.dark);                      // one panel still open
    box(m, [8, H / 2, 0], [1.2, H, 1.2], MAT.steel);
  },
  rubble(m){
    const r = scorch(m, 34, 22, 61);
    for (let i = 0; i < 9; i++) box(m, [(r() - 0.5) * 30, 1.2 + r(), (r() - 0.5) * 18], [3 + r() * 6, 0.8 + r(), 2 + r() * 4], [MAT.steel, MAT.rust, MAT.plate, MAT.dark][i % 4], r() * 3, (r() - 0.5) * 0.6);
    box(m, [-4, 2.2, 2], [4, 1.4, 4], MAT.team, 0.4);
  },
  fit: {
    lore: 'The crew\'s standard defensive wall, bolted together on site from fabricated steel plate. Spiders lay it tile by tile, and each new section joins the ones beside it into a single wall.',
    style: 'Crew field engineering: grey steel plate in 12 px panels with seams and rivets, a dark top rail, amber hazard kick plates along the base and a pale square pillar with gold bolts at every tile. Team colour runs as one unbroken stripe along the top of the wall and caps each pillar.',
    silhouette: 'Thin straight runs of wall joined by square pillars, like a fence line: nothing else on the map is a continuous line.',
    changes: [
      'Replaces the old Defensive Wall\'s art and name; the game key stays defensive_wall, so existing saves keep their walls.',
      'Each tile draws one of 16 pieces by which of its four sides touch a wall or a gate\'s end, so runs, corners, T and cross joins read as one wall. A lone tile is a short east-west section.',
      'Pieces are rendered past the tile edge and cropped, and patterns repeat every 6 or 12 px, so neighbouring tiles meet without a seam.'
    ]
  }
});
