// Save-format discipline: the shape of GW.Save.serialize() is pinned per GW.SAVE_SCHEMA,
// every older schema has a migration step and a fixture save, fixtures migrate, load and
// keep playing, saves round-trip exactly, and browser slots are backed up before an
// older save is migrated. See "Changing the save format" in docs/ARCHITECTURE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSim, newGame } from './harness.mjs';
import { representativeGame, fingerprint, shapeFile, fixtureFile, FIXTURES_DIR, readJSON } from './save-support.mjs';

const CHANGED = 'Save format changed. Bump GW.SAVE_SCHEMA and add a migration.';
const HOWTO = 'See "Changing the save format" in docs/ARCHITECTURE.md.';
const fixtures = () => fs.readdirSync(FIXTURES_DIR)
  .map(f => ({ f, m: /^save-schema-(\d+)(?:-[\w.-]+)?\.json$/.exec(f) }))
  .filter(x => x.m).map(x => ({ file: path.join(FIXTURES_DIR, x.f), name: x.f, schema: Number(x.m[1]) }));

test('save shape matches the fingerprint recorded for GW.SAVE_SCHEMA', () => {
  const G = representativeGame();
  const schema = G.SAVE_SCHEMA, file = shapeFile(schema);
  assert.ok(fs.existsSync(file),
    `No save-shape fingerprint for schema ${schema} (${path.basename(file)}). After bumping GW.SAVE_SCHEMA, run: npm run save:snapshot. ${HOWTO}`);
  const expected = readJSON(file).shape, actual = fingerprint(G.Save.serialize());
  const added = actual.filter(l => !expected.includes(l)), removed = expected.filter(l => !actual.includes(l));
  if (added.length || removed.length){
    assert.fail([CHANGED, HOWTO,
      ...added.map(l => '  + ' + l), ...removed.map(l => '  - ' + l)].join('\n'));
  }
});

test('the fingerprint notices added, removed and retyped fields', () => {
  const base = { a: 1, list: [{ x: 1 }, { x: 2, y: 'k' }], n: null };
  const fp = fingerprint(base);
  assert.deepEqual(fp, ['$.a: number', '$.list: array', '$.list[].x: number', '$.list[].y?: string', '$.list[]: object', '$.n: null', '$: object']);
  assert.notDeepEqual(fingerprint({ ...base, b: true }), fp, 'added key');
  assert.notDeepEqual(fingerprint({ list: base.list, n: null }), fp, 'removed key');
  assert.notDeepEqual(fingerprint({ ...base, a: '1' }), fp, 'retyped value');
  assert.notDeepEqual(fingerprint({ ...base, list: [{ x: 1, y: 'k' }] }), fp, 'optional became required');
  assert.deepEqual(fingerprint({ ...base, list: [...base.list, { x: 3 }] }), fp, 'element count does not matter');
});

test('every older schema has a named migration step and a fixture save', () => {
  const G = loadSim(), M = G.Save.migrations;
  for (let v = 1; v < G.SAVE_SCHEMA; v++){
    assert.equal(typeof M[v], 'function', `No migration from schema ${v}: add migrate_${v}_to_${v + 1} to src/sim/save.js. ${HOWTO}`);
    assert.equal(M[v].name, `migrate_${v}_to_${v + 1}`, 'migration steps are named migrate_<from>_to_<to>');
    assert.ok(fs.existsSync(fixtureFile(v)),
      `No fixture save for schema ${v} (tests/fixtures/${path.basename(fixtureFile(v))}). Keep one fixture per schema version; generate it with the last release that wrote schema ${v}. ${HOWTO}`);
  }
  assert.deepEqual(Object.keys(M).map(Number).sort((a, b) => a - b), Array.from({ length: G.SAVE_SCHEMA - 1 }, (_, i) => i + 1), 'no stray migration steps');
  assert.ok(fs.existsSync(fixtureFile(G.SAVE_SCHEMA)), `No fixture save for the current schema ${G.SAVE_SCHEMA}. Run: npm run save:snapshot. ${HOWTO}`);
  for (const { name, file, schema } of fixtures()) assert.equal(readJSON(file).schema, schema, `${name} holds a schema ${schema} save`);
});

test('migrate() applies steps in order and rejects unknown schemas', () => {
  const G = loadSim();
  const v1 = readJSON(fixtureFile(1));
  const before = JSON.stringify(v1);
  const out = G.Save.migrate(v1);
  assert.equal(out.schema, G.SAVE_SCHEMA);
  assert.equal(JSON.stringify(v1), before, 'migration does not modify its input');
  const current = readJSON(fixtureFile(G.SAVE_SCHEMA));
  assert.equal(G.Save.migrate(current), current, 'a current save passes through unchanged');
  assert.throws(() => G.Save.migrate({ ...current, schema: G.SAVE_SCHEMA + 1 }), /newer than this version/);
  assert.throws(() => G.Save.migrate({ ...current, schema: 0 }), /Unsupported save schema/);
  assert.throws(() => G.Save.migrate({ ...current, schema: '2' }), /Unsupported save schema/);
  assert.throws(() => G.Save.migrate({ ...current, project: 'other' }), /Not a Zero Earth Protocol/);
});

for (const { name, file } of fixtures()){
  test(`fixture ${name} migrates, validates, loads and keeps playing`, () => {
    const G = loadSim();
    const raw = readJSON(file);
    const d = G.Save.validate(G.Save.migrate(raw));
    assert.equal(d.schema, G.SAVE_SCHEMA);
    const S = G.Save.restore(raw, 1);
    S.paused = false;
    const crew = G.Units.friendly().length;
    assert.ok(G.Units.hero() && G.Units.ship(), 'commander and ship present');
    G.Sim.run(5);
    assert.ok(S.time > d.time + 4.9, 'the simulation advanced');
    assert.ok(G.Units.hero(), 'the commander survived');
    assert.ok(G.Units.friendly().length >= crew - 1, 'the crew is intact');
    G.Save.validate(G.Save.serialize());
  });
}

test('round trip: serialize → load → serialize gives the same save', () => {
  const G = representativeGame();
  const a = JSON.stringify(G.Save.serialize());
  G.Save.restore(JSON.parse(a), 1);
  const b = JSON.stringify(G.Save.serialize());
  if (a !== b){
    const pa = JSON.parse(a), pb = JSON.parse(b);
    assert.deepEqual(pb, pa, 'values differ after a load');
    assert.equal(b, a, 'same values but different key order after a load');
  }
  // And once more from the loaded state, to catch fields that only settle after a load.
  G.Save.restore(JSON.parse(b), 1);
  assert.equal(JSON.stringify(G.Save.serialize()), a);
});

function withNotices(G){
  const notes = [];
  G.Events.on('notify', m => notes.push(m));
  return notes;
}

test('loading an older browser save backs up the untouched original first', () => {
  const G = newGame();
  const notes = withNotices(G);
  const raw = fs.readFileSync(fixtureFile(1), 'utf8');
  G.Storage.set(G.Save.keyFor(3), raw);
  assert.equal(G.Save.backup(3, 1), null);
  assert.ok(G.Save.load(3));
  assert.equal(G.Save.backup(3, 1), raw, 'backup is the original text, byte for byte');
  assert.ok(notes.some(n => /upgraded from an older version.*backup/.test(n)), notes.join(' | '));
  // The autosave then replaces the slot with the current format; the backup stays.
  assert.ok(G.Save.save(3));
  assert.equal(JSON.parse(G.Storage.get(G.Save.keyFor(3))).schema, G.SAVE_SCHEMA);
  assert.equal(G.Save.backup(3, 1), raw);
  // A current save needs no backup.
  assert.ok(G.Save.load(3));
  assert.equal(G.Save.backup(3, G.SAVE_SCHEMA), null);
  G.Save.clear(3);
  assert.equal(G.Save.backup(3, 1), raw, 'clearing a slot keeps its backup');
});

test('a save that fails migration or validation is not loaded, and the current game is kept', () => {
  const G = newGame();
  const notes = withNotices(G);
  G.Sim.run(2);
  const before = JSON.stringify(G.Save.serialize());
  // An older save that migrates but fails validation.
  const broken = readJSON(fixtureFile(1));
  broken.units[0].hp = -5;
  const text = JSON.stringify(broken);
  G.Storage.set(G.Save.keyFor(2), text);
  assert.equal(G.Save.load(2), false);
  assert.equal(JSON.stringify(G.Save.serialize()), before, 'current game untouched');
  const msg = notes.at(-1);
  assert.match(msg, /Save Slot 2 could not be loaded: Invalid expedition save: unit stats\./);
  assert.match(msg, /original save is kept as a backup/);
  assert.match(msg, /current game was not changed/);
  assert.equal(G.Save.backup(2, 1), text);
  // Menus show it as unreadable, not empty, and Continue skips it.
  assert.match(G.Save.info(2).error, /unit stats/);
  assert.equal(G.Save.newestSlot(), null);
  // A save from a newer version of the game.
  const future = readJSON(fixtureFile(G.SAVE_SCHEMA));
  future.schema = G.SAVE_SCHEMA + 1;
  G.Storage.set(G.Save.keyFor(1), JSON.stringify(future));
  assert.equal(G.Save.load(1), false);
  assert.match(notes.at(-1), /newer than this version/);
  assert.equal(G.Save.backup(1, G.SAVE_SCHEMA + 1), JSON.stringify(future), 'kept in case the slot is overwritten');
  // Not JSON at all.
  G.Storage.set(G.Save.keyFor(1), '{"project":');
  assert.equal(G.Save.load(1), false);
  assert.match(notes.at(-1), /could not be loaded/);
  assert.equal(JSON.stringify(G.Save.serialize()), before);
});

test('a failure part way through rebuilding the world rolls back to the previous game', () => {
  const G = newGame();
  G.Sim.run(2);
  const before = JSON.stringify(G.Save.serialize());
  const good = readJSON(fixtureFile(G.SAVE_SCHEMA));
  const adopt = G.Buildings.adopt;
  let calls = 0;
  G.Buildings.adopt = function(b){ if (++calls === 2) throw new Error('simulated failure'); return adopt.call(this, b); };
  assert.throws(() => G.Save.restore(good, 1), /Could not rebuild the expedition: simulated failure/);
  G.Buildings.adopt = adopt;
  assert.equal(JSON.stringify(G.Save.serialize()), before, 'previous game restored');
  G.Sim.run(1);
});

test('migrate_2_to_3: saves from before the grass test map keep their forest terrain', () => {
  const G = loadSim();
  for (const file of [fixtureFile(1), fixtureFile(2), path.join(FIXTURES_DIR, 'save-schema-2-early-v0.6.json')]){
    const raw = readJSON(file);
    assert.equal(G.Save.migrate(raw).map, 'forest', path.basename(file));
    const S = G.Save.restore(raw, 1);
    assert.equal(S.map, 'forest');
    const forest = G.MapGen.forest(S.seed).tiles;
    // Same terrain as the forest generator everywhere the save did not edit.
    let same = 0;
    for (let i = 0; i < forest.length; i++) if (S.grid.tiles[i] === forest[i]) same++;
    assert.ok(same / forest.length > 0.97, path.basename(file) + ': ' + same);
    assert.ok(S.grid.tiles.some(t => t === G.TT.TREE), 'still has trees');
  }
  const bad = readJSON(fixtureFile(G.SAVE_SCHEMA)); bad.map = 'moon';
  assert.throws(() => G.Save.validate(bad), /map type/);
});
