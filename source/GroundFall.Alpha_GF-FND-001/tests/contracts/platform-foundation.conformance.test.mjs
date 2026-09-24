import test from "node:test";
import assert from "node:assert/strict";
import {
  GAMEPLAY_UPDATE_PHASES,
  WORLD_GEOMETRY_BASELINE,
  assertFoundationProvider,
  screenToCanvas,
  canvasToWorld,
  worldToCanvas,
  worldToTile,
  tileToWorldCenter
} from "../../contracts/platform-foundation.mjs";

test("foundation fake provider conforms without implementation imports", () => {
  const fake = {
    getConfigSnapshot() { return { ...WORLD_GEOMETRY_BASELINE }; },
    getRuntimeMetrics() {
      return { fps: 60, drawMs: 1, updateMs: 0, visible: 3, pathCalls: 0, pathMs: 0, entities: 3, chunks: 4 };
    }
  };
  assert.equal(assertFoundationProvider(fake), true);
});

test("coordinate conversions preserve explicit spaces", () => {
  const canvas = screenToCanvas({ x: 140, y: 90 }, { left: 40, top: 10 });
  assert.deepEqual(canvas, { x: 100, y: 80 });
  const camera = { x: 500, y: 1000, z: 2 };
  const world = canvasToWorld(canvas, camera);
  assert.deepEqual(world, { x: 550, y: 1040 });
  assert.deepEqual(worldToCanvas(world, camera), canvas);
  assert.deepEqual(worldToTile({ x: 95, y: 144 }), { col: 1, row: 3 });
  assert.deepEqual(tileToWorldCenter({ col: 1, row: 3 }), { x: 72, y: 168 });
});

test("documented update order is the existing v0.7.0 order", () => {
  assert.deepEqual([...GAMEPLAY_UPDATE_PHASES], [
    "time", "input", "containers", "economy", "spatial", "commands", "scavenge",
    "movement", "construction", "defense", "combat", "cleanup", "rules"
  ]);
});
