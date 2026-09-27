# Prompt: make a test sprite

In a Claude Code session on this repository, type `/sprite <description>`. The skill is `.claude/skills/sprite/SKILL.md`, and it loads when the session starts.

If `/sprite` isn't available, paste the prompt below into a Claude Code session on this repository and describe the sprite on its last line. The session needs the repository checked out, because the lab runs its tools (`npm run sprite`). A chat without the repository can't run it.

```
You're working in the AD-ZEP repo (Buddyjoe15/AD-ZEP). Use a branch that has the
sprite lab (art/sprite-lab/ and tools/sprite-lab.mjs). Make a test sprite, following
.claude/skills/sprite/SKILL.md step by step:

1. Read art/PIXEL_ART_RULES.md in full (section 5 covers the sprite lab and the lore and
   style check), docs/DESIGN.md, the first paragraph of README.md, any matching
   definition in src/data/, and art/sprite-lab/specs/example_spider.mjs.
2. Fit the idea to AD-ZEP. Work out:
   - category, faction, team colour, frame, elevation, and animations or states;
   - lore fit and style fit;
   - the silhouette cue that sets it apart from the Utility Spider, drones and Vance;
   - anything you changed from my description.
   Don't ask me about gaps: use the rules' defaults and list them as assumptions. Ask
   only if the idea conflicts with the lore, is organic or Omega, or can't fit any frame.
3. Write art/sprite-lab/specs/<key>.mjs as a 3D model built with tools/sprite-kit.mjs:
   straight top-down, 96 × 96 art px per tile, and the shared palette only.
4. Run: npm run sprite -- art/sprite-lab/specs/<key>.mjs --capture
   Fix every FAIL. Look once at sheet.png and preview.png, fix what you see, and
   render again.
5. Publish art/sprite-lab/out/<key>/index.html as an artifact.

Reply with:
- the link;
- two or three lines on how it fits the lore and style;
- what you changed or assumed;
- any warnings, each with your recommendation.
Don't commit unless I ask.

The sprite: <describe it here>
```
