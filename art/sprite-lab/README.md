# Sprite lab

Makes and tests three-quarter sprites at 96 art px per tile, under [`art/SPRITE_ART_RULES.md`](../SPRITE_ART_RULES.md).

- **`specs/`**: one file per sprite, a 3D model built in code with `tools/sprite-kit.mjs`. `utility_spider.mjs` is the reference that every unit is compared with, and the example to copy.
- **`page.html`**: the template for the test page.
- **`out/<key>/`** (generated, not committed): `sheet.png`, `shadow.png`, `meta.json` and `index.html`, a self-contained test page you can open from disk or publish.

```
npm run sprite -- art/sprite-lab/specs/<key>.mjs             # render, check, write out/<key>/
npm run sprite -- art/sprite-lab/specs/<key>.mjs --capture   # also screenshot the page (Playwright)
```

In Claude Code, `/sprite <short description>` runs the whole process: it checks the idea against the lore and style, writes the spec, renders and checks it, and publishes the test page (see `.claude/skills/sprite/SKILL.md`).

The renderer is `tools/render3d.mjs`, shared with the Spider prototype in `art/proto-3q/`. The lab renders at 60% face height (`LIFT` in `tools/sprite-kit.mjs`) on the game's shared palette; the prototype uses 80% and its own palette.
