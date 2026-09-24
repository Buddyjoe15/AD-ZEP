# Abyssal Dawn: Zero Earth Protocol — v0.7

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
| Fabricate | Click the ship (or a Fabricator) · **Set rally point** in its window, then tap the map, sends new units there | Tap the ship |
| Build | Select a Utility Spider → Build | Same |
| Mine | Build a **Mine Building** on a Metal Mine deposit (it snaps on), then right-click the building with a Spider selected | Tap the building with a Spider selected |
| Follow | Select any friendly unit(s) → **Follow** → click the unit to follow · **Stop** cancels | Same, with taps |
| Inspect | Long-press anything | Long-press anything |
| Debug & Map Editor | **DEBUG** (top bar): add metal, godmode, instant build, and place anything. **MAP EDITOR** (shown in debug mode): paint terrain with a 1–9 tile brush, place structures, deposits and signals, erase objects, reset the map to grass | Same; two fingers still pan and zoom while editing |
| Load test | Click the red **HF** Hostile Fabricator in the testing zone (or place one from DEBUG): set spawn speed and count, choose *Gather at rally point* or *Advance on Vance*, **Move rally point** then tap the map, press Start | Same |
| Inventory, Expedition log | I / the Inventory button, or Expedition log; **×** (top left) closes them; drag a title bar to move the window | Same |
| Enemy info | Click a hostile unit: its HP, damage, range, speed and what it is doing | Tap a hostile unit |
| Other | H: centre on ship · I: inventory · Space: pause · Esc: cancel · F3: diagnostics | — |

Saves go to three browser slots (autosave every 60 s and on each transit). You can also export and import them as JSON from the Expedition log. Saves from v0.5 load and are migrated automatically. Before an older save is upgraded, its original is kept in browser storage as a backup. A save that can't be loaded is reported instead of loaded, and your current game is left as it was.

## Develop

```
npm test               # static checks + headless simulation and save-format tests (no dependencies)
npm run test:browser   # real-browser tests: desktop, touch, bundled build, 2,000-unit stress
npm run build          # dist/ad-ezp.html, one self-contained file
npm run save:snapshot  # after bumping GW.SAVE_SCHEMA: record the new save shape and fixture
```

Changing what a save contains? Follow the checklist in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#changing-the-save-format). The tests fail if the save format changes without a schema bump and migration.

The browser tests need Playwright and Chromium (`npm install --no-save playwright && npx playwright install chromium`). A global install also works. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can point at existing installations. When Playwright is missing, the tests are skipped. CI (`.github/workflows/test.yml`) runs everything and uploads the build and screenshots.

The code is split into a DOM-free **simulation** (`src/core`, `src/data`, `src/world`, `src/sim`) and a **presentation** layer (`src/render`, `src/ui`). The simulation runs headless in Node, which is how the tests drive whole expeditions in milliseconds.

**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** explains the structure and how to add units, items, structures, behaviours, resources and systems. Most new content is a data definition only.

## What changed in v0.7

- **Renamed** to *Abyssal Dawn: Zero Earth Protocol* (AD-ZEP). Saves keep their internal `AD-EZP` identifier, so existing saves still load.
- **Test map.** New games start on open grass with no terrain at all. The testing zone, ship, deposits and signals are placed as before. Add water, trees, mountains, paths and ruins with the Map Editor.
- **Map Editor** (debug mode). The **MAP EDITOR** button next to DEBUG opens a panel with three tabs:
  - *Terrain*: 12 terrain types with a 1×1 to 9×9 brush. Tap or drag to paint. Blocking terrain (water, trees, rock, ruin walls) never covers structures or resource nodes, and units standing there are moved aside.
  - *Objects*: every structure, both resource node types, and signals.
  - *Erase*: removes structures (not the ship), containers, nodes, signals and construction sites; construction sites are refunded.

  *Reset map to grass* clears everything. Edits are saved with the game.
- **Debug cheats.** Add 100, 1,000 or 10,000 metal. **Godmode** makes friendly units take no damage (structures still do). **Instant build** finishes construction and fabrication on the next tick. Cheats are session settings and are not saved.
- **Utility Spider** cargo holds 250 metal (was 600). Spiders in older saves are updated when loaded.
- **Hostile Fabricator waves and rally point.** Units now appear at a single spawn point on the side of the Fabricator facing its rally point, instead of in a ring around it. A new wave appears only once the previous one has moved off the spawn point; whatever accumulates meanwhile comes out in the next wave, up to 250 at once. *Hold position* is replaced by **Gather at rally point**: units walk to a red flag and wait there. **Move rally point**, then tap the map, moves the flag and every waiting unit. *Advance on Vance* works as before.
- **Inventory** has a **×** in its top-left corner to close it, and can be moved by dragging its title bar (it reopens where you left it).
- **Rally points for every unit producer.** The ship and Fabricators get **Set rally point** (then tap the map) and **Clear rally point** in their fabrication window; new units walk to a blue flag. The Hostile Fabricator keeps its red flag.
- **Expedition log** can be moved by dragging its title bar and closed with a **×** in the top-left, like the inventory.
- **Unit stats everywhere.** Every unit window shows HP and damage: per shot, per second, and range (e.g. `HP 100 / 100 · DMG 12 (16.7/s) · Range 205`). Groups show one line per unit type.
- **Enemy info.** Click or tap a hostile unit to see a card with its HP bar, damage, range, speed, where it came from and what it is doing (marching on Vance, attacking something, holding at a rally point). Your selection is not changed.
- **Save format: schema 5.** The ship and Fabricators save `rally` (a point, or null); `migrate_4_to_5` gives older saves none, so new units still wait beside the fabricator until you set one.
- **Save format: schema 4.** Spawners save their rally point (`spawner.rally`); `migrate_3_to_4` gives spawners in older saves the default one, five tiles south of the structure.
- **Save format: schema 3.** Saves record which map built their terrain (`map`: `grass` or `forest`). Saves from v0.5 and v0.6 are migrated as `forest` and keep their original forest terrain. The original is backed up before the upgrade, as before.

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
- **GPU unit rendering.** Units are drawn by WebGL2: each unit's art (including Vance's hover and the Spider's walk frames) is painted once into a sprite atlas, and every visible unit is then drawn in a single instanced call, with health bars in a second. Map, structures and overlays stay on Canvas 2D layers. Drawing 3,000 units went from 9–50 ms of CPU per frame to about 1.5 ms. Browsers without hardware-accelerated WebGL2 automatically use a Canvas 2D fallback that stamps the same sprites. `?renderer=2d` or `?renderer=gpu` forces either one, and F3 shows which is active.
- **Swarm AI for enemies.** Hostile Autonomous Machines no longer each run their own route search. They follow one shared flow field toward Vance, built in small fixed slices across ticks and weighted to spread crowds across gaps. When anything friendly comes within 10 tiles (crew, the ship or player structures), they break off and attack it, and resume the march when it's gone. Enemies boxed in near the front hold position instead of shoving. In a real browser, 5,000 swarming enemies take about 4.5 ms per tick (11 ms before), and zoomed-out views stay at 45–60 fps by drawing distant units as batched markers.
- **Deterministic simulation.** Background work (flow fields, route searches) is budgeted by amount of work, not time, so a given game plays out identically on any machine. A test checks this. The static check also rejects wall-clock reads and `Math.random` in the simulation. Armour wear, the last random choice, is now seeded.
- **Save discipline.** The save format is fingerprinted per schema version. There is one fixture save per version, migrations are a chain of named steps, and saves must round-trip exactly. Older browser saves are backed up before they are upgraded, and a save that fails to load leaves the current game running.
- **Expedition log** no longer has Explore with Vance, Assign mining or Survey drone.
- **Two ways to get metal.** *Scavenging Mines* are loose salvage a Spider collects itself, fast (20/s), until they run out. *Metal Mines* are 1×1 deposits with a near-endless reserve. Nothing happens until you build a 3×3 **Mine Building** centred over one. It then extracts slowly (2/s) into a 300-unit stockpile, and Spiders haul that stockpile to the ship. Each Earth has two Metal Mines near the ship, and the testing zone has one with a Mine Building already on it.
- **Follow** replaces "Follow Vance". Any friendly unit, Vance included, can follow any other friendly unit you tap. A dashed line shows who it is following.
- **Utility Spider storage** is 25 slots, shown in the selection panel. Older saves are upgraded when loaded.
- **Hostile Fabricator** (test tool): a spawner structure that produces Hostile Autonomous Machines at 1–1,000 per second, up to 20,000 in total. Spawned units hold position or hunt the crew. Its window shows live unit counts, on-screen count, fps and frame times. It is hidden from the Spider's build menu.
- **Now working:** the Repair Station heals nearby units, and the Sensor Station studies signals in range (its description already claimed this).
- **Removed dead features:** the XP/skill tree and coin currency. The v0.5 expedition layer had disabled both, and they no longer appear in the interface.

Not tested: physical mobile devices, Safari and Firefox.
