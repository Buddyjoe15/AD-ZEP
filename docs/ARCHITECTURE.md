# Architecture

## Layers

```
index.html            entry point; the <script> order below is the load order
src/core/             namespace, config, events, registries, system/scene managers, state
src/data/             content definitions (units, items, buildables, resources, terrain, recipes, climates, rules)
src/world/            grid + occupancy + regions, seeded map generator, spatial hash, pathfinding
src/sim/              gameplay systems: units, economy, buildings, inventory, orders/AI, movement,
                      combat, gathering, construction, fabrication, expedition, scenario, saves
src/render/           canvas art registry, terrain chunk cache, renderer + minimap
src/ui/               HUD, inventory, build mode, expedition panels, debug catalog, input, menus
src/main.js           boot + fixed-timestep loop
tools/                build (single-file bundle), static checks, save-format snapshot
tests/                headless simulation and save tests, browser tests, one fixture save per schema
```

**The rule:** nothing in `core`, `data`, `world` or `sim` touches the DOM, reads the wall clock (`Date.now`, `performance.now`, `new Date`) or calls `Math.random`. `tools/check.mjs` enforces both. Randomness comes from the seeded `GW.RNG` or `GW.hashRandom`. Diagnostics timings and save timestamps go through `GW.Clock`, which `src/main.js` connects to the real clock and which reads zero headless. Because of it, the whole simulation runs in Node (`tests/harness.mjs`), and could later move into a Web Worker or onto a server.

The simulation reports changes to the interface through `GW.Events` (`notify`, `inventory:changed`, `container:opened`, `expedition:transit`, `game:defeat`, …). The UI listens to these events and never mutates state behind the simulation's back. Player commands go through simulation APIs (`GW.Orders`, `GW.Construction`, `GW.Fabrication`, `GW.Expedition.action`).

## Simulation loop

`GW.Sim.step(dt)` runs the systems in `GW.SIM_ORDER` at a fixed 30 Hz:

```
time → containers → economy → commands (AI) → gather → construction → fabrication
     → paths (queued route searches) → movement (+ spatial rebuild, separation)
     → buildings (behaviours) → combat → expedition → cleanup → rules
```

To add a system, register it and put its name in the order:

```js
GW.SystemManager.register('weather', { update(dt){ /* … */ }, reset(){ /* new world */ } });
GW.SIM_ORDER.splice(GW.SIM_ORDER.indexOf('combat'), 0, 'weather');
```

Per-system timings appear in the F3 diagnostics panel.

## Adding content

Every definition is validated when it is registered. Cross-references (recipe → unit, cost → resource) are checked by `GW.Defs.verify()` at boot and in `npm test`. Unknown keys fail loudly.

**A unit** (`src/data/units.js`). Behaviour comes from `capabilities`: `fight`, `survey`, `build`, `gather`, `carry`, `storage`, `fabricate`, `dropoff`, `command`. Set `ai: 'hunter'` (or add a function to `GW.AI`) for autonomous units. `visual` picks the art, and anything without art gets a generic marker.

```js
GW.Defs.units.define('heavy_drone', {
  name: 'Heavy Drone', hp: 400, speed: 90, radius: 14, range: 240, damage: 30, reload: 1.4, sight: 700,
  capabilities: ['fight'], visual: 'rifle'
});
GW.Defs.recipes.define('heavy_drone', { name: 'Heavy Drone', unit: 'heavy_drone', cost: { metal: 300 }, time: 18, blurb: 'Slow, armoured gun platform' });
```

**An item** (`src/data/items.js`). Equipment has a `slot` and `effects` (`damageReduction`, `inventoryBonus`, …). Materials set `maxStack` and stack automatically.

**A structure** (`src/data/buildables.js`). Its function comes from `behaviors`, each handled by `GW.Behaviors.register(type, { update(building, cfg, dt) })`. Built-in behaviours are `defenseAura`, `repairAura`, `studySignals` and `spawner` (with `spawner: { unit, rate, amount, hold }`; see the Hostile Fabricator). `debugOnly: true` keeps a structure out of the Spider's build menu. Add `fabricator: { queueMax }` to give it a production queue, or `container: { capacity }` to make it storage.

```js
GW.Behaviors.register('produce', {
  update(b, cfg, dt){
    b.timer = (b.timer || 0) + dt;
    if (b.timer >= cfg.interval){ b.timer = 0; GW.Economy.add(cfg.resource, cfg.amount, 'production'); }
  }
});
GW.Defs.buildables.define('refinery', {
  name: 'Refinery', w: 2, h: 2, hp: 600, buildTime: 12, cost: { metal: 250 }, symbol: 'RF', color: '#c9b27a',
  behaviors: [{ type: 'produce', resource: 'metal', amount: 5, interval: 10 }],
  description: 'Refines 5 metal every 10 seconds.'
});
```

**A resource** (`src/data/resources.js`) appears in the resource bar, the ledger and cost checks automatically. `transitCap` limits how much of it crosses to the next Earth.

**Resource nodes, climates and expedition balance** live in `src/data/world.js` (`GW.EXPEDITION_RULES`). A node is either `kind: 'scavenge'` (collected directly by gatherers) or `kind: 'deposit'` (a 1×1 tile that needs its `building` built centred on it). Add a new mine type by defining a deposit node, then either reuse `mine_building` or add a buildable with `placeOnNode: 'deposit'`, an odd footprint and an `extractor` behaviour.

The debug catalog (DEBUG button) lists every registered structure, item, unit and node, so new content can be placed and inspected immediately.

## Scaling notes

| Concern | Approach |
|---|---|
| Passability | `Grid.passable()` is two array reads (terrain lookup table plus structure occupancy counter). Structures stamp occupancy when placed or removed. |
| Reachability | 4-connected region labels, rebuilt lazily after occupancy changes. Unreachable targets are retargeted to the nearest reachable tile without running A*. |
| Route search | A* with typed arrays reused through generation stamps, an allocation-free index heap, a node budget with partial paths, and line-of-sight smoothing. |
| Many requests | `PathService.request()` queues searches; `paths` serves them within `PATH_NODE_BUDGET` A* expansions / `PATH_MAX_PER_TICK` per tick. A newer request replaces an older one for the same unit. |
| Swarms | `ai: 'swarm'` units share one `TargetField` toward Vance: a Dijkstra field over the swarm's bounding window, built `buildTiles` tiles per tick and refreshed periodically with a small per-unit crowd cost. Units steer straight at the farthest field point in line of sight a few tiles ahead, and engage anything within `aggroTiles`. Tuning lives in `GW.SWARM_RULES`. |
| Determinism | Per-tick budgets count work, not milliseconds, so the same inputs give the same game on any machine (covered by a test). Keep it that way: never branch simulation logic on wall-clock time. `tools/check.mjs` rejects wall-clock and `Math.random` calls in the simulation layers. |
| Group orders | Groups of `FLOWFIELD_MIN_GROUP` or more share one windowed Dijkstra field. Units smooth their paths incrementally while moving. |
| Neighbour queries | Dense typed-array grids (per-cell linked lists, rebuilt every tick): tile-sized cells for collision and picking, plus coarser per-team grids for target acquisition. Every unit object has the same fields in the same order (`GW.Units.blank()`), which keeps hot loops fast. |
| Lookups | Units are indexed by id (`GW.Units.get`). |
| Rendering | Three stacked canvases: map and structures (Canvas 2D), units (WebGL2, `src/render/gpu.js`) and overlays such as selection, routes, beams, gunfire and previews (Canvas 2D). Unit art comes from the shared sprite atlas (`src/render/sprites.js`), painted once per visual, team and animation frame from `visuals.js` with tight per-visual bounds. The GPU draws all visible units in one instanced call. Without hardware WebGL2 (`failIfMajorPerformanceCaveat`), the Canvas 2D fallback stamps the same sprites, using pre-shrunk atlas levels, and switches to batched markers below `UNIT_LOD_ZOOM`. Sprites are stored at 4 px per world px. Terrain uses an LRU chunk cache (chunks are repainted at `TERRAIN_RES`, 2 px per world px, once zoomed in past 1:1, and the cache is budgeted in 1× chunks) plus a far-zoom overview image, and the minimap redraws at 8 Hz. |

Browser benchmarks (tick budget is 33 ms): 5,000 enemies swarming Vance take about 4.5 ms per tick, 10,000 about 8.5 ms, and 20,000 about 17 ms, rising as they pack tightly. With GPU rendering, simulation rather than drawing is the limit past roughly 20,000 units. The Node test harness runs the simulation inside a `vm` sandbox that is several times slower than a browser, so its timings are only useful for comparing changes against each other. Past roughly 5,000 active units, the next steps would be moving the simulation into a Worker (it is already DOM-free) and switching to structure-of-arrays storage for positions.

## Saves

AI contributors: the binding rules are under "Save format rules" in [`CLAUDE.md`](../CLAUDE.md) (the same text is in [`AGENTS.md`](../AGENTS.md)).

`GW.Save.serialize()` writes schema `GW.SAVE_SCHEMA` (currently 2). `migrate()` upgrades older saves one step at a time through named functions in `src/sim/save.js` (`migrate_1_to_2`, then `migrate_2_to_3`, and so on), registered in `MIGRATIONS` by the schema they start from. `validate()` then rejects malformed data before anything changes. If rebuilding the world still fails part way, `restore()` rolls back to the game that was running.

Terrain is regenerated from the seed, and `terrainEdits` replays any changes made after generation. The map generator must keep its RNG call order: a terrain fingerprint test fails if generation changes.

`tests/save.test.mjs` guards the format:

- **Shape fingerprint.** The keys and value types of a representative game's save (`tests/save-support.mjs`), recursively, with array elements merged and optional keys marked, must match `tests/save-shapes/schema-N.json`. Otherwise it fails with "Save format changed. Bump GW.SAVE_SCHEMA and add a migration." and lists the changed paths.
- **Fixtures.** `tests/fixtures/save-schema-N.json` holds one save per schema. Extra saves can sit alongside as `save-schema-N-label.json`, like the early-v0.6 schema 2 save. Every fixture must migrate, validate, load and play 5 seconds. Each older schema must have its fixture and its migration step.
- **Round trip.** Serialize, load and serialize again must give an identical JSON string.
- **Backups.** Before a browser slot holding an older save is migrated, the untouched text is stored under `ad-ezp-v01-slot-<n>-backup-schema-<old>` (`GW.Save.backup(slot, schema)`). A slot that fails to load is kept the same way. The current game stays loaded, a message says why, and the menus mark the slot as unreadable instead of empty.

### Changing the save format

Any change to what `serialize()` writes counts: a new, removed, renamed or retyped field, or a field that becomes optional.

1. Make the change, then run `npm test`. The fingerprint test fails and lists the changed paths. If it doesn't fail, extend `representativeGame()` in `tests/save-support.mjs` so the new data appears in the save, and run it again.
2. Bump `GW.SAVE_SCHEMA` in `src/core/namespace.js` (N → N+1). Never edit `tests/save-shapes/schema-N.json` to make the test pass; that file describes saves players already have.
3. Write `migrate_N_to_N+1(d)` in `src/sim/save.js` and add it to `MIGRATIONS` as `{ N: migrate_N_to_N+1 }`. It must return a new object with `schema: N + 1`, copying rather than mutating its input (start with `G.copy(d)`), and fill every new field with a sensible default. Leave the earlier steps alone.
4. Update `validate()` for the new shape, and `restore()` / `adopt()` if the field needs rebuilding on load.
5. Run `npm run save:snapshot`. It writes `tests/save-shapes/schema-N+1.json` and `tests/fixtures/save-schema-N+1.json`. The existing `save-schema-N.json` fixture stays: it is the proof that schema N saves still load.
6. Run `npm test` until it passes: fingerprint, migration chain, every fixture, round trip. Add a test for any behaviour the migration has to preserve.
7. Keep the simulation deterministic. Use `GW.RNG` / `GW.hashRandom`, never `Math.random`, and never read the wall clock in `src/core`, `src/data`, `src/world` or `src/sim`.
8. Mention the migration in the README's changelog.
