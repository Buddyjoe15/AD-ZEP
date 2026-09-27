# Sprite lab

Makes and tests pixel-art sprites from 3D models built in code, straight top-down at 96 art px per tile, under [`art/PIXEL_ART_RULES.md`](../PIXEL_ART_RULES.md) (section 5).

- **`specs/`**: one file per sprite, a model built with `tools/sprite-kit.mjs`. `example_spider.mjs` is the worked example to copy.
- **`page.html`**: the template for the test page.
- **`out/<key>/`** (generated, not committed): `sheet.png`, `meta.json` and `index.html`, a self-contained test page you can open from disk or publish.

```
npm run sprite -- art/sprite-lab/specs/<key>.mjs             # render, check, write out/<key>/
npm run sprite -- art/sprite-lab/specs/<key>.mjs --capture   # also screenshot the page (Playwright)
```

In Claude Code, `/sprite <short description>` runs the whole process: it checks the idea against the lore and style, writes the spec, renders and checks it, and publishes the test page (see `.claude/skills/sprite/SKILL.md`).

The renderer is `tools/render3d.mjs`, shared with the three-quarter Spider prototype in `art/proto-3q/`. The lab renders with no height shift (`LIFT = 0` in the kit), so the view is straight top-down, on the game's shared palette.
