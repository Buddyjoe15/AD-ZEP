# Utility Spider: three-quarter prototype

An experiment for a more detailed look, closer to painted concept art: the Utility Spider built as a 3D model in code and rendered to pixel art in a three-quarter view, at 2 art px per world px. The game doesn't use it. It deliberately breaks `art/PIXEL_ART_RULES.md`, which requires straight top-down art at 1 art px per world px. It's here to decide whether to change those rules.

Open [`preview.html`](preview.html) directly from disk. It compares today's Spider with the prototype on the game's Woodlands grass, at game zoom and walking in a ring, and shows the whole sheet.

```
npm run proto:spider           # spider-3q.js and spider-3q-sheet.png
npm run proto:spider:preview   # also previews/ (needs Playwright + Chromium)
```

## How it's made

- **Models.** `tools/render3d.mjs` builds them from boxes, tubes, balls and lathed profiles (a profile turned around an axis), in world px.
- **The Spider** (`tools/spider-3q.mjs`) is about 135 parts:
  - a plate head with team cheek plates, a glass visor and three eyes;
  - a lathed cargo hull in team colour with seams, a plate band, a hazard band, side vents, a top hatch, tail lights and an antenna;
  - a laser arm with a turret, a piston, an elbow hinge and an emitter;
  - eight legs, each with a hip actuator, an armoured upper leg with a piston, an amber knee hinge, a shin guard and a clawed foot. The knees are solved for each foot position.
  - The hull, head and arm ride 6 world px above the leg mount, and the rear legs angle out to the side. The upper legs pass under the body with about 1 world px to spare in every walk frame, instead of cutting through its sides.
- **Camera.** An oblique three-quarter view. The ground keeps its top-down shape, so map tiles stay square as they are in the game, and each px of height lifts a point 0.8 px up the screen.
- **Facings.** Each of the 8 facings is its own render, never a rotated copy, so the angle, lighting and shadow match on all of them.
- **Light and colour.** Each art px is shaded from 2 × 2 samples and takes their most common colour, which keeps edges clean and thin parts whole. For each sample:
  - one light from the top left, with smooth normals on curved parts, so domes and tubes shade as gradients rather than facets;
  - a glint where a material is shiny (plate, chrome, glass);
  - ambient occlusion: a sample with surfaces standing in front of it nearby darkens, which shades creases and the places where parts meet;
  - surface patterns computed from the model position: seams, hazard stripes and grime. Patterns are fixed to the body, so they don't crawl while it walks;
  - the result picks a step on the material's colour ramp.

  Then, where depth jumps between neighbouring pixels, the farther one steps darker, which draws the lines between parts, and a 1 px outline goes around the silhouette.
- **Shadow.** The model is projected onto the ground along the light, and stored as a mask for the engine to darken by 55%.
- **Palette.** Its own 32 colours: 6-step ramps for steel, plate, team and amber, plus dark parts and cyan lights. Team colour is a magenta ramp swapped per team. The game's palette is untouched.

## Compared with today's Spider

| | Today | Prototype |
|---|---|---|
| View | straight top-down | three-quarter |
| Art px per world px | 1 | 2 |
| Frame | 49 × 49 | 128 × 155 |
| Facings | 2 drawn, 6 rotated copies | 8 rendered |
| Frames per facing | 10 (idle 2, walk 4, work 4) | 14 (idle 2, walk 8, work 4) |
| Colours | from the shared 48 | its own 32 |

## Findings

- **Detail.** At zoom 1 on a high-density screen (1.5 screen px per world px) most of the extra detail is averaged away. It starts to show at about 2 screen px per world px, and shows fully at the closest zoom (3.3).
- **Size.** As run-length text, `spider-3q.js` is 716 KB for one unit. The same frames as a PNG are 168 KB (`spider-3q-sheet.png`), about 224 KB embedded as base64.
  - Embedded PNG data is the better format for the game.
  - The browser still lets the game read the pixels of an embedded image when it's opened from disk.
- **What the game would need.**
  - Sprites drawn from the back of the screen to the front.
  - Clicks that hit the visible sprite.
  - These shadow masks in place of the engine's silhouette shadows.
  - Atlas room: a 128 × 155 frame needs bigger slots than the atlas's 128 px ones, even at 1 atlas px per art px (today's art is stored at 2). With both teams, one atlas texture holds the frames of only a few units like this, so the atlas would need more than one texture.
