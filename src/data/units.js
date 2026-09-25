/* Unit definitions. Behaviour is chosen by capabilities, never by unit key:
     fight      – acquires targets and fires (needs range and damage)
     survey     – studies signals when nearby
     build      – constructs buildables (Utility Spider)
     gather     – harvests resource nodes
     carry      – hauls cargo (cargoCapacity) back to a dropoff
     storage    – carries an item container (storageSlots)
     fabricate  – owns a production queue (see `fabricator`)
     dropoff    – accepts hauled cargo
     command    – the Commander; losing it ends the expedition
   `flying` units are air targets: only anti-air turrets and Missile Batteries (and other
   units) can hit them.
   `visual` selects a renderer in src/render/visuals.js; unknown visuals fall back to a
   generic marker, so new units are playable before they have art. */
GW.Defs.units.defineAll({
  hero: {
    name: 'Commander Elias Vance', hp: 300, speed: 125, radius: 18, range: 210, damage: 15, reload: 0.66, sight: 760,
    capabilities: ['command', 'survey', 'fight', 'interact'], visual: 'hero', barOffset: 70
  },
  ship: {
    name: 'UES Aster Vale', hp: 5000, speed: 0, radius: 144, sight: 900, footprint: { w: 6, h: 6 },
    capabilities: ['fabricate', 'dropoff'], fabricator: { queueMax: 5 }, visual: 'ship', selectable: true,
    power: { supply: 25 }   // Warp Drive: constant output
  },
  survey_drone: {
    name: 'Survey Drone', hp: 260, speed: 175, radius: 15, sight: 800, flying: true,
    capabilities: ['survey'], visual: 'scout'
  },
  security_drone: {
    name: 'Security Drone', hp: 100, speed: 118, radius: 10, range: 205, damage: 12, reload: 0.72, sight: 650, flying: true,
    capabilities: ['fight'], visual: 'rifle'
  },
  utility_spider: {
    name: 'Utility Spider', hp: 520, speed: 132, radius: 17, sight: 720, cargoCapacity: 250, storageSlots: 25,
    capabilities: ['build', 'gather', 'carry', 'storage'], visual: 'utility'
  },
  hostile_machine: {
    name: 'Hostile Autonomous Machine', team: 'red', hp: 65, speed: 118, radius: 10, range: 140, damage: 6, reload: 0.72, sight: 480,
    capabilities: ['fight'], visual: 'rifle', selectable: false,
    ai: 'swarm', aggroTiles: 10, attackStructures: true   // marches on Vance; engages anything within 10 tiles
  },
  hostile_drone: {
    name: 'Hostile Drone', team: 'red', hp: 45, speed: 150, radius: 9, range: 120, damage: 5, reload: 0.6, sight: 480, flying: true,
    capabilities: ['fight'], visual: 'rifle', selectable: false,
    ai: 'swarm', aggroTiles: 10, attackStructures: true   // a flying swarm unit: only anti-air and missiles can hit it
  }
});
