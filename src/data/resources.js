/* Stockpiled resources. transitCap limits how much crosses to the next Earth.
   Raw materials are mined from deposits and hauled to the ship; construction resources
   are made from them in an Ore Processor (recipes in src/data/world.js). The top bar
   always shows `always` resources and the rest once the stockpile holds some. */
GW.Defs.resources.defineAll({
  metal:       { name: 'Metal',       icon: '◆', color: '#c9d4dc', transitCap: 300, always: true },
  copper:      { name: 'Copper',      icon: '◆', color: '#d98a4e', transitCap: 300 },
  uranium:     { name: 'Uranium',     icon: '◆', color: '#8fe36a', transitCap: 150 },
  steel:       { name: 'Steel',       icon: '▰', color: '#9fb4c4', transitCap: 150 },
  electronics: { name: 'Electronics', icon: '▣', color: '#6fd3e8', transitCap: 50 },
  fuel_rods:   { name: 'Fuel Rods',   icon: '▮', color: '#b6f06a', transitCap: 60 },
  missiles:    { name: 'Missiles',    icon: '➤', color: '#ff9f5a', transitCap: 40 }
});
