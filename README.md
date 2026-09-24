# Abyssal Dawn: Earth Zero Protocol — v0.6

A browser expedition strategy game. Commander Elias Vance and the UES Aster Vale land on an unfamiliar Earth. You study signals, mine metal with Utility Spiders, fabricate drones, build field structures, and survive hostile machines while the drive stabilises. Then you recall the crew and transit to the next Earth.

## Play

Open `index.html` in a browser. It runs straight from disk with no build step and no server.

For a single file you can share or play offline, run `npm run build` and open `dist/ad-ezp.html`.

Choose **New Game → Save Slot → Launch expedition**. The same seed always generates the same terrain.

| Input | Desktop | Touch |
|---|---|---|
| Select | Click a unit, drag a box, shift-click to add | Tap a unit; hold on empty ground, then drag, to box-select |
| Move | Right-click terrain | Tap terrain |
| Formation | Formation buttons in the selection panel | Hold on the ground with a group selected, drag to rotate, release |
| Camera | WASD / arrows, mouse wheel, minimap | Drag empty ground, pinch |
| Fabricate | Click the ship (or a Fabricator) | Tap the ship |
| Build | Select a Utility Spider → Build | Same |
| Mine | Build a **Mine Building** on a Metal Mine deposit (it snaps on), then right-click the building with a Spider selected | Tap the building with a Spider selected |
| Follow | Select any friendly unit(s) → **Follow** → click the unit to follow · **Stop** cancels | Same, with taps |
| Inspect | Long-press anything | Long-press anything |
| Load test | Click the red **HF** Hostile Fabricator in the testing zone (or place one from DEBUG): set spawn speed and count, choose hold or hunt, press Start | Same |
| Other | H: centre on ship · I: inventory · Space: pause · Esc: cancel · F3: diagnostics | — |

Saves go to three browser slots (autosave every 60 s and on each transit). You can also export and import them as JSON from the Expedition log. Saves from v0.5 load and are migrated automatically.

## Develop

```
npm test               # static checks + 20 headless simulation tests (no dependencies)
npm run test:browser   # real-browser tests: desktop, touch, bundled build, 2,000-unit stress
npm run build          # dist/ad-ezp.html, one self-contained file
```

The browser tests need Playwright and Chromium (`npm install --no-save playwright && npx playwright install chromium`). A global install also works. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can point at existing installations. When Playwright is missing, the tests are skipped. CI (`.github/workflows/test.yml`) runs everything and uploads the build and screenshots.

The code is split into a DOM-free **simulation** (`src/core`, `src/data`, `src/world`, `src/sim`) and a **presentation** layer (`src/render`, `src/ui`). The simulation runs headless in Node, which is how the tests drive whole expeditions in milliseconds.

**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** explains the structure and how to add units, items, structures, behaviours, resources and systems. Most new content is a data definition only.

## What changed in v0.6

- **Restructured.** The 245 KB single-file build and its monkey-patching extension scripts are replaced by 41 focused modules. `index.html` is now the real source entry point. The old `build.py` depended on a source folder missing from the repository, and the old test scripts used hard-coded machine paths; both are removed.
- **Scales to thousands of units.** Measured headless: 2,000 units in active combat take about 11 ms per 33 ms tick (about 20 ms before the final optimisations), and 3,000 idle units about 12 ms. In the browser, 2,000 units render at about 30 fps under headless software rendering.
  - **Grid:** tile passability is an O(1) lookup, where the old code scanned every building on each check.
  - **Spatial hashes:** per-team hashes, so target searches only look at opposing teams.
  - **Pathfinding:** A* reuses preallocated arrays instead of allocating 262,144-element arrays per search. Unreachable goals are rejected using connected regions. Blocked targets fall back to the nearest reachable tile. Group moves share one flow field. AI route requests go through a time-budgeted queue.
- **Data-driven content.** Units choose behaviour by capability, not by type name. Structures get their function from a behaviour list. Fabrication recipes, resources, climates and expedition balance are all data.
- **Economy.** Every resource change goes through one API with a rolling income/expense ledger, shown in the Game menu and the Expedition log.
- **Fixes:**
  - A construction site whose builder died was never cleared, so departure stayed blocked for the rest of the game. It is now refunded.
  - A Spider-built chest used to become an invisible solid block. It is now a container.
  - A construction approach tile diagonal to a 2×2 structure could leave the builder retrying forever.
  - Terrain edits (landing zone, testing zone) are now saved, so the ground no longer reverts on load.
  - The testing-zone Sensor Station no longer collects a generated signal for free.
  - Removing a backpack can no longer strand items beyond your capacity.
  - Minimap colours now match the terrain.
- **Swarm AI for enemies.** Hostile Autonomous Machines no longer each run their own route search. They follow one shared flow field toward Vance, built in small fixed slices across ticks and weighted to spread crowds across gaps. When anything friendly comes within 10 tiles (crew, the ship or player structures), they break off and attack it, and resume the march when it's gone. Enemies boxed in near the front hold position instead of shoving. In a real browser, 5,000 swarming enemies take about 4.5 ms per tick (11 ms before), and zoomed-out views stay at 45–60 fps by drawing distant units as batched markers.
- **Deterministic simulation.** Background work (flow fields, route searches) is budgeted by amount of work, not time, so a given game plays out identically on any machine. A test checks this.
- **Expedition log** no longer has Explore with Vance, Assign mining or Survey drone.
- **Two ways to get metal.** *Scavenging Mines* are loose salvage a Spider collects itself, fast (20/s), until they run out. *Metal Mines* are 1×1 deposits with a near-endless reserve. Nothing happens until you build a 3×3 **Mine Building** centred over one. It then extracts slowly (2/s) into a 300-unit stockpile, and Spiders haul that stockpile to the ship. Each Earth has two Metal Mines near the ship, and the testing zone has one with a Mine Building already on it.
- **Follow** replaces "Follow Vance". Any friendly unit, Vance included, can follow any other friendly unit you tap. A dashed line shows who it is following.
- **Utility Spider storage** is 25 slots, shown in the selection panel. Older saves are upgraded when loaded.
- **Hostile Fabricator** (test tool): a spawner structure that produces Hostile Autonomous Machines at 1–1,000 per second, up to 20,000 in total. Spawned units hold position or hunt the crew. Its window shows live unit counts, on-screen count, fps and frame times. It is hidden from the Spider's build menu.
- **Now working:** the Repair Station heals nearby units, and the Sensor Station studies signals in range (its description already claimed this).
- **Removed dead features:** the XP/skill tree and coin currency. The v0.5 expedition layer had disabled both, and they no longer appear in the interface.

Not tested: physical mobile devices, Safari and Firefox.
