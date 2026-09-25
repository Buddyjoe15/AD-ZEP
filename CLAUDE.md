# CLAUDE.md

Abyssal Dawn: Zero Earth Protocol, a browser strategy game. Read `README.md` and `docs/ARCHITECTURE.md` before larger changes.

## Project constraints

- Plain `<script>` tags in `index.html` define the load order. Do not use ES modules in `src/`.
- `index.html` must open directly from disk (`file://`) with no server or build step.
- Add no dependencies. `npm test` and `npm run build` must keep working.
- The simulation layers (`src/core`, `src/data`, `src/world`, `src/sim`) never touch the DOM.
- Commands: `npm test` (static checks + headless tests), `npm run test:browser` (Playwright, if installed), `npm run build`, `npm run save:snapshot`.
- New pixel art follows `art/PIXEL_ART_RULES.md` (scale, palette, facings, shadows, and the questions to ask before drawing).

## Save format rules

The save system is `GW.Save` in `src/sim/save.js`. The current schema is `GW.SAVE_SCHEMA` in `src/core/namespace.js` (now 6). Its tests are in `tests/save.test.mjs`, with helpers in `tests/save-support.mjs`. Full background: "Saves" in `docs/ARCHITECTURE.md`.

### When a change affects saves

Any change that adds, removes, renames, or changes the type or meaning of saved data is a save format change. That includes:
- new unit, structure, item or resource fields that must persist;
- new systems with state;
- changes to fabrication queues, inventories, containers, resource nodes or terrain edits.

`GW.Save.serialize()` copies whole unit, building, container and node objects. Adding a field to `GW.Units.blank()`, `GW.Buildings.add()` or `GW.Containers.create()` is therefore a save format change, even if you did not mean it to be. `npm test` catches it: the fingerprint test fails with "Save format changed. Bump GW.SAVE_SCHEMA and add a migration."

### How to change the save format

N is the current `GW.SAVE_SCHEMA`.
1. Before changing any code, make sure `tests/fixtures/save-schema-N.json` exists. If it doesn't, run `npm run save:snapshot` now, while the code still writes schema N, and commit the result.
2. Bump `GW.SAVE_SCHEMA` to N+1 in `src/core/namespace.js`.
3. Add a new named step `migrate_N_to_N+1(d)` in `src/sim/save.js` and register it in `MIGRATIONS` as `{ N: migrate_N_to_N+1 }`. Start from `G.copy(d)`, never mutate the input, and return the result with `schema: N + 1`. Never edit an existing migration step; they are permanent history.
4. Give every new field a sensible default in the migration, so old saves load with correct behaviour.
5. Update `validate()` in `src/sim/save.js` to accept the new shape and reject malformed data. Also update `apply()` / `GW.Units.adopt()` / `GW.Buildings.adopt()` if the field must be rebuilt on load.
6. Run `npm run save:snapshot`. It writes `tests/save-shapes/schema-N+1.json` (the fingerprint) and `tests/fixtures/save-schema-N+1.json`. If the new data doesn't show up in the fingerprint, extend `representativeGame()` in `tests/save-support.mjs` so it does, and run the snapshot again with `-- --force`. Never use `--force` on a schema players already have saves in.
7. Run `npm test`. The fingerprint, migration chain, fixture and round-trip tests must all pass, along with `tools/check.mjs`. Add a test for any behaviour the migration must preserve.
8. Add a line to the "What changed" section of `README.md` describing the save change.

### What not to save

Do not save data that can be rebuilt. Terrain is regenerated from the seed and the map type (`map`), and only `terrainEdits` are saved (Map Editor strokes included). Never save:
- the grid, occupancy, region labels or the spatial and team grids;
- `PathService` queues, flow fields, the swarm `TargetField` or other per-system caches;
- shots, selection, metrics, the sprite atlas, or anything in `src/render` and `src/ui`.

Save only the simulation state needed to resume the game. A unit's current `path` waypoints are unit state and are saved; `pathPending` is always saved as `false`. Camera and formation are the only presentation fields in a save; don't add more.

### Determinism

Simulation code (`src/core`, `src/data`, `src/world`, `src/sim`) must never use `Date.now`, `performance.now`, `new Date` or `Math.random`; `tools/check.mjs` fails if it does.
- For randomness, use the seeded `GW.RNG(seed)` or `GW.hashRandom(...ints)`.
- Wall-clock time is allowed only through `GW.Clock`, and only for diagnostics timings and the `savedAt` stamp, never for game logic.
- Budget background work by amount of work, never by milliseconds.

Never change the order of RNG calls in the forest generator (`src/world/mapgen.js`), and never change what an existing map type in `GW.MapGen.types` generates; add a new type instead. The terrain fingerprint test in `tests/sim.test.mjs` depends on it, and existing saves regenerate their terrain from it.

### Never

- Never weaken, skip or delete a save test to make a change pass.
- Never delete an old fixture in `tests/fixtures/`. Never regenerate an old-schema fixture either.
- Never change a fingerprint in `tests/save-shapes/` without also bumping `GW.SAVE_SCHEMA`, and never edit one by hand.
- Never load a save that fails migration or validation. `GW.Save.restore()` must validate before it changes any state. `GW.Save.load()` must show an error, keep the current game and keep the backup (`GW.Save.backup(slot, schema)`).

### Adding new content

New units, items, structures, resources and behaviours are data definitions in `src/data/` (see "Adding content" in `docs/ARCHITECTURE.md`). A new definition that only uses existing saved fields needs no schema change: definitions are looked up by key, so balance and text changes apply to existing saves. If it needs new persistent state, follow "How to change the save format" above.
