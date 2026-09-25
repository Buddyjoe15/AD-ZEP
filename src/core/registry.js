/* Content registries. Every unit, item, building, resource, node and recipe is data
   registered here, so adding content means adding a definition file, not editing systems.
   Each registry validates definitions when they are registered and fills defaults. */
(function(){
  'use strict';
  const G = GW;

  class Registry {
    constructor(kind, normalize){
      this.kind = kind;
      this.normalize = normalize || (d => d);
      this.map = new Map();
    }
    define(key, def){
      if (typeof key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(key)) throw new Error(`Invalid ${this.kind} key "${key}"`);
      const d = this.normalize({ ...def, key });
      this.map.set(key, d);
      return d;
    }
    defineAll(obj){ for (const [k, d] of Object.entries(obj)) this.define(k, d); return this; }
    has(key){ return this.map.has(key); }
    get(key){ return this.map.get(key); }
    require(key){
      const d = this.map.get(key);
      if (!d) throw new Error(`Unknown ${this.kind}: ${key}`);
      return d;
    }
    remove(key){ return this.map.delete(key); }
    keys(){ return [...this.map.keys()]; }
    all(){ return [...this.map.values()]; }
    get size(){ return this.map.size; }
  }
  G.Registry = Registry;

  const need = (d, kind, fields) => {
    for (const f of fields) if (d[f] === undefined) throw new Error(`${kind} "${d.key}" is missing "${f}"`);
  };
  const costOk = (d, kind) => {
    for (const [r, v] of Object.entries(d.cost || {})){
      if (!G.isNum(v) || v < 0) throw new Error(`${kind} "${d.key}" has an invalid cost for ${r}`);
    }
  };

  G.Defs = {
    resources: new Registry('resource', d => {
      need(d, 'Resource', ['name']);
      return { icon: '•', color: '#ddd', transitCap: Infinity, hidden: false, ...d };
    }),
    terrain: new Registry('terrain', d => {
      need(d, 'Terrain', ['id', 'name']);
      return { passable: true, moveCost: 1, speed: 1, minimap: [80, 100, 70], ...d };
    }),
    units: new Registry('unit', d => {
      need(d, 'Unit', ['name', 'hp', 'speed', 'radius']);
      return {
        team: 'blue', range: 0, damage: 0, reload: 999, sight: 600, capabilities: [],
        visual: d.key, cargoCapacity: 0, storageSlots: 0, footprint: null, fabricator: null,
        ai: null, selectable: true, ...d,
        capabilities: [...(d.capabilities || [])]
      };
    }),
    items: new Registry('item', d => {
      need(d, 'Item', ['name', 'kind']);
      const stackable = !!d.maxStack && d.maxStack > 1;
      return { slot: null, maxDurability: stackable ? 0 : 100, effects: {}, description: '', maxStack: 1, stackable, ...d };
    }),
    buildables: new Registry('buildable', d => {
      need(d, 'Buildable', ['name', 'w', 'h']);
      costOk(d, 'Buildable');
      return {
        hp: 500, buildTime: 2, cost: {}, description: '', behaviors: [], symbol: null, color: '#9bbcf0',
        container: null, fabricator: null, spawner: null, team: 'blue', debugOnly: false, placeOnNode: null,
        blocksMovement: !d.container, ...d
      };
    }),
    nodes: new Registry('resource node', d => {
      need(d, 'Node', ['name', 'resource', 'capacity', 'rate', 'range']);
      return { description: '', kind: 'scavenge', building: null, ...d };
    }),
    recipes: new Registry('fabrication recipe', d => {
      need(d, 'Recipe', ['name', 'time']);
      costOk(d, 'Recipe');
      if (!d.unit === !d.produces) throw new Error(`Recipe ${d.name} needs either unit or produces`);
      return { cost: {}, blurb: '', unit: null, produces: null, ...d };
    }),
    climates: new Registry('climate', d => {
      need(d, 'Climate', ['name', 'air']);
      return { hazard: 0, hostiles: true, ...d };
    })
  };

  // Validates cross-references once all data files have loaded.
  G.Defs.verify = function(){
    const D = G.Defs, problems = [];
    for (const u of D.units.all()){
      if (u.fabricator && !(u.fabricator.queueMax > 0)) problems.push(`unit ${u.key}: fabricator.queueMax`);
    }
    for (const r of D.recipes.all()){
      if (r.unit && !D.units.has(r.unit)) problems.push(`recipe ${r.key}: unknown unit ${r.unit}`);
      for (const [k, v] of Object.entries(r.produces || {})) if (!D.resources.has(k) || !(v > 0)) problems.push(`recipe ${r.key}: bad product ${k}`);
      for (const k of Object.keys(r.cost)) if (!D.resources.has(k)) problems.push(`recipe ${r.key}: unknown resource ${k}`);
    }
    for (const b of D.buildables.all()){
      for (const k of Object.keys(b.cost)) if (!D.resources.has(k)) problems.push(`buildable ${b.key}: unknown resource ${k}`);
      for (const beh of b.behaviors) if (!beh.type) problems.push(`buildable ${b.key}: behavior without type`);
      if (b.spawner && !D.units.has(b.spawner.unit)) problems.push(`buildable ${b.key}: spawner unit ${b.spawner.unit} unknown`);
      for (const k of (b.fabricator && b.fabricator.recipes) || []) if (!D.recipes.has(k)) problems.push(`buildable ${b.key}: unknown recipe ${k}`);
    }
    for (const n of D.nodes.all()){
      if (!D.resources.has(n.resource)) problems.push(`node ${n.key}: unknown resource ${n.resource}`);
      if (!['scavenge', 'deposit'].includes(n.kind)) problems.push(`node ${n.key}: kind must be scavenge or deposit`);
      if (n.kind === 'deposit'){
        const b = D.buildables.get(n.building);
        if (!b) problems.push(`node ${n.key}: unknown building ${n.building}`);
        else if (b.placeOnNode !== 'deposit' || b.w % 2 !== 1 || b.h % 2 !== 1) problems.push(`node ${n.key}: ${n.building} must have placeOnNode 'deposit' and an odd footprint to centre on it`);
      }
    }
    if (problems.length) throw new Error('Content definitions are inconsistent:\n' + problems.join('\n'));
    return true;
  };
})();
