/* Structures a Utility Spider can construct. Function comes from `behaviors`, each handled
   by a behaviour registered with GW.Behaviors (src/sim/buildings.js, spawner.js):
     defenseAura  { radiusTiles, reduction }  – nearby friendly units take less damage
     repairAura   { radiusTiles, rate }       – heals nearby friendly units (hp per second)
     turret       { range, damage, reload, accuracy, targets: 'ground' | 'air' | 'any',
                    minRange?, splash?, ammo?, shot?, charge? } – fires at enemy units (src/sim/defense.js);
                    `charge` seconds of charging with a target in range come before each shot;
                    `turn` (radians/s) makes it traverse at that rate and fire only on target;
                    `accuracy` is the chance to hit (Defensive Sensors add to it); `ammo`
                    names a resource spent per shot from the stockpile
     studySignals { radiusTiles }             – studies expedition signals in range
   `container` makes the structure an item container instead of a solid building.
   `fabricator` gives the building a production queue for recipes in src/data/world.js
   (unit recipes, or only the keys in `fabricator.recipes`).
   `spawner` + the `spawner` behaviour produce units continuously (see src/sim/spawner.js).
   `placeOnNode: 'deposit'` structures must be centred on a deposit resource node (mines).
   `debugOnly` structures are hidden from the Utility Spider's build menu.
   `power` makes it a producer or consumer on the electricity grid (see src/sim/power.js).
   `armor` (0–1) reduces damage the structure takes. `gate` makes it a gate: friendly units
   pass while it is open, enemies never do (src/sim/defense.js). `sight` is its fog-of-war
   vision in world px (default 240).
   `shield` { radiusTiles, capacity, recharge } makes it a Shield Projector: switched on from
   its window, its charge absorbs damage to friendly structures in range.
   `sensor` { detectTiles, boostTiles, accuracyBonus } makes it a Defensive Sensor.
   `wall` marks a wall: with pixel art, walls join their neighbours on each side (other walls
   and the ends of gates) into one continuous wall; never diagonally.
   Footprints (`w`, `h`, in tiles) are twice what they were before units and structures were
   shown at twice the size; mines stay odd (7 × 7) so they centre on their deposit.
   `rotateTo` names the same structure turned 90° (gates); the build menu lists one of the
   pair and rotates between them. `listed: false` keeps a structure out of the build menu. */
GW.Defs.buildables.defineAll({
  chest: {
    name: 'Chest', w: 2, h: 2, buildTime: 2, cost: {}, container: { capacity: 24 },
    description: 'A 2×2 storage chest. Player-built chests are immediately usable.'
  },
  // ---- Fortifications ----
  shield_projector: {
    name: 'Shield Projector', w: 6, h: 6, hp: 1500, armor: 0.2, buildTime: 20, cost: { metal: 300, steel: 25, electronics: 10 },
    symbol: 'SHD', color: '#7fd8f0', sight: 300,
    shield: { radiusTiles: 6, capacity: 2500, recharge: 40 }, power: { demand: 40, when: 'active' },
    description: 'Generates a limited energy field over friendly structures within six tiles. Switch it on in its window: while on, it draws 40 power and charges up to 2,500 shield, which absorbs damage to covered structures until it runs out. Temporary protection against dangerous attacks, not a replacement for walls.'
  },
  defensive_sensor: {
    name: 'Defensive Sensor', w: 2, h: 2, hp: 250, buildTime: 6, cost: { metal: 90, electronics: 3 },
    symbol: 'SEN', color: '#9fe0b0', sight: 576,
    sensor: { detectTiles: 12, boostTiles: 6, accuracyBonus: 0.25 }, power: { demand: 3 },
    description: 'Short-range detection. Turrets within six tiles hit every shot (up from 75%). Sees 12 tiles through fog, and warns when enemies come within that range. Draws 3 power.'
  },
  // ---- Walls (join their neighbours into one wall) and gates ----
  wood_wall: {
    name: 'Wood Wall', w: 2, h: 2, hp: 350, buildTime: 3, cost: { metal: 25 }, wall: true,
    behaviors: [{ type: 'defenseAura', radiusTiles: 1, reduction: 0.15 }],
    description: 'Quick, cheap palisade of sharpened logs with stakes angled out from its foot, one 2×2 section at a time. Weakest wall: 350 HP. Friendly units within one tile take 15% less damage.'
  },
  defensive_wall: {
    name: 'Metal Wall', w: 2, h: 2, hp: 600, buildTime: 5, cost: { metal: 60 }, wall: true,
    behaviors: [{ type: 'defenseAura', radiusTiles: 1, reduction: 0.20 }],
    description: 'Standard bolted steel wall, one 2×2 section at a time. Blocks enemies and channels them into controlled approaches. Friendly units within one tile take 20% less damage.'
  },
  reinforced_wall: {
    name: 'Reinforced Metal Wall', w: 2, h: 2, hp: 1600, armor: 0.35, buildTime: 8, cost: { metal: 40, steel: 12 }, wall: true,
    behaviors: [{ type: 'defenseAura', radiusTiles: 1, reduction: 0.25 }],
    description: 'Heavy armoured wall: 1,600 HP and takes 35% less damage. Friendly units within one tile take 25% less damage.'
  },
  // Gates: 2, 3 or 4 tiles long, each horizontal or vertical (rotateTo). Walls join their ends.
  gate: {
    name: 'Gate (1×2)', w: 4, h: 2, symbol: 'GATE', color: '#8f9c8a', hp: 900, armor: 0.2, buildTime: 6, cost: { metal: 80 }, blocksMovement: false, rotateTo: 'gate_v',
    gate: { openTiles: 2, hostileTiles: 6 },
    description: 'Lets Vance, Utility Spiders and other friendly units through defensive walls. Always closed; opens when a friendly unit is within two tiles, and shuts automatically while hostiles are within six. Enemies can never pass. Rotate it to build it across a north-south wall.'
  },
  gate_v: {
    name: 'Gate (1×2, vertical)', w: 2, h: 4, symbol: 'GATE', color: '#8f9c8a', hp: 900, armor: 0.2, buildTime: 6, cost: { metal: 80 }, blocksMovement: false, rotateTo: 'gate', listed: false,
    gate: { openTiles: 2, hostileTiles: 6 },
    description: 'The 1×2 Gate turned for a north-south wall.'
  },
  gate_3: {
    name: 'Gate (1×3)', w: 6, h: 2, symbol: 'GATE', color: '#8f9c8a', hp: 1300, armor: 0.2, buildTime: 8, cost: { metal: 120 }, blocksMovement: false, rotateTo: 'gate_3_v',
    gate: { openTiles: 2, hostileTiles: 6 },
    description: 'A wider gate, three tiles across, for groups of units. Opens for friendly units within two tiles and stays shut while hostiles are within six. Rotate it for a north-south wall.'
  },
  gate_3_v: {
    name: 'Gate (1×3, vertical)', w: 2, h: 6, symbol: 'GATE', color: '#8f9c8a', hp: 1300, armor: 0.2, buildTime: 8, cost: { metal: 120 }, blocksMovement: false, rotateTo: 'gate_3', listed: false,
    gate: { openTiles: 2, hostileTiles: 6 },
    description: 'The 1×3 Gate turned for a north-south wall.'
  },
  gate_4: {
    name: 'Gate (1×4)', w: 8, h: 2, symbol: 'GATE', color: '#8f9c8a', hp: 1700, armor: 0.2, buildTime: 10, cost: { metal: 160 }, blocksMovement: false, rotateTo: 'gate_4_v',
    gate: { openTiles: 2, hostileTiles: 6 },
    description: 'The widest gate, four tiles across, for convoys. Opens for friendly units within two tiles and stays shut while hostiles are within six. Rotate it for a north-south wall.'
  },
  gate_4_v: {
    name: 'Gate (1×4, vertical)', w: 2, h: 8, symbol: 'GATE', color: '#8f9c8a', hp: 1700, armor: 0.2, buildTime: 10, cost: { metal: 160 }, blocksMovement: false, rotateTo: 'gate_4', listed: false,
    gate: { openTiles: 2, hostileTiles: 6 },
    description: 'The 1×4 Gate turned for a north-south wall.'
  },
  // ---- Turrets (fire automatically at enemy units; testing-zone copies stay idle).
  //      Each hits 75% of the time; a Defensive Sensor nearby makes that 100%. ----
  sentry_turret: {
    name: 'Sentry Turret', w: 2, h: 2, symbol: 'ST', color: '#7fa3b5', hp: 400, buildTime: 6, cost: { metal: 120 }, sight: 300,
    behaviors: [{ type: 'turret', range: 260, damage: 9, reload: 0.5, accuracy: 0.75, targets: 'ground' }],
    description: 'Basic automated defensive turret for early-game perimeter defence. Rapid light fire at ground targets within 260.'
  },
  laser_turret: {
    name: 'Laser Turret', w: 2, h: 2, hp: 700, armor: 0.15, buildTime: 10, cost: { metal: 180, electronics: 6 }, sight: 420,
    behaviors: [{ type: 'turret', range: 380, damage: 60, reload: 0.5, charge: 2.5, turn: Math.PI, accuracy: 0.9, targets: 'ground', shot: 'laser' }],
    power: { demand: 6 },
    description: 'Heavy laser rifle on a diamond pad. Charges for 2.5 s with a target in range, its coils lighting one by one, then fires a 60-damage beam at ground targets within 380. Draws 6 power.'
  },
  heavy_turret: {
    name: 'Heavy Turret', w: 4, h: 4, symbol: 'HT', color: '#6f8594', hp: 1400, armor: 0.2, buildTime: 12, cost: { metal: 200, steel: 20 }, sight: 360,
    behaviors: [{ type: 'turret', range: 340, damage: 70, reload: 3, accuracy: 0.75, targets: 'ground', splash: 40, shot: 'heavy' }],
    description: 'Slow-firing, high-damage cannon for large creatures, heavily armoured enemies and major assaults. 70 damage every 3 s to ground targets, with a small blast.'
  },
  aa_turret: {
    name: 'Anti-Air Turret', w: 2, h: 2, symbol: 'AA', color: '#8fb8d8', hp: 350, buildTime: 7, cost: { metal: 100, electronics: 2 }, sight: 400,
    behaviors: [{ type: 'turret', range: 400, damage: 14, reload: 0.35, accuracy: 0.75, targets: 'air' }],
    description: 'Targets flying organisms, drones and aircraft within 400. Cannot hit ground targets.'
  },
  missile_battery: {
    name: 'Missile Battery', w: 4, h: 4, symbol: 'MB', color: '#d9906a', hp: 900, buildTime: 14, cost: { metal: 180, steel: 15, electronics: 4 }, sight: 400,
    behaviors: [{ type: 'turret', range: 720, minRange: 160, damage: 50, reload: 4, accuracy: 0.75, targets: 'any', splash: 70, ammo: 'missiles', shot: 'missile' }],
    description: 'Long-range defensive installation: 50-damage missiles with a wide blast, from 160 out to 720, at ground or air targets. Uses one Missile per shot from the stockpile (made at a Fabricator).'
  },
  generator: {
    name: 'Field Generator', w: 4, h: 4, hp: 500, buildTime: 8, cost: { metal: 100 }, symbol: 'G', color: '#d9bb60',
    description: 'Placeholder structure. No function yet.'
  },
  repair: {
    name: 'Repair Station', w: 4, h: 4, hp: 500, buildTime: 8, cost: { metal: 140 }, symbol: 'R', color: '#70d7b2',
    behaviors: [{ type: 'repairAura', radiusTiles: 3, rate: 5 }],
    description: 'Repairs friendly units within three tiles (5 HP per second).'
  },
  sensor: {
    name: 'Sensor Station', w: 4, h: 4, hp: 500, buildTime: 8, cost: { metal: 80 }, symbol: 'S', color: '#9bbcf0',
    behaviors: [{ type: 'studySignals', radiusTiles: 5 }],
    description: 'Studies expedition signals within five tiles without an escort.'
  },
  fabricator: {
    name: 'Fabricator', w: 4, h: 4, hp: 800, buildTime: 10, cost: { metal: 200 }, symbol: 'FAB', color: '#c9a0e8',
    fabricator: { queueMax: 5, recipes: ['survey_drone', 'security_drone', 'utility_spider', 'salvage_crawler', 'missiles'] }, level: 1, power: { demand: 10, when: 'producing' },
    description: 'Level 1 fabricator. Builds everything the ship can fabricate, plus Missiles for Missile Batteries. Draws 10 power only while producing.'
  },
  solar_array: {
    name: 'Solar Array', w: 6, h: 4, hp: 300, buildTime: 6, cost: { metal: 60 }, symbol: 'SOL', color: '#e8c547',
    power: { supply: 8, scale: 'solar' },
    description: 'Basic renewable power generation. Extremely cheap to operate but dependent on sunlight: makes up to 8 power, scaled by this Earth\'s solar efficiency (atmosphere, weather, orbit and environment).'
  },
  wind_turbine: {
    name: 'Wind Turbine', w: 4, h: 4, hp: 350, buildTime: 8, cost: { metal: 90 }, symbol: 'WND', color: '#a9d8e8',
    power: { supply: 6, scale: 'wind' },
    description: 'Generates energy from atmospheric wind: 6 power in a steady breeze, scaled by this Earth\'s wind. Extremely useful on storm-heavy worlds, nearly worthless where the atmosphere is thin or stagnant.'
  },
  ore_processor: {
    name: 'Ore Processor', w: 6, h: 6, hp: 1200, buildTime: 15, cost: { metal: 250 }, symbol: 'ORE', color: '#d9a066',
    fabricator: { queueMax: 10, recipes: ['steel', 'electronics', 'fuel_rods'] }, power: { demand: 15, when: 'producing' },
    description: 'Turns raw material into usable construction resources. Choose Steel (2 metal), Electronics (6 copper) or Fuel Rods (6 uranium); inputs come from the stockpile when queued and the product goes back to it. Draws 15 power only while processing.'
  },
  // Key kept as mine_building so saves and deposits keep working.
  mine_building: {
    name: 'Resource Extractor', w: 7, h: 7, hp: 1200, buildTime: 15, cost: { metal: 150 }, symbol: 'EXT', color: '#b8a16a',
    placeOnNode: 'deposit',
    behaviors: [{ type: 'extractor', stockCap: 300 }], power: { demand: 5, when: 'extracting' },
    description: 'Primary automated mining structure. Placed over any resource deposit, it switches its mining system to the material underneath (metal, copper, uranium…) and extracts it into a 300-unit stockpile that Utility Spiders haul to the ship. Draws 5 power while extracting.'
  },
  // A hostile nest deep in a cave (Genesis, G.Caves): it wakes when friendly units come near,
  // sends out its guards, and keeps making more until it is destroyed.
  cave_nest: {
    name: 'Hostile Nest', w: 4, h: 4, hp: 900, buildTime: 10, cost: {}, symbol: 'NE', color: '#b8483f',
    team: 'red', debugOnly: true, armor: 0.2,
    spawner: { unit: 'hostile_machine', rate: 0.5, amount: 10, hold: true },
    behaviors: [{ type: 'spawner' }, { type: 'caveNest', wakeTiles: 9, releaseTiles: 6 }],
    description: 'A nest of Hostile Autonomous Machines in the dark of a cave. It wakes when friendly units come within nine tiles, and its machines attack once they come within six. Destroy it to stop them.'
  },
  hostile_fabricator: {
    name: 'Hostile Fabricator', w: 4, h: 4, hp: 1500, buildTime: 10, cost: {}, symbol: 'HF', color: '#e0685f',
    team: 'red', debugOnly: true,
    spawner: { unit: 'hostile_machine', rate: 5, amount: 100, hold: true },   // hold: spawned units gather at the rally point until switched to hunt
    behaviors: [{ type: 'spawner' }],
    description: 'Test spawner. Produces Hostile Autonomous Machines at a chosen speed and count. Click it to configure.'
  }
});
