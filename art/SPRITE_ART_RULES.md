# Sprite art rules: three-quarter view, 96 px per tile

These rules are for new sprites of units, structures and props in the three-quarter style chosen for Abyssal Dawn: Zero Earth Protocol: an angled camera at 60% face height, at 96 × 96 art px per map tile, drawn by code from 3D models. They describe how the art must look, how it fits the game's world, and how to make and test it with the sprite lab (`art/sprite-lab/`).

**Status.** This is the art direction for new sprites. The game still draws its current top-down art, which follows `art/PIXEL_ART_RULES.md`, until the engine draws three-quarter sprites (see "What the game needs" at the end). Palette and team-colour rules are shared by both files. Where the two files disagree about the camera, the frame sizes or the facings, this file applies to three-quarter sprites.

**To make a sprite from a short description,** use the `/sprite` skill (`.claude/skills/sprite/SKILL.md`): `/sprite a salvage crawler that strips wrecks for metal`. It follows section 1.

---

## 1. From a description to a test page

1. **Read the description and fill the gaps from these rules.** A short description is enough. Pick the category, size, faction, team, animations or states and materials from the defaults below, and write each assumption into the fit report. Ask the requester only when the description conflicts with the lore or with a "never" rule, or when two readings would give very different sprites.
2. **Check it against the lore and the style (section 2).** Decide who built it, what it's made of and what it does in the game. If the request doesn't fit (a dragon, a wizard, a cartoon face), reinterpret it inside the world, keep what the requester cares about (the silhouette, the role, the mood), and list the change under "Changed from the request".
3. **Write the spec:** `art/sprite-lab/specs/<key>.mjs`, a model built in code (section 6). Start from the closest existing spec.
4. **Render and check:** `npm run sprite -- art/sprite-lab/specs/<key>.mjs --capture`. Fix every failing check (section 8), then look at `preview.png` and `sheet.png` once and fix what they show.
5. **Publish the test page** (`art/sprite-lab/out/<key>/index.html`) and give the requester its link, the fit report and anything to decide.
6. **Iterate** on their feedback by editing the spec and publishing the page again at the same address.

## 2. Lore and style

### 2.1 The world in brief

- **The expedition.** Commander Elias Vance and the UES Aster Vale are thrown between alternate Earths by a damaged warp drive. The ship's AI, **ARIA**, controls the ship, fabricates the drone army and speaks in terse, classified status lines. Vance believes the worlds are planets ("Planet 001"); they are Earths whose history went a different way.
- **Crew technology** is fabricated on site from metal, steel, electronics and fuel rods, by the ship and by Fabricators. It is practical field engineering: modular hulls, bolted plates, hazard striping, exposed pistons and cables, cyan sensor lights and amber warning lights. It is built to be repaired, not admired.
- **Hostiles.** Today's Hostile Autonomous Machines and Hostile Drones stand in for the **Omega**, which is still being designed. The Omega uses warp and Element P freely and takes humans as organic material for its army. Until its design is settled, make hostiles machines: harsher and more angular than crew tech, dark steel with rust, red sensor lights. Flag any organic or Omega design as needing the requester's approval.
- **Element P** is the ship's rare main fuel, a resonance material with an unexplained mechanism. Show it as contained cyan-white light, never as loose magic.
- **Lost archives** are black-box recordings from Earths that also tried the warp. They look like salvaged recorders and data cores, never scrolls or tablets.
- **The Earths.** Woods World (Northern Canada, abandoned settlements, logging camps, wind, rain and lightning) is the first. Later: Medieval Earth (castle, villages, trade), Lava World (ash, lava, steam), Snow Earth (ice age), Earth at War (a WW2-era world war with WW1 tactics, wasteland salvage), Omega World. Local structures belong to their Earth: timber, stone and weathered paint on Woods World, not sci-fi panels.
- **Tone.** Grounded science fiction. No fantasy magic, cartoon faces, text or logos (a short stencil mark is fine), gore, or anything cute.

### 2.2 Faction style

| Faction | Built by | Materials (section 5) | Team colour | Lights |
|---|---|---|---|---|
| **Crew** | the Aster Vale, Fabricators, Spiders | `steel`, `plate`, `dark`, `chrome`, `gold` joints, `amber` hazard bands | yes: the player's team | `glow` (cyan) sensors, `lampAmber` warnings, `lampGreen` status |
| **Hostile** | machine stand-ins for the Omega | `dark`, `steel`, `rust`, `red`, `chrome` | yes: red in play | `lampRed` sensors |
| **Local** | the Earth's own people, long ago | `wood`, `log`, `stone`, `rust`, weathered `plate` | no | `lampAmber` lanterns, at most |
| **Nature** | the Earth | `bark`, `leaf`, `pine`, `stone`, `water` | no | none |
| **Anomaly** | Element P, archives, the warp | `dark`, `chrome` housings | no | `glow`, contained |

- **Crew** shapes are rounded boxes and cylinders with chamfers, panel seams every few world px, rivets and bolts, and a team plate or stripe on top. Parts that move show how: hinges, pistons, cable runs.
- **Hostile** shapes are angular and asymmetric, with jagged plate edges, exposed frames, rust streaks and one or more red sensor lights facing forward.
- Every design needs **one silhouette cue** that tells it apart from the Utility Spider, the drones and Vance at ⅓ zoom: a long barrel, a tall mast, a wide flat hull, a hunched back. Write it in the fit report.

### 2.3 Game fit

- If the description names something already in the game, read its definition first (`src/data/units.js`, `src/data/buildables.js`, `src/data/world.js`) and match its footprint, radius, capabilities and role. Set `gameKey` in the spec.
- A unit that moves has `walk` (or `fly`); one that builds or mines has `work`; a structure with a behaviour has `working`. See 7.1 and 7.2.
- Art must not need new saved state. If what it shows depends on something the game doesn't save yet, say so; it becomes a save format change under `CLAUDE.md`.

## 3. Camera and scale (fixed)

- **Three-quarter oblique view.** The ground keeps its top-down shape, so map tiles stay square. Every world px of height lifts a point **0.6 px** up the screen (60% face height), so the south faces of things show. Not isometric, and not a perspective camera.
- **96 art px per tile:** 2 art px per world px. A map tile (48 world px) is 96 × 96 art px. Metadata says `worldPxPerArtPx: 0.5`.
- **Light** comes from the top left and slightly behind (toward the north-west, above), the same for every facing. Shadows fall to the bottom right, onto the ground.
- The engine draws the art at whole art px, nearest-neighbour. Every pixel is fully opaque or fully transparent.
- These values are in `tools/sprite-kit.mjs` (`LIFT`, `RES`). Don't change them per sprite.

## 4. Frames

Model space is world px: x east, y up, z south. The origin is the ground point under a unit, or the centre of a structure's footprint on the ground. Frame sizes are in art px, and everything must stay 1 px inside the frame. A 1 × 1 unit's frame is 96 × 96.

### 4.1 Units

| Frame | Size (art px) | Origin | Ground reach | Height | For |
|---|---|---|---|---|---|
| `standard` | 96 × 96 | 48, 62 | 16 world px | 24 world px | Spider-sized, about one tile |
| `tall` | 96 × 128 | 48, 94 | 16 | 50 | Vance, walkers, masts |
| `small` | 64 × 64 | 32, 42 | 10 | 17 | drone-sized |

- **Ground reach** is how far any part reaches from the origin on the ground plan, strides and swings included, in any facing. **Height** is the tallest point. The origin sits low in the frame so the height has room.
- Units taller or wider than these don't fit a one-tile frame. Make them smaller, or treat them as structures.
- Use `unitFrame('standard' | 'tall' | 'small')` from the kit.

### 4.2 Structures and props

- **Width** = footprint width × 96. **Height** = footprint depth × 96 + **headroom**, the room above the footprint for the model's height: `ceil((height × 0.6 × 2 + 2) / 16) × 16`, at least 16.
- A 2 × 2 structure 40 world px tall is 192 × 256. Its footprint starts 64 px down (`footprintOrigin: [0, 64]`).
- Use `structureFrame(w, h, height)` from the kit.
- Trees and other tall terrain props use this rule too, as 1 × 1 props. They stand up out of the ground, so they are drawn with the sprites, not baked into the terrain. Flat terrain stays under `PIXEL_ART_RULES.md`.

### 4.3 Shadows

- Shadows are **cast by the model onto the ground** and stored as a separate mask sheet (`shadow.png`). The engine darkens the ground under it by 55%, and overlapping shadows don't double.
- Never bake a shadow into the sprite.
- A shadow frame is the sprite frame plus 32 art px to the right and below (units) or 64 (structures), with the same origin.

## 5. Palette and materials

- **The shared palette only:** the 48 colours in `tools/pixelart.mjs` (listed in `PIXEL_ART_RULES.md`, section 2.2, plus the Woodlands grass, leaf and water ramps). Adding a colour changes it for every asset: ask first, and follow "Palette" in `CLAUDE.md`.
- **Team colour** is the magenta placeholder ramp `team0`–`team2`, swapped per team at load. Never use magenta for anything else, and never paint a real team colour.
- **Materials** are defined in `tools/sprite-kit.mjs` (`MAT`), each a ramp from dark to light with a glint strength:

| Material | Ramp | Use |
|---|---|---|
| `steel` | char0 → plate1 (6) | hulls, frames, legs |
| `dark` | outline → steel1 (5) | joints, housings, tyres, cables |
| `plate` | steel1 → plate2 (5) | armour plates, pads, heads |
| `chrome` | steel2 → plate1 (3), very shiny | piston rods, barrels, antennae |
| `team` | team0 → team2 (3) | team plates and stripes |
| `amber`, `gold` | rust0 → amber2 / gold1 | hazard bands, hinges, knee joints |
| `rust`, `red`, `green` | their ramps | wear, hostile trim, status |
| `glass` | visor → cyan1, very shiny | visors, windows, screens |
| `glow`, `lampAmber`, `lampRed`, `lampGreen` | emissive | lights; they ignore the light direction |
| `wood`, `log`, `stone`, `bark`, `leaf`, `pine`, `water`, `smoke` | their ramps | local structures and nature |

- Add detail with **patterns**, which are fixed to the model surface so they don't crawl as it moves: `patterned(MAT.steel, p => ...)` returns −1 or −2 for seams, +1 for a lit edge, or another material for stripes and plates. `grime()` adds wear.

## 6. Shading and pixels

The renderer (`tools/render3d.mjs`) does all of this; don't paint any of it by hand.

- **Shading.** It shades from the model, not the silhouette:
  - Each art px is sampled 2 × 2 and takes its most common colour, which keeps edges clean.
  - Light is diffuse from the top left, with a glint on shiny materials.
  - Ambient occlusion darkens creases and the places where parts meet.
- **Lines and outline.** The farther of two neighbouring pixels steps darker where depth jumps, which draws the lines between parts. A 1 art px `outline` goes around the silhouette.
- **No soft pixels.** Nothing semi-transparent: no soft glows, no anti-aliasing. Show light with emissive materials.

## 7. What to draw

### 7.1 Units

- **8 facings**, one sheet row each, in the order `up, up-right, right, down-right, down, down-left, left, up-left`. Each is rendered from the model (heading = facing × 45°), never a rotated or mirrored picture.
- The unit faces −z (up the screen in `up`). Put sensors and weapons at the front, thrusters and exhausts at the back.
- **Animations**, each frame rendered from the model:

  | Name | Played when | Typical |
  |---|---|---|
  | `idle` | standing still | 2–4 frames, 2–5 fps |
  | `walk` | moving | 4 frames, 8 fps |
  | `work` | building or mining | 4 frames, 6 fps |
  | `fly` | always, for flying units | 4 frames, 16 fps |

  Any other name needs engine work, so flag it.
- **Team colour** must be visible from the three-quarter camera: at least 64 art px in the down-right facing (32 on a small frame). Put it on top: a stripe, plate or pad.
- **Parts:** keep limbs at least 1 world px in radius (2 art px thick), and body parts large enough to read as shapes at ⅓ zoom.

### 7.2 Structures

- **One facing.** Structures sit on the grid and don't turn.
- **States**, in this order: `foundation`, `frame`, `near-complete`, `finished`, `working` (animated), `damaged`, `rubble`. A test sprite may start with `finished` and `working`; the full set is needed before it goes in the game.
- **Front faces carry the detail:** doors, windows, vents, panels, lights, stencils. Top surfaces carry the team colour and the silhouette.

### 7.3 Detail density

- **The smallest detail is 1 art px** (half a world px): seams, rivets, glints.
- Aim for a detail every 3 to 6 world px on crew and hostile surfaces, and fewer on nature.
- Detail must survive ⅓ zoom as texture, while the silhouette and team colour carry recognition.

## 8. Deliverables and checks

**The sprite lab writes** `art/sprite-lab/out/<key>/`:
- `sheet.png`: the sprite sheet, magenta team ramp in place. Rows are facings (units) or one row (structures); columns are the animation or state frames in order.
- `shadow.png`: the shadow mask sheet.
- `meta.json`:
  - the frame size and origin, `worldPxPerArtPx`, the camera;
  - facings, and animations or states as `{ start, frames, fps }`;
  - the shadow sheet's frame and origin.
- `index.html`: the test page. It has the fit report, the frame at every zoom, the facings, the animations or states, a scale scene next to Utility Spiders, a crowd at ⅓ zoom, the checks and the metadata.

**Checks** (`tools/sprite-lab.mjs`). A **fail** must be fixed; a **warn** is for the requester to decide.
- **Frame size** matches section 4.
- **Inside the frame:** every facing and frame keeps a 1 px margin.
- **Shadow fits** its padded frame.
- **Palette:** shared colours only.
- **Team colour:** enough team pixels on team assets, and none on assets without a team.
- **Animations / states:** only names the engine plays (warn), and `idle` or `finished` present (warn).
- **Silhouette:** a unit overlapping the Utility Spider's silhouette by more than 75% (warn).

## 9. Never

- Semi-transparent pixels, baked shadows, or light painted by hand.
- Colours outside the shared palette, magenta for anything but team colour, or real team colours.
- A different camera height or scale for one sprite, isometric or perspective views, or top-down art for a new three-quarter asset.
- Rotated or mirrored copies of a facing.
- Art outside its frame, or a unit bigger than its frame allows (make it smaller, or make it a structure).
- Designs that break the tone: fantasy magic, cartoon faces, text or logos, gore; organic or Omega designs without the requester's approval.
- New saved state for a purely visual effect.

## What the game needs before it draws these

`art/proto-3q/README.md` lists it:
- sprites sorted back to front;
- clicks that hit the visible sprite;
- the model's shadow masks in place of silhouette shadows;
- more atlas room for larger frames.

Until then, sprites made with these rules live in the sprite lab as tests and designs.
