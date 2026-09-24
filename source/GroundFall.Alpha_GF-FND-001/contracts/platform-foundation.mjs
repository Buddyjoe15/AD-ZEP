export const EXECUTABLE_CONTRACT_RELEASE = "EC-0.1-foundation";

export const WORLD_GEOMETRY_BASELINE = Object.freeze({
  columns: 512,
  rows: 512,
  tileWorldPixels: 48,
  widthWorldPixels: 24576,
  heightWorldPixels: 24576
});

// Existing v0.7.0 gameplay update order. This is descriptive and must not be
// changed by a consumer without a coordinated contract/baseline decision.
export const GAMEPLAY_UPDATE_PHASES = Object.freeze([
  "time",
  "input",
  "containers",
  "economy",
  "spatial",
  "commands",
  "scavenge",
  "movement",
  "construction",
  "defense",
  "combat",
  "cleanup",
  "rules"
]);

export const COORDINATE_SPACES = Object.freeze({
  screen: Object.freeze({
    units: "CSS pixels",
    origin: "browser viewport top-left",
    axes: "+x right, +y down",
    source: "PointerEvent.clientX/clientY"
  }),
  canvas: Object.freeze({
    units: "CSS pixels",
    origin: "canvas client rectangle top-left",
    axes: "+x right, +y down",
    conversion: "screen minus canvas.getBoundingClientRect().left/top"
  }),
  world: Object.freeze({
    units: "world pixels",
    origin: "world top-left",
    axes: "+x right, +y down",
    conversion: "camera origin plus canvas / zoom"
  }),
  tile: Object.freeze({
    units: "integer tile indices",
    origin: "tile (0,0) at world top-left",
    axes: "+column right, +row down",
    conversion: "floor(world / tileWorldPixels)"
  })
});

export const FOUNDATION_RUNTIME_METRIC_KEYS = Object.freeze([
  "fps",
  "drawMs",
  "updateMs",
  "visible",
  "pathCalls",
  "pathMs",
  "entities",
  "chunks"
]);

export function screenToCanvas(point, rect) {
  return { x: point.x - rect.left, y: point.y - rect.top };
}

export function canvasToWorld(point, camera) {
  return { x: camera.x + point.x / camera.z, y: camera.y + point.y / camera.z };
}

export function worldToCanvas(point, camera) {
  return { x: (point.x - camera.x) * camera.z, y: (point.y - camera.y) * camera.z };
}

export function worldToTile(point, tileWorldPixels = WORLD_GEOMETRY_BASELINE.tileWorldPixels) {
  return { col: Math.floor(point.x / tileWorldPixels), row: Math.floor(point.y / tileWorldPixels) };
}

export function tileToWorldCenter(tile, tileWorldPixels = WORLD_GEOMETRY_BASELINE.tileWorldPixels) {
  return {
    x: (tile.col + 0.5) * tileWorldPixels,
    y: (tile.row + 0.5) * tileWorldPixels
  };
}

export function assertFoundationProvider(provider) {
  const required = ["getConfigSnapshot", "getRuntimeMetrics"];
  for (const key of required) {
    if (!provider || typeof provider[key] !== "function") {
      throw new TypeError(`Foundation provider missing function: ${key}`);
    }
  }
  const config = provider.getConfigSnapshot();
  for (const [key, expected] of Object.entries(WORLD_GEOMETRY_BASELINE)) {
    if (config[key] !== expected) {
      throw new Error(`Foundation config mismatch for ${key}: expected ${expected}, got ${config[key]}`);
    }
  }
  const metrics = provider.getRuntimeMetrics();
  for (const key of FOUNDATION_RUNTIME_METRIC_KEYS) {
    if (!(key in metrics)) throw new Error(`Foundation metrics missing key: ${key}`);
  }
  return true;
}
