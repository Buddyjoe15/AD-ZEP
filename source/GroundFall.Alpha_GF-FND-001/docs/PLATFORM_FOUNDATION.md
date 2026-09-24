# GroundFall.Alpha Platform Foundation — GF-FND-001

## Baseline

Human-approved source identity is `GF-A-P01-R2`, artifact `Groundfall_Master_v0_7_0.html` v0.7.0, SHA-256 `5b05ff60123caa372ce05625c0716ebe90bfcfe4a7cfece9ac829d67317f299f`.

The local Git baseline commit is a development convenience derived from those exact bytes. The checksum establishes byte identity; the Git commit does not create or replace Human approval.

## Preserved current architecture

GF-FND-001 keeps the game in one standalone HTML file because a safe harness does not require a behavioral extraction. Platform ownership directories are established for future work without moving specialist logic now.

Observed v0.7.0 bootstrap sequence:

1. `G.Renderer.init()`
2. `G.Input.init()`
3. `G.UI.init()`
4. `G.MainMenu.init()`
5. `G.SystemManager.initAll()`
6. `G.reset()`
7. switch to `mainMenu`
8. start `requestAnimationFrame(frame)`

Observed fixed-step frame behavior:

- `FIXED_DT = 1/30` second.
- Elapsed wall time is clamped by `MAX_FRAME = 0.25` second.
- An accumulator executes at most four fixed simulation updates per animation frame.
- If four steps are consumed and backlog remains, the remaining accumulated backlog is discarded.
- Scene rendering occurs after the fixed-step loop.
- `visibilitychange` sets `clockReset`, which prevents a large catch-up delta when the page becomes active again. It does not itself change the pause state.

Observed gameplay system update order, unchanged by this task:

`time → input → containers → economy → spatial → commands → scavenge → movement → construction → defense → combat → cleanup → rules`

Any proposed reordering requires coordination; GF-FND-001 does not silently adopt a new phase order.

## Rendering boundary

Gameplay scene rendering calls `G.Renderer.draw()` and `G.UI.update()` after simulation stepping. No scheduler update is intentionally invoked from the render path. The browser smoke test additionally checks that repeated render calls while simulation is paused do not advance `G.State.time`.

## Coordinate terminology

- **Screen coordinates:** browser viewport coordinates from `PointerEvent.clientX/clientY`, measured in CSS pixels.
- **Canvas coordinates:** canvas-local CSS pixels after subtracting the canvas client rectangle origin.
- **World coordinates:** floating-point world pixels. v0.7.0 uses 48 world pixels per tile.
- **Tile coordinates:** integer `(column,row)` indices obtained with `floor(world / 48)`.

The legacy function `G.worldFromScreen(x,y)` is named "screen" but its current callers pass **canvas-local** CSS coordinates. This naming mismatch is documented rather than changed in a behavior-preservation task.

Canvas backing-store pixels (scaled by device-pixel ratio) are a rendering implementation detail and are not interchangeable with canvas CSS coordinates.

## Runtime authority

Target authoritative writers from the approved task packet:

- Navigation: simulation position and velocity.
- World: terrain/static environment.
- Actors: health, damage, death, combat, AI, perception, actor lifecycle.
- Gameplay: inventory, resources, progression, construction, production.
- Platform: camera/UI/input/settings and save orchestration.

The current monolith predates these separations. The harness establishes boundaries without pretending the legacy source has already been decomposed.

## Persistence continuity

v0.7.0 currently uses localStorage prefixes `groundfall-master-save-slot-` and legacy fallback `groundfall-save-slot-`. GF-FND-001 keeps the canonical HTML byte-identical, so it introduces no deliberate save-schema/key change.

The current loader contains legacy behavior for pre-0.7.0 data. That existing behavior is preserved, not redesigned here.

## Instrumentation foundation

The current runtime already exposes `GW.State.metrics`, including FPS, draw time, path calls/time, entity counts, visible counts, and chunk counts. The executable foundation contract lists the stable metric keys used by the harness. Headless browser evidence captures these values plus startup timing under a named workload without changing simulation behavior.

`updateMs` exists in the current metrics object but v0.7.0 does not visibly assign it in the inspected source. It is therefore recorded as an available field, not claimed as a valid measured update duration.
