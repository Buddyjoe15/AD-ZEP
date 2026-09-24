/* Terrain types. Ids are stored in the world grid (Uint8Array) and in no save file, so
   they only need to stay stable relative to the map generator. */
GW.Defs.terrain.defineAll({
  grass:    { id: 0,  name: 'Grass',    minimap: [77, 105, 70] },
  path:     { id: 1,  name: 'Path',     moveCost: 0.82, speed: 1.18, minimap: [120, 105, 77] },
  water:    { id: 2,  name: 'Water',    passable: false, minimap: [49, 102, 119] },
  rock:     { id: 3,  name: 'Rock',     passable: false, minimap: [88, 87, 79] },
  forest:   { id: 4,  name: 'Forest',   moveCost: 1.22, speed: 0.82, minimap: [45, 78, 48] },
  tree:     { id: 5,  name: 'Tree',     passable: false, minimap: [27, 58, 33] },
  bush:     { id: 6,  name: 'Brush',    moveCost: 1.22, speed: 0.82, minimap: [56, 90, 52] },
  bridge:   { id: 7,  name: 'Bridge',   moveCost: 0.82, speed: 1.18, minimap: [135, 112, 74] },
  floor:    { id: 8,  name: 'Floor',    minimap: [126, 111, 82] },
  wall:     { id: 9,  name: 'Ruin wall', passable: false, minimap: [82, 70, 56] },
  door:     { id: 10, name: 'Doorway',  minimap: [161, 132, 81] },
  clearing: { id: 11, name: 'Clearing', minimap: [95, 119, 80] }
});
