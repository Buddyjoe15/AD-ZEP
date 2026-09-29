# AD-ZEP image-model prompts

Give the user prompts in code blocks so they copy cleanly on a phone. The STYLE and
RULES blocks are locked: paste them word for word into every prompt, and change only
the ASSET block. Consistency across the project depends on this.

## Locked STYLE block
```
Top-down pixel art game sprite for "Abyssal Dawn: Earth Zero Protocol", a sci-fi RTS. Straight overhead camera, 90° top-down, no perspective or side view. Clean pixel art with crisp edges, no anti-aliasing blur. Limited palette: gunmetal greys, dark steel blue, worn olive accents, with emissive cyan for friendly lights. Soft light from top-left. Mechanical, military-industrial style. Readable silhouette at small size. Fully transparent background (PNG alpha); if transparency isn't possible, use a flat solid magenta (#FF00FF) background. No ground, no baked shadow, no text, no border.
```
Enemy units: replace "emissive cyan for friendly lights" with the enemy accent color
once the user has chosen one; ask the first time an enemy asset comes up.

## Locked RULES block (animation-ready)
```
Animation-ready rules:
- Emissive lights as small solid cyan blocks, no glow halo.
- No muzzle flash, bullets, lasers, smoke, fire or sparks.
- Vents and exhausts shown as dark openings.
- Guns and barrels lie flat and point toward the top of the image (seen from above, not looking down the barrel).
- Front of the unit faces the top of the image.
```

## ASSET block templates
Tiles are 192 px. The canvas is the footprint × 192 px: 192×192 for a standard
1-tile unit (Spider-sized), 384×384 for a 2×2 unit or building, 128×128 for a
drone-sized unit. Put the right size in `<canvas>` below. Pick the template that
matches how the unit moves and what rotates.

Unit with a rotating turret (ask for two images):
```
Asset: "<Name>", sprite canvas <canvas> px (<footprint> tiles at 192 px per tile). <shape, armor, locomotion, role>. One central <weapon> turret.

Output two separate images:
1) the <unit> WITHOUT the turret (empty circular mount in the center)
2) the turret alone, barrels pointing straight up, centered, including its own base plate
```

Legged unit (legs are split off in code; do NOT ask for separate legs):
add to the description: "legs spread evenly and symmetrical around the body, clearly separated from each other, each leg fully visible".

Hover/floating unit: add "floating hover unit, no legs or wheels, <n> engine exhausts at the rear shown as dark openings".

Building: add "square footprint filling the canvas, <n>×<n> tiles" (canvas <n>×192 px). Parts that animate
(radar dish, fan, crane arm) are requested as separate images like a turret.

## Follow-up fix prompts (send in the same ChatGPT chat)
Turret came out merged with the body:
```
Using the exact same style and design as the turret in the last image, output ONLY the turret as a separate image: centered, barrels pointing straight up, top-down view, no body, no legs, fully transparent background (or flat solid magenta #FF00FF if transparency isn't possible). Include the turret's own base plate but not the armor around it.
```
Side or 3/4 view: "Redraw exactly this design from a straight 90° top-down view, as if the camera is directly above it."
Barrels drawn as circles facing the camera: "Redraw the barrels lying flat, pointing toward the top of the image, as seen from directly above."
Glow halos or effects baked in: "Same image, but remove all glow, smoke, flashes and effects; lights as solid cyan blocks only."
Style drift (colors or outline weight off): re-send the full locked STYLE block plus "Match the style of this reference exactly" and have the user attach an approved sprite as reference.
