/* Structures a Utility Spider can construct. Function comes from `behaviors`, each handled
   by a registered behaviour in src/sim/behaviors.js:
     defenseAura  { radiusTiles, reduction }  – nearby friendly units take less damage
     repairAura   { radiusTiles, rate }       – heals nearby friendly units (hp per second)
     studySignals { radiusTiles }             – studies expedition signals in range
   `container` makes the structure an item container instead of a solid building.
   `fabricator` gives the building a production queue for recipes in fabrication.js. */
GW.Defs.buildables.defineAll({
  chest: {
    name: 'Chest', w: 1, h: 1, buildTime: 2, cost: {}, container: { capacity: 24 },
    description: 'A 1×1 storage chest. Player-built chests are immediately usable.'
  },
  wall: {
    name: 'Wall', w: 1, h: 1, hp: 600, buildTime: 5, cost: { metal: 60 },
    behaviors: [{ type: 'defenseAura', radiusTiles: 1, reduction: 0.20 }],
    description: 'Temporary defensive barrier. Friendly units within one tile take 20% less damage.'
  },
  generator: {
    name: 'Field Generator', w: 2, h: 2, hp: 500, buildTime: 8, cost: { metal: 100 }, symbol: 'G', color: '#d9bb60',
    description: 'Placeholder structure. No function yet.'
  },
  repair: {
    name: 'Repair Station', w: 2, h: 2, hp: 500, buildTime: 8, cost: { metal: 140 }, symbol: 'R', color: '#70d7b2',
    behaviors: [{ type: 'repairAura', radiusTiles: 3, rate: 5 }],
    description: 'Repairs friendly units within three tiles (5 HP per second).'
  },
  sensor: {
    name: 'Sensor Station', w: 2, h: 2, hp: 500, buildTime: 8, cost: { metal: 80 }, symbol: 'S', color: '#9bbcf0',
    behaviors: [{ type: 'studySignals', radiusTiles: 5 }],
    description: 'Studies expedition signals within five tiles without an escort.'
  },
  fabricator: {
    name: 'Fabricator', w: 2, h: 2, hp: 800, buildTime: 10, cost: { metal: 200 }, symbol: 'FAB', color: '#c9a0e8',
    fabricator: { queueMax: 5 }, level: 1,
    description: 'Level 1 fabricator. Builds everything the ship can fabricate.'
  }
});
