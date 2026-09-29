/* Engine tuning. Game content (units, items, costs) lives in src/data, not here. */
(function(){
  'use strict';
  const G = GW;
  G.CONFIG = {
    TILE: 48,
    WORLD_TILES: 512,          // square world, tiles per side
    COLS: 512, ROWS: 512, WORLD_W: 512 * 48, WORLD_H: 512 * 48,
    FIXED_DT: 1 / 30, MAX_FRAME: 0.25, MAX_STEPS_PER_FRAME: 4,

    // Rendering
    // CHUNK_CACHE_MAX is a budget in full-size 1× chunks (about 2.4 MB each); a chunk at res r
    // costs r² times its share of a full chunk. Missing chunks are painted for up to
    // CHUNK_BUILD_MS a frame (at least one), centre first.
    // CHUNK_BLANK_MS while part of the view has only the overview (quick chunks), CHUNK_SHARPEN_MS
    // once it is covered, CHUNK_AHEAD_MS for the ring round it painted ahead.
    CHUNK_TILES: 16, CHUNK_CACHE_MAX: 128, CHUNK_BUILD_MS: 10, CHUNK_BLANK_MS: 50, CHUNK_SHARPEN_MS: 6, CHUNK_AHEAD_MS: 3,
    // Close up, terrain chunks are painted at the screen's resolution: 2, 3 or 4 canvas px per
    // world px, up to TERRAIN_RES_MAX; from SUB_RES up, chunks are half as many tiles across.
    // QUICK_RES: chunks painted first where the view has nothing, before the sharp ones.
    TERRAIN_RES: 2, TERRAIN_RES_MAX: 4, SUB_RES: 2, QUICK_RES: 0.5,
    // Between LOD_ZOOM and FAR_CHUNK_ZOOM (1.5× further out) terrain uses lower-resolution
    // chunks (FAR_CHUNK_SCALE of full size, trees drawn in at rest) before the overview image.
    FAR_CHUNK_ZOOM: 0.20, FAR_CHUNK_SCALE: 1 / 3, FAR_CHUNK_CACHE_MAX: 176,
    // Below UNIT_LOD_ZOOM (UNIT_LOD_ZOOM_PIXEL with pixel art on) ordinary units draw as team squares.
    LOD_ZOOM: 0.30, UNIT_LOD_ZOOM: 0.45, UNIT_LOD_ZOOM_PIXEL: 0.30, ZOOM_MIN: 0.055, ZOOM_MAX: 4, MINIMAP_HZ: 8,
    COLORS: { blue: '#49a4ff', red: '#ef5b55', neutral: '#d4c46c' },

    // Spatial partitioning
    SPATIAL_CELL: 48,          // dense grid for unit collision / picking (one tile)
    TARGET_CELL: 256,          // per-team hashes used for target acquisition (long radii)

    // Pathfinding
    PATH_NODE_BUDGET: 60000,    // A* expansions served per tick (work-based, so deterministic)
    PATH_MAX_PER_TICK: 96,      // hard cap on queued requests served per tick
    PATH_MAX_NODES: 40000,      // A* expansion cap; partial path returned when hit
    PATH_RETARGET_RADIUS: 24,   // tiles searched for a reachable stand-in goal
    FLOWFIELD_MIN_GROUP: 8,     // group moves this large share one Dijkstra field
    FLOWFIELD_MARGIN: 40,       // tiles of slack around the group's bounding box

    // Interaction distances (world px)
    INTERACT_RANGE: 150,
    SEARCH_CANCEL_RANGE: 180,
    INTERACT_MIN_ZOOM: 0.30,

    // Population
    POPULATION_CAP: 32,         // friendly units including queued fabrication
    SAVE_SLOTS: 3,
    AUTOSAVE_SECONDS: 60
  };

  G.setWorldSize = function(n){
    Object.assign(G.CONFIG, { WORLD_TILES: n, COLS: n, ROWS: n, WORLD_W: n * G.CONFIG.TILE, WORLD_H: n * G.CONFIG.TILE });
  };
})();
