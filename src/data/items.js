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
  },
  // Found in cave caches (G.Caves). Rare caches hold the better gear.
  cave_crystal: {
    name: 'Cave Crystal', kind: 'material', maxStack: 20,
    description: 'A clear, faintly glowing crystal grown in the dark. Valuable, and nobody on board knows why it glows.'
  },
  salvaged_alloy: {
    name: 'Salvaged Alloy', kind: 'material', maxStack: 20,
    description: 'Ingots of a light alloy from an old cache, stamped with a mark nobody recognises.'
  },
  miners_helmet: {
    name: "Miner's Helmet", kind: 'armor', slot: 'head', maxDurability: 140,
    description: 'A dented hard hat with a lamp mount. Tougher than it looks.', effects: { damageReduction: 0.08 }
  },
  expedition_pack: {
    name: 'Expedition Pack', kind: 'gear', slot: 'backpack', maxDurability: 160,
    description: 'A large frame pack from a lost survey team. Adds 16 inventory spaces while equipped.', effects: { inventoryBonus: 16 }
  },
  prototype_visor: {
    name: 'Prototype Visor', kind: 'armor', slot: 'head', maxDurability: 200,
    description: 'Rare. A sealed helmet visor of unknown make, far stronger than anything the crew carries.', effects: { damageReduction: 0.14 }
  }
});

// Black-box recordings (Lost archives, docs/DESIGN.md), found in caves. Each holds a fragment
// of another Earth's last moments; `text` is what plays when it is found.
GW.RECORDINGS = [
  { title: 'Recording 01: "Spin-up"', text: 'Drive at ninety percent. The fold is holding. Tell the children to look out of the window, they will want to remember this. ... Wait. Why is the sky' },
  { title: 'Recording 02: "Second attempt"', text: 'Log, day four hundred and six. We rebuilt the coil from what was left. The engineers say the first failure was a calibration fault. I want to believe them.' },
  { title: 'Recording 03: "The echo"', text: 'There is a signal on our own frequency, coming from inside the fold. It is our own voice. It is saying the same words, a few seconds ahead of us.' },
  { title: 'Recording 04: "Evacuation"', text: 'All non-essential crew to the lower decks. If the field collapses, the lower decks will be the last to go. That is not a comfort. It is only arithmetic.' },
  { title: 'Recording 05: "The assistant"', text: 'She keeps asking to see the full logs. I told her the logs are sealed for her own protection. She said: whose protection? I did not have an answer.' },
  { title: 'Recording 06: "Green"', text: 'Came through. Trees everywhere. It looks like home, but the stars are wrong, and the maps are wrong, and the town on the ridge was never on any map.' },
  { title: 'Recording 07: "Machines"', text: 'They came out of the ground at night. Not ours. Not anyone\'s. They do not answer on any channel. They just keep coming towards the drive.' },
  { title: 'Recording 08: "Count"', text: 'That is the ninth Earth. Nine. Each one a little further from the one we left. I have stopped telling the crew the number.' },
  { title: 'Recording 09: "Disclosure"', text: 'If you are hearing this, your ship has an assistant like ours. Ask her what she is not allowed to tell you. Then ask her why.' },
  { title: 'Recording 10: "Last entry"', text: 'Power failing. I am leaving this where the next ones will find it: underground, where it is quiet. Do not trust the fold. Do not trust' }
];
GW.RECORDINGS.forEach((r, i) => GW.Defs.items.define('recording_' + String(i + 1).padStart(2, '0'), {
  name: r.title, kind: 'recording', maxStack: 1,
  description: 'A black-box recording from another Earth. ' + r.text
}));
