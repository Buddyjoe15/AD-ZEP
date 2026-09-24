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
tools/                build (single-file bundle) and static checks
tests/                headless simulation tests, browser tests, v0.5 save fixture
```

**The rule:** nothing in `core`, `data`, `world` or `sim` touches the DOM. `tools/check.mjs` enforces this. Because of it, the whole simulation runs in Node (`tests/harness.mjs`), and could later move into a Web Worker or onto a server.

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
| Determinism | Per-tick budgets count work, not milliseconds, so the same inputs give the same game on any machine (covered by a test). Keep it that way: never branch simulation logic on wall-clock time. |
| Group orders | Groups of `FLOWFIELD_MIN_GROUP` or more share one windowed Dijkstra field. Units smooth their paths incrementally while moving. |
| Neighbour queries | Dense typed-array grids (per-cell linked lists, rebuilt every tick): tile-sized cells for collision and picking, plus coarser per-team grids for target acquisition. Every unit object has the same fields in the same order (`GW.Units.blank()`), which keeps hot loops fast. |
| Lookups | Units are indexed by id (`GW.Units.get`). |
| Rendering | View culling, an LRU terrain chunk cache (built a few chunks per frame), a far-zoom overview image, batched team-coloured markers for ordinary units below `UNIT_LOD_ZOOM`, batched gunfire, and a minimap redrawn at 8 Hz. |

Browser benchmark (tick budget is 33 ms): 5,000 enemies swarming Vance take about 4.5 ms per tick. The Node test harness runs the simulation inside a `vm` sandbox that is several times slower than a browser, so its timings are only useful for comparing changes against each other. Past roughly 5,000 active units, the next steps would be moving the simulation into a Worker (it is already DOM-free) and switching to structure-of-arrays storage for positions.

## Saves

`GW.Save.serialize()` writes schema 2. `validate()` rejects malformed data before anything changes. `migrate()` upgrades schema 1 (v0.5) saves: unit types, cargo and storage fields, queues, and the old solid-chest bug. When you change the save format, bump `GW.SAVE_SCHEMA` and add a migration step.

Terrain is regenerated from the seed, and `terrainEdits` replays any changes made after generation. The map generator must keep its RNG call order: a terrain fingerprint test fails if generation changes.
