/* Item definitions. Instances store only { id, key, durability, count }; names, effects and
   descriptions are read from here, so balance changes apply to existing saves.
   Set maxStack > 1 for stackable materials (they then have no durability). */
GW.Defs.items.defineAll({
  field_cap: {
    name: 'Field Cap', kind: 'armor', slot: 'head', maxDurability: 100,
    description: 'A reinforced field cap with a thin impact liner.', effects: { damageReduction: 0.05 }
  },
  simple_backpack: {
    name: 'Simple Backpack', kind: 'gear', slot: 'backpack', maxDurability: 100,
    description: 'A simple field backpack that adds 10 inventory spaces while equipped.', effects: { inventoryBonus: 10 }
  }
});
