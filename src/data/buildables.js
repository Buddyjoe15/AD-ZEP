/* Structures a Utility Spider can construct. Function comes from `behaviors`, each handled
   by a behaviour registered with GW.Behaviors (src/sim/buildings.js, spawner.js):
     defenseAura  { radiusTiles, reduction }  – nearby friendly units take less damage
     repairAura   { radiusTiles, rate }       – heals nearby friendly units (hp per second)
     studySignals { radiusTiles }             – studies expedition signals in range
   `container` makes the structure an item container instead of a solid building.
   `fabricator` gives the building a production queue for recipes in fabrication.js.
   `spawner` + the `spawner` behaviour produce units continuously (see src/sim/spawner.js).
   `placeOnNode: 'deposit'` structures must be centred on a deposit resource node (mines).
   `debugOnly` structures are hidden from the Utility Spider's build menu. */
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
  },
  mine_building: {
    name: 'Mine Building', w: 3, h: 3, hp: 1200, buildTime: 15, cost: { metal: 150 }, symbol: 'MINE', color: '#b8a16a',
    placeOnNode: 'deposit',
    behaviors: [{ type: 'extractor', stockCap: 300 }],
    description: 'Built centred over a mine deposit. Slowly extracts its resource into a 300-unit stockpile that Utility Spiders haul to the ship.'
  },
  hostile_fabricator: {
    name: 'Hostile Fabricator', w: 2, h: 2, hp: 1500, buildTime: 10, cost: {}, symbol: 'HF', color: '#e0685f',
    team: 'red', debugOnly: true,
    spawner: { unit: 'hostile_machine', rate: 5, amount: 100, hold: true },   // hold: spawned units gather at the rally point until switched to hunt
    behaviors: [{ type: 'spawner' }],
    description: 'Test spawner. Produces Hostile Autonomous Machines at a chosen speed and count. Click it to configure.'
  }
});
