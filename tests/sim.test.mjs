// Headless simulation tests. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSim, newGame, ROOT } from './harness.mjs';

const T = 48;
const fnv = arr => { let h = 2166136261; for (const t of arr){ h ^= t; h = Math.imul(h, 16777619) >>> 0; } return h; };
const find = (G, type) => G.State.units.find(u => u.type === type && u.hp > 0);
// An open tile a few tiles south-east of the ship ramp, clear of the testing zone.
const openTileNear = (G, dx, dy) => {
  const sh = G.Units.ship(), p = G.State.grid.nearestOpen(sh.gx + 3 + dx, sh.gy + sh.h + dy, 10);
  return p;
};
function pathValid(G, u, pts){
  let prev = { x: u.x, y: u.y };
  for (const p of pts){
    if (!G.State.grid.passableWorld(p.x, p.y)) return false;
    if (!G.State.grid.lineClear(prev.x, prev.y, p.x, p.y) && G.State.grid.passableWorld(prev.x, prev.y)) return false;
    prev = p;
  }
  return true;
}

test('content registries are consistent', () => {
  const G = loadSim();
  assert.equal(G.Defs.verify(), true);
  for (const k of ['hero', 'ship', 'survey_drone', 'security_drone', 'utility_spider', 'hostile_machine']) assert.ok(G.Defs.units.has(k), k);
  assert.throws(() => G.Defs.units.define('Bad Key', { name: 'x', hp: 1, speed: 1, radius: 1 }));
  assert.throws(() => G.Defs.buildables.define('broken', { name: 'x', w: 1, h: 1, cost: { metal: -5 } }));
});

test('engine config: zoom limits and level-of-detail thresholds are numbers in order', () => {
  const C = loadSim().CONFIG;
  for (const k of ['ZOOM_MIN', 'ZOOM_MAX', 'LOD_ZOOM', 'FAR_CHUNK_ZOOM', 'UNIT_LOD_ZOOM', 'UNIT_LOD_ZOOM_PIXEL', 'MINIMAP_HZ', 'CHUNK_CACHE_MAX', 'FAR_CHUNK_CACHE_MAX', 'FAR_CHUNK_SCALE'])
    assert.ok(Number.isFinite(C[k]) && C[k] > 0, k + ' is a positive number, got ' + C[k]);
  assert.ok(C.ZOOM_MIN < C.FAR_CHUNK_ZOOM && C.FAR_CHUNK_ZOOM < C.LOD_ZOOM && C.LOD_ZOOM < C.ZOOM_MAX);
  assert.ok(C.ZOOM_MIN < C.UNIT_LOD_ZOOM_PIXEL && C.UNIT_LOD_ZOOM < C.ZOOM_MAX);
});

test('terrain generation is deterministic and unchanged from v0.5', () => {
  const G = loadSim();
  assert.equal(fnv(G.MapGen.forest(72491).tiles), 1434927080);
  assert.equal(fnv(G.MapGen.forest(1).tiles), 3605140733);
});

test('grid occupancy and regions follow structures', () => {
  const G = newGame();
  const S = G.State, p = openTileNear(G, 4, 3);
  assert.ok(S.grid.passable(p.x, p.y));
  const b = G.Buildings.add('defensive_wall', p.x, p.y);
  assert.equal(S.grid.passable(p.x, p.y), false);
  assert.equal(S.grid.regionAt(p.x, p.y), 0);
  G.Buildings.remove(b);
  assert.ok(S.grid.passable(p.x, p.y));
  assert.ok(S.grid.regionAt(p.x, p.y) > 0);
  const sh = G.Units.ship();
  assert.equal(S.grid.passable(sh.gx + 2, sh.gy + 2), false, 'ship footprint blocks movement');
});

test('pathfinder: valid routes, stand-in goals and partial paths', () => {
  const G = newGame();
  const S = G.State, hero = G.Units.hero();
  // Long route across the river.
  const far = S.paths.find(hero.x, hero.y, 60 * T, 60 * T);
  assert.ok(far.length > 0);
  assert.ok(pathValid(G, hero, far));
  const end = far[far.length - 1];
  assert.ok(Math.hypot(end.x - 60 * T, end.y - 60 * T) < 30 * T);
  // Goal inside the ship: routed to the nearest reachable tile instead.
  const sh = G.Units.ship();
  const blocked = S.paths.find(hero.x, hero.y, sh.x, sh.y);
  assert.ok(blocked.length > 0);
  assert.ok(S.grid.passableWorld(blocked.at(-1).x, blocked.at(-1).y));
  // Tiny node budget returns a partial path that still makes progress.
  const partial = S.paths.find(hero.x, hero.y, 40 * T, 470 * T, 50);
  assert.ok(partial.length > 0);
  assert.ok(pathValid(G, hero, partial));
});

test('pathfinder: an enclosed goal region is rejected without a full search', () => {
  const G = newGame();
  const S = G.State, p = openTileNear(G, 8, 6);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) G.Buildings.add('defensive_wall', p.x + dx, p.y + dy);
  const hero = G.Units.hero(), before = S.metrics.pathCalls;
  const route = S.paths.find(hero.x, hero.y, (p.x + 0.5) * T, (p.y + 0.5) * T);
  assert.equal(S.metrics.pathCalls, before + 1);
  const last = route.at(-1);
  assert.ok(!(Math.floor(last.x / T) === p.x && Math.floor(last.y / T) === p.y), 'does not enter the sealed tile');
  assert.equal(S.paths.reachable(hero.x, hero.y, (p.x + 0.5) * T, (p.y + 0.5) * T), false);
});

test('group moves share a flow field and arrive', () => {
  const G = newGame();
  const S = G.State, sh = G.Units.ship(), units = [];
  for (let i = 0; i < 40; i++){
    const p = G.openPoint(sh.x - 300 + (i % 10) * 40, sh.y + 420 + Math.floor(i / 10) * 40);
    units.push(G.Units.spawn('security_drone', p.x, p.y));
  }
  G.rebuildSpatial();
  const before = S.metrics.flowFields;
  const goal = G.openPoint(sh.x + 1400, sh.y + 900);
  G.Orders.move(units, goal.x, goal.y);
  assert.equal(S.metrics.flowFields, before + 1);
  G.Sim.run(40);
  const arrived = units.filter(u => Math.hypot(u.x - goal.x, u.y - goal.y) < 420).length;
  assert.ok(arrived >= 36, `${arrived}/40 arrived`);
});

test('path requests are served under a per-tick cap', () => {
  const G = newGame();
  const S = G.State, sh = G.Units.ship(), units = [];
  for (let i = 0; i < 300; i++){ const p = G.openPoint(sh.x - 600 + (i % 30) * 40, sh.y + 500 + Math.floor(i / 30) * 40); units.push(G.Units.spawn('survey_drone', p.x, p.y)); }
  for (const u of units) S.paths.request(u, 100 * T, 100 * T);
  const served = S.paths.process(Infinity, 96);
  assert.equal(served, 96);
  assert.equal(S.paths.length, 204);
  while (S.paths.length) S.paths.process(Infinity, 96);
  assert.ok(units.every(u => !u.pathPending));
  // A newer request replaces an older one for the same unit.
  S.paths.request(units[0], 10 * T, 10 * T); S.paths.request(units[0], 20 * T, 20 * T);
  assert.equal(S.paths.process(Infinity, 96), 1);
});

test('economy tracks spending, income and refunds', () => {
  const G = newGame();
  const E = G.Economy;
  assert.equal(E.get('metal'), 180);
  assert.equal(E.spend({ metal: 500 }), false);
  assert.equal(E.get('metal'), 180);
  assert.ok(E.spend({ metal: 80 }));
  E.add('metal', 200);
  E.refund({ metal: 20 });
  assert.equal(E.get('metal'), 320);
  const r = E.rate('metal');
  assert.equal(r.expense, 80);
  assert.equal(r.income, 220);
  assert.equal(E.describe({ metal: 60 }), '60 metal');
});

test('inventory stacks, equipment and backpack capacity', () => {
  const G = newGame();
  G.Defs.items.define('test_scrap', { name: 'Test Scrap', kind: 'material', maxStack: 20 });
  const I = G.Inventory;
  assert.equal(I.capacity(), 10);
  const pack = I.items.find(i => i.key === 'simple_backpack');
  assert.ok(I.equip(pack.id));
  assert.equal(I.capacity(), 20);
  I.add(G.Items.create('test_scrap', 15));
  I.add(G.Items.create('test_scrap', 15));
  const stacks = I.items.filter(i => i.key === 'test_scrap');
  assert.deepEqual(Array.from(stacks, s => s.count), [20, 10]);
  while (I.items.length < 20) I.add(G.Items.create('field_cap'));
  assert.equal(I.unequip('backpack'), false, 'cannot drop capacity below the carried items');
  const cap = I.items.find(i => i.key === 'field_cap');
  assert.ok(I.equip(cap.id));
  assert.ok(Math.abs(I.damageReduction() - 0.05) < 1e-9);
});

test('utility spider mines a node and delivers to the ship', () => {
  const G = newGame();
  const spider = find(G, 'utility_spider');
  const scrap = G.State.resourceNodes.find(n => n.type === 'scrap_mine');
  assert.ok(G.Gather.command(spider, scrap));
  G.Sim.run(70);
  assert.ok(G.State.expedition.progress.delivered >= 600, 'delivered ' + G.State.expedition.progress.delivered);
  assert.ok(G.Economy.get('metal') >= 180 + 600);
  assert.ok(G.State.resourceNodes.some(n => n.remaining < 1200));
  assert.equal(spider.command, 'gather');
});

test('construction completes, blocks the tile and refunds when cancelled', () => {
  const G = newGame();
  const S = G.State, spider = find(G, 'utility_spider'), p = openTileNear(G, 5, 4);
  const site = G.Construction.order(spider, 'generator', p.x, p.y);
  assert.ok(site);
  assert.equal(G.Economy.get('metal'), 80);
  G.Sim.run(25);
  const b = S.buildings.find(b => b.type === 'generator' && b.gx === p.x && b.gy === p.y);
  assert.ok(b, 'generator built');
  assert.equal(S.grid.passable(p.x, p.y), false);
  assert.equal(S.expedition.progress.built, 1);
  // Cancelling through a new order refunds the cost.
  const q = openTileNear(G, -2, 6);
  S.resources.metal = 100;
  assert.ok(G.Construction.order(spider, 'defensive_wall', q.x, q.y));
  assert.equal(G.Economy.get('metal'), 40);
  G.Orders.move([spider], spider.x + 100, spider.y);
  assert.equal(G.Economy.get('metal'), 100);
  assert.equal(S.constructionSites.length, 0);
  // A dead builder's site is refunded rather than blocking departure forever.
  assert.ok(G.Construction.order(spider, 'defensive_wall', q.x, q.y));
  spider.hp = 0;
  G.Sim.run(0.2);
  assert.equal(S.constructionSites.length, 0);
  assert.equal(G.Economy.get('metal'), 100);
});

test('built chests are containers, not solid buildings', () => {
  const G = newGame();
  const spider = find(G, 'utility_spider'), p = openTileNear(G, 3, 5), n = G.State.containers.length;
  assert.ok(G.Construction.order(spider, 'chest', p.x, p.y));
  G.Sim.run(15);
  assert.equal(G.State.containers.length, n + 1);
  assert.ok(G.State.grid.passable(p.x, p.y));
});

test('fabrication queues, respects capacity and refunds destroyed owners', () => {
  const G = newGame();
  const S = G.State, ship = G.Units.ship();
  S.resources.metal = 10000;
  for (let i = 0; i < 5; i++) assert.ok(G.Fabrication.enqueue(ship, 'survey_drone'));
  assert.equal(G.Fabrication.enqueue(ship, 'survey_drone'), false, 'queue full');
  G.Sim.run(9);
  assert.equal(S.units.filter(u => u.type === 'survey_drone').length, 2);
  G.Fabrication.refundQueue(ship);
  assert.equal(G.Economy.get('metal'), 10000 - 100, 'one drone built, four refunded');
  G.CONFIG.POPULATION_CAP = G.Fabrication.population() + 1;
  assert.ok(G.Fabrication.enqueue(ship, 'security_drone'));
  assert.match(G.Fabrication.blocker(ship, 'security_drone'), /capacity/);
  // Fabricator buildings produce too.
  G.CONFIG.POPULATION_CAP = 32;
  const fab = S.buildings.find(b => b.type === 'fabricator');
  assert.ok(G.Fabrication.enqueue(fab, 'utility_spider'));
  G.Sim.run(13);
  assert.equal(S.units.filter(u => u.type === 'utility_spider').length, 2);
});

test('hostile waves fight, walls reduce damage and repair stations heal', () => {
  const G = newGame();
  const S = G.State, E = S.expedition;
  E.elapsed = E.waveAt - 0.01;
  G.Sim.run(0.1);
  const foes = S.units.filter(u => u.team === 'red');
  assert.equal(foes.length, 3);
  const guard = find(G, 'security_drone');
  foes[0].x = guard.x + 70; foes[0].y = guard.y;
  const hp = guard.hp;
  G.Sim.run(3);
  assert.ok(guard.hp < hp || foes[0].hp < 65);
  // Wall aura.
  const b = S.buildings.find(b => b.type === 'defensive_wall');
  const probe = { team: 'blue', x: b.x + 20, y: b.y, radius: 10 };
  assert.equal(G.Buildings.damageReduction(probe), 0.2);
  // Repair aura.
  const rep = S.buildings.find(b => b.type === 'repair');
  const drone = find(G, 'survey_drone');
  for (const f of S.units.filter(u => u.team === 'red')) f.hp = 0;
  G.Sim.run(0.1);
  drone.x = rep.x + 60; drone.y = rep.y + 70; drone.path = []; drone.hp = 100;
  G.Sim.run(2);
  assert.ok(drone.hp > 105, 'healed to ' + drone.hp);
});

test('sensor stations and surveyors study signals', () => {
  const G = newGame();
  const S = G.State, E = S.expedition, sensor = S.buildings.find(b => b.type === 'sensor');
  E.sites = [{ id: 's1', x: sensor.x + 120, y: sensor.y, kind: 'Archive', done: false, progress: 0 }];
  const metal = G.Economy.get('metal');
  G.Sim.run(5);
  assert.ok(E.sites[0].done);
  assert.equal(G.Economy.get('metal'), metal + 70);
  E.sites.push({ id: 's2', x: 20 * T, y: 20 * T, kind: 'Element P', done: false, progress: 0 });
  const survey = find(G, 'survey_drone');
  survey.x = 20 * T + 40; survey.y = 20 * T;
  G.Sim.run(5);
  assert.equal(E.elementP, 1);
  E.readiness = 100;
  assert.ok(G.Expedition.action('boost'));
  assert.equal(E.readiness, 10);
});

test('saves round-trip and invalid data is rejected without side effects', () => {
  const G = newGame();
  G.Gather.command(find(G, 'utility_spider'), G.State.resourceNodes.find(n => n.type === 'scrap_mine'));
  G.Sim.run(20);
  const a = G.Save.serialize();
  G.Save.validate(a);
  G.Save.restore(JSON.parse(JSON.stringify(a)), 1);
  const b = G.Save.serialize();
  delete a.savedAt; delete b.savedAt;
  assert.deepEqual(b, a);
  G.Sim.run(5);
  const bad = JSON.parse(JSON.stringify(a));
  bad.units[0].hp = -3;
  const snapshot = JSON.stringify(G.Save.serialize().units);
  assert.throws(() => G.Save.restore(bad, 1), /Invalid expedition save/);
  assert.equal(JSON.stringify(G.Save.serialize().units), snapshot);
  const wrong = JSON.parse(JSON.stringify(a)); wrong.expedition.queue = undefined; wrong.units.find(u => u.isShip).fabQueue = [{ recipe: 'nope', left: 1 }];
  assert.throws(() => G.Save.validate(wrong));
  // Storage slots.
  assert.ok(G.Save.save(2));
  assert.equal(G.Save.info(2).world, 1);
  assert.equal(G.Save.newestSlot(), 2);
  assert.ok(G.Save.load(2));
});

test('v0.5 (schema 1) saves migrate and keep playing', () => {
  const G = loadSim();
  const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/save-schema-1.json'), 'utf8'));
  const S = G.Save.restore(v1, 1);
  S.paused = false;
  const types = Array.from(S.units, u => u.type).sort();
  assert.deepEqual(types, ['hero', 'security_drone', 'security_drone', 'ship', 'survey_drone', 'utility_spider']);
  const spider = find(G, 'utility_spider');
  assert.equal(spider.command, 'build');
  assert.equal(S.constructionSites.length, 1);
  assert.equal(S.resources.coins, undefined);
  G.Sim.run(20);
  assert.equal(S.constructionSites.length, 0, 'the in-progress wall finishes');
  assert.equal(S.buildings.filter(b => b.type === 'defensive_wall').length, 2);
  G.Save.validate(G.Save.serialize());
});

test('transit keeps the crew, leaves structures and caps carried metal', () => {
  const G = newGame();
  const S = G.State, E = S.expedition;
  S.resources.metal = 1000;
  assert.ok(G.Expedition.action('repair'));
  const hero = G.Units.hero(), sh = G.Units.ship();
  E.readiness = 0;
  hero.x = sh.x + 1200;
  assert.equal(G.Expedition.transit(), false, 'Vance is away from the ship');
  assert.equal(E.world, 1);
  G.Expedition.action('recall');
  G.Sim.run(25);
  const ids = Array.from(G.Units.friendly(), u => u.id).sort(), seed = S.seed;
  assert.ok(G.Expedition.departure().ready, G.Expedition.departure().reasons.join('; '));
  assert.ok(G.Expedition.transit());
  assert.equal(S.expedition.world, 2);
  assert.notEqual(S.seed, seed);
  assert.deepEqual(Array.from(G.Units.friendly(), u => u.id).sort(), ids);
  assert.ok(S.buildings.every(b => b.testZone), 'field structures left behind');
  assert.equal(S.resources.metal, 300);
  assert.equal(S.expedition.lastReport.leftMetal, 600);
  G.Save.validate(G.Save.serialize());
  G.Sim.run(5);
});

test('defeat is reported when the commander dies', () => {
  const G = newGame();
  let reason = null;
  G.Events.on('game:defeat', e => { reason = e.reason; });
  G.Units.hero().hp = 0;
  G.Sim.run(0.1);
  assert.equal(G.State.gameOver, true);
  assert.match(reason, /Vance/);
});

test('scale: 2,000 units in combat stay within the tick budget', () => {
  const G = newGame();
  const S = G.State, C = G.CONFIG;
  C.POPULATION_CAP = 1e9;
  const cx = C.WORLD_W / 2;
  for (let i = 0; i < 1000; i++){
    const a = G.openPoint(cx - 3000 + (i % 50) * 60, 150 * T + Math.floor(i / 50) * 60);
    const b = G.openPoint(cx - 3000 + (i % 50) * 60, 150 * T + 1300 + Math.floor(i / 50) * 60);
    G.Units.spawn('security_drone', a.x, a.y);
    G.Units.spawn('hostile_machine', b.x, b.y);
  }
  G.rebuildSpatial();
  G.Sim.run(1);   // warm up
  const t0 = performance.now();
  G.Sim.run(5);
  const perTick = (performance.now() - t0) / 150;
  assert.ok(perTick < 30, `average tick ${perTick.toFixed(2)} ms`);
  assert.ok(S.units.length < 2005, 'combat resolved some units');
});

test('new units, recipes, structures and behaviours work from data alone (docs example)', () => {
  const G = newGame();
  G.Defs.units.define('heavy_drone', {
    name: 'Heavy Drone', hp: 400, speed: 90, radius: 14, range: 240, damage: 30, reload: 1.4, sight: 700,
    capabilities: ['fight'], visual: 'rifle'
  });
  G.Defs.recipes.define('heavy_drone', { name: 'Heavy Drone', unit: 'heavy_drone', cost: { metal: 300 }, time: 18 });
  G.Behaviors.register('produce', {
    update(b, cfg, dt){ b.timer = (b.timer || 0) + dt; if (b.timer >= cfg.interval){ b.timer = 0; G.Economy.add(cfg.resource, cfg.amount, 'production'); } }
  });
  G.Defs.buildables.define('refinery', {
    name: 'Refinery', w: 2, h: 2, hp: 600, buildTime: 12, cost: { metal: 250 }, symbol: 'RF',
    behaviors: [{ type: 'produce', resource: 'metal', amount: 5, interval: 10 }]
  });
  assert.equal(G.Defs.verify(), true);
  const S = G.State;
  S.resources.metal = 1000;
  assert.ok(G.Fabrication.enqueue(G.Units.ship(), 'heavy_drone'));
  const p = openTileNear(G, 6, 4);
  G.Buildings.add('refinery', p.x, p.y);
  const metal = G.Economy.get('metal');
  G.Sim.run(21);
  assert.ok(S.units.some(u => u.type === 'heavy_drone'));
  assert.ok(G.Economy.get('metal') >= metal + 10);
  G.Save.validate(G.Save.serialize());
});

test('Hostile Fabricator spawns waves at one point, waits for it to clear, and gathers them at a movable rally point', () => {
  const G = newGame();
  const S = G.State, b = S.buildings.find(b => b.type === 'hostile_fabricator'), SP = G.Spawner;
  assert.ok(b, 'testing zone includes the Hostile Fabricator');
  assert.equal(b.team, 'red');
  assert.equal(SP.state(b).running, false, 'idle until started');
  assert.ok(SP.state(b).rally.y > b.y, 'default rally point south of the structure');
  G.Sim.run(2);
  assert.equal(S.units.filter(u => u.team === 'red').length, 0);
  // Keep the crew out of range so they do not shoot the test subjects.
  for (const u of G.Units.crew()) u.maxHp = u.hp = 1e9;
  // One fast wave: every unit appears on the spawn point, facing the rally point.
  SP.configure(b, { rate: 600, amount: 60 });
  SP.start(b);
  const p = SP.spawnPoint(b);
  G.Sim.step();
  const first = SP.spawnedBy(b);
  assert.equal(first.length, 20, 'rate 600 → 20 in the first tick');
  assert.ok(first.every(u => Math.hypot(u.x - p.x, u.y - p.y) < 60), 'all at the spawn point');
  assert.ok(p.y > b.y + b.h * T / 2, 'spawn point on the rally side');
  // While a unit still stands on the spawn point, no new wave appears.
  const blocker = first[0];
  for (let i = 0; i < 20; i++){ blocker.x = p.x; blocker.y = p.y; blocker.path = []; G.Sim.step(); }
  assert.equal(SP.spawnedBy(b).length, 20, 'waits for the spawn point to clear');
  // Once it moves away, the next wave (what accumulated meanwhile) appears.
  G.Sim.run(8);
  assert.equal(SP.state(b).spawned, 60);
  assert.equal(SP.state(b).running, false, 'stops at the requested count');
  // Held units gather at the rally point and do not hunt.
  const near = (pt, r) => SP.spawnedBy(b).filter(u => Math.hypot(u.x - pt.x, u.y - pt.y) < r).length;
  G.Sim.run(6);
  assert.ok(SP.spawnedBy(b).every(u => u.aiHold));
  assert.ok(near(SP.state(b).rally, 260) >= 55, 'gathered at the rally point: ' + near(SP.state(b).rally, 260));
  // Moving the rally point moves them.
  const moved = G.openPoint(b.x + 700, b.y + 500);
  SP.configure(b, { rally: moved });
  assert.deepEqual({ ...SP.state(b).rally }, { x: moved.x, y: moved.y });
  G.Sim.run(10);
  assert.ok(near(moved, 260) >= 55, 'followed the rally point: ' + near(moved, 260));
  // Switching to hunt sends them after the crew.
  SP.configure(b, { hold: false });
  G.Sim.run(2);
  assert.ok(SP.spawnedBy(b).every(u => !u.aiHold));
  assert.ok(SP.spawnedBy(b).some(u => u.path.length || u.pathPending || u.aiMode), 'released units start advancing');
  // Settings, including the rally point, survive a save; removing clears only this spawner's units.
  SP.configure(b, { hold: true });
  const d = G.Save.serialize();
  G.Save.validate(d);
  G.Save.restore(d, 1);
  S.paused = false;   // gameplay resumes after a load (the UI does this when it enters the scene)
  const b2 = S.buildings.find(x => x.id === b.id);
  assert.equal(SP.state(b2).amount, 60);
  assert.deepEqual({ ...SP.state(b2).rally }, { x: moved.x, y: moved.y });
  const alive = SP.spawnedBy(b2).length;
  assert.ok(alive >= 55);
  assert.equal(SP.clear(b2), alive);
  assert.equal(S.units.filter(u => u.team === 'red').length, 0);
  // Very fast rates: waves are capped per tick, and the whole run still completes.
  SP.configure(b2, { rate: 1000, amount: 1200, hold: true });
  SP.start(b2);
  G.Sim.step();
  assert.ok(SP.spawnedBy(b2).length <= SP.MAX_PER_TICK);
  for (let i = 0; i < 60 && SP.state(b2).running; i++) G.Sim.run(1);
  assert.equal(SP.state(b2).spawned, 1200, 'counted as spawned');
  assert.equal(SP.state(b2).running, false);
  assert.equal(G.Defs.buildables.get('hostile_fabricator').debugOnly, true, 'not in the Spider build menu');
});

test('crowded units slide along a wall instead of pinning each other against it', () => {
  // Regression: a push was all-or-nothing, so a unit resting on a wall's edge, nudged a hair
  // into the wall by every push, could never move, and a unit squeezing past it stayed stuck
  // (a Hostile Fabricator's spawn point next to the Shield Projector never cleared).
  const G = newGame();
  const S = G.State, grid = S.grid, b = S.buildings.find(b => b.type === 'shield_projector');
  const gx = Math.floor(b.x / T), gy = Math.floor((b.y - b.h * T / 2) / T);   // top row of its footprint
  assert.ok(!grid.passable(gx, gy) && grid.passable(gx, gy - 1) && grid.passable(gx + 1, gy - 1), 'open ground along the top edge');
  const put = (x, y) => { const u = G.Units.spawn('hostile_machine', x, y, { team: 'red' }); u.aiHold = true; u.path = []; return u; };
  const x0 = (gx + 0.5) * T, y0 = gy * T - 0.05;
  const a = put(x0, y0), c = put(x0 - 18, y0 - 1.45);   // overlapping, pushing a east and a hair south
  G.SystemManager.registry.get('movement').update(1 / 30);
  assert.ok(a.x > x0 + 2, `pushed along the wall (moved ${(a.x - x0).toFixed(2)} px)`);
  assert.ok(grid.passableWorld(a.x, a.y) && grid.passableWorld(c.x, c.y), 'both stay on open ground');
});

test('a unit pushed onto a wall with its next waypoint straight through it drops the route to re-plan', () => {
  // Regression: sliding along the open axis moved it ~0 px each tick, so it kept a route it
  // could never follow (and a spawner waiting for it to leave never spawned again).
  const G = newGame();
  const S = G.State, b = S.buildings.find(b => b.type === 'shield_projector');
  const gx = Math.floor(b.x / T), gy = Math.floor((b.y - b.h * T / 2) / T);
  const x0 = (gx + 0.5) * T, u = G.Units.spawn('hostile_machine', x0, gy * T - 0.05, { team: 'red' });
  u.aiHold = true; u.path = [{ x: x0 + 0.01, y: (gy + 4) * T }]; u.pathIndex = 0;
  G.SystemManager.registry.get('movement').update(1 / 30);
  assert.equal(u.path.length, 0, 'route dropped');
  assert.ok(S.grid.passableWorld(u.x, u.y));
});

test('metal mines need a centred 3×3 Mine Building, then extract slowly into a stockpile Spiders haul', () => {
  const G = newGame();
  const S = G.State, spider = find(G, 'utility_spider');
  const deposits = S.resourceNodes.filter(n => n.type === 'metal_mine');
  assert.ok(deposits.length >= 3, 'deposits near the ship plus one in the testing zone');
  const free = deposits.find(n => !G.Gather.mineOn(n) && !S.buildings.some(b => b.nodeId === n.id));
  assert.ok(free.remaining >= 1e6 - 1, 'near-endless reserve');
  // A bare deposit does nothing and cannot be hauled from.
  assert.equal(G.Gather.command(spider, free), false);
  // Placement: only centred on the deposit.
  const d = G.Defs.buildables.get('mine_building');
  assert.equal(d.w, 3); assert.equal(d.h, 3);
  assert.equal(G.Buildings.canPlaceKey('mine_building', free.gx, free.gy), false, 'off-centre');
  assert.equal(G.Buildings.canPlaceKey('mine_building', free.gx - 1, free.gy - 1), true, 'centred');
  const snap = G.Buildings.placementAt('mine_building', free.x + 40, free.y - 30);
  assert.deepEqual([snap.gx, snap.gy], [free.gx - 1, free.gy - 1], 'snaps onto the nearby deposit');
  assert.equal(G.Buildings.canPlaceKey('defensive_wall', free.gx, free.gy), false, 'other structures cannot cover a deposit');
  // Build it with the Spider.
  S.resources.metal = 500;
  assert.ok(G.Construction.order(spider, 'mine_building', free.gx - 1, free.gy - 1));
  G.Sim.run(40);
  const mine = S.buildings.find(b => b.type === 'mine_building' && b.gx === free.gx - 1);
  assert.ok(mine, 'mine built');
  assert.equal(free.buildingId, mine.id);
  // Extraction is slow (2/s) compared with scavenging (20/s).
  const s0 = G.Gather.stockTotal(mine);
  G.Sim.run(10);
  const made = G.Gather.stockTotal(mine) - s0;
  assert.ok(made > 17 && made < 23, 'about 20 in 10 s, got ' + made);
  // Haul from the stockpile to the ship.
  const metal = G.Economy.get('metal');
  assert.ok(G.Gather.command(spider, mine));
  G.Sim.run(60);
  assert.ok(G.Economy.get('metal') > metal + 30, 'hauled metal arrived: ' + (G.Economy.get('metal') - metal));
  assert.equal(spider.mineId, mine.id);
  assert.ok(free.remaining > 1e6 - 1000);
  // Saves keep the pairing; destroying the mine frees the deposit.
  const saved = G.Save.serialize();
  G.Save.validate(saved);
  G.Save.restore(saved, 1); S.paused = false;
  const mine2 = S.buildings.find(b => b.id === mine.id), node2 = S.resourceNodes.find(n => n.id === free.id);
  assert.equal(G.Gather.mineOn(node2), mine2);
  mine2.hp = 0; G.Sim.run(0.2);
  assert.equal(node2.buildingId, null);
  assert.equal(G.Buildings.canPlaceKey('mine_building', node2.gx - 1, node2.gy - 1), true);
});

test('Follow: any friendly unit follows the unit chosen for it', () => {
  const G = newGame();
  const S = G.State, hero = G.Units.hero(), survey = find(G, 'survey_drone'), guard = find(G, 'security_drone'), spider = find(G, 'utility_spider');
  // A drone follows another drone (not Vance).
  assert.equal(G.Orders.setCommand([guard], 'follow', null, survey.id).length, 1);
  assert.equal(guard.followId, survey.id);
  const dest = G.openPoint(survey.x + 900, survey.y + 300);
  G.Orders.move([survey], dest.x, dest.y);
  G.Sim.run(12);
  assert.ok(Math.hypot(guard.x - survey.x, guard.y - survey.y) < 200, 'guard kept up with the survey drone');
  // Vance can follow too, and a unit never follows itself.
  assert.equal(G.Orders.setCommand([hero, spider], 'follow', null, spider.id).length, 1, 'only Vance; the Spider skips itself');
  assert.equal(hero.command, 'follow');
  assert.equal(spider.command, 'idle');
  // Following ends when the target dies.
  survey.hp = 0;
  G.Sim.run(0.5);
  assert.equal(guard.command, 'idle');
  // Stop clears it; hostiles cannot be followed.
  G.Orders.setCommand([hero], 'idle');
  assert.equal(hero.command, 'idle');
  const foe = G.Units.spawn('hostile_machine', hero.x + 2000, hero.y);
  assert.equal(G.Orders.setCommand([guard], 'follow', null, foe.id).length, 0);
});

test('Utility Spider storage holds 25 and older saves are upgraded', () => {
  const G = newGame();
  const spider = find(G, 'utility_spider');
  assert.equal(spider.storage.capacity, 25);
  const d = G.Save.serialize();
  d.units.find(u => u.type === 'utility_spider').storage.capacity = 10;
  G.Save.restore(d, 1);
  assert.equal(find(G, 'utility_spider').storage.capacity, 25);
});

test('swarm: enemies march on Vance down one shared flow field, without per-unit route searches', () => {
  const G = newGame();
  const S = G.State, hero = G.Units.hero(), T = 48;
  for (const u of S.units) if (u.team === 'blue' && !u.isShip && !u.isHero) u.hp = 0;   // nothing to distract them
  G.Sim.run(0.1);
  const foes = [];
  for (let i = 0; i < 300; i++){
    const p = G.openPoint(hero.x + 45 * T + (i % 20) * 30, hero.y - 20 * T + Math.floor(i / 20) * 30, 0, 20);
    foes.push(G.Units.spawn('hostile_machine', p.x, p.y));
  }
  G.rebuildSpatial();
  hero.maxHp = hero.hp = 1e9;
  for (let i = 0; i < 20 && !(G.Swarm.field && G.Swarm.field.ready); i++) G.Sim.run(0.5);
  assert.ok(G.Swarm.field && G.Swarm.field.ready, 'field built (it spans several ticks)');
  const d0 = foes.reduce((a, u) => a + Math.hypot(u.x - hero.x, u.y - hero.y), 0) / foes.length;
  const calls = S.metrics.pathCalls;
  G.Sim.run(8);
  const d1 = foes.filter(u => u.hp > 0).reduce((a, u) => a + Math.hypot(u.x - hero.x, u.y - hero.y), 0) / foes.length;
  assert.ok(d1 < d0 - 450, `advanced on Vance: ${d0.toFixed(0)} → ${d1.toFixed(0)} px`);
  assert.ok(S.metrics.pathCalls - calls < 60, `few individual searches (${S.metrics.pathCalls - calls}) for 300 marching units`);
  // The field follows Vance when he moves.
  const goal = S.grid.nearestOpen(Math.floor(hero.x / T) - 30, Math.floor(hero.y / T) + 10, 10);
  hero.x = (goal.x + 0.5) * T; hero.y = (goal.y + 0.5) * T;
  G.Sim.run(3);
  assert.equal(G.Swarm.field.goal, goal.y * S.grid.cols + goal.x);
});

test('swarm: aggro engages anything friendly within 10 tiles, including structures', () => {
  const G = newGame();
  const S = G.State, hero = G.Units.hero(), T = 48, drone = S.units.find(u => u.type === 'security_drone');
  hero.maxHp = hero.hp = 1e9;
  // A drone far from Vance: an enemy 8 tiles away engages it; one 16 tiles away ignores it.
  const spot = G.openPoint(hero.x - 60 * T, hero.y - 40 * T, 0, 20);
  Object.assign(drone, { x: spot.x, y: spot.y, path: [] }); G.Orders.setCommand([drone], 'idle');
  drone.maxHp = drone.hp = 1e9; drone.damage = 0;
  const near = G.Units.spawn('hostile_machine', ...Object.values(G.openPoint(spot.x + 8 * T, spot.y, 0, 4)));
  const far = G.Units.spawn('hostile_machine', ...Object.values(G.openPoint(spot.x, spot.y + 16 * T, 0, 4)));
  G.rebuildSpatial();
  G.Sim.run(3);
  assert.equal(near.aiTargetId, drone.id, 'near enemy engages the drone');
  assert.ok(Math.hypot(near.x - drone.x, near.y - drone.y) < 200, 'and closes to firing range');
  assert.notEqual(far.aiTargetId, drone.id, 'far enemy keeps marching');
  assert.equal(far.aiMode, 'march');
  assert.ok(drone.hp < 1e9, 'the drone is being shot');
  // Structures: a player wall with no units around draws fire; testing-zone fixtures never do.
  drone.hp = 0; near.hp = 0; far.hp = 0; G.Sim.run(0.1);
  const wspot = S.grid.nearestOpen(Math.floor(hero.x / T) + 40, Math.floor(hero.y / T) + 30, 10);
  const wall = G.Buildings.add('defensive_wall', wspot.x, wspot.y);
  const e = G.Units.spawn('hostile_machine', ...Object.values(G.openPoint(wall.x + 6 * T, wall.y, 0, 4)));
  G.rebuildSpatial();
  G.Sim.run(4);
  assert.equal(e.aiTargetId, wall.id);
  assert.ok(wall.hp < wall.maxHp, 'wall damaged: ' + wall.hp);
  const fixture = S.buildings.find(b => b.testZone);
  assert.equal(G.Buildings.nearestTarget({ team: 'red', x: fixture.x, y: fixture.y }, 500) === fixture, false);
});

test('simulation is deterministic: the same swarm battle plays out identically twice', () => {
  const play = () => {
    const G = newGame(), S = G.State, h = G.Units.hero(), T = 48;
    for (let i = 0; i < 400; i++){ const p = G.openPoint(h.x + 30 * T + (i % 20) * 30, h.y + Math.floor(i / 20) * 30, 0, 20); G.Units.spawn('hostile_machine', p.x, p.y); }
    G.rebuildSpatial();
    G.Sim.run(12);
    let hash = 2166136261;
    for (const u of S.units){ for (const v of [u.id, Math.round(u.x * 100), Math.round(u.y * 100), Math.round(u.hp * 100)]){ hash ^= v; hash = Math.imul(hash, 16777619) >>> 0; } }
    return { hash, n: S.units.length, pathCalls: S.metrics.pathCalls };
  };
  const a = play(), b = play();
  assert.deepEqual({ ...b }, { ...a });
});

test('new games use the all-grass test map; transit keeps the map type', () => {
  const G = newGame();
  const S = G.State;
  assert.equal(S.map, 'grass');
  assert.ok(S.grid.tiles.every(t => t === G.TT.GRASS), '100% grass');
  assert.deepEqual(Array.from(S.terrainEdits), [], 'nothing to clear on open ground');
  assert.ok(S.buildings.some(b => b.type === 'hostile_fabricator') && S.resourceNodes.length >= 4, 'testing zone and deposits still placed');
  const forest = loadSim();
  forest.Scenario.newGame({ seed: 72491, map: 'forest' });
  assert.equal(fnv(forest.MapGen.forest(72491).tiles), 1434927080, 'forest generator unchanged');
  assert.ok(forest.State.grid.tiles.some(t => t === forest.TT.TREE));
});

test('woodlands generator is deterministic, with heights, water and a clear landing zone', () => {
  const G = loadSim();
  for (const [a, b, c] of [[1, 2, 3], [-7, 512, 72491], [0, 0, 0]]) assert.equal(G.hashRandom3(a, b, c), G.hashRandom(a, b, c));
  const grid = G.MapGen.woodlands(72491), art = grid.art, id = k => G.Defs.terrain.get(k).id;
  // Pinned like the forest map: existing Woodlands saves rebuild their terrain from this.
  assert.equal(fnv(grid.tiles), 1031677493, 'woodlands terrain unchanged');
  assert.equal(fnv(art.level), 4273338452, 'woodlands heights unchanged');
  assert.equal(fnv(G.MapGen.woodlands(72491).tiles), fnv(grid.tiles), 'same seed, same map');
  assert.notEqual(fnv(G.MapGen.woodlands(5).tiles), fnv(grid.tiles));
  const has = k => grid.tiles.includes(id(k));
  for (const k of ['tree', 'tall_grass', 'water', 'waterfall', 'cliff', 'steps', 'bridge', 'swamp', 'reeds', 'fallen_tree', 'cave', 'log_wall', 'sawhorse', 'wall', 'door']) assert.ok(has(k), k);
  assert.ok(art.level.some(l => l === 0) && art.level.some(l => l === 4), 'five height levels');
  assert.ok(art.detail.some(d => d > 0) && art.places.some(p => p.kind === 'settlement'));
  // The ship lands on a flat, open pad 24 tiles across at the centre.
  const mid = grid.cols / 2, l0 = art.level[mid * grid.cols + mid];
  for (let y = mid - 24; y <= mid + 24; y++) for (let x = mid - 24; x <= mid + 24; x++){
    if (Math.hypot(x - mid, y - mid) > 24) continue;
    assert.equal(grid.get(x, y), id('clearing'), `pad at ${x},${y}`);
    assert.equal(art.level[y * grid.cols + x], l0);
  }
  // A cliff always separates two height levels: no open tile sits beside lower open ground.
  let steps = 0;
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols - 1; x++){
    const i = y * grid.cols + x, j = i + 1;
    if (art.level[i] !== art.level[j] && grid.terrainPassable(x, y) && grid.terrainPassable(x + 1, y)){
      const t = [grid.tiles[i], grid.tiles[j]];
      if (!t.includes(id('slope')) && !t.includes(id('steps')) && !t.includes(id('bridge'))) steps++;
    }
  }
  assert.ok(steps < 60, 'level changes are cliffs, slopes, steps or bridges; loose steps: ' + steps);
});

test('a woodlands game starts, plays and survives a save', () => {
  const G = loadSim();
  G.Scenario.newGame({ seed: 72491, map: 'woodlands' });
  const S = G.State, sh = G.Units.ship();
  assert.equal(S.map, 'woodlands');
  for (const b of S.buildings) for (let y = b.gy; y < b.gy + b.h; y++) for (let x = b.gx; x < b.gx + b.w; x++) assert.ok(S.grid.terrainPassable(x, y), b.type + ' on open ground');
  for (const p of S.expedition.sites) assert.ok(S.grid.reachable(sh.gx + 3, sh.gy + sh.h, Math.floor(p.x / T), Math.floor(p.y / T)), 'signal reachable');
  S.paused = false;
  G.Sim.run(3);
  const tiles = Array.from(S.grid.tiles), level = fnv(S.grid.art.level);
  G.Save.restore(G.Save.serialize(), 1);
  assert.deepEqual(Array.from(G.State.grid.tiles), tiles);
  assert.equal(fnv(G.State.grid.art.level), level, 'heights rebuilt from the seed');
});

test('landing site: new games land where asked; Woodlands keeps it off water; saves keep it', () => {
  const G = loadSim(), id = k => G.Defs.terrain.get(k).id;
  // Test map: the ship lands on the chosen tile; out-of-range requests stay 64 tiles from the edge.
  G.Scenario.newGame({ seed: 7, map: 'grass', landing: { x: 120, y: 400 } });
  let sh = G.Units.ship();
  assert.deepEqual({ ...G.State.landing }, { x: 120, y: 400 });
  assert.equal(sh.x, 120 * T); assert.equal(sh.y, 400 * T);
  assert.ok(Math.hypot(G.Units.hero().x - sh.x, G.Units.hero().y - sh.y) < 400, 'Vance starts beside the ship');
  G.Scenario.newGame({ seed: 7, map: 'grass', landing: { x: 3, y: 9999 } });
  assert.deepEqual({ ...G.State.landing }, { x: 64, y: 511 - 64 });
  // Woodlands: the clearing is built around the landing site.
  const g = G.MapGen.woodlands(72491, { landing: { x: 400, y: 150 } }), L = g.art.landing;
  assert.ok(Math.hypot(L.x - 400, L.y - 150) < 20, 'lands at or near the chosen tile');
  for (let y = L.y - 20; y <= L.y + 20; y++) for (let x = L.x - 20; x <= L.x + 20; x++)
    if (Math.hypot(x - L.x, y - L.y) <= 20) assert.equal(g.get(x, y), id('clearing'), `pad at ${x},${y}`);
  // A landing asked for in a river moves to the nearest dry ground.
  const river = G.MapGen.woodlands(72491), cols = river.cols;
  let wet = null;
  for (let i = 0; i < river.size && !wet; i++){ const x = i % cols, y = (i / cols) | 0; if (river.tiles[i] === id('water') && x > 80 && x < cols - 80 && y > 80 && y < cols - 80) wet = { x, y }; }
  const moved = G.MapGen.woodlands(72491, { landing: wet }).art.landing;
  assert.notDeepEqual({ ...moved }, wet);
  assert.ok(Math.hypot(moved.x - wet.x, moved.y - wet.y) < 60, 'moved to nearby dry ground');
  const dryGrid = G.MapGen.woodlands(72491, { landing: wet });
  for (let y = moved.y - 24; y <= moved.y + 24; y++) for (let x = moved.x - 24; x <= moved.x + 24; x++)
    if (Math.hypot(x - moved.x, y - moved.y) <= 24) assert.ok(dryGrid.terrainPassable(x, y), `open ground at ${x},${y}`);
  // A Woodlands game with a chosen landing site restores the same terrain and landing.
  G.Scenario.newGame({ seed: 72491, map: 'woodlands', landing: { x: 400, y: 150 } });
  sh = G.Units.ship();
  assert.deepEqual({ ...G.State.landing }, { ...L });
  assert.equal(sh.x, L.x * T); assert.equal(sh.y, L.y * T);
  const tiles = Array.from(G.State.grid.tiles);
  const d = G.Save.serialize();
  assert.deepEqual({ ...d.landing }, { ...L });
  G.Save.restore(d, 1);
  assert.deepEqual({ ...G.State.landing }, { ...L });
  assert.deepEqual(Array.from(G.State.grid.tiles), tiles);
});

test('map editor: load woodlands and the test map, and keep named maps', () => {
  const G = newGame();
  const S = G.State, sh = G.Units.ship(), id = k => G.Defs.terrain.get(k).id;
  assert.equal(G.MapEdit.loadMap('nowhere'), false);
  assert.equal(G.MapEdit.loadMap('woodlands', 1.5), false);
  assert.equal(G.MapEdit.loadMap('woodlands', 9, [{ x: 0, y: 0, w: 1, h: 1, t: 200 }]), false, 'unknown terrain in an edit');
  // Save the test map with an edit, then swap in Woodlands under the running game.
  G.MapEdit.paint(sh.gx - 30, sh.gy, 3, G.TT.WATER);
  const testTiles = Array.from(S.grid.tiles);
  assert.ok(G.MapLibrary.saveCurrent('Test map'));
  assert.ok(G.MapEdit.loadMap('woodlands', 424242));
  assert.equal(S.map, 'woodlands');
  assert.equal(S.seed, 424242);
  assert.ok(S.grid.art && S.grid.tiles.includes(id('cliff')));
  for (const b of S.buildings) for (let y = b.gy; y < b.gy + b.h; y++) for (let x = b.gx; x < b.gx + b.w; x++) assert.ok(S.grid.terrainPassable(x, y), b.type + ' on open ground');
  for (const u of S.units) if (!u.isShip) assert.ok(S.grid.passableWorld(u.x, u.y), u.type + ' on open ground');
  // The swap is saved: a restore rebuilds the same Woodlands terrain.
  const woodTiles = Array.from(S.grid.tiles);
  G.Save.restore(G.Save.serialize(), 1);
  assert.equal(G.State.map, 'woodlands');
  assert.deepEqual(Array.from(G.State.grid.tiles), woodTiles);
  assert.ok(G.MapLibrary.saveCurrent('Woodlands 424242'));
  // Reload the saved test map: the same tiles as before, edits included.
  assert.equal(G.MapLibrary.list().map(m => m.name).join('|'), 'Test map|Woodlands 424242');
  assert.ok(G.MapLibrary.load('Test map'));
  assert.equal(G.State.map, 'grass');
  assert.ok(!G.State.grid.art);
  assert.deepEqual(Array.from(G.State.grid.tiles), testTiles);
  assert.ok(G.MapLibrary.load('Woodlands 424242'));
  assert.deepEqual(Array.from(G.State.grid.tiles), woodTiles);
  // Resetting to grass on another map switches back to the test map.
  assert.ok(G.MapEdit.reset());
  assert.equal(G.State.map, 'grass');
  assert.ok(G.State.grid.tiles.every(t => t === G.TT.GRASS));
  assert.equal(G.MapLibrary.remove('Test map'), true);
  assert.equal(G.MapLibrary.remove('Test map'), false);
  assert.equal(G.MapLibrary.load('Test map'), false);
});

test('Utility Spider cargo holds 250 metal; loaded spiders follow the definition', () => {
  const G = newGame();
  const spider = find(G, 'utility_spider');
  assert.equal(G.Defs.units.get('utility_spider').cargoCapacity, 250);
  assert.equal(spider.cargoCapacity, 250);
  const d = G.Save.serialize();
  d.units.find(u => u.type === 'utility_spider').cargoCapacity = 600;
  G.Save.restore(d, 1);
  assert.equal(find(G, 'utility_spider').cargoCapacity, 250);
  G.State.paused = false;
  G.Gather.command(find(G, 'utility_spider'), G.State.resourceNodes.find(n => n.type === 'scrap_mine'));
  let most = 0;
  for (let i = 0; i < 40; i++){ G.Sim.run(1); most = Math.max(most, G.Units.cargoTotal(find(G, 'utility_spider'))); }
  assert.ok(most > 200 && most <= 250, 'a load fills to 250, got ' + most);
});

test('debug cheats: godmode protects friendly units, instant build finishes at once, metal can be added', () => {
  const G = newGame();
  const S = G.State, hero = G.Units.hero(), guard = find(G, 'security_drone'), spider = find(G, 'utility_spider');
  assert.equal(G.Cheats.addResource('metal', 5000), true);
  assert.equal(G.Economy.get('metal'), G.EXPEDITION_RULES.startMetal + 5000);
  assert.equal(G.Cheats.addResource('nope', 5), false);
  G.Cheats.set('god', true);
  for (let i = 0; i < 12; i++) G.Units.spawn('hostile_machine', hero.x + 150 + (i % 4) * 30, hero.y + Math.floor(i / 4) * 30);
  G.Sim.run(6);
  assert.equal(hero.hp, hero.maxHp, 'Vance untouched');
  assert.equal(guard.hp, guard.maxHp);
  G.Cheats.set('god', false);
  // Instant build: the structure appears on the next tick, fabrication too.
  G.Cheats.set('instantBuild', true);
  const p = openTileNear(G, 2, 4);
  assert.ok(G.Construction.order(spider, 'generator', p.x, p.y));
  G.Sim.step();
  assert.ok(S.buildings.some(b => b.type === 'generator' && b.gx === p.x && b.gy === p.y));
  assert.equal(spider.buildSiteId, null);
  const before = G.Units.countTeam('blue');
  assert.ok(G.Fabrication.enqueue(G.Units.ship(), 'survey_drone'));
  G.Sim.step();
  assert.equal(G.Units.countTeam('blue'), before + 1);
  G.Cheats.set('instantBuild', false);
  assert.throws(() => G.Cheats.set('fly', true));
});

test('map editor: paint terrain around structures, erase objects, and keep it all in saves', () => {
  const G = newGame();
  const S = G.State, sh = G.Units.ship(), grid = S.grid, TT = G.TT;
  // Water brush over the ship's edge: the ship's tiles are skipped, others painted.
  const n = G.MapEdit.paint(sh.gx, sh.gy + 2, 5, TT.WATER);
  assert.ok(n > 0 && n < 25, 'painted ' + n);
  assert.equal(grid.get(sh.gx - 2, sh.gy + 2), TT.WATER);
  assert.equal(grid.get(sh.gx + 1, sh.gy + 2), TT.GRASS, 'under the ship stays as it was');
  // A unit standing where water is painted is moved to dry ground.
  const u = find(G, 'survey_drone'), ux = Math.floor(u.x / T), uy = Math.floor(u.y / T);
  G.MapEdit.paint(ux, uy, 3, TT.ROCK);
  assert.ok(grid.passable(Math.floor(u.x / T), Math.floor(u.y / T)), 'unit evacuated');
  // Passable brushes cover the whole square and replace older edits they cover.
  G.MapEdit.paint(ux, uy, 9, TT.PATH);
  assert.equal(grid.get(ux, uy), TT.PATH);
  const edits = S.terrainEdits.length;
  G.MapEdit.paint(ux, uy, 9, TT.FOREST);
  assert.equal(S.terrainEdits.length, edits, 'the covered stroke was dropped');
  // Erase: a structure, a resource node, a signal.
  const wall = G.Buildings.add('defensive_wall', ux + 8, uy);
  assert.equal(G.MapEdit.removeAt(wall.x, wall.y), 'Defensive Wall');
  assert.ok(!S.buildings.includes(wall));
  assert.equal(grid.passable(ux + 8, uy), true);
  const node = S.resourceNodes.find(n => n.type === 'scrap_mine');
  assert.ok(G.MapEdit.removeAt(node.x, node.y));
  assert.ok(!S.resourceNodes.includes(node));
  assert.equal(G.MapEdit.removeAt(sh.x, sh.y), null, 'the ship cannot be erased');
  // Edits survive a save and load.
  const tiles = Array.from(grid.tiles);
  G.Save.restore(G.Save.serialize(), 1);
  assert.deepEqual(Array.from(G.State.grid.tiles), tiles);
  // Reset to grass clears every edit.
  assert.ok(G.MapEdit.reset());
  assert.ok(G.State.grid.tiles.every(t => t === TT.GRASS));
  assert.deepEqual(Array.from(G.State.terrainEdits), []);
  assert.equal(G.MapEdit.reset(TT.WATER), false, 'only passable terrain can fill the map');
});

test('rally points: units from the ship and Fabricators walk to their rally point', () => {
  const G = newGame();
  const S = G.State, ship = G.Units.ship(), fab = S.buildings.find(b => b.type === 'fabricator');
  assert.equal(ship.rally, null, 'none by default');
  assert.equal(fab.rally, null);
  S.resources.metal = 5000;
  G.Cheats.set('instantBuild', true);
  // Without a rally point the unit stays beside the ship.
  G.Fabrication.enqueue(ship, 'survey_drone'); G.Sim.step();
  const idle = S.units[S.units.length - 1];
  G.Sim.run(3);
  assert.ok(!idle.path.length && Math.hypot(idle.x - ship.x, idle.y - ship.y) < 500);
  // With one, new units walk there (spread around it).
  const r1 = G.openPoint(ship.x + 900, ship.y + 700), r2 = G.openPoint(fab.x - 600, fab.y + 500);
  assert.ok(G.Fabrication.setRally(ship, r1));
  assert.ok(G.Fabrication.setRally(fab, r2));
  for (let i = 0; i < 3; i++){ G.Fabrication.enqueue(ship, 'security_drone'); G.Sim.step(); }
  G.Fabrication.enqueue(fab, 'survey_drone'); G.Sim.step();
  const fromShip = S.units.slice(-4, -1), fromFab = S.units[S.units.length - 1];
  G.Cheats.set('instantBuild', false);
  G.Sim.run(15);
  for (const u of fromShip) assert.ok(Math.hypot(u.x - r1.x, u.y - r1.y) < 200, 'at the ship rally point: ' + Math.round(Math.hypot(u.x - r1.x, u.y - r1.y)));
  assert.ok(Math.hypot(fromFab.x - r2.x, fromFab.y - r2.y) < 200, 'at the Fabricator rally point');
  // Saved and restored; cleared with null.
  G.Save.restore(G.Save.serialize(), 1);
  assert.deepEqual({ ...G.Units.ship().rally }, { x: r1.x, y: r1.y });
  assert.deepEqual({ ...G.State.buildings.find(b => b.id === fab.id).rally }, { x: r2.x, y: r2.y });
  G.Fabrication.setRally(G.Units.ship(), null);
  assert.equal(G.Units.ship().rally, null);
  assert.equal(G.Fabrication.setRally(find(G, 'survey_drone'), r1), false, 'only fabricators have rally points');
});

test('Ore Processor turns metal, copper and uranium into steel, electronics and fuel rods', () => {
  const G = newGame();
  const S = G.State, ship = G.Units.ship(), P = G.Fabrication;
  const proc = S.buildings.find(b => b.type === 'ore_processor');
  assert.ok(proc, 'one stands in the testing zone');
  assert.equal(proc.w, 3); assert.equal(proc.h, 3);
  // Each producer offers only its own recipes.
  assert.equal(P.recipesFor(proc).map(r => r.key).join(), 'steel,electronics,fuel_rods');
  assert.ok(P.recipesFor(ship).every(r => r.unit), 'the ship builds units only');
  assert.equal(P.blocker(proc, 'survey_drone'), 'Unavailable');
  assert.equal(P.blocker(ship, 'steel'), 'Unavailable');
  // Steel: 2 metal → 1 steel in 5 s. Inputs are paid when queued.
  S.resources = { metal: 10 };
  assert.ok(P.enqueue(proc, 'steel'));
  assert.equal(G.Economy.get('metal'), 8);
  G.Sim.run(4.8);
  assert.equal(G.Economy.get('steel'), 0, 'not before 5 s');
  G.Sim.run(0.4);
  assert.equal(G.Economy.get('steel'), 1);
  // Electronics: 6 copper → 1 in 12 s. Fuel rods: 6 uranium → 6 in 30 s.
  assert.match(P.blocker(proc, 'electronics'), /Need 6 copper/);
  S.resources.copper = 12; S.resources.uranium = 6;
  const crew = P.population();
  assert.ok(P.enqueue(proc, 'electronics')); assert.ok(P.enqueue(proc, 'electronics')); assert.ok(P.enqueue(proc, 'fuel_rods'));
  assert.equal(P.population(), crew, 'processing does not count toward the crew cap');
  assert.equal(G.Economy.get('copper'), 0); assert.equal(G.Economy.get('uranium'), 0);
  // Saves keep the queue mid-way.
  G.Sim.run(13);
  const saved = G.Save.serialize();
  G.Save.validate(saved);
  G.Save.restore(saved, 1); S.paused = false;
  const proc2 = S.buildings.find(b => b.id === proc.id);
  assert.equal(proc2.fabQueue.map(q => q.recipe).join(), 'electronics,fuel_rods');
  assert.equal(G.Economy.get('electronics'), 1);
  G.Sim.run(11.5 + 30.5);
  assert.equal(G.Economy.get('electronics'), 2);
  assert.equal(G.Economy.get('fuel_rods'), 6);
  // A destroyed processor refunds what was still queued.
  S.resources.metal = 4;
  assert.ok(P.enqueue(proc2, 'steel')); assert.ok(P.enqueue(proc2, 'steel'));
  proc2.hp = 0; G.Sim.run(0.2);
  assert.equal(G.Economy.get('metal'), 4);
});

test('copper and uranium deposits are placed on each Earth and mined like metal', () => {
  const G = newGame();
  const S = G.State, spider = find(G, 'utility_spider');
  for (const type of ['copper_mine', 'uranium_mine']) assert.ok(S.resourceNodes.some(n => n.type === type), type + ' placed');
  const copper = S.resourceNodes.find(n => n.type === 'copper_mine');
  assert.equal(G.Buildings.canPlaceKey('mine_building', copper.gx - 1, copper.gy - 1), true, 'room for a Mine Building');
  S.resources.metal = 500;
  assert.ok(G.Construction.order(spider, 'mine_building', copper.gx - 1, copper.gy - 1));
  G.Sim.run(60);
  const mine = S.buildings.find(b => b.nodeId === copper.id);
  assert.ok(mine, 'mine built on the copper deposit');
  G.Sim.run(20);
  assert.ok(mine.stock.copper > 30, 'extracts copper: ' + mine.stock.copper);
  assert.ok(G.Gather.command(spider, mine));
  G.Sim.run(90);
  assert.ok(G.Economy.get('copper') > 20, 'copper hauled to the ship: ' + G.Economy.get('copper'));
  // Uranium is slower: 1 per second.
  assert.equal(G.Defs.nodes.get('uranium_mine').rate, 1);
  // Transit caps every resource.
  Object.assign(S.resources, { copper: 1000, uranium: 1000, steel: 1000, electronics: 1000, fuel_rods: 1000 });
  S.expedition.repairs = 100; S.expedition.readiness = 0;
  G.Expedition.action('recall'); G.Sim.run(40);
  for (const u of G.Units.friendly()) if (u.cargo) for (const k of Object.keys(u.cargo)) u.cargo[k] = 0;
  assert.ok(G.Expedition.transit(), G.Expedition.departure().reasons.join('; '));
  for (const k of ['copper', 'uranium', 'steel', 'electronics', 'fuel_rods']) assert.equal(S.resources[k], G.Defs.resources.get(k).transitCap, k);
  assert.ok(S.resourceNodes.some(n => n.type === 'copper_mine') && S.resourceNodes.some(n => n.type === 'uranium_mine'), 'new deposits on the next Earth');
});

test('power: the Warp Drive gives 25, Solar Arrays scale with the Earth, and a short grid slows production', () => {
  const G = newGame();
  const S = G.State, P = G.Power, ship = G.Units.ship(), T = G.CONFIG.TILE;
  G.Sim.run(0.1);
  // A Solar Array stands north of the ship in the testing zone.
  const solar = S.buildings.find(b => b.type === 'solar_array');
  assert.ok(solar, 'solar array placed');
  assert.equal(solar.w, 3); assert.equal(solar.h, 2);
  assert.ok(solar.gy + solar.h <= ship.gy, 'north of the ship');
  assert.equal(P.output(ship), 25);
  assert.equal(P.output(solar), 8, 'full sun on the first (temperate) Earth');
  // Idle producers draw nothing; the test-zone mine draws 5 while extracting.
  const fab = S.buildings.find(b => b.type === 'fabricator'), proc = S.buildings.find(b => b.type === 'ore_processor');
  const mines = S.buildings.filter(b => b.type === 'mine_building' && b.team === 'blue');
  assert.equal(P.draw(fab), 0); assert.equal(P.draw(proc), 0);
  const wind = S.buildings.find(b => b.type === 'wind_turbine');
  assert.ok(wind && wind.gy + wind.h <= ship.gy, 'wind turbine north of the ship');
  assert.equal(P.output(wind), 6, 'steady breeze on the first Earth');
  assert.equal(P.grid.supply, 39);
  const sensors = S.buildings.filter(b => b.type === 'defensive_sensor');
  assert.equal(P.grid.demand, 5 * mines.filter(b => G.Gather.extracting(b)).length + 3 * sensors.length, 'extractors and the always-on sensor');
  // Producing draws power.
  S.resources.metal = 10000;
  assert.ok(G.Fabrication.enqueue(fab, 'security_drone'));
  assert.ok(G.Fabrication.enqueue(proc, 'steel'));
  G.Sim.run(0.1);
  assert.equal(P.draw(fab), 10); assert.equal(P.draw(proc), 15);
  assert.equal(P.grid.ratio, 1, '39 supply covers 30 demand');
  // Lose the Solar Array and add demand: everything slows to supply / demand.
  S.buildings.splice(S.buildings.indexOf(solar), 1); S.buildings.splice(S.buildings.indexOf(wind), 1);
  const extra = G.Buildings.add('fabricator', ship.gx + 12, ship.gy + 10);
  assert.ok(G.Fabrication.enqueue(extra, 'survey_drone'));
  G.Sim.run(0.1);
  const demand = P.grid.demand;
  assert.equal(P.grid.supply, 25);
  assert.ok(demand > 25, 'demand ' + demand);
  const left0 = proc.fabQueue[0].left;
  G.Sim.run(1);
  assert.ok(Math.abs((left0 - proc.fabQueue[0].left) - 25 / demand) < 0.05, 'processing runs at ' + (left0 - proc.fabQueue[0].left));
  // The ship's own fabrication runs on the Warp Drive and never slows.
  assert.ok(G.Fabrication.enqueue(ship, 'survey_drone'));
  const s0 = ship.fabQueue[0].left;
  G.Sim.run(1);
  assert.ok(Math.abs((s0 - ship.fabQueue[0].left) - 1) < 0.05);
  // Hostile structures are not on the player's grid.
  const hf = S.buildings.find(b => b.type === 'hostile_fabricator');
  assert.equal(P.factor(hf), 1);
  // Nothing about power is saved: it is rebuilt from structures after loading.
  const saved = G.Save.serialize();
  assert.ok(!JSON.stringify(saved).includes('"ratio"'));
  G.Save.restore(saved, 1);
  assert.equal(P.grid.demand, demand);
});

test('power: solar and wind output follow each Earth\'s climate', () => {
  const G = newGame();
  const S = G.State, P = G.Power, solar = S.buildings.find(b => b.type === 'solar_array'), wind = S.buildings.find(b => b.type === 'wind_turbine');
  assert.equal(wind.w, 2); assert.equal(wind.h, 2);
  const expect = { temperate: [8, 6], frozen: [4.8, 10.8], silent: [10, 0.3], irradiated: [3.2, 7.8] };
  G.Defs.climates.all().forEach((c, i) => {
    S.expedition.climate = i;
    assert.ok(Math.abs(P.output(solar) - expect[c.key][0]) < 1e-9, c.key + ' solar: ' + P.output(solar));
    assert.ok(Math.abs(P.output(wind) - expect[c.key][1]) < 1e-9, c.key + ' wind: ' + P.output(wind));
  });
  // Storm worlds make wind worth building; stagnant ones make it nearly worthless.
  assert.ok(expect.frozen[1] > expect.frozen[0] && expect.silent[1] < 1);
  // Pausing or losing the array removes its output.
  solar.hp = 0;
  assert.equal(P.output(solar), 0);
});

test('the Resource Extractor mines whatever deposit it stands on', () => {
  const G = newGame();
  const S = G.State, d = G.Defs.buildables.get('mine_building');
  assert.equal(d.name, 'Resource Extractor');
  assert.equal(d.w, 3); assert.equal(d.h, 3);
  S.resources.metal = 10000;
  const made = {};
  for (const type of ['metal_mine', 'copper_mine', 'uranium_mine']){
    const n = S.resourceNodes.find(n => n.type === type && !G.Gather.mineOn(n) && !S.buildings.some(b => b.nodeId === n.id));
    assert.ok(G.Buildings.canPlaceKey('mine_building', n.gx - 1, n.gy - 1), type);
    const b = G.Buildings.add('mine_building', n.gx - 1, n.gy - 1);
    assert.equal(b.nodeId, n.id, 'claims the deposit underneath');
    made[type] = b;
  }
  G.Sim.run(10);
  assert.ok(made.metal_mine.stock.metal > 15 && !made.metal_mine.stock.copper);
  assert.ok(made.copper_mine.stock.copper > 15 && !made.copper_mine.stock.metal);
  assert.ok(made.uranium_mine.stock.uranium > 7 && made.uranium_mine.stock.uranium < made.copper_mine.stock.copper, 'uranium is slower');
  // It will not stand anywhere but centred on a deposit.
  const sh = G.Units.ship();
  assert.equal(G.Buildings.canPlaceKey('mine_building', sh.gx + 10, sh.gy + 12), false);
});

// An open field east of the ship, away from the testing zone and deposits.
const field = (G, dx = 14, dy = 16) => { const sh = G.Units.ship(); return G.State.grid.nearestOpen(sh.gx + dx, sh.gy + dy, 6); };

test('walls: Reinforced Walls take less damage; both block movement like the old Wall', () => {
  const G = newGame();
  const S = G.State, T = 48, p = field(G);
  const plain = G.Buildings.add('defensive_wall', p.x, p.y), strong = G.Buildings.add('reinforced_wall', p.x + 2, p.y);
  assert.equal(S.grid.passable(p.x, p.y), false); assert.equal(S.grid.passable(p.x + 2, p.y), false);
  assert.equal(strong.maxHp, 1600); assert.ok(strong.maxHp > plain.maxHp);
  const foe = G.Units.spawn('hostile_machine', (p.x + 1.5) * T, (p.y + 2.5) * T);
  foe.speed = 0; G.rebuildSpatial();
  const hit = b => { const hp = b.hp; foe.aiMode = null; foe.targetId = null; foe.cool = 0; foe.x = b.x; foe.y = b.y + 90; G.Units.rebuildIndex?.(); G.rebuildSpatial();
    // Fire once through the combat system at this structure.
    foe.aiTargetId = b.id; foe.aiMode = 'engage'; foe.aiHold = false; G.SystemManager.get('combat').update(0.01); return hp - b.hp; };
  const dPlain = hit(plain), dStrong = hit(strong);
  assert.ok(dPlain > 0, 'wall damaged: ' + dPlain);
  assert.ok(Math.abs(dStrong - dPlain * 0.65) < 1e-6, `reinforced takes 35% less (${dStrong} vs ${dPlain})`);
});

test('gate: friendly units pass when it opens; enemies never do, and it shuts while they are near', () => {
  const G = newGame();
  const S = G.State, T = 48, p = field(G, 16, 18);
  // A wall line with a 2×1 gate in the middle.
  for (let x = p.x - 6; x <= p.x + 7; x++) if (x < p.x || x > p.x + 1) G.Buildings.add('defensive_wall', x, p.y);
  const gate = G.Buildings.add('gate', p.x, p.y);
  assert.equal(gate.w, 2); assert.equal(gate.h, 1);
  assert.equal(S.grid.passable(p.x, p.y), true, 'the grid (and so the pathfinder) sees the gate as a way through');
  assert.equal(G.Buildings.canPlace(p.x, p.y, 1, 1), false, 'nothing can be built on a gate');
  G.Sim.run(0.1);
  assert.equal(G.Gates.isOpen(gate), false, 'closed with nobody around');
  // A friendly Spider walks through.
  const sp = find(G, 'utility_spider');
  G.Units.clearOrders(sp); sp.x = gate.x; sp.y = gate.y + 4 * T;
  G.rebuildSpatial();
  G.Orders.move([sp], gate.x, gate.y - 4 * T);
  G.Sim.run(6);
  assert.ok(sp.y < gate.y - T, 'spider passed through: y ' + sp.y + ' gate ' + gate.y);
  // A hostile nearby keeps it shut, and even friendly units stop at it.
  const foe = G.Units.spawn('hostile_machine', gate.x + 3 * T, gate.y - 3 * T);
  foe.speed = 0; foe.damage = 0;
  G.Units.clearOrders(sp); sp.x = gate.x; sp.y = gate.y - 2 * T; G.rebuildSpatial();
  G.Sim.run(0.1);
  assert.equal(G.Gates.isOpen(gate), false, 'shut while a hostile is within six tiles');
  assert.equal(G.Gates.blocksWorld(sp, gate.x, gate.y), true);
  // Enemies are blocked even when it is open.
  foe.hp = 0; G.Sim.run(0.1);
  assert.equal(G.Gates.isOpen(gate), true, 'reopens for the waiting spider');
  const raider = G.Units.spawn('hostile_machine', gate.x + 20 * T, gate.y);
  assert.equal(G.Gates.blocksWorld(raider, gate.x, gate.y), true, 'enemies can never enter a gate tile');
  assert.equal(G.Gates.blocksWorld(sp, gate.x, gate.y), false);
  // Gate state is not saved.
  assert.ok(!JSON.stringify(G.Save.serialize()).includes('"open"'));
});

test('turrets: sentry and heavy hit ground, anti-air hits flyers, and the Missile Battery needs missiles', () => {
  const G = newGame();
  const S = G.State, T = 48, sh = G.Units.ship(), p = field(G, 20, 20);
  const put = (key, dx, dy) => G.Buildings.add(key, p.x + dx, p.y + dy);
  const foe = (type, dx, dy) => { const u = G.Units.spawn(type, (p.x + dx) * T, (p.y + dy) * T); u.speed = 0; u.damage = 0; u.hp = u.maxHp = 1000; return u; };
  put('defensive_sensor', -2, 2);   // every turret here hits every shot
  const sentry = put('sentry_turret', 0, 0);
  assert.equal(G.Turrets.accuracy(sentry, G.Defs.buildables.get('sentry_turret').behaviors[0]), 1);
  const ground = foe('hostile_machine', 4, 0), air = foe('hostile_drone', 0, 4);
  G.rebuildSpatial(); G.Sim.run(2.05);
  assert.ok(ground.hp < 1000 && air.hp === 1000, `sentry hits ground only (${ground.hp}, ${air.hp})`);
  sentry.hp = 0; G.Sim.run(0.1);
  // Anti-air: flyers only.
  ground.hp = air.hp = 1000;
  const aa = put('aa_turret', 0, 0);
  G.Sim.run(2);
  assert.ok(air.hp < 1000 && ground.hp === 1000, `anti-air hits air only (${ground.hp}, ${air.hp})`);
  aa.hp = 0; G.Sim.run(0.1);
  // Heavy turret: 70 per shell, every 3 s, with a blast that also catches a neighbour.
  ground.hp = 1000; air.hp = 1000;
  const buddy = foe('hostile_machine', 4.5, 0.4);
  G.rebuildSpatial();
  const heavy = put('heavy_turret', -3, -3);
  G.Sim.run(3.1);
  assert.equal(1000 - ground.hp, 140, 'two shells in 3.1 s');
  assert.equal(1000 - buddy.hp, 140, 'the blast hit the neighbour too');
  assert.equal(air.hp, 1000);
  heavy.hp = 0; ground.hp = 0; buddy.hp = 0; G.Sim.run(0.1);
  // Missile Battery: out to 720, not inside 160, ground or air, one missile per shot.
  const mb = put('missile_battery', 0, 0), far = foe('hostile_drone', 12, 0);
  air.hp = 0; G.rebuildSpatial();
  S.resources.missiles = 0;
  G.Sim.run(2);
  assert.equal(far.hp, 1000, 'no missiles, no fire');
  assert.equal(G.Turrets.get(mb).noAmmo, true);
  S.resources.missiles = 2;
  G.Sim.run(8.2);
  assert.equal(far.hp, 900, 'two missiles, two hits');
  assert.equal(G.Economy.get('missiles'), 0);
  const close = foe('hostile_machine', 1, 1);
  S.resources.missiles = 5; far.hp = 0; G.rebuildSpatial(); G.Sim.run(4.5);
  assert.equal(close.hp, 1000, 'too close for missiles');
  // Testing-zone turrets stay idle.
  const tz = S.buildings.find(b => b.type === 'sentry_turret' && b.testZone);
  assert.ok(tz, 'a sentry stands in the testing zone');
  const near = foe('hostile_machine', 0, 0); near.x = tz.x + 100; near.y = tz.y; G.rebuildSpatial(); G.Sim.run(2);
  assert.equal(near.hp, 1000);
});

test('Missiles are made at a Fabricator from steel and electronics', () => {
  const G = newGame();
  const S = G.State, fab = S.buildings.find(b => b.type === 'fabricator'), P = G.Fabrication;
  assert.ok(P.recipesFor(fab).some(r => r.key === 'missiles'));
  assert.ok(P.recipesFor(fab).some(r => r.key === 'utility_spider'), 'still builds units');
  assert.ok(!P.recipesFor(G.Units.ship()).some(r => r.key === 'missiles'), 'not the ship');
  Object.assign(S.resources, { steel: 2, electronics: 1 });
  assert.ok(P.enqueue(fab, 'missiles'));
  G.Sim.run(10.2);
  assert.equal(G.Economy.get('missiles'), 4);
});

test('Defensive Sensor: turrets without one hit about 75% of shots; it sees 12 tiles through fog and warns', () => {
  const G = newGame();
  const S = G.State, T = 48, p = field(G, 22, 22);
  const sentry = G.Buildings.add('sentry_turret', p.x, p.y);
  const foe = G.Units.spawn('hostile_machine', (p.x + 3) * T, p.y * T);
  foe.speed = 0; foe.damage = 0; foe.hp = foe.maxHp = 100000;
  G.rebuildSpatial();
  G.Sim.run(100);   // ~200 shots
  const hits = (100000 - foe.hp) / 9, shots = G.Turrets.get(sentry).shots;
  assert.ok(shots > 150, 'shots ' + shots);
  assert.ok(hits / shots > 0.65 && hits / shots < 0.85, `hit rate ${(hits / shots).toFixed(2)}`);
  // Replays are identical (the roll is deterministic).
  const G2 = newGame(), p2 = field(G2, 22, 22), s2 = G2.Buildings.add('sentry_turret', p2.x, p2.y), f2 = G2.Units.spawn('hostile_machine', (p2.x + 3) * T, p2.y * T);
  f2.speed = 0; f2.damage = 0; f2.hp = f2.maxHp = 100000; G2.rebuildSpatial(); G2.Sim.run(100);
  assert.equal(f2.hp, foe.hp);
  // A sensor within six tiles makes it 100%, and draws 3 power.
  const sensor = G.Buildings.add('defensive_sensor', p.x - 3, p.y);
  assert.equal(G.Sensors.bonus(sentry), 0.25);
  assert.equal(G.Power.draw(sensor), 3);
  const hp = foe.hp, n0 = G.Turrets.get(sentry).shots;
  G.Sim.run(10);
  assert.equal(hp - foe.hp, 9 * (G.Turrets.get(sentry).shots - n0), 'every shot hits');
  // Early warning: enemies inside 12 tiles are reported once, with a direction.
  const alerts = [];
  G.Events.on('sensor:alert', a => alerts.push(a));
  G.Sensors.last.clear();
  G.Units.spawn('hostile_machine', sensor.x - 10 * T, sensor.y);
  G.rebuildSpatial(); G.Sim.run(1);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].count, 2);
  G.Sim.run(5);
  assert.equal(alerts.length, 1, 'no repeat within 30 s');
  assert.equal(G.Defs.buildables.get('defensive_sensor').sight, 576, '12 tiles of fog vision');
});

test('Shield Projector: switched on it charges, draws 40 power and absorbs damage to nearby structures', () => {
  const G = newGame();
  const S = G.State, T = 48, p = field(G, 18, 24);
  const proj = G.Buildings.add('shield_projector', p.x, p.y);
  const wall = G.Buildings.add('defensive_wall', p.x + 5, p.y + 1), far = G.Buildings.add('defensive_wall', p.x + 12, p.y + 1);
  assert.equal(proj.shieldOn, false); assert.equal(proj.shield, 0);
  G.Sim.run(2);
  assert.equal(proj.shield, 0, 'no charge while off');
  assert.equal(G.Power.draw(proj), 0);
  assert.ok(G.Shields.set(proj, true));
  G.Sim.run(0.1);
  assert.equal(G.Power.draw(proj), 40, 'significant power while on');
  // The ship's 25 + test-zone solar/wind can't cover 40 more: it charges at the grid ratio.
  const ratio = G.Power.grid.ratio;
  assert.ok(ratio < 1, 'ratio ' + ratio);
  const c0 = proj.shield; G.Sim.run(10);
  assert.ok(Math.abs(proj.shield - c0 - 400 * ratio) < 5, `charged ${proj.shield - c0} at ${ratio}`);
  // Full power: up to capacity.
  const extra = [];
  for (let i = 0; i < 6; i++) extra.push(G.Buildings.add('solar_array', p.x - 20, p.y + i * 3));
  G.Sim.run(80);
  assert.equal(proj.shield, 2500);
  // Hits on covered structures come off the charge; outside the field they don't.
  const foe = G.Units.spawn('hostile_machine', wall.x, wall.y + 90);
  foe.speed = 0; G.rebuildSpatial();
  const strike = b => { foe.x = b.x; foe.y = b.y + 90; foe.aiTargetId = b.id; foe.aiMode = 'engage'; foe.aiHold = false; foe.cool = 0; G.rebuildSpatial(); G.SystemManager.get('combat').update(0.01); };
  strike(wall);
  assert.equal(wall.hp, 600, 'wall untouched');
  assert.equal(proj.shield, 2494, 'the field took the hit');
  strike(far);
  assert.ok(far.hp < 600, 'outside the field: damaged');
  // It runs out: then damage goes through.
  proj.shield = 2; strike(wall);
  assert.equal(proj.shield, 0); assert.equal(wall.hp, 596);
  // Off: no draw, keeps its charge; the switch and charge are saved.
  proj.shield = 1234; G.Shields.set(proj, false); G.Sim.run(0.1);
  assert.equal(G.Power.draw(proj), 0); assert.equal(proj.shield, 1234);
  G.Shields.set(proj, true);
  const saved = G.Save.serialize();
  G.Save.restore(saved, 1);
  const again = S.buildings.find(b => b.id === proj.id) || G.State.buildings.find(b => b.id === proj.id);
  assert.equal(again.shieldOn, true); assert.equal(again.shield, 1234);
});
