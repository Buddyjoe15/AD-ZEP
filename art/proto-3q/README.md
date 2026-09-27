# Utility Spider: three-quarter prototype

An experiment for a more detailed look, closer to painted concept art: the Utility Spider built as a 3D model in code and rendered to pixel art in a three-quarter view, at 2 art px per world px. The game doesn't use it. It deliberately breaks `art/PIXEL_ART_RULES.md`, which requires straight top-down art at 1 art px per world px. It's here to decide whether to change those rules.

Open [`preview.html`](preview.html) directly from disk. It compares today's Spider with the prototype on the game's Woodlands grass, at game zoom and walking in a ring, and shows the whole sheet.

```
npm run proto:spider           # spider-3q.js and spider-3q-sheet.png
npm run proto:spider:preview   # also previews/ (needs Playwright + Chromium)
```

## How it's made

- **Models.** `tools/render3d.mjs` builds them from boxes, tubes and balls, in world px. `tools/spider-3q.mjs` is the Spider: its body, laser arm and eight two-segment legs, with the knees solved for each foot position.
- **Camera.** An oblique three-quarter view. The ground keeps its top-down shape, so map tiles stay square as they are in the game, and each px of height lifts a point 0.8 px up the screen.
- **Facings.** Each of the 8 facings is its own render, never a rotated copy, so the angle, lighting and shadow match on all of them.
- **Light and colour.**
  - One light from the top left falls on every triangle, and each material turns it into a step on its colour ramp.
  - Where depth jumps between neighbouring pixels, the farther one steps darker, which draws the lines between parts. A 1 px outline goes around the silhouette.
- **Shadow.** The model is projected onto the ground along the light, and stored as a mask for the engine to darken by 55%.
- **Palette.** Its own 32 colours: 6-step ramps for steel, plate, team and amber, plus dark parts and cyan lights. Team colour is a magenta ramp swapped per team. The game's palette is untouched.

## Compared with today's Spider

| | Today | Prototype |
|---|---|---|
| View | straight top-down | three-quarter |
| Art px per world px | 1 | 2 |
| Frame | 49 × 49 | 104 × 121 |
| Facings | 2 drawn, 6 rotated copies | 8 rendered |
| Frames per facing | 10 (idle 2, walk 4, work 4) | 14 (idle 2, walk 8, work 4) |
| Colours | from the shared 48 | its own 32 |

## Findings

- **Detail.** At zoom 1 on a high-density screen (1.5 screen px per world px) most of the extra detail is averaged away. It starts to show at about 2 screen px per world px, and shows fully at the closest zoom (3.3).
- **Size.** As run-length text, `spider-3q.js` is 516 KB for one unit. The same frames as a PNG are 129 KB (`spider-3q-sheet.png`), about 173 KB embedded as base64.
  - Embedded PNG data is the better format for the game.
  - The browser still lets the game read the pixels of an embedded image when it's opened from disk.
- **What the game would need.**
  - Sprites drawn from the back of the screen to the front.
  - Clicks that hit the visible sprite.
  - These shadow masks in place of the engine's silhouette shadows.
  - Atlas room: a 104 × 121 frame fits the atlas's 128 px slots at 1 atlas px per art px (today's art is stored at 2). With both teams, one atlas texture holds the frames of about 9 units like this, so the atlas would need more than one texture.
