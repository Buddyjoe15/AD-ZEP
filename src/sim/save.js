/* Save files: serialisation, strict validation, a chain of schema migrations, restore,
   and a storage adapter that falls back to memory when localStorage is unavailable.
   Before changing the save format, read "Changing the save format" in docs/ARCHITECTURE.md. */
(function(){
  'use strict';
  const G = GW;
  const num = G.isNum, int = Number.isInteger;
  const LIMITS = { units: 50000, list: 100000, path: 20000, log: 64 };

  G.Storage = (function(){
    const mem = new Map();
    let ls = null;
    try { if (typeof localStorage !== 'undefined'){ localStorage.setItem('__ezp_probe', '1'); localStorage.removeItem('__ezp_probe'); ls = localStorage; } } catch (e){ ls = null; }
    return {
      persistent: !!ls,
      get(k){ try { return ls ? ls.getItem(k) : (mem.has(k) ? mem.get(k) : null); } catch (e){ return null; } },
      set(k, v){ if (ls) ls.setItem(k, v); else mem.set(k, v); },
      remove(k){ try { if (ls) ls.removeItem(k); else mem.delete(k); } catch (e){ /* ignore */ } }
    };
  })();

  // ---- Migrations: one named step per schema bump. Each takes a save of schema N and
  // returns a new object of schema N + 1 without mutating its input. ----

  // Schema 1 (v0.5) → schema 2 (v0.6).
  const ROLE_TO_TYPE = { Survey: 'survey_drone', Security: 'security_drone', Utility: 'utility_spider', Mining: 'utility_spider', Cargo: 'utility_spider', Construction: 'utility_spider' };
  const ROLE_TO_RECIPE = ROLE_TO_TYPE;
  function migrateItem(it){
    if (!it || typeof it !== 'object') return it;
    const out = { id: it.id, key: it.key };
    if (it.count != null) out.count = it.count;
    if (it.durability != null){ out.durability = it.durability; out.maxDurability = it.maxDurability; }
    return out;
  }
  function migrate_1_to_2(d){
    const v = G.copy(d), T = 48;
    v.schema = 2;
    v.units = (v.units || []).map(u => {
      let type = u.type;
      if (u.droneRole && ROLE_TO_TYPE[u.droneRole]) type = ROLE_TO_TYPE[u.droneRole];
      else if (u.team === 'red') type = 'hostile_machine';
      else if (u.type === 'rifle') type = 'security_drone';
      else if (u.type === 'scout') type = 'survey_drone';
      else if (u.type === 'building_truck') type = 'utility_spider';
      const def = G.Defs.units.get(type) || {};
      const n = {
        id: u.id, type, team: u.team, name: def.name || u.name, x: u.x, y: u.y, heading: u.heading || 0,
        hp: u.hp, maxHp: u.maxHp, speed: u.speed, radius: u.radius, range: u.range, damage: u.damage, reload: u.reload,
        cool: u.cool || 0, sight: u.sight, path: u.path || [], pathIndex: u.pathIndex || 0, pathPending: false,
        command: u.command === 'scavenge' ? 'gather' : (u.command || 'idle'), guardPoint: u.guardPoint || null, patrolA: u.patrolA || null,
        patrolB: u.patrolB || null, patrolTarget: u.patrolTarget || 0, commandNextPath: 0, recallPoint: u.recallPoint || null, recallRetry: 0,
        targetId: null, targetNextScan: 0, aiNextPath: 0, squad: u.squad || null
      };
      if (u.isHero) n.isHero = true;
      if (u.isShip){ n.isShip = true; n.gx = u.gx; n.gy = u.gy; n.w = u.w || 6; n.h = u.h || 6; n.fabQueue = []; }
      if (def.cargoCapacity){
        n.cargo = { ...(u.resourceCargo || {}) };
        n.cargoCapacity = Math.max(def.cargoCapacity, u.resourceCargoCapacity || 0);
        n.haulState = u.haulState === 'toMine' ? 'toNode' : (u.haulState || 'idle');
        n.nodeId = u.scavengeNodeId || null;
      }
      if ((def.capabilities || []).includes('build')) n.buildSiteId = u.buildSiteId || null;
      if (def.storageSlots){
        const st = u.mobileStorage || {};
        n.storage = { id: 'storage-' + u.id, name: def.name + ' Storage', capacity: st.capacity || def.storageSlots, items: (st.items || []).map(migrateItem), opened: true, mobileUnitId: u.id };
      }
      return n;
    });
    const ship = v.units.find(u => u.isShip);
    if (ship) ship.fabQueue = ((v.expedition && v.expedition.queue) || []).map(q => ({ recipe: ROLE_TO_RECIPE[q.role] || q.role, left: q.left }));
    // v0.5 created a solid "chest" building when a Spider built a chest; make it a container.
    const chests = (v.buildings || []).filter(b => b.type === 'chest');
    v.buildings = (v.buildings || []).filter(b => b.type !== 'chest').map(b => {
      const o = { ...b };
      if (b.queue){ o.fabQueue = b.queue.map(q => ({ recipe: ROLE_TO_RECIPE[q.role] || q.role, left: q.left })); delete o.queue; }
      else if (b.type === 'fabricator') o.fabQueue = [];
      return o;
    });
    v.containers = (v.containers || []).map(c => ({
      id: c.id, type: c.type === 'ground_item' ? 'ground_item' : 'chest', name: c.name || (c.type === 'ground_item' ? 'Item' : 'Chest'),
      x: c.x, y: c.y, gx: c.gx != null ? c.gx : Math.floor(c.x / T), gy: c.gy != null ? c.gy : Math.floor(c.y / T),
      opened: !!c.opened, built: !!c.built, capacity: c.capacity || 24, items: (c.items || []).map(migrateItem), ...(c.testZone ? { testZone: true } : {})
    }));
    for (const b of chests) v.containers.push({ id: b.id, type: 'chest', name: 'Chest', x: (b.gx + 0.5) * T, y: (b.gy + 0.5) * T, gx: b.gx, gy: b.gy, opened: true, built: true, capacity: 24, items: [] });
    v.resourceNodes = (v.scavengeNodes || []).map(n => ({ id: n.id, type: n.type, name: n.name, x: n.x, y: n.y, remaining: n.remaining }));
    delete v.scavengeNodes;
    const inv = v.inventory || {};
    v.inventory = { items: (inv.items || []).map(migrateItem), equipment: { ...G.emptyEquipment() } };
    for (const k of G.EQUIPMENT_SLOTS) v.inventory.equipment[k] = inv.equipment && inv.equipment[k] ? migrateItem(inv.equipment[k]) : null;
    v.resources = { metal: (v.resources && v.resources.metal) || 0 };
    if (v.expedition){
      delete v.expedition.queue;
      v.expedition.progress = v.expedition.progress || { delivered: 0, built: 0 };
      v.expedition.lastReport = v.expedition.lastReport || null;
    }
    // v0.5 cleared this landing rectangle on every load; record it as an explicit edit.
    const g = ship ? ship.gx : 253, h = ship ? ship.gy : 253;
    v.terrainEdits = [{ x: g - 13, y: h - 5, w: 32, h: 28, t: 11 }];
    for (const k of ['version', 'biome', 'characterProfile', 'heroSkills', 'heroProgress', 'selectionAnchorId', 'squads']) delete v[k];
    return v;
  }

  // Schema 2 → schema 3 (v0.7): saves record which map generator built their terrain.
  // Every earlier save was generated as a forest Earth.
  function migrate_2_to_3(d){
    const v = G.copy(d);
    v.schema = 3;
    v.map = 'forest';
    return v;
  }

  // Schema 3 → schema 4 (v0.7): spawners have a movable rally point. Held units used to
  // wait wherever they spawned; the new default rally point is the one a freshly placed
  // spawner gets (five tiles south of its edge).
  function migrate_3_to_4(d){
    const v = G.copy(d), T = 48;
    v.schema = 4;
    for (const b of v.buildings || []){
      if (b.spawner && typeof b.spawner === 'object' && !b.spawner.rally) b.spawner.rally = { x: b.x, y: b.y + ((b.h || 0) / 2 + 5) * T };
    }
    return v;
  }

  // Schema 4 → schema 5 (v0.7): the ship and Fabricators have a rally point for the units
  // they produce. Older saves have none (null): new units wait beside their fabricator,
  // as they always did.
  function migrate_4_to_5(d){
    const v = G.copy(d);
    v.schema = 5;
    for (const o of [...(v.units || []), ...(v.buildings || [])]) if (o && Array.isArray(o.fabQueue) && o.rally === undefined) o.rally = null;
    return v;
  }

  // Schema 5 → schema 6 (Building Additions): the Wall structure is replaced by the Defensive
  // Wall, which has the same size, health, cost and cover aura. Walls and wall construction
  // sites in older saves become Defensive Walls.
  function migrate_5_to_6(d){
    const v = G.copy(d);
    v.schema = 6;
    for (const b of v.buildings || []) if (b && b.type === 'wall') b.type = 'defensive_wall';
    for (const s of v.constructionSites || []) if (s && s.type === 'wall') s.type = 'defensive_wall';
    return v;
  }

  // Schema 6 → schema 7: Shield Projectors save whether they are switched on (`shieldOn`)
  // and their stored field charge (`shield`). Any projector without them starts switched
  // off and empty, which is how a newly built one starts.
  function migrate_6_to_7(d){
    const v = G.copy(d);
    v.schema = 7;
    for (const b of v.buildings || []) if (b && b.type === 'shield_projector'){
      if (typeof b.shieldOn !== 'boolean') b.shieldOn = false;
      if (!num(b.shield) || b.shield < 0) b.shield = 0;
    }
    return v;
  }

  // Keyed by the schema each step upgrades from; add { 7: migrate_7_to_8 } and so on.
  const MIGRATIONS = { 1: migrate_1_to_2, 2: migrate_2_to_3, 3: migrate_3_to_4, 4: migrate_4_to_5, 5: migrate_5_to_6, 6: migrate_6_to_7 };

  // Applies the steps in order until the save reaches G.SAVE_SCHEMA. A current save is
  // returned as is; anything newer or unknown is rejected.
  function migrate(d){
    if (!d || typeof d !== 'object' || d.project !== G.PROJECT) throw new Error('Not a Zero Earth Protocol expedition file');
    if (!int(d.schema) || d.schema < 1) throw new Error('Unsupported save schema ' + d.schema);
    if (d.schema > G.SAVE_SCHEMA) throw new Error('Save schema ' + d.schema + ' is newer than this version of the game (schema ' + G.SAVE_SCHEMA + ')');
    let v = d;
    while (v.schema < G.SAVE_SCHEMA){
      const from = v.schema, step = MIGRATIONS[from];
      if (!step) throw new Error('No migration from save schema ' + from);
      v = step(v);
      if (!v || v.schema !== from + 1) throw new Error('Migration from schema ' + from + ' did not produce schema ' + (from + 1));
    }
    return v;
  }

  // ---- Validation (current schema). Throws with a specific message on the first problem. ----
  function validate(d){
    const C = G.CONFIG, D = G.Defs;
    const fail = why => { throw new Error('Invalid expedition save: ' + why); };
    const list = (x, max = LIMITS.list) => Array.isArray(x) && x.length <= max;
    const W = (d && d.worldSize || 0) * C.TILE;
    const point = p => p && num(p.x) && num(p.y) && p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= W;
    const item = i => i && typeof i.id === 'string' && D.items.has(i.key) &&
      (D.items.get(i.key).stackable ? int(i.count) && i.count > 0 && i.count <= D.items.get(i.key).maxStack : num(i.durability) && num(i.maxDurability) && i.durability >= 0);
    const cost = o => o && typeof o === 'object' && Object.entries(o).every(([k, v]) => D.resources.has(k) && num(v) && v >= 0);
    const spawner = s => typeof s.running === 'boolean' && typeof s.hold === 'boolean' && ['rate', 'amount', 'spawned', 'acc'].every(k => num(s[k]) && s[k] >= 0) && point(s.rally);
    const queue = q => list(q, 64) && q.every(e => D.recipes.has(e.recipe) && num(e.left) && e.left >= -1);

    if (!d || d.project !== G.PROJECT || d.schema !== G.SAVE_SCHEMA) fail('project or schema');
    if (!int(d.seed) || d.seed < 0 || d.seed > 4294967295) fail('seed');
    if (typeof d.map !== 'string' || !Object.prototype.hasOwnProperty.call(G.MapGen.types, d.map)) fail('map type');
    if (!int(d.worldSize) || d.worldSize < 64 || d.worldSize > 2048) fail('world size');
    if (!num(d.time) || d.time < 0 || !int(d.nextId)) fail('clock');
    if (!list(d.units, LIMITS.units)) fail('units');
    const ids = new Set();
    for (const u of d.units){
      const def = D.units.get(u.type);
      if (!def) fail('unknown unit type ' + u.type);
      if (!int(u.id) || ids.has(u.id)) fail('unit id');
      ids.add(u.id);
      if (!point(u) || !['blue', 'red'].includes(u.team)) fail('unit position or team');
      for (const k of ['hp', 'maxHp', 'speed', 'radius', 'range', 'damage', 'reload', 'cool', 'sight']) if (!num(u[k])) fail('unit ' + k);
      if (u.hp <= 0 || u.hp > u.maxHp || u.maxHp <= 0 || u.speed < 0 || u.radius <= 0) fail('unit stats');
      if (!list(u.path, LIMITS.path) || !u.path.every(point)) fail('unit path');
      for (const k of ['guardPoint', 'patrolA', 'patrolB', 'recallPoint']) if (u[k] && !point(u[k])) fail('unit ' + k);
      if (u.cargo && !Object.entries(u.cargo).every(([k, v]) => D.resources.has(k) && num(v) && v >= 0)) fail('unit cargo');
      if (u.storage && (!list(u.storage.items, 1000) || !u.storage.items.every(item) || !num(u.storage.capacity))) fail('unit storage');
      if (u.fabQueue && !queue(u.fabQueue)) fail('unit fabrication queue');
      if (u.fabQueue && !(u.rally === null || point(u.rally))) fail('unit rally point');
      if (u.isShip && (![u.gx, u.gy, u.w, u.h].every(int))) fail('ship footprint');
      if (u.team === 'red' && (u.isHero || u.isShip)) fail('hostile flags');
      for (const k of ['followId']) if (u[k] != null && !int(u[k])) fail('unit ' + k);
      for (const k of ['mineId', 'nodeId', 'spawnerId']) if (u[k] != null && typeof u[k] !== 'string') fail('unit ' + k);
    }
    if (d.units.filter(u => u.isHero).length !== 1 || !d.units.some(u => u.isHero && u.id === d.heroId)) fail('commander');
    if (d.units.filter(u => u.isShip).length !== 1 || !d.units.some(u => u.isShip && u.id === d.shipId)) fail('ship');
    if (d.nextId <= Math.max(0, ...ids)) fail('next id');
    if (!cost(d.resources)) fail('resources');
    if (!d.inventory || !list(d.inventory.items, 1000) || !d.inventory.items.every(item)) fail('inventory');
    if (!d.inventory.equipment || !Object.values(d.inventory.equipment).every(i => i === null || item(i))) fail('equipment');
    if (!d.camera || !point(d.camera) || !num(d.camera.z) || d.camera.z < C.ZOOM_MIN || d.camera.z > C.ZOOM_MAX) fail('camera');
    for (const k of ['containers', 'buildings', 'constructionSites', 'resourceNodes', 'terrainEdits']) if (!list(d[k])) fail(k);
    if (!d.containers.every(c => point(c) && typeof c.id === 'string' && list(c.items, 1000) && c.items.every(item) && num(c.capacity))) fail('container');
    if (!d.buildings.every(b => point(b) && D.buildables.has(b.type) && num(b.hp) && num(b.maxHp) && [b.gx, b.gy, b.w, b.h].every(int) && (!b.fabQueue || queue(b.fabQueue)) && (!b.spawner || spawner(b.spawner)))) fail('building');
    if (!d.constructionSites.every(s => point(s) && D.buildables.has(s.type) && num(s.remaining) && num(s.buildTime) && [s.gx, s.gy, s.w, s.h].every(int))) fail('construction site');
    if (!d.resourceNodes.every(n => point(n) && D.nodes.has(n.type) && num(n.remaining) && n.remaining >= 0 &&
      (D.nodes.get(n.type).kind !== 'deposit' || (int(n.gx) && int(n.gy))))) fail('resource node');
    if (!d.buildings.every(b => !b.fabQueue || b.rally === null || point(b.rally))) fail('building rally point');
    if (!d.buildings.every(b => (!b.stock || cost(b.stock)) && (b.nodeId == null || typeof b.nodeId === 'string'))) fail('building stockpile');
    // Shield Projectors carry their switch and charge; nothing else may.
    if (!d.buildings.every(b => {
      const sh = D.buildables.get(b.type).shield;
      if (!sh) return b.shieldOn === undefined && b.shield === undefined;
      return typeof b.shieldOn === 'boolean' && num(b.shield) && b.shield >= 0 && b.shield <= sh.capacity;
    })) fail('building shield');
    if (!d.terrainEdits.every(e => [e.x, e.y, e.w, e.h, e.t].every(int) && e.w >= 0 && e.h >= 0 && e.w * e.h <= 1 << 20)) fail('terrain edit');
    const e = d.expedition;
    if (!e) fail('expedition');
    for (const k of ['world', 'readiness', 'repairs', 'elementP', 'elapsed', 'upgrades', 'auto', 'scans', 'built', 'waveAt']) if (!num(e[k]) || e[k] < 0) fail('expedition ' + k);
    if (!int(e.world) || e.world < 1 || !int(e.climate) || e.climate < 0 || e.climate >= D.climates.size) fail('expedition world');
    if (![0, 100].includes(e.repairs) || !int(e.elementP) || e.elementP > G.EXPEDITION_RULES.elementPMax || !int(e.upgrades) || e.upgrades > G.EXPEDITION_RULES.upgradeMax) fail('expedition progress');
    if (!list(e.sites) || !e.sites.every(p => point(p) && ['Archive', 'Element P'].includes(p.kind) && num(p.progress))) fail('expedition signals');
    if (!list(e.log, LIMITS.log) || !e.log.every(x => typeof x === 'string') || !list(e.history)) fail('expedition log');
    if (!e.progress || !['delivered', 'built'].every(k => num(e.progress[k]) && e.progress[k] >= 0)) fail('expedition tally');
    if (e.lastReport && !['world', 'seed', 'seconds', 'metal', 'discoveries', 'built', 'crew', 'retainedMetal', 'leftMetal'].every(k => num(e.lastReport[k]) && e.lastReport[k] >= 0)) fail('arrival report');
    return d;
  }

  // Builds a fresh world from validated save data.
  function apply(d, slot){
    G.setWorldSize(d.worldSize);
    const S = G.Scenario.createWorld(d.seed, { slot, map: d.map });
    for (const e of d.terrainEdits){ S.grid.fill(e.x, e.y, e.w, e.h, e.t); S.terrainEdits.push({ ...e }); }
    Object.assign(S, {
      time: d.time, nextId: d.nextId, heroId: d.heroId, shipId: d.shipId,
      formation: G.FORMATIONS.includes(d.formation) ? d.formation : 'square', formationAngle: num(d.formationAngle) ? d.formationAngle : 0,
      resources: G.copy(d.resources), inventory: { items: G.copy(d.inventory.items), equipment: { ...G.emptyEquipment(), ...G.copy(d.inventory.equipment) } },
      containers: G.copy(d.containers), constructionSites: G.copy(d.constructionSites), resourceNodes: G.copy(d.resourceNodes),
      expedition: G.copy(d.expedition)
    });
    Object.assign(S.camera, d.camera);
    for (const u of G.copy(d.units)){
      // Capacity changes in the unit definitions apply to existing units: storage only
      // grows (items are never dropped), cargo follows the definition.
      const def = G.Defs.units.get(u.type);
      if (u.storage && def.storageSlots > u.storage.capacity) u.storage.capacity = def.storageSlots;
      if (u.cargo && def.cargoCapacity) u.cargoCapacity = def.cargoCapacity;
      G.Units.adopt(u);
    }
    for (const b of G.copy(d.buildings)) G.Buildings.adopt(b);
    S.selected = new Set([d.heroId]); S.selectionAnchorId = d.heroId;
    G.rebuildSpatial();
    G.Events.emit('game:restored', S);
    return S;
  }

  G.Save = {
    prefix: 'ad-ezp-v01-slot-',
    keyFor(slot){ return this.prefix + slot; },
    backupKey(slot, schema){ return this.prefix + slot + '-backup-schema-' + schema; },
    // The untouched original of an older save, stored before it was first migrated.
    backup(slot, schema){ return G.Storage.get(this.backupKey(slot, schema)); },
    migrate, validate, migrations: MIGRATIONS,
    serialize(){
      const S = G.State;
      const units = S.units.filter(u => u.hp > 0).map(u => { const o = G.copy(u); o.pathPending = false; return o; });
      return {
        project: G.PROJECT, schema: G.SAVE_SCHEMA, version: G.VERSION, savedAt: G.Clock.stamp(),
        seed: S.seed, map: S.map, worldSize: G.CONFIG.WORLD_TILES, time: S.time, nextId: S.nextId, heroId: S.heroId, shipId: S.shipId,
        camera: { x: S.camera.x, y: S.camera.y, z: S.camera.z }, formation: S.formation, formationAngle: S.formationAngle,
        resources: G.copy(S.resources), inventory: G.copy(S.inventory), units,
        buildings: G.copy(S.buildings), constructionSites: G.copy(S.constructionSites), containers: G.copy(S.containers),
        resourceNodes: G.copy(S.resourceNodes), terrainEdits: G.copy(S.terrainEdits || []), expedition: G.copy(S.expedition)
      };
    },
    // Rebuilds the world from save data. Throws, leaving the current game as it was, if
    // the data cannot be migrated or is invalid, or if rebuilding fails part way.
    restore(raw, slot = G.State.activeSaveSlot){
      const d = validate(migrate(raw));
      const S0 = G.State, prevSlot = S0.activeSaveSlot;
      const rollback = S0.grid && S0.expedition && S0.units.some(u => u.isHero) ? this.serialize() : null;
      try { return apply(d, slot); }
      catch (e){
        if (rollback){ try { apply(rollback, prevSlot); } catch (e2){ /* report the first error */ } }
        throw new Error('Could not rebuild the expedition: ' + e.message);
      }
    },
    save(slot = G.State.activeSaveSlot){
      slot = G.clamp(slot | 0, 1, G.CONFIG.SAVE_SLOTS);
      try {
        if (G.State.paths) G.State.paths.process(Infinity, Infinity);
        G.Storage.set(this.keyFor(slot), JSON.stringify(this.serialize()));
        G.State.activeSaveSlot = slot;
        G.notify('Expedition saved');
        G.Events.emit('save:written', slot);
        return true;
      } catch (e){
        G.notify('Save unavailable. Export an expedition file.');
        return false;
      }
    },
    // Loads a browser slot. An older save is first copied, untouched, to a backup key,
    // because the next autosave replaces the slot with the migrated version. On any
    // failure the current game stays loaded and a message says what happened.
    load(slot){
      let backedUp = false, raw = null, data = null;
      try {
        raw = G.Storage.get(this.keyFor(slot));
        if (!raw){ G.notify('Save Slot ' + slot + ' is empty'); return false; }
        data = JSON.parse(raw);
        const old = data && data.project === G.PROJECT && int(data.schema) && data.schema < G.SAVE_SCHEMA;
        if (old){
          const key = this.backupKey(slot, data.schema);
          if (G.Storage.get(key) === null){
            try { G.Storage.set(key, raw); }
            catch (e){ throw new Error('it is from an older version and there is no room to back it up before upgrading. Free some browser storage and try again'); }
          }
          backedUp = G.Storage.get(key) !== null;
        }
        this.restore(data, slot);
        if (old) G.notify('Save Slot ' + slot + ' was upgraded from an older version. The original is kept as a backup.');
        return true;
      } catch (e){
        // Keep a copy of a save that failed to load too, so a later save to this slot
        // cannot destroy the only copy.
        if (raw && !backedUp){
          const key = this.backupKey(slot, data && int(data.schema) ? data.schema : 'unknown');
          try { if (G.Storage.get(key) === null) G.Storage.set(key, raw); backedUp = G.Storage.get(key) !== null; } catch (e2){ /* storage full */ }
        }
        G.notify('Save Slot ' + slot + ' could not be loaded: ' + e.message + '.' + (backedUp ? ' The original save is kept as a backup.' : '') + ' Your current game was not changed.');
        G.Events.emit('save:rejected', { slot, error: e.message, backedUp });
        return false;
      }
    },
    // Slot summary for menus: null when empty, { slot, error } when it cannot be loaded.
    info(slot){
      const raw = G.Storage.get(this.keyFor(slot));
      if (!raw) return null;
      try {
        const d = validate(migrate(JSON.parse(raw)));
        return { slot, savedAt: d.savedAt || null, time: d.time, world: d.expedition.world, units: d.units.length };
      } catch (e){ return { slot, error: e.message }; }
    },
    newestSlot(){
      let best = null;
      for (let n = 1; n <= G.CONFIG.SAVE_SLOTS; n++){
        const i = this.info(n);
        if (!i || i.error) continue;
        const t = i.savedAt ? Date.parse(i.savedAt) : 0;
        if (!best || t > best.t) best = { slot: n, t };
      }
      return best ? best.slot : null;
    },
    clear(slot){ G.Storage.remove(this.keyFor(slot)); G.Events.emit('save:cleared', slot); },
    exportJSON(){ return JSON.stringify(this.serialize()); },
    importJSON(text, slot = G.State.activeSaveSlot){
      if (typeof text !== 'string' || text.length > 32e6) throw new Error('File too large');
      return this.restore(JSON.parse(text), slot);
    }
  };
})();
