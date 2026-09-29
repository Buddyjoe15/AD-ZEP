---
name: adzep-asset
description: >-
  End-to-end art pipeline for the game Abyssal Dawn: Earth Zero Protocol (AD-EZP / AD-ZEP) — writes image-model prompts in the locked project style, reviews the art the user brings back, cuts it into animation parts at 192 px per tile, and builds a live animation demo (turret tracking, walking legs, lights, muzzle flashes, lasers, engine smoke). Use this whenever the user wants a new unit, building or other sprite for AD-ZEP/Abyssal Dawn, says /adzep-asset, uploads ChatGPT or other generated art for the game, asks for a prompt for game art, or wants a sprite checked, cut up, resized or animated — even if they only name the unit ("let's do the Pulse Drone next").
---

# AD-ZEP asset pipeline

The user makes the art in an image model (usually ChatGPT). Claude writes the prompt,
checks the results, processes them into parts and animates them in code. The user
works from a phone, so keep replies short, put copyable prompts in code blocks, and
deliver results as a published demo plus downloadable parts.

Project constants (don't re-ask): straight top-down view, 192 art px per tile
(48 world px at 4 art px per world px, as in `art/PIXEL_ART_RULES.md`). Every sprite
part is a square transparent PNG of footprint × 192 px: 192×192 for a standard
1-tile unit (Spider-sized), 384×384 for 2×2, 128×128 for a drone-sized unit. The
unit's pivot is the canvas center, front of the unit = top of the image. Check memory for anything newer about the
project (unit roles, sizes, style changes) and let that win over this file.

## Where this is running
- **claude.ai chat**: work in `/home/claude/<unit_slug>/`, write deliverables to
  `/mnt/user-data/outputs/`, publish the demo as an artifact, present the parts.
- **Claude Code (inside the AD-ZEP repo)**: the user adds source images to the repo
  (or a path they name). Work in a scratch folder outside the game code, then put the
  finished parts where the game already keeps sprites (look at the repo; ask if there
  is no sprite folder yet) and the demo in `tools/sprite-demos/<slug>_demo.html`.
  Skip artifact publishing and file presenting; commit when the user approves.
  Scripts need Python 3 with Pillow and numpy (`pip install pillow numpy` if missing).
  Paths below like `/mnt/user-data/outputs/` mean "the delivery location" here.

## 1. Intake — ask before writing the prompt
Ask only what the conversation and memory don't already answer, in one short message
(use tappable options when available):
- Which unit/building, and its role (what it attacks, how fast, what makes it distinct)
- How it moves: legs / hover / wheels-tracks / static building
- What rotates or animates separately: turret, dish, fan, arm — or nothing
- Weapon effect: bullets, laser, artillery, melee, none
- Footprint if not 1×1 (then the canvas changes: 192 px per tile, e.g. 384×384 for 2×2)

If the user already described the unit in memory (e.g. Guard Spider: slow, very fast
central gun; Pulse Drone: fast floating tank with a large slow-firing laser), confirm
rather than ask.

## 2. Write the prompt
Read `references/style-prompt.md`. Build the prompt from the locked STYLE block + locked
RULES block + the matching ASSET template. Never edit the locked blocks for one unit.
Tell the user in one line what images to expect back (e.g. body without turret +
turret alone).

## 3. Review the art the user uploads
Look at every image, then run the numbers:
`python3 scripts/process.py inspect <files>`
The chat preview shows transparent PNGs on white, so trust `transparent_bg` from the
script, not your eyes.

Check, and say plainly what passes and what doesn't:
1. Straight top-down (no side/3/4 view), front facing up
2. Barrels lie flat pointing up (not circles seen down the barrel)
3. Palette and style match the locked style and earlier approved units
4. Moving parts are separate images as requested; body has an empty mount if it has a turret
5. Lights are solid cyan blocks; no baked glow, smoke, flashes or shadows
6. Legs (if any) symmetrical, separated, fully visible
7. Background transparent (or solid magenta/white that can be keyed out)

If something fails, give the matching follow-up fix prompt from `references/style-prompt.md`.
Minor issues that code can fix (background, size, small offsets) are not a reason to
regenerate — say you'll handle them. An unrequested but good image (e.g. merged
version) can be kept as a portrait/icon.

## 4. Process into parts
Work in `/home/claude/<unit_slug>/`. Scripts are in this skill's `scripts/` folder.
- Background not transparent: `process.py keyout IMG --color magenta|white --out F` first.
- Body: `process.py body BODY.png --out parts/body.png --meta meta.json [--tiles T] [--center X Y]`
  T = footprint in tiles (default 1 → 192 px; 2 → 384 px; 0.667 → 128 px drone).
  Every later step reads the size from `meta.json`.
  For a turret unit, pass `--center` = the mount-hole center (look at the image;
  the default bbox center is often off because legs/armor are asymmetric).
- Legs: `process.py legs BODY.png --meta meta.json --outdir parts` then delete
  `parts/body.png` (legs replace it with `core.png`). Auto-detects leg angles and
  alternating gait groups; override with `--angles` / `--core-radius` if the preview
  shows a leg cut wrongly.
- Turret: `process.py turret TURRET.png --meta meta.json --pivot PX PY --scale S --out parts/turret.png`
  PIVOT = middle of the turret's base plate in its source image. SCALE = turret size
  relative to the body source image; start so the base plate is ~1.6× the mount-hole
  width (Guard Spider used 0.62) and adjust after the preview.
- Always: `process.py preview --meta meta.json --parts parts --out preview.png`
  (write it outside `parts/`) and look at it. Fix and repeat until the turret sits
  right, leg cuts are clean in both gait poses, nothing is clipped at the edge.
- `process.py check parts --meta meta.json` must print ALL <size>x<size> before delivering.

## 5. Animate
Write `unit.json` (only keys that differ from defaults; see `scripts/build_demo.py`):
- `name`, `move` (legs/hover/wheels), `speed` px/s (slow ~45–60, fast ~110+), `turnRate`
- `weapon` (bullets/laser/none), `fireInterval` s (rapid 0.07, slow laser 1.2–2), `range`
- `muzzles`: barrel tips relative to the pivot with the gun pointing up, in sprite px.
  `meta.json` has a `muzzle_guess`; read the real tips off the preview (multi-barrel
  guns: one entry per barrel, they fire in rotation).
- `exhausts`: smoke points relative to the body center, body pointing up (rear = +y).
Then `build_demo.py --parts parts --meta meta.json --unit unit.json --out /mnt/user-data/outputs/<slug>_demo.html`.
Test before publishing if a headless browser is available (playwright): load the page,
tap once, screenshot, confirm no page errors.

## 6. Deliver
- Publish the demo HTML as an artifact (update the same artifact on later revisions).
- Copy `parts/` + `meta.json` + `unit.json` to `/mnt/user-data/outputs/<slug>_parts/` and present them.
- Short summary: what animates, part list with sizes, anything left to decide.
  Offer tuning ("stride too big / too fast?") rather than listing every setting.
- If the user wants it in the game, the demo's draw/update logic and meta.json are
  the reference for Claude Code to port into AD-ZEP.

## Worked example: Guard Spider
Six-legged spider, 1×1 tile (192×192 canvas), central 3-barrel rapid-fire turret. Body mount center (627,598) in
a 1254 px source; turret pivot (626,880), scale 0.62; legs auto-detected at
~0/52/128/178/232/308°. unit.json:
`{"name":"Guard Spider","muzzles":[[0,-68],[-9,-62],[9,-62]]}` (defaults: speed 55,
fireInterval 0.07, swing 0.24). The user approved this look and gait as the baseline.
