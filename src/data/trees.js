/* Free-standing tree species and dead wood (stumps, fallen trees), used by maps that plant
   trees at their own positions instead of one per tile (Genesis, src/world/genesis.js). Trees
   are regenerated from the seed with the rest of the terrain; only the damage done to them is
   saved (src/sim/trees.js).
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
// Toughness, in the damage units weapons deal (a Heavy Turret shell does 70, a missile 50):
// living trees by size, times the species' `tough`; stumps and fallen trees by their size.
// A Salvage Crawler saws at CHOP_RATE × its gatherRate damage a second.
GW.TREES.HP = { tree: [60, 160, 320], stump: [90, 150], log: [200, 320] };
GW.TREES.CHOP_RATE = 25;
// Wood a Salvage Crawler gets from what it saws down (explosions leave none): living trees
// by size, times the species' `wood`; stumps and fallen trees by their size.
GW.TREES.WOOD = { tree: [8, 20, 40], stump: [4, 8], log: [25, 40] };
GW.TREES.species.snag.wood = 0.5;
GW.TREES.species.maple.wood = 1.2;
// Seconds a felled tree takes to fall. The Crawler gets the wood when it hits the ground
// (the renderer's falling animation takes the same time).
GW.TREES.FALL_TIME = 1.3;
GW.TREES.species.snag.tough = 0.6;
GW.TREES.species.maple.tough = 1.2;
// Dead wood among the trees, placed and drawn with them but under every crown. `sizes` are
// what the art is drawn for (index = the prop's size): a stump's cut face and a fallen tree's
// length and trunk width, in world px. Fallen trees block the tiles along their trunk;
// stumps can be walked over. A fallen tree lies at one of LOG_ANGLES directions (0 = its
// crown end pointing east, then clockwise), so it can fall any way, not just along the grid.
GW.TREES.props = {
  stump_cut:    { name: 'Tree stump',    sizes: [{ r: 4 }, { r: 6 }] },
  stump_broken: { name: 'Snapped stump', sizes: [{ r: 4 }, { r: 6 }] },
  log:          { name: 'Fallen tree',   sizes: [{ length: 72, width: 6 }, { length: 108, width: 9 }] },
  // Landscaping on Genesis maps, where the terrain has brush, wildflowers, mushrooms, boulders,
  // reeds or forest floor (the tile keeps its terrain; these are drawn on it at their own
  // places). `hp` and `wood` by size, as for the dead wood; boulders can't be destroyed.
  bush:      { name: 'Bush',           sizes: [{ r: 7 }, { r: 10 }, { r: 13 }], hp: [30, 50, 80], wood: [1, 2, 3] },
  flowers:   { name: 'Wildflowers',    sizes: [{ r: 8 }], hp: [10], wood: [0] },
  boulder:   { name: 'Boulder',        sizes: [{ r: 7 }, { r: 11 }, { r: 15 }], hp: [Infinity, Infinity, Infinity], wood: [0, 0, 0] },
  reeds:     { name: 'Reeds',          sizes: [{ r: 9 }], hp: [15], wood: [0] },
  mushrooms: { name: 'Mushrooms',      sizes: [{ r: 6 }], hp: [10], wood: [0] },
  fern:      { name: 'Fern',           sizes: [{ r: 9 }, { r: 13 }], hp: [15, 20], wood: [0, 0] }
};
GW.TREES.LOG_ANGLES = 16;
// Every kind a Genesis map plants, in the order `grid.art.trees.kind` indexes: species first.
GW.TREES.ALL = [...GW.TREES.KINDS, ...Object.keys(GW.TREES.props)];
// Calls fn(tile x, tile y) for each tile a fallen tree's trunk lies across: size z, angle
// index `a`, centred on world px (x, y). The generator blocks these tiles; the renderer knows
// from them which fallen-tree tiles it draws itself.
GW.TREES.logTiles = function(x, y, z, a, tile, fn){
  const d = this.props.log.sizes[z], th = a / this.LOG_ANGLES * Math.PI * 2, ux = Math.cos(th), uy = Math.sin(th);
  let last = -1;
  for (let s = -d.length / 2 + d.width; s <= d.length * 0.22; s += 4){
    const tx = Math.floor((x + ux * s) / tile), ty = Math.floor((y + uy * s) / tile), key = ty * 65536 + tx;
    if (key !== last){ last = key; fn(tx, ty); }
  }
};
