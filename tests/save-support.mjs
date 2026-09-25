// Shared by tests/save.test.mjs and tools/save-snapshot.mjs: the save-shape fingerprint and
// the representative game it is taken from.
import fs from 'node:fs';
import path from 'node:path';
import { newGame, ROOT } from './harness.mjs';

export const SHAPES_DIR = path.join(ROOT, 'tests/save-shapes');
export const FIXTURES_DIR = path.join(ROOT, 'tests/fixtures');
export const shapeFile = schema => path.join(SHAPES_DIR, `schema-${schema}.json`);
export const fixtureFile = schema => path.join(FIXTURES_DIR, `save-schema-${schema}.json`);

const kind = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

// The structure of a JSON value as sorted lines, one per path:
//   "units[].cargo: null|object"     every type seen at that path
//   "units[].cargo?.metal: number"   `?` marks a key missing from some objects at that path
// Array elements are merged into one shape (path `[]`), so the fingerprint describes the
// format rather than how many units or items a game happens to have.
export function fingerprint(value){
  const types = new Map(), objects = new Map(), keys = new Map();
  const walk = (p, v) => {
    const k = kind(v);
    if (!types.has(p)) types.set(p, new Set());
    types.get(p).add(k);
    if (k === 'array') for (const e of v) walk(p + '[]', e);
    else if (k === 'object'){
      objects.set(p, (objects.get(p) || 0) + 1);
      for (const key of Object.keys(v)){
        const kp = p + '.' + key;
        keys.set(kp, (keys.get(kp) || 0) + 1);
        walk(kp, v[key]);
      }
    }
  };
  walk('$', value);
  const lines = [];
  for (const [p, set] of types){
    let label = p;
    if (keys.has(p)){
      const parent = p.slice(0, p.lastIndexOf('.'));
      if (keys.get(p) < objects.get(parent)) label = parent + '.' + p.slice(parent.length + 1) + '?';
    }
    lines.push(`${label}: ${[...set].sort().join('|')}`);
  }
  return lines.sort();
}

// A deterministic game that exercises every part of the save format: a completed transit
// (arrival report), units with every order type, cargo, storage, follow, guard and patrol
// orders, hostile swarm units from a running spawner, a construction site, fabrication
// queues, a Mine Building with a stockpile, containers holding items, equipment, and the
// terrain edits painted with the Map Editor.
export function representativeGame(){
  const G = newGame(72491);
  const S = G.State, T = G.CONFIG.TILE;
  const find = type => S.units.find(u => u.type === type && u.hp > 0);
  // Transit first so the expedition carries an arrival report and history.
  S.resources.metal = 1000;
  G.Expedition.action('repair');
  S.expedition.readiness = 0;
  G.Expedition.action('recall');
  G.Sim.run(25);
  if (!G.Expedition.transit()) throw new Error('representative game: transit failed');
  S.paused = false;
  S.resources.metal = 2000;

  const hero = G.Units.hero(), ship = G.Units.ship();
  const spider = find('utility_spider'), survey = find('survey_drone'), guard = find('security_drone');
  // Extra crew for the remaining order types.
  const spider2 = G.Units.spawn('utility_spider', ship.x - 200, ship.y + 300);
  const patrol = G.Units.spawn('security_drone', ship.x + 200, ship.y + 300);
  const follower = G.Units.spawn('survey_drone', ship.x + 260, ship.y + 320);
  G.Orders.setCommand([guard], 'guard', { x: guard.x + 96, y: guard.y });
  G.Orders.setCommand([patrol], 'patrol', { x: patrol.x + 300, y: patrol.y });
  G.Orders.setCommand([follower], 'follow', null, survey.id);
  G.Orders.move([survey], survey.x + 400, survey.y + 200);
  guard.squad = 1;   // as the squad keys in the HUD assign it
  // A straggler still walking back to the ship after a recall.
  const straggler = G.Units.spawn('survey_drone', ship.x + 1400, ship.y - 900);
  const back = G.openPoint(ship.x - 120, ship.y + 300);
  G.Orders.move([straggler], back.x, back.y);
  straggler.recallPoint = back;

  // Work: one Spider hauls from the testing-zone Mine Building, one builds.
  const mine = S.buildings.find(b => G.Gather.isMine(b));
  if (!mine || !G.Gather.command(spider, mine)) throw new Error('representative game: no Mine Building to haul from');
  const scavenger = G.Units.spawn('utility_spider', ship.x - 260, ship.y + 320);
  const scrap = S.resourceNodes.find(n => G.Gather.def(n).kind === 'scavenge');
  if (!scrap || !G.Gather.command(scavenger, scrap)) throw new Error('representative game: no scavenging node');
  const sh = G.Units.ship(), site = S.grid.nearestOpen(sh.gx + 4, sh.gy + sh.h + 3, 10);
  if (!G.Construction.order(spider2, 'generator', site.x, site.y)) throw new Error('representative game: construction order failed');
  G.Fabrication.setRally(ship, G.openPoint(ship.x + 300, ship.y + 420));   // the Fabricator keeps none
  G.Fabrication.enqueue(ship, 'survey_drone');
  G.Fabrication.enqueue(ship, 'security_drone');
  const fab = S.buildings.find(b => b.fabQueue);
  if (fab) G.Fabrication.enqueue(fab, 'utility_spider');

  // Items: a stack in the backpack, equipped armour, loot in a chest and in Spider storage.
  G.Inventory.add(G.Items.create('field_cap'));
  const cap = S.inventory.items.find(i => i.key === 'field_cap');
  G.Inventory.equip(cap.id);
  const chest = S.containers.find(c => c.type === 'chest');
  if (chest) chest.items.push(G.Items.create('field_cap'));
  spider.storage.items.push(G.Items.create('simple_backpack'));

  // A finished player structure and chest (not part of the testing zone), far enough from
  // the crew that the hostile attacking the wall survives the few seconds simulated.
  const wallAt = S.grid.nearestOpen(sh.gx - 30, sh.gy - 22, 10);
  const wall = G.Buildings.add('defensive_wall', wallAt.x, wallAt.y);
  const chestAt = S.grid.nearestOpen(sh.gx + 10, sh.gy + sh.h + 6, 10);
  G.Buildings.add('chest', chestAt.x, chestAt.y).items.push(G.Items.create('field_cap'));
  // Map Editor strokes: a pond (impassable, painted around nothing) and a path.
  G.MapEdit.paint(sh.gx + 20, sh.gy - 14, 5, G.TT.WATER);
  G.MapEdit.paint(sh.gx + 12, sh.gy - 14, 3, G.TT.PATH);

  // Hostiles: a held group from the Hostile Fabricator, a few marching on Vance, one
  // attacking the wall and one attacking the straggler.
  const hf = S.buildings.find(b => b.type === 'hostile_fabricator');
  G.Spawner.configure(hf, { rate: 20, amount: 12, hold: true });
  G.Spawner.start(hf);
  for (let i = 0; i < 4; i++) G.Units.spawn('hostile_machine', hero.x + 1400 + i * 40, hero.y + 200);
  G.Units.spawn('hostile_machine', wall.x - 2 * T, wall.y);
  G.Units.spawn('hostile_machine', straggler.x + 4 * T, straggler.y);
  G.Sim.run(3);
  S.camera.x = hero.x; S.camera.y = hero.y; S.camera.z = 0.9;
  return G;
}

export const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
