# Pixel art rules — Abyssal Dawn: Zero Earth Protocol

These are the rules for making new pixel art for the game. They match the art already in the game (Utility Spider, drones, Commander Vance, Repair Station, dust plain terrain) and the engine that draws it. This file works on its own, so you can paste it into a new chat. In this repository, the pipeline is `tools/sprites.mjs` and the engine side is `src/render/pixelart.js`.

**If you are an AI asked to make art with these rules:** start with the questions in section 1. Don't draw anything until you have the answers and the requester has confirmed your spec summary (section 1.3). If an answer conflicts with a rule below, point out the conflict and ask; don't bend the rule silently.

**Exception: test sprites from a short description.** `/sprite <description>` (section 5) makes a test sprite in the sprite lab without the question round. It fills the gaps with the defaults here, checks the idea against the lore (section 5.1), and publishes a test page that serves as the spec summary for the requester to confirm. Nothing it makes goes into the game until they confirm it.

---

## 1. Ask first

### 1.1 How to ask

- Ask all the questions in one round, grouped by the headings below. Leave out the ones that plainly don't apply to this kind of asset.
- Offer the default in brackets so the requester can just say "defaults". Example: *Frame size? [49×49 world px, like the Spider]*.
- If the requester points to an existing unit or structure in the game, read its definition first (`src/data/units.js`, `src/data/buildables.js`, `src/data/resources.js`, `src/data/terrain.js`). Fill in whatever it already says, such as radius, footprint, hp and behaviour, and only ask for what's left.
- Ask a follow-up round only for answers that are missing or contradict each other.

### 1.2 The questions

**A. What is it?**
1. Name, and the game key if it has one (for example `utility_spider`, `repair`).
2. Category. Pick one:
   - **Ground unit**: walks or drives on the ground.
   - **Hover unit**: floats just above the ground, like Vance.
   - **Flying unit**: in the air, drawn above everything on the ground, like the drones.
   - **Structure / building**: sits on the tile grid and has construction states.
   - **Resource node / deposit**: something units mine or harvest.
   - **Static item or prop**: a container, ground item, wreck or decoration, with no facing.
   - **Terrain tile**: a ground type that tiles across the map.
   - **Effect**: projectile, explosion, beam or marker. The engine currently draws effects as Canvas lines, so confirm pixel art is really wanted.
3. Who owns it? Player (blue), hostile (red), neutral (yellow), any team, or no team. This decides whether it needs team colour.
4. Is it new content, or new art for something already in the game?

**B. Size and footprint**
5. Units: how big is it compared with a Spider (about 1 tile) or a drone (about ⅔ of a tile)? What is its collision radius in world px, if known?
6. Structures and resource nodes: what is the footprint in tiles (w × h)?
7. Props and items: what size, in tiles or art px?

**C. Look and readability**
8. What is it for, and what must a player recognise at a glance? Name one shape feature that sets its silhouette apart from the Spider, the drone and Vance.
9. Key parts, front to back (for units, the front is the direction it moves or aims).
10. Where does the team colour go? [a plate or stripe on top, visible from above]
11. Any glowing parts: lights, thrusters, eyes, screens?
12. References or existing art to match.

**D. Facings (units)**
13. Does it face where it moves or aims? [yes: 8 facings] Does it look the same from every direction? [no]
14. Does anything turn separately from the body, like a turret? This needs a second layer, which the engine doesn't support yet. Flag it.

**E. Animations and states.** List every animation with its frame count and speed. The engine plays these names automatically:

| Name | Played when | Typical |
|---|---|---|
| `idle` | standing still | 2–4 frames, 2–5 fps |
| `walk` | moving along a path | 4 frames, 8 fps |
| `work` | its build or mining beam is active | 4 frames, 6 fps |
| `fly` | always, for flying units without `idle` | 4 frames, 16 fps (rotors) |

15. Which of these does it need? Does it need other animations (attack, death, open or close)? Any name not in the table needs engine work, so flag it.
16. Structures: which states does it need? [all of: foundation, frame, near-complete, finished, working (animated), damaged, rubble] What counts as "working" for this structure?
17. Resource nodes: states by amount left? [full, partly mined, depleted]
18. Terrain: how many variants, and any rare feature variants such as cracks, stones or plants? [8, weighted, 3 plain]

**F. Game data**
19. Does anything it shows depend on game state that isn't saved yet, such as a new "open" flag or charge level? If so, it's a save format change and must follow the "Save format rules" in `CLAUDE.md`. Art that only reads existing state needs none.

### 1.3 Confirm before drawing

Write a short spec and ask for a yes:

```
Asset: <name> (<key>) — <category>, <team>
Frame: <w>×<h> art px (<w/2>×<h/2> world px), origin <x,y>, <facings> facings
Animations/states: <name frames@fps>, …
Shadow: engine, <elevation> offset <dx,dy>
Team colour on: <where>   Glow on: <where>
Silhouette cue: <what makes it readable at ⅓ zoom>
Save change: none | <what and why>
```

---

## 2. Fixed rules

### 2.1 Scale and view

- **Straight top-down.** Not isometric and not three-quarter view. The camera looks straight down.
- **Everything: 2 art px per world px.** A map tile is 48 world px, which is **96 × 96 art px**.
- **Terrain** tiles and terrain props such as Woodlands trees are 96 × 96. Size their features in world px and draw them at twice that in art px. Keep seams, joints, blades and cracks one art px wide, so they come out finer. The data's top-level `worldPxPerArtPx` is 0.5.
- **Units and structures** are drawn the same way. A Spider is 49 world px across and **98 × 98 art px**; its metadata says `worldPxPerArtPx: 0.5`.
  - Draw them in world px, with the painter at scale 2 (`painter(g, angle, origin, 2)`). Each shape is rasterised at double resolution, so curves and diagonals come out smoother.
  - The shading and outline passes still work per art px, so edges and outlines come out half as thick as the terrain's.
- History: the first test set used 2 world px per art px (24 × 24 per tile). Everything was redrawn at 1 world px per art px, then units and structures were doubled again to 2 art px per world px, then terrain and trees too (96 × 96 per tile). Don't change a scale again without redrawing every asset that uses it.
- Up close the engine draws the art nearest-neighbour, at whole art pixels. When art lands on fewer screen pixels than it has (zoomed out, or terrain in a 1× chunk), the engine averages it instead so fine detail doesn't shimmer. Never draw sub-pixel detail or anti-aliasing.

### 2.2 Palette: 37 colours, nothing else

| Group | Names and colours |
|---|---|
| Outline | `outline` #0d1419 |
| Steel (hulls, legs, frames) | `steel0` #1f2c34 · `steel1` #34495a · `steel2` #557184 · `steel3` #8aa7b4 |
| Plate (light armour, pads) | `plate0` #7f8b86 · `plate1` #b3bdb5 · `plate2` #e3eae2 |
| **Team (placeholders)** | `team0` #800080 · `team1` #c000c0 · `team2` #ff00ff |
| Amber (warnings, joints, sparks) | `amber0` #7a4f1c · `amber1` #c98a2e · `amber2` #f2c66a |
| Cyan (lights, energy) | `cyan0` #1c5f73 · `cyan1` #36b8ef · `cyan2` #aef4ff |
| Rust (damage) | `rust0` #4a2a1e · `rust1` #7d4630 · `rust2` #a8653f |
| Dust (terrain only) | `dust0` #5e4f3d · `dust1` #6f5e48 · `dust2` #7f6c53 · `dust3` #8e7a5e · `dust4` #9e896b · `dust5` #b09c7e |
| Char (scorch, rubble) | `char0` #231f1c · `char1` #433a33 |
| Green (repair, OK status) | `green0` #2f8a4c · `green1` #6fe08e |
| Red (warning lights) | `red0` #8a2a2a · `red1` #e85e55 |
| Other | `white` #ffffff · `visor` #16343e · `gold0` #9a7a3e · `gold1` #e1bd76 · `blur` #6d7c84 (rotor blur) |

- **Team colour** uses only the magenta ramp `team0`–`team2`. The game swaps it at load for blue (#1f5a99 #49a4ff #a8d6ff), red (#8a2622 #ef5b55 #ffb0a6) or neutral (#8a7a36 #d4c46c #f0e6a8). Never use magenta for anything else, and never paint a real team colour.
- Use the `dust` colours only for terrain. Use `blur` only for motion blur, such as rotors.
- Adding a colour means changing the palette for every asset. Ask first.

### 2.3 Pixels, outline, light and shadow

- **Every pixel is fully opaque or fully transparent.** No partial alpha, glow haloes or soft edges. Show glow with the light `cyan`, `amber2`, `white` or `green1` colours.
- **Shadows are drawn by the engine, never baked into sprites.** The engine stamps the sprite's silhouette at an offset and darkens what is underneath by 55%. Overlapping shadows don't double up. Pick the offset (in world px) by elevation. The metadata stores it in art px, so units and structures store twice these numbers:

  | Elevation | Offset | Examples |
  |---|---|---|
  | ground unit | 2, 4 | Spider |
  | hover | 6, 8 | Vance |
  | air | 8, 10 | drones |
  | structure / prop | 4, 4 | Repair Station |

- **Light comes from the top left, on every facing.** Don't paint directional light into the art. Author with flat mid-tones. The pipeline adds light and shadow edges and the outline itself, after rotating:
  - Each pixel on a top or left silhouette edge steps one shade lighter along its ramp. Each pixel on a bottom or right edge steps one shade darker.
  - The ramps are steel, plate, team, rust, gold, char and `amber0`/`amber1`.
  - A 1 px `outline` is added around the silhouette, 4-connected (no diagonal corners).
  - Glow and blur pixels (`blur`, `cyan1`, `cyan2`, `amber2`, `white`) get no outline, and glow colours aren't shaded.
- Interior detail such as panel lines, seams and vents may use darker or lighter steps if it doesn't imply a light direction.

### 2.4 Units

- **Square frames at 2 art px per world px.** The unit's size is given in world px (odd, so it has a centre) and the frame is twice that. The origin (the unit's position) is the frame's centre, between its four middle pixels: `(N - 1) / 2` in the metadata. Sizes in use:
  - **49 world px (98 × 98 art px)** for Spider-sized units (about 1 tile).
  - **33 world px (66 × 66 art px)** for drone-sized units.

  Pick one of these unless the spec says otherwise.
- **Keep all art within the frame's inscribed circle, minus 1 world px** for the outline: radius 23 world px for Spider-sized units, 15 for drone-sized ones. Otherwise the 45° facing clips at the corners.
- **8 facings**, one sheet row each, in this order: `up, up-right, right, down-right, down, down-left, left, up-left`. The engine picks the facing nearest the unit's heading and never rotates the sprite.
- **Author only `up` and `up-right`.** The other six are lossless 90° turns of those two, made by the pipeline.
- **Draw `up-right` at 45° directly.** Don't resample `up`. Check that the diagonal keeps the unit's silhouette: legs splay radially so a Spider shows an X, not a plus sign.
- "Forward" is up in the `up` frame. Put weapons, eyes and sensors at the front and thrusters at the back.
- Team colour must be visible from straight above: a plate, stripe or pad on top, at least 6 × 6 world px on a 49 world px unit.
- Use the finer scale for real detail (joints, seams, rivets, vents, visor glints), and keep limbs, arms and girders at least 2 world px thick (`thick` in the painter) so they still read at ⅓ zoom.
- **Readability test:** at ⅓ zoom on a phone (1 device px per world px), the unit must still be told apart from Spiders, drones and Vance by shape and team colour, including in a crowd of 30 or more.

### 2.5 Structures

- The frame is the footprint in tiles × 48 world px, at 2 art px per world px. A 2 × 2 structure is 96 world px, a **192 × 192 art px** frame. The origin is the **top-left corner** [0, 0], aligned to the grid. No facings: one row of frames.
- Keep a **1 px transparent margin** inside the frame for the outline. The body usually fills the rest, like the Repair Station's hull at 6 to 89 on a 96 px frame.
- **States**, and when the engine shows them:

  | State | Shown when |
  |---|---|
  | `foundation` | construction below ⅓ |
  | `frame` | construction below ⅔ |
  | `near-complete` | construction ⅔ to done |
  | `finished` | built, idle |
  | `working` (animated, e.g. 4 frames @ 6 fps) | its behaviour is active; the Repair Station counts as working while a damaged friendly unit is in reach |
  | `damaged` | below 50% health; working stops showing |
  | `rubble` | destroyed; shown for 90 s, then gone (not saved) |

- Construction states build up visually: slab and anchors, then girders, then mostly plated with one section open.
- Put team colour on the finished hull (stripes or edges). Construction states may show it too.
- Structures without pixel art keep their old Canvas art, so pixel art can be added one structure at a time.

### 2.6 Resource nodes, props and items

- Resource nodes, props and items that stand on the map (not terrain props like trees) use the structure rules: 2 art px per world px, grid-aligned, top-left origin, frame = footprint × 48 world px, engine shadow at offset 4, 4 world px, no facings.
- A 1 × 1 deposit or prop is **48 × 48 world px (96 × 96 art px)**. Small ground items may use a smaller odd-sized frame in world px, centred on the item, like 21 × 21.
- States by what's left (full, partly mined, depleted) come from saved amounts and need no save change.
- **Engine work needed:** the renderer doesn't yet draw pixel art for these categories. Say so in the spec (section 1.3).

### 2.7 Terrain tiles

- **96 × 96** (48 world px), seamless, flat top-down. Use `dust` colours for the dust plain; another terrain type needs its own ramp, so ask first. No outline and no shading pass.
- **8 variants, weighted.** Mostly plain, with rare feature variants. The dust plain uses weights 6, 6, 6, 4, 3, 2, 1, 1.
- **Edge-matched:** every variant shares the same values along its edges, so any two variants meet without a seam.
- **Tone-matched:** every variant has the same overall brightness (the same interior values, reshuffled), so no tile stands out.
- Anything placed near an edge wraps to the opposite edge.
- The engine picks the variant for each tile with a mixing hash (`fmix32`), never a linear formula like `(3x + 5y) & 3`. A linear formula caused visible diagonal banding in the first test.
- Lighting baked into terrain details (a lit top-left and dark bottom-right on stones) is allowed; terrain tiles are never rotated.

---

## 3. Deliverables

For each asset:
1. **Sheet PNG** at 1×, with the magenta team ramp in place.
   - Units: rows are the 8 facings; columns are all animation frames in order, each animation contiguous.
   - Structures, props and terrain: one row.
2. **JSON metadata** next to it, in the same shape as `art/pixel-test/sheets/spider.json`: `name`, `frameWidth`, `frameHeight`, `origin`, `worldPxPerArtPx` (0.5 for units and structures, 1 for terrain), `facings` (units), `animations` or `states` as `{ start, frames, fps }`, and `shadow: { drawnBy: "engine", offset, elevation }`.
3. **Preview** at ⅓, ⅔ and 1 zoom on a phone-sized screen, on dust terrain, next to Spiders and drones for scale. Show blue and red team versions.

Inside this repository:
- Add the art as a draw function in `tools/sprites.mjs` (`UNITS` for units, or next to the station for structures). A unit modelled in the sprite lab goes in `MODELLED` instead, pointing at its spec: every facing is rendered from the model at the game's odd frame size (49 world px, 98 art px, for a one-tile unit). Run `npm run sprites`, which writes `art/pixel-test/sheets/` and `src/render/pixel-data.js`. Never edit `pixel-data.js` by hand.
- Map the game's `visual` or buildable key to the sprite in `G.PixelArt.UNITS` or `G.PixelArt.BUILDINGS` (`src/render/pixelart.js`).
- Add it to the preview scene in `art/pixel-test/preview.html` and run `npm run sprites:preview`.
- `npm test` and `npm run test:browser` must pass.

## 4. Never

- Semi-transparent pixels, baked shadows, or directional light painted into unit art.
- Colours outside the palette, magenta used for anything but team colour, or real team colours in the art.
- Isometric or angled views, or a different art-pixel scale.
- Unit art outside the inscribed circle, or even-sized unit frames.
- Hand-drawing the six rotated facings, or resampling `up` to make `up-right`.
- Terrain variants that don't match at the edges or differ in tone, or linear variant picking.
- New saved state for a purely visual effect. Anything that must persist follows the save rules in `CLAUDE.md`.

## 5. Sprite lab and `/sprite`

The sprite lab (`art/sprite-lab/`) makes test sprites from 3D models built in code. It renders them straight top-down at 96 art px per tile, checks them against these rules, and writes a test page. In Claude Code, `/sprite <short description>` runs the whole process (`.claude/skills/sprite/SKILL.md`), for example `/sprite a salvage crawler that strips wrecks for metal`.

### 5.1 Lore and style check

Check every new design against the world before drawing it. `docs/DESIGN.md` has the full design and the story.
- **The expedition.** Commander Elias Vance and the UES Aster Vale are thrown between alternate Earths by a damaged warp drive. The ship's AI, ARIA, controls the ship, fabricates the drone army and speaks in terse, classified status lines. Vance believes the worlds are planets ("Planet 001"); they are Earths whose history went a different way.
- **Crew technology** is fabricated on site from metal, steel, electronics and fuel rods. It is practical field engineering: modular hulls, bolted plates, hazard striping, exposed pistons and cables, cyan sensor lights and amber warning lights.
- **Hostiles.** Today's Hostile Autonomous Machines and Hostile Drones stand in for the Omega, which is still being designed. Make hostiles machines: harsher and more angular than crew tech, dark steel with rust, red sensor lights. Flag any organic or Omega design for the requester's approval.
- **Element P** is the ship's rare fuel: show it as contained cyan-white light, never loose magic. **Lost archives** are black-box recordings from Earths that also tried the warp: salvaged recorders and data cores.
- **The Earths.** Woods World (Northern Canada, abandoned settlements, logging camps, wind and rain) comes first. Later: Medieval Earth, Lava World, Snow Earth, Earth at War (a WW2-era world war, wasteland salvage), Omega World. Local structures belong to their Earth, such as timber and stone on Woods World.
- **Tone.** Grounded science fiction. No fantasy magic, cartoon faces, text or logos (a short stencil mark is fine), gore, or anything cute.

| Faction | Materials (`MAT` in `tools/sprite-kit.mjs`) | Team colour | Lights |
|---|---|---|---|
| Crew | `steel`, `plate`, `dark`, `chrome`, `gold` joints, `amber` hazard bands | yes | `glow` sensors, `lampAmber`, `lampGreen` |
| Hostile | `dark`, `steel`, `rust`, `red`, `chrome` | yes (red in play) | `lampRed` |
| Local (the Earth's own) | `wood`, `log`, `stone`, `rust`, weathered `plate` | no | `lampAmber` lanterns at most |
| Nature | `bark`, `leaf`, `pine`, `stone`, `water` | no | none |
| Anomaly (Element P, archives) | `dark`, `chrome` housings | no | `glow`, contained |

If a request doesn't fit (a dragon, a wizard), reinterpret it inside the world, keeping what the requester cares about (silhouette, role, mood), and list the change on the test page.

### 5.2 Lab rules

- **Specs.** One file per sprite, `art/sprite-lab/specs/<key>.mjs`: a model in world px (x east, y up, z south; units face −z) built with `tools/sprite-kit.mjs`. `example_spider.mjs` is the worked example.
- **Straight top-down at 2 art px per world px,** rendered by `tools/render3d.mjs` with no height shift.
  - Light from the top left on every facing, a glint on shiny materials, and ambient occlusion in creases.
  - Lines where parts meet, and a 1 px outline.
  - Colours only from the shared palette, through the material ramps in the kit.
- **Frames: 96 × 96 per tile.**
  - Units: `standard` 96 × 96 (48 world px, Spider-sized), `small` 64 × 64 (drone-sized) or `large` 192 × 192, with the origin at the centre.
  - Structures and props: footprint × 96.
  - The game's current Spider and drone use odd world sizes (98 and 66 art px); the lab uses whole tiles. Both are 2 art px per world px, and the engine reads the size from the metadata.
- **Facings.** A unit's 8 facings are each rendered from the model, with the light staying top left. This replaces the rule to author `up` and `up-right` and rotate them: it gives the same silhouettes with the same light.
- **Variants** (optional). A spec may set `variants: { label, by, values, at, pick }` for a look that follows game state rather than time, such as a hopper's fill level by `cargoTotal / cargoCapacity`. `build()` gets the value as `variant`. Each variant repeats every animation or state, left to right in the sheet, and the metadata says how the engine picks one. The engine picks cargo variants (`by: 'cargo'`); any other kind needs engine work, so the check warns.
- **Shadows** stay engine-drawn from the silhouette, at the offset for the elevation (section 2.3).
- **Checks** (`npm run sprite -- <spec>`). A fail must be fixed; a warn is for the requester to decide.
  - Frame size.
  - Inside the frame, and for units inside the inscribed circle less 1 world px.
  - Palette only.
  - Team colour: at least 6 × 6 world px on a Spider-sized unit (scaled by frame area), and none on teamless art.
  - Animation and state names the engine plays (warn), and variants the engine can't pick (warn).
  - Silhouette overlap with the in-game Utility Spider above 75% (warn).
- **Output** in `art/sprite-lab/out/<key>/` (not committed): `sheet.png`, `meta.json` and `index.html`. The page has the fit report, the frame at every zoom, the facings, the animations or states, the sprite beside today's Spiders, a crowd at ⅓ zoom, the checks and the metadata.
- **Into the game.** A lab sprite goes into the game only once the requester confirms it, through section 3: its sheet and metadata into the pipeline, mapped in `src/render/pixelart.js`.

