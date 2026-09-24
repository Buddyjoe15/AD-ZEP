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

test('terrain generation is deterministic and unchanged from v0.5', () => {
  const G = loadSim();
  assert.equal(fnv(G.MapGen.forest(72491).tiles), 1434927080);
  assert.equal(fnv(G.MapGen.forest(1).tiles), 3605140733);
});

test('grid occupancy and regions follow structures', () => {
  const G = newGame();
  const S = G.State, p = openTileNear(G, 4, 3);
  assert.ok(S.grid.passable(p.x, p.y));
  const b = G.Buildings.add('wall', p.x, p.y);
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
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) G.Buildings.add('wall', p.x + dx, p.y + dy);
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
  assert.ok(G.Construction.order(spider, 'wall', q.x, q.y));
  assert.equal(G.Economy.get('metal'), 40);
  G.Orders.move([spider], spider.x + 100, spider.y);
  assert.equal(G.Economy.get('metal'), 100);
  assert.equal(S.constructionSites.length, 0);
  // A dead builder's site is refunded rather than blocking departure forever.
  assert.ok(G.Construction.order(spider, 'wall', q.x, q.y));
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
  const b = S.buildings.find(b => b.type === 'wall');
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
  const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/save-v1.json'), 'utf8'));
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
  assert.equal(S.buildings.filter(b => b.type === 'wall').length, 2);
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

test('Hostile Fabricator spawns at the chosen speed up to the chosen count', () => {
  const G = newGame();
  const S = G.State, b = S.buildings.find(b => b.type === 'hostile_fabricator');
  assert.ok(b, 'testing zone includes the Hostile Fabricator');
  assert.equal(b.team, 'red');
  assert.equal(G.Spawner.state(b).running, false, 'idle until started');
  G.Sim.run(2);
  assert.equal(S.units.filter(u => u.team === 'red').length, 0);
  G.Spawner.configure(b, { rate: 20, amount: 50 });
  G.Spawner.start(b);
  G.Sim.run(1);
  const afterOne = G.Spawner.spawnedBy(b).length;
  assert.ok(afterOne >= 18 && afterOne <= 22, `~20 spawned in 1 s, got ${afterOne}`);
  G.Sim.run(3);
  assert.equal(G.Spawner.spawnedBy(b).length, 50);
  assert.equal(G.Spawner.state(b).running, false, 'stops at the requested count');
  // Held units do not hunt; switching to hunt sends them after the crew.
  assert.ok(G.Spawner.spawnedBy(b).every(u => u.aiHold && !u.path.length));
  G.Spawner.configure(b, { hold: false });
  G.Sim.run(2);
  assert.ok(G.Spawner.spawnedBy(b).some(u => u.path.length || u.pathPending), 'released units start advancing');
  // Settings survive a save; removing clears only this spawner's units.
  const d = G.Save.serialize();
  G.Save.validate(d);
  G.Save.restore(d, 1);
  S.paused = false;   // gameplay resumes after a load (the UI does this when it enters the scene)
  const b2 = S.buildings.find(x => x.id === b.id);
  assert.equal(G.Spawner.state(b2).amount, 50);
  const alive = G.Spawner.spawnedBy(b2).length;   // nearby crew may have shot a few held units
  assert.ok(alive >= 45);
  assert.equal(G.Spawner.clear(b2), alive);
  assert.equal(S.units.filter(u => u.team === 'red').length, 0);
  // Very fast rates are spread over ticks, and the whole run still completes.
  G.Spawner.configure(b2, { rate: 1000, amount: 1200, hold: true });
  G.Spawner.start(b2);
  G.Sim.step();
  assert.ok(G.Spawner.spawnedBy(b2).length <= G.Spawner.MAX_PER_TICK);
  G.Sim.run(3);
  assert.equal(G.Spawner.state(b2).spawned, 1200, 'counted as spawned (nearby crew may already be shooting some)');
  assert.equal(G.Spawner.state(b2).running, false);
  assert.equal(G.Defs.buildables.get('hostile_fabricator').debugOnly, true, 'not in the Spider build menu');
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
  assert.equal(G.Buildings.canPlaceKey('wall', free.gx, free.gy), false, 'other structures cannot cover a deposit');
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
  const wall = G.Buildings.add('wall', wspot.x, wspot.y);
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
