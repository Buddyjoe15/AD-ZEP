/* Free-standing tree species, used by maps that plant trees at their own positions instead of
   one per tile (Genesis, src/world/genesis.js). Nothing here is saved: trees are regenerated
   from the seed with the rest of the terrain.
   `crown` is the crown diameter in world px for each size (small, medium, large); the art in
   tools/genesis-trees.mjs is drawn to the same sizes (a test checks they match). In the wind,
   `sway` scales how often and how far a tree leans (stiff conifers less, light birches more)
   and `rustle` how many of them rustle and how fast; a snag has no leaves to rustle. */
GW.TREES = {
  SIZES: ['small', 'medium', 'large'],
  // A tree of this size or larger blocks the tile its trunk stands on. Smaller trees stand on
  // forest floor, which slows units down but lets them through.
  BLOCKS_FROM: 1,
  // How far a crown leans per wind step, in world px, by size: saplings bend most.
  LEAN_PX: [2, 1.5, 1],
  species: {
    spruce: { name: 'Spruce', crown: [18, 28, 38], sway: 0.6, rustle: 0.5 },
    pine:   { name: 'Pine',   crown: [22, 34, 46], sway: 0.8, rustle: 0.7 },
    birch:  { name: 'Birch',  crown: [20, 30, 40], sway: 1.2, rustle: 1.4 },
    maple:  { name: 'Maple',  crown: [24, 40, 56], sway: 0.9, rustle: 1 },
    snag:   { name: 'Dead snag', crown: [18, 26, 36], sway: 0.5, rustle: 0 }
  }
};
GW.TREES.KINDS = Object.keys(GW.TREES.species);
