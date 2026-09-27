---
name: sprite
description: Turn a short description into an AD-ZEP pixel-art sprite, straight top-down at 96 × 96 art px per tile. Checks the idea against the game's lore and art style, builds a 3D model in code in the sprite lab, renders and checks it, and publishes a test page. Use when the user types /sprite <description>, or asks to design, mock up or test a new unit, structure, prop or tree sprite.
---

# /sprite: from a description to a tested sprite

The user gives a short description, for example `/sprite a salvage crawler that strips wrecks for metal`. You turn it into a sprite that fits Abyssal Dawn: Zero Earth Protocol, render it straight top-down at the required size (96 × 96 art px per tile) and publish a test page they can open.

## 1. Read first

Read these before you design anything; don't work from memory:
- `art/PIXEL_ART_RULES.md`, all of it. Section 5 covers the lab, the lore and style check and the checks; sections 2–4 cover the palette, light, units, structures and the "never" list.
- `docs/DESIGN.md` for the lore, and the first paragraph of `README.md`.
- If the description names or resembles something in the game, its definition in `src/data/units.js`, `src/data/buildables.js` or `src/data/world.js`.
- `art/sprite-lab/specs/`: the closest existing spec, and `example_spider.mjs`, the worked example.

## 2. Fit it to the game

Work out, and keep for the fit report:
- **What it is.** Category (unit, structure or prop), faction (crew, hostile, local, nature, anomaly), team colour or not, frame (`unitFrame('standard' | 'small' | 'large')` or `structureFrame(w, h)`), elevation (`ground`, `hover`, `air`, `structure`, `prop`), and animations or states.
- **Lore fit.** Who built it, from what, and what it does in the game loop, in one or two sentences grounded in the lore.
- **Style fit.** Materials and lights from the faction table, where the team colour goes (on top, where the camera sees it), and the detail it carries.
- **Silhouette cue.** The one shape feature that tells it apart from the Utility Spider, the drones and Vance at ⅓ zoom, seen from straight above.
- **Changes from the request.** Everything you changed to fit the lore, the tone or the frame, each in one line.

Don't ask questions for gaps: take the defaults from the rules and list them as assumptions. Stop and ask only when:
- the description conflicts with the lore or a "never" rule and there is more than one sensible way to reinterpret it;
- it is organic or Omega (not designed yet);
- it can't fit any frame.

Put each question with your recommended answer.

## 3. Build the model

1. Write `art/sprite-lab/specs/<key>.mjs`, where `<key>` is snake_case. Copy the structure of the closest spec:
   - a default export with `key`, `name`, `gameKey` (if it exists in the game), `request` (the user's words), `kind`, `faction`, `team`, `elevation`, `frame`, `animations` (units) or `states` and `footprint` (structures and props), `fit` { `lore`, `style`, `silhouette`, `changes`: [] };
   - `build({ anim, frame, frames, state })` returning a `Model`.
2. Build from the kit (`tools/sprite-kit.mjs`):
   - `Model` shapes: `box`, `tube`, `ball`, `lathe` with `mul`, `translate`, `scale`, `rotX` and `along`;
   - materials from `MAT`, and `patterned()` for seams, stripes and plates, `grime()` for wear, `piston()` for hydraulics.
3. Keep model space in world px: x east, y up, z south. The unit faces −z. The camera looks straight down, so everything that matters must show from above; height still shapes the shading.
4. Keep units inside the inscribed circle: 23 world px from the origin for a standard frame, walk strides included. Aim for a detail every 3–6 world px.

## 4. Render, check and look

Run `npm run sprite -- art/sprite-lab/specs/<key>.mjs --capture`.
- **Fix every FAIL** and run it again. A WARN goes in your reply for the user to decide, unless the fix is obvious.
- **Look once** at `art/sprite-lab/out/<key>/sheet.png` and `preview.png`. Check:
  - Does it read as what was asked?
  - Does the silhouette cue show in every facing?
  - Is the team colour visible, and does it sit well beside today's Spiders?

  Fix what you find in one pass, render again, then stop polishing.

## 5. Publish the test page

- **Publish** `art/sprite-lab/out/<key>/index.html` with the Artifact tool:
  - on the first publish, `icon: "sprite"` and a one-sentence description;
  - on later rounds, publish the same path again so the link stays the same.
- **The page is self-contained.** It shows:
  - the fit report and the frame at 96 × 96 with guides;
  - the game zooms, the eight facings, the animations or states;
  - the sprite beside the Utility Spider the game draws today, and a crowd at ⅓ zoom;
  - the checks and the metadata.

## 6. Reply

Keep it short:
- the link;
- two or three lines on how it fits the lore and style;
- what you changed from the request and what you assumed;
- any WARN checks or questions, each with a recommendation;
- an offer of the obvious next steps: adjust it, add the missing states or animations, try another team, or put it in the game once they confirm it (`art/PIXEL_ART_RULES.md`, section 3).

Don't commit unless the user asks. When they do, commit the spec on a branch of its own under the "Parallel branches" rules in `CLAUDE.md`. The `out/` folder is generated and isn't committed.

## Changing a sprite later

When the user asks for changes ("make the legs longer", "more rust"):
1. Edit the spec.
2. Render and check again.
3. Republish the same page.
4. Say what changed in one or two lines.
