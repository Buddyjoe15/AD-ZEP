/* Resource nodes, fabrication recipes, climates and control reference. */

/* Resource nodes come in two kinds:
     scavenge – loose salvage. A Spider collects it directly and quickly (`rate` per second)
                until the pile (`capacity`) is gone.
     deposit  – a 1×1 mine. Nothing happens until its `building` (a Mine Building) is built
                centred over it; that structure then extracts `rate` per second into its own
                stockpile, which Spiders haul to the ship. `capacity` is effectively endless. */
GW.Defs.nodes.defineAll({
  scrap_mine: {
    name: 'Scavenging Mine', kind: 'scavenge', resource: 'metal', capacity: 1200, rate: 20, range: 62,
    description: 'Loose salvage. A Utility Spider collects it quickly until it runs out.'
  },
  metal_mine: {
    name: 'Metal Mine', kind: 'deposit', resource: 'metal', capacity: 1000000, rate: 2, range: 0, building: 'mine_building', ore: '#c9d4dc',
    description: 'A near-endless metal seam. Build a Mine Building over it; extraction is slow but never runs dry.'
  },
  copper_mine: {
    name: 'Copper Deposit', kind: 'deposit', resource: 'copper', capacity: 1000000, rate: 2, range: 0, building: 'mine_building', ore: '#d98a4e',
    description: 'A near-endless copper seam. Build a Mine Building over it. Copper becomes Electronics in an Ore Processor.'
  },
  uranium_mine: {
    name: 'Uranium Deposit', kind: 'deposit', resource: 'uranium', capacity: 1000000, rate: 1, range: 0, building: 'mine_building', ore: '#8fe36a',
    description: 'A near-endless uranium seam. Build a Mine Building over it; extraction is slower than metal. Uranium becomes Fuel Rods in an Ore Processor.'
  }
});

/* Recipes make either a unit (`unit`) or construction resources (`produces`, added to
   the stockpile). Costs are paid when queued. The ship and Fabricators build unit
   recipes; a structure whose `fabricator.recipes` lists keys builds only those. */
GW.Defs.recipes.defineAll({
  survey_drone:   { name: 'Survey Drone',   unit: 'survey_drone',   cost: { metal: 100 }, time: 8,  blurb: 'Investigate signals and discoveries' },
  security_drone: { name: 'Security Drone', unit: 'security_drone', cost: { metal: 140 }, time: 10, blurb: 'Protect the expedition' },
  utility_spider: { name: 'Utility Spider', unit: 'utility_spider', cost: { metal: 160 }, time: 12, blurb: 'Mine, carry cargo and build with a laser' },
  // Ore Processor
  steel:       { name: 'Steel',       produces: { steel: 1 },       cost: { metal: 2 },   time: 5,  blurb: '2 metal → 1 steel' },
  electronics: { name: 'Electronics', produces: { electronics: 1 }, cost: { copper: 6 },  time: 12, blurb: '6 copper → 1 electronics' },
  fuel_rods:   { name: 'Fuel Rods',   produces: { fuel_rods: 6 },   cost: { uranium: 6 }, time: 30, blurb: '6 uranium → 6 fuel rods' }
});

// Order matters: Earth n uses climate (n-1) % count.
// `solar` scales Solar Array output on that Earth (1 = full sun).
GW.Defs.climates.defineAll({
  temperate:  { name: 'Temperate ruins',  air: 'Compatible', solar: 1, solarNote: 'Clear skies' },
  frozen:     { name: 'Frozen Earth',     air: 'Cold / sealed suit required', hazard: 0.3, solar: 0.6, solarNote: 'Low sun and heavy cloud' },
  silent:     { name: 'Silent Earth',     air: 'Compatible', hostiles: false, solar: 1.25, solarNote: 'Thin, still atmosphere' },
  irradiated: { name: 'Irradiated Earth', air: 'Radiation / sealed suit required', hazard: 0.7, solar: 0.4, solarNote: 'Fallout haze' }
});

// Expedition balance. Provisional working values.
GW.EXPEDITION_RULES = {
  startMetal: 180,
  readiness: 180, readinessMin: 90, readinessPerUpgrade: 15,
  repairCost: 100, upgradeCost: 180, upgradeHp: 40, upgradeMax: 5,
  boostSeconds: 90, elementPMax: 10,
  metalMines: [[620, -260], [-240, 780]],   // metal deposits placed near the ship on each Earth
  copperMines: [[1000, 420]],                // copper and uranium deposits, further out
  uraniumMines: [[-760, -620]],
  testNorth: ['solar_array'],                // testing-zone structures placed north of the ship
  signalCount: 6, signalStudySeconds: 4, archiveReward: { metal: 70 }, signalRange: 100,
  firstWave: 110, waveInterval: 100, waveBase: 2, waveMax: 5,
  hazardSafeRadius: 700, crewRadius: 620,
  startingCrew: ['survey_drone', 'security_drone', 'utility_spider']
};

// Swarm AI (src/sim/swarm.js).
GW.SWARM_RULES = {
  rebuildSeconds: 0.75,   // how often the flow field toward Vance may be rebuilt as he moves
  buildTiles: 6000,       // flow-field tiles settled per tick (the build spans ticks; ~1-2 ms)
  refreshSeconds: 1.5,    // periodic rebuild while a swarm exists, to update crowd costs
  crowdCost: 0.35,        // extra field cost per unit already standing on a tile (spreads swarms over gaps)
  firstBuildTiles: 24000, // larger step while no field exists yet, so a new swarm starts moving promptly
  margin: 24,             // tiles of slack around the swarm and Vance covered by the field (detours)
  lookahead: 6,           // tiles walked down the field when a unit picks its next straight leg
  steerSeconds: 0.4,      // how often a marching unit re-picks its leg
  spread: 14,             // per-unit offset (px) so a swarm fans out instead of queueing single file
  crowdHold: 3            // overlapping neighbours at which a unit stops pushing forward and waits
};

GW.KEY_BINDINGS = [
  ['WASD / Arrow Keys', 'Pan camera'], ['Mouse Wheel', 'Zoom at cursor'], ['Pinch', 'Touch zoom'],
  ['Left Click / Tap', 'Select unit'], ['Drag Select', 'Select multiple units'], ['Hold + Drag', 'Touch mass selection'],
  ['Right Click / Tap Terrain', 'Move selected units'], ['Hold Selected Group', 'Preview formation placement'],
  ['Drag Formation Preview', 'Rotate formation'], ['Double Tap / Double Click', 'Deselect units'],
  ['H', 'Center on ship'], ['I', 'Inventory'], ['Space', 'Pause / Resume'],
  ['Escape', 'Clear selection / cancel build'], ['F3', 'Developer diagnostics']
];

GW.FORMATIONS = ['v', 'circle', 'square', 'line'];
