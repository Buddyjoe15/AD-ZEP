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
    CHUNK_TILES: 16, CHUNK_CACHE_MAX: 64, CHUNKS_BUILT_PER_FRAME: 2,
    LOD_ZOOM: 0.30, UNIT_LOD_ZOOM: 0.45, ZOOM_MIN: 0.055, ZOOM_MAX: 2.2, MINIMAP_HZ: 8,
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
