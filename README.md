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
| Mine | Build a **Resource Extractor** on a Metal Mine, Copper Deposit or Uranium Deposit (it snaps on), then right-click the building with a Spider selected | Tap the building with a Spider selected |
| Process | Click the **Ore Processor** and pick Steel, Electronics or Fuel Rods | Tap the Ore Processor |
| Follow | Select any friendly unit(s) → **Follow** → click the unit to follow · **Stop** cancels | Same, with taps |
| Inspect | Long-press anything | Long-press anything |
| Debug & Map Editor | **DEBUG** (top bar): add metal, godmode, instant build, fog of war and pixel-art toggles, unit counts and an inspector, and place anything. **MAP EDITOR** (shown in debug mode): paint terrain with a 1–9 tile brush, place structures, deposits and signals, erase objects, reset the map to grass, load the test map or a Woodlands map, and save named maps to reload later | Same; two fingers still pan and zoom while editing |
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
npm run sprites        # regenerate the pixel-art test set in art/pixel-test (sprites:preview also renders previews)
```

**Pixel-art sprites (test branch).** Utility Spiders, drones, Vance, the Repair Station and the grass terrain are drawn with top-down pixel art from [art/pixel-test](art/pixel-test/README.md). Add `?art=classic` to the URL, or use **DEBUG → Pixel-art sprites**, to switch back to the original art. See "Pixel art" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). New art follows [art/PIXEL_ART_RULES.md](art/PIXEL_ART_RULES.md).

Changing what a save contains? Follow the checklist in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#changing-the-save-format). The tests fail if the save format changes without a schema bump and migration.

The browser tests need Playwright and Chromium (`npm install --no-save playwright && npx playwright install chromium`). A global install also works. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can point at existing installations. When Playwright is missing, the tests are skipped. CI (`.github/workflows/test.yml`) runs everything and uploads the build and screenshots.

The code is split into a DOM-free **simulation** (`src/core`, `src/data`, `src/world`, `src/sim`) and a **presentation** layer (`src/render`, `src/ui`). The simulation runs headless in Node, which is how the tests drive whole expeditions in milliseconds.

**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** explains the structure and how to add units, items, structures, behaviours, resources and systems. Most new content is a data definition only.

## What changed in v0.7

- **Woodlands map** (new map type, `woodlands`). A generated 512 × 512 woodland over five height levels. Cliffs mark every step between levels and block movement; grassy slopes and carved steps cross them. Rivers only run downhill, so there is a waterfall wherever one drops a level. It also has a lake and creek, a sunken swamp, villages of standing and ruined buildings, logging camps with a log hut and sawhorse, 2–4 caves (rarely 7–8), boulders, thickets, mushrooms, alien plants and crystals, a geothermal field, and scattered ground detail such as pebbles, leaves and tracks. The ship lands on a flat clearing 48 tiles across. Height, cliff faces (one tile tall) and ground detail are drawn only; the game map stays flat.
- **Debug hover info.** While the Debug panel is open, hovering the mouse over a structure, unit, container, resource node, signal or terrain feature shows an info box: for terrain, its name, tile, whether it blocks movement, its height level, ground detail, the nearest named place and, for trees, their kind and the wind.
- **Sharper units when zoomed out (pixel art).** Units no longer blur below 1:1. On the GPU path the sprite texture's smaller copies are point-sampled rather than averaged, and the nearest pixel of the nearest copy is used; the Canvas 2D fallback's half- and quarter-size copies are no longer smoothed. With pixel art on, ordinary units now turn into team squares only below zoom 0.30 (was 0.45). Very far out a unit can lose a pixel here and there; that is the trade-off for staying sharp. Classic art keeps its smooth scaling.
- **Detailed terrain further out.** Terrain now stays detailed down to zoom 0.20 (was 0.30), 1.5× further out, using lower-resolution chunks (a third of full size, trees drawn in at rest) between 0.30 and 0.20, and on large screens where the view holds more than 64 full chunks. Below 0.20 the map image shows as before.
- **Woodlands pixel art (pilot).** With pixel art on, Woodlands maps draw grass, tall grass, water and deep water as pixel-art tiles (8 weighted variants each), shorelines with a muddy bank and foam, one-tile cliffs with a piece for each side that drops (south faces in detailed stonework: lit stone blocks, cracks, moss, hanging grass and loose stones at the foot, in 4 versions; ragged rock rims on the other sides), and trees as outlined canopy props with an engine shadow. Trees come in three kinds that grow in groves: round oaks, spiky dark pines (mostly on high ground) and light birches (mostly by water). **Wind:** trees have two motions, leaves rustling and the crown leaning downwind (east), and the weather sets both. Calm: leaves rustle, no tree leans. Small breeze (the default for testing): half the trees rustle and 25% lean a little. Breeze: most rustle, 60% lean a little. Strong wind and Storm: every tree rustles fast and leans further. Leaning trees are drawn every frame; rustling leaves are drawn over the cached terrain when zoomed in (0.5 and closer). Switch it in the Debug panel; it is a session setting and not saved. Everything else keeps its vector art for now, and the classic switch turns it all off. The palette grows from 37 to 48 colours (grass, leaf and water ramps). Saves are unchanged.
- **Map Editor: Maps tab.** Load the test map (open grass) or a Woodlands map from any seed under the game in progress. Units, structures and resources stay, with open ground cleared under them. **Save current map** keeps the map type, seed and edits under a name in this browser, to reload later. **Preview** (under the Woodlands seed) opens a page for that seed before anything is loaded: the whole map with its named places, a close view to drag and zoom, what the map is made of, its ground detail, and where its villages, waterfalls, caves and camps are. **Load this map** loads it from there. The terrain palette gains the 27 Woodlands terrain types.
- **Saves are unchanged (still schema 7).** A save records the map type (`map`) and seed as before, and a Woodlands map's terrain, heights and ground detail are rebuilt from them. `woodlands` is a new accepted value for `map`, and terrain edits can use the new terrain ids 12–38. Saved maps are kept apart from save slots.
- **Shield Projector** (3×3; 300 metal, 25 steel, 10 electronics): a limited energy field over friendly structures within 6 tiles.
  - Tap it and choose **Switch on**. While on, it draws 40 power and charges up to 2,500 (40/s, slower on a short grid).
  - The charge absorbs damage to covered structures until it runs out, then damage goes through again. It keeps its charge when switched off.
  - It's temporary protection for dangerous attacks, not a replacement for walls. A dashed dome shows the field and flashes when hit.
- **Defensive Sensor** (1×1; 90 metal, 3 electronics; draws 3 power):
  - Turrets now hit 75% of their shots; any turret within 6 tiles of a sensor hits every shot.
  - It sees 12 tiles through fog and warns when enemies come within that range, e.g. "Sensor: 12 hostiles approaching from the south", at most every 30 s.
- **Save format: schema 7.** Shield Projectors save their switch (`shieldOn`) and charge (`shield`). `migrate_6_to_7` gives any projector without them a switched-off, empty field, which is how a new one starts. Turret aim, sensor warnings and gate states are not saved.
- **Defences.** The Wall is replaced by a set of defensive structures. All of them are in the Utility Spider's build menu and the testing zone; testing-zone turrets hold fire.

  | Structure | Size | Cost | What it does |
  |---|---|---|---|
  | Defensive Wall | 1×1 | 60 metal | Blocks enemies and channels them into controlled approaches. 600 HP; friendly units beside it take 20% less damage (as the old Wall). Sections join up visually. |
  | Reinforced Wall | 1×1 | 40 metal + 12 steel | 1,600 HP and takes 35% less damage. 25% cover for friendly units beside it. |
  | Gate | 2×1 | 80 metal | Always closed. Opens when a friendly unit is within 2 tiles, and shuts while hostiles are within 6. Enemies can never pass. |
  | Sentry Turret | 1×1 | 120 metal | Early perimeter defence: 9 damage twice a second at ground targets within 260. |
  | Heavy Turret | 2×2 | 200 metal + 20 steel | 70 damage every 3 s with a small blast, at ground targets within 340. |
  | Anti-Air Turret | 1×1 | 100 metal + 2 electronics | Fast fire at flying targets within 400 only. |
  | Missile Battery | 2×2 | 180 metal + 15 steel + 4 electronics | 50 damage with a wide blast every 4 s, ground or air, from 160 out to 720. Uses one **Missile** per shot. |

  - **Missiles** are made at a Fabricator: 2 steel + 1 electronics → 4 missiles in 10 s.
  - **Flying units:** Survey and Security Drones are now flying units, and a new **Hostile Drone** (a flying enemy, placeable from DEBUG) is only hit by anti-air and missiles. Flying units still move along the ground paths for now.
  - **Save format: schema 6.** `migrate_5_to_6` turns Walls and wall construction sites into Defensive Walls, with the same health, size and cover. Gate states and turret cooldowns are recalculated, never saved.
- **Fog of war.** Friendly units reveal a circle of their sight, structures 5 tiles and construction sites 3. Ground you've seen stays dimmed with its terrain and structures; ground you haven't seen is dark. Enemies show only inside your crew's sight, and hidden enemies can't be clicked. The minimap follows the fog. It's display only: enemies still fight as before, and the explored area isn't saved but rebuilds from what the crew can see after loading. `?fog=0` turns it off.
- **Debug panel additions.**
  - *Display → Fog of war* turns fog on or off.
  - *Units* lists live counts by team and type. Tap a row to jump to the next unit of that type.
  - *Inspect* shows any unit's full state when tapped, even under fog: ID, HP, tile, heading, sight, weapon, command, target, path, AI mode, cargo and queue.
- **Wind Turbine** (2×2, 90 metal): supplies 6 power in a steady breeze, scaled by the Earth's wind. Temperate 100%, Frozen 180% (polar storms), Silent 5% (stagnant air), Irradiated 130%. A test turbine stands north of the ship beside the Solar Array. The Expedition log shows each Earth's wind rating.
- **Resource Extractor** replaces the Mine Building. It's the single 3×3 automated mining structure: placed over any deposit, it mines whatever is underneath and shows the material's name and colour. Existing saves keep their mines, which are now Resource Extractors.
- **Electricity and the Solar Array.** Power is a rate shared by all your structures (no wires). The ship's Warp Drive always supplies 25.
  - **Solar Array** (3×2, 60 metal): supplies up to 8, scaled by the Earth's solar efficiency. Temperate 100%, Frozen 60%, Silent 125%, Irradiated 40%. The Expedition log shows the current Earth's rating.
  - **Structures that use power:** the Fabricator draws 10 only while producing, the Ore Processor 15 only while processing, and a Mine Building 5 while extracting.
  - **When demand exceeds supply,** all of them slow to the same fraction (supply ÷ demand) instead of stopping. The ship's own fabrication runs on the Warp Drive and never slows.
  - **Top bar:** a ϟ pill shows supply/demand and turns red when short.
  - A test Solar Array stands north of the ship. Saves are unchanged: power is recalculated from your structures.
- **Ore Processor and new resources.** Copper Deposits and Uranium Deposits are mined like Metal Mines: build a Mine Building on one and haul with Spiders. Uranium extracts at half the rate. Each Earth has one of each, further from the ship than the metal. A new 3×3 structure, the **Ore Processor** (250 metal), turns raw material into construction resources. Tap it and pick what to make:
  - **Steel**: 2 metal → 1 steel, 5 s.
  - **Electronics**: 6 copper → 1 electronics, 12 s.
  - **Fuel Rods**: 6 uranium → 6 fuel rods, 30 s.

  Inputs come from the stockpile when queued (up to 10), and products go back to it. The top bar shows each resource once you have some. Transit carries up to 300 copper, 150 uranium, 150 steel, 50 electronics and 60 fuel rods. Saves are unchanged. Existing saves get the new deposits on their next Earth.
- **Pixel art (test).** Spiders, drones, Vance, the Repair Station and the grass terrain now use top-down pixel sprites with 8 facings and shadows drawn by the engine. `?art=classic` or the Debug panel switches back to the original art. This is presentation only; saves are unchanged.
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
