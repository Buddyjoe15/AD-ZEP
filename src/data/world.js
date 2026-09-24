/* Resource nodes, fabrication recipes, climates and control reference. */
GW.Defs.nodes.defineAll({
  scrap_mine: {
    name: 'Scavenging Mine', resource: 'metal', capacity: 1200, rate: 20, range: 62,
    description: 'A salvage-rich deposit for Utility Spiders.'
  }
});

GW.Defs.recipes.defineAll({
  survey_drone:   { name: 'Survey Drone',   unit: 'survey_drone',   cost: { metal: 100 }, time: 8,  blurb: 'Investigate signals and discoveries' },
  security_drone: { name: 'Security Drone', unit: 'security_drone', cost: { metal: 140 }, time: 10, blurb: 'Protect the expedition' },
  utility_spider: { name: 'Utility Spider', unit: 'utility_spider', cost: { metal: 160 }, time: 12, blurb: 'Mine, carry cargo and build with a laser' }
});

// Order matters: Earth n uses climate (n-1) % count.
GW.Defs.climates.defineAll({
  temperate:  { name: 'Temperate ruins',  air: 'Compatible' },
  frozen:     { name: 'Frozen Earth',     air: 'Cold / sealed suit required', hazard: 0.3 },
  silent:     { name: 'Silent Earth',     air: 'Compatible', hostiles: false },
  irradiated: { name: 'Irradiated Earth', air: 'Radiation / sealed suit required', hazard: 0.7 }
});

// Expedition balance. Provisional working values.
GW.EXPEDITION_RULES = {
  startMetal: 180,
  readiness: 180, readinessMin: 90, readinessPerUpgrade: 15,
  repairCost: 100, upgradeCost: 180, upgradeHp: 40, upgradeMax: 5,
  boostSeconds: 90, elementPMax: 10,
  signalCount: 6, signalStudySeconds: 4, archiveReward: { metal: 70 }, signalRange: 100,
  firstWave: 110, waveInterval: 100, waveBase: 2, waveMax: 5,
  hazardSafeRadius: 700, crewRadius: 620,
  startingCrew: ['survey_drone', 'security_drone', 'utility_spider']
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
