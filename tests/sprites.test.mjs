// Pixel-art test set (art/pixel-test): the pipeline rules hold, and the committed files
// match what tools/sprites.mjs generates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { build, dataScript, OUT, DATA_FILE, FACINGS } from '../tools/sprites.mjs';
import { PALETTE, ALPHABET, Grid, rot90, finish } from '../tools/pixelart.mjs';

const { data } = build();
const decode = (s, w) => { const g = new Grid(w, s.length / w); [...s].forEach((ch, i) => g.p[i] = ALPHABET.indexOf(ch)); return g; };

test('palette has 48 distinct colours', () => {
  assert.equal(PALETTE.length, 48);
  assert.equal(new Set(PALETTE.map(([, h]) => h)).size, 48);
  assert.equal(ALPHABET.length, 49);
});

test('every facing except up and up-right is a lossless rotation, shaded after rotating', () => {
  for (const name of ['spider', 'drone', 'vance']){
    const sp = data.sprites[name];
    assert.equal(sp.frames.length, FACINGS.length);
    for (let f = 2; f < 8; f++) sp.frames[f].forEach((str, col) => {
      // Shading is applied last, so the rotated frame is not simply the rotated pixels…
      const prev = decode(sp.frames[f - 2][col], sp.frameWidth), cur = decode(str, sp.frameWidth);
      // …but its silhouette is exactly the previous facing's silhouette turned 90°.
      const turned = rot90(prev);
      for (let i = 0; i < cur.p.length; i++) assert.equal(!!cur.p[i], !!turned.p[i], `${name} facing ${f} frame ${col} px ${i}`);
    });
  }
});

test('shading lights the top-left edge on every facing', () => {
  const g = new Grid(9, 9);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) g.p[y * 9 + x] = 3;   // steel1 block
  let s = finish(g);
  for (let k = 0; k < 4; k++){
    assert.equal(s.get(2, 4), 4, 'left edge lighter'); assert.equal(s.get(6, 4), 2, 'right edge darker');
    s = finish(rot90(g));
  }
});

test('committed src/render/pixel-data.js is up to date (run npm run sprites)', () => {
  assert.equal(fs.readFileSync(DATA_FILE, 'utf8'), dataScript(data));
});

test('sheet PNGs are fully opaque or fully transparent', () => {
  for (const f of fs.readdirSync(path.join(OUT, 'sheets')).filter(f => f.endsWith('.png'))){
    const buf = fs.readFileSync(path.join(OUT, 'sheets', f));
    let o = 8, idat = [], w = 0, h = 0;
    while (o < buf.length){
      const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), body = buf.subarray(o + 8, o + 8 + len);
      if (type === 'IHDR'){ w = body.readUInt32BE(0); h = body.readUInt32BE(4); }
      if (type === 'IDAT') idat.push(body);
      o += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const a = raw[y * (w * 4 + 1) + 1 + x * 4 + 3];
      assert.ok(a === 0 || a === 255, `${f} (${x},${y}) alpha ${a}`);
    }
  }
});

test('woodlands pilot: full terrain tiles, edge-matched variants, shoreline and cliff pieces, outlined tree props', () => {
  const W = data.woodlands, T = data.tileArt;
  assert.equal(T, 96, 'terrain art is drawn at 2 art px per world px: 96 × 96 per tile');
  assert.equal(data.worldPxPerArtPx, 0.5);
  for (const v of ['v1', 'v2']) for (const s of data.terrain[v].tiles) assert.equal(s.length, T * T, 'dust plain ' + v);
  for (const key of ['grass', 'tall_grass', 'water', 'deep_water', 'shore', 'cliff']){
    for (const s of W[key].tiles){ assert.equal(s.length, T * T, key); assert.ok(!s.includes('.'), key + ' tiles are fully opaque'); }
  }
  for (const key of ['grass', 'tall_grass', 'water', 'deep_water']) assert.equal(W[key].tiles.length, W[key].weights.length, key);
  assert.equal(W.shore.tiles.length, 16, 'one shoreline piece per land mask');
  assert.equal(W.cliff.tiles.length, W.cliff.pieces.length);
  for (const k of ['S', 'N', 'E', 'W', 'cNE', 'cSE', 'cSW', 'cNW']) assert.ok(W.cliff.pieces.includes(k), k);
  // A south face has rock across its middle rows; a north rim keeps grass there.
  const S = decode(W.cliff.tiles[W.cliff.pieces.indexOf('S')], T), N = decode(W.cliff.tiles[W.cliff.pieces.indexOf('N')], T);
  const name = i => PALETTE[i - 1][0];
  assert.ok(name(S.get(T / 2, T / 2)).startsWith('dust') || name(S.get(T / 2, T / 2)).startsWith('char'));
  assert.ok(name(N.get(T / 2, T / 2)).startsWith('grass'));
  // Tree props: three kinds, each variant with 9 frames (lean * 3 + rustle): leans move further
  // downwind (east), rustle steps change the leaves without moving the crown;
  // transparent 1 px margin, outlined, engine shadow offset.
  assert.deepEqual([...W.tree.shadow.offset], [8, 8], 'the tree shadow sits 4 world px down and right');
  assert.equal(W.tree.types.join(), 'oak,pine,birch');
  assert.equal(W.tree.animations.lean.frames * W.tree.animations.rustle.frames, 9);
  const cx = g => { let sum = 0, n = 0; for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (g.get(x, y)){ sum += x; n++; } return sum / n; };
  for (const kind of W.tree.types){
    assert.ok(W.tree.variants[kind].length >= 2, kind + ' variants');
    for (const frames of W.tree.variants[kind]){
      assert.equal(frames.length, 9);
      const gs = frames.map(s => decode(s, T));
      for (const [f, g] of gs.entries()){
        for (let i = 0; i < T; i++) for (const [x, y] of [[i, 0], [0, i], [i, T - 1], [T - 1, i]]) assert.equal(g.get(x, y), 0, `${kind} frame ${f} margin`);
        assert.ok(frames[f].includes(ALPHABET[1]), 'outlined');
      }
      assert.ok(cx(gs[3]) > cx(gs[0]) + 1 && cx(gs[6]) > cx(gs[3]) + 1, kind + ' leans further east at each lean');
      for (const lean of [0, 3, 6]) for (const step of [1, 2]){
        assert.notEqual(frames[lean + step], frames[lean], kind + ' leaves move');
        assert.ok(Math.abs(cx(gs[lean + step]) - cx(gs[lean])) < 0.5, kind + ' rustling does not lean');
      }
    }
  }
});

test('sprite lab: the example spec renders top-down at 96 × 96 and passes every check; a sprite too big for its frame fails', async () => {
  const { loadSpec, renderSpec, check } = await import('../tools/sprite-lab.mjs');
  const { Model, MAT, mul, translate, scale, unitFrame, LIFT } = await import('../tools/sprite-kit.mjs');
  assert.equal(LIFT, 0, 'straight top-down');
  assert.deepEqual([unitFrame().w, unitFrame().h], [96, 96], 'a one-tile unit frame is 96 × 96 art px');
  const spec = await loadSpec(path.join(path.dirname(new URL(import.meta.url).pathname), '../art/sprite-lab/specs/example_spider.mjs'));
  const R = renderSpec(spec);
  assert.equal(R.rows.length, 8, 'eight facings');
  assert.equal(R.rows[0].length, 10, 'idle 2 + walk 4 + work 4');
  const results = check(spec, R);
  assert.deepEqual(results.filter(c => c.level !== 'pass').map(c => c.name), [], JSON.stringify(results));
  // A box reaching past the inscribed circle, with no team colour where one is required.
  const big = { ...spec, key: 'too_big', gameKey: null, animations: { idle: { frames: 1, fps: 1 } }, build: () => new Model().box(mul(translate(0, 5, 0), scale(40, 10, 40)), MAT.steel) };
  const bad = check(big, renderSpec(big)).filter(c => c.level === 'fail').map(c => c.name);
  assert.ok(bad.includes('Inside the frame') && bad.includes('Team colour'), bad.join());
  // Variants repeat every animation, one block per variant, and build() is told which.
  const seen = [], varied = { ...spec, variants: { label: 'Load', by: 'cargo', values: ['empty', 'full'] }, build: a => { seen.push(a.variant); return spec.build(a); } };
  const RV = renderSpec(varied);
  assert.equal(RV.rows[0].length, 20, 'two blocks of idle 2 + walk 4 + work 4');
  assert.deepEqual([RV.seq[0].variant, RV.seq[10].variant, RV.seq[10].anim], ['empty', 'full', 'idle']);
  assert.ok(seen.includes('empty') && seen.includes('full'));
  assert.ok(check(varied, RV).some(c => c.name === 'Variants' && c.level === 'warn'), 'no fill levels: the engine can\'t pick one');
  const byCargo = { ...varied, variants: { ...varied.variants, at: [0, 1] } };
  assert.ok(check(byCargo, RV).some(c => c.name === 'Variants' && c.level === 'pass'), 'cargo fill levels: the engine picks one');
});

test('Sentry Turret: modelled base states and a head layer in 16 facings, turned about the footprint centre', () => {
  const tu = data.sprites.sentry_turret, H = tu.head, N = tu.frameWidth;
  assert.equal(N, 96, 'a 1 × 1 structure is 96 × 96 art px');
  for (const s of ['foundation', 'frame', 'near-complete', 'finished', 'damaged', 'rubble']) assert.ok(tu.states[s], s);
  assert.equal(tu.frames[0].length, Object.values(tu.states).reduce((n, s) => n + s.frames, 0));
  assert.equal(H.facings, 16); assert.equal(H.frames.length, 16);
  assert.deepEqual(H.on, { finished: 'idle', damaged: 'damaged' });
  assert.deepEqual(H.firing, { idle: ['firing', 'flash'], damaged: ['damaged-firing', 'damaged-flash'] });
  for (const [fire, flash] of Object.values(H.firing)) assert.equal(H.states[fire].frames, H.states[flash].frames, 'a flash frame for every firing frame');
  const dmg = H.states['damaged-firing'];
  assert.equal(new Set(H.frames[0].slice(dmg.start, dmg.start + dmg.frames)).size, dmg.frames, 'the damaged gun spins and feeds too');
  assert.equal(new Set(H.frames[0].slice(H.states.firing.start, H.states.firing.start + H.states.firing.frames)).size, H.states.firing.frames, 'the barrels and belts move every firing frame');
  const cols = Object.values(H.states).reduce((n, s) => n + s.frames, 0);
  for (const row of H.frames){ assert.equal(row.length, cols); for (const str of row) assert.equal(str.length, N * N); }
  // Each facing is the model turned, not a copy: every facing differs, and the one pointing
  // down is the up facing turned 180° (nearly: each is rasterised on its own).
  assert.equal(new Set(H.frames.map(r => r[0])).size, 16);
  const up = decode(H.frames[0][0], N), down = decode(H.frames[8][0], N), turned = rot90(rot90(up));
  let differ = 0, solid = 0;
  for (let i = 0; i < up.p.length; i++){ if (!!down.p[i] !== !!turned.p[i]) differ++; if (up.p[i]) solid++; }
  assert.ok(differ < solid * 0.04, `down facing silhouette is the up facing turned (${differ} of ${solid} px differ)`);
});

test('walls: 16 joined pieces per state that reach the tile edge exactly on the sides they join; gates in three lengths, both ways, with an open state', () => {
  for (const name of ['wood_wall', 'defensive_wall', 'reinforced_wall']){
    const sp = data.sprites[name], N = sp.frameWidth;
    for (const state of ['finished', 'damaged']){
      const st = sp.states[state];
      assert.equal(st.frames, 16, `${name} ${state}`); assert.ok(st.connect);
      for (let mask = 0; mask < 16; mask++){
        const g = decode(sp.frames[0][st.start + mask], N), mid = N / 2;
        const edges = { 1: g.get(mid, 0), 2: g.get(N - 1, mid), 4: g.get(mid, N - 1), 8: g.get(0, mid) };
        for (const [bit, v] of Object.entries(edges)) assert.equal(!!v, !!(mask & bit), `${name} ${state} mask ${mask} side ${bit}`);
      }
    }
    for (const state of ['foundation', 'frame', 'near-complete', 'rubble']) assert.ok(sp.states[state] && !sp.states[state].connect, `${name} ${state}`);
  }
  for (const [name, w, h] of [['gate', 2, 1], ['gate_3', 3, 1], ['gate_4', 4, 1], ['gate_v', 1, 2], ['gate_3_v', 1, 3], ['gate_4_v', 1, 4]]){
    const sp = data.sprites[name];
    assert.deepEqual([sp.frameWidth, sp.frameHeight], [w * 96, h * 96], name);
    assert.ok(sp.states.open && sp.states.finished && sp.states.damaged, name);
    assert.notEqual(sp.frames[0][sp.states.open.start], sp.frames[0][sp.states.finished.start], name + ' looks different open');
  }
  // A vertical gate is the horizontal one turned, not squashed: same silhouette area, near enough.
  const area = s => [...s].filter(ch => ch !== ALPHABET[0]).length;
  const hz = data.sprites.gate_3, vt = data.sprites.gate_3_v, a = area(hz.frames[0][hz.states.finished.start]), b = area(vt.frames[0][vt.states.finished.start]);
  assert.ok(Math.abs(a - b) < a * 0.05, `turned gate keeps its size (${a} vs ${b} px)`);
});

test('Laser Turret: a diamond base and a head in 16 facings whose charging frames light one more coil each', () => {
  const sp = data.sprites.laser_turret, H = sp.head;
  assert.equal(sp.frameWidth, 96);
  assert.equal(H.facings, 16);
  assert.equal(H.chargeTime, 2.5);
  assert.deepEqual(H.firing, { idle: ['charging', 'flash'], damaged: ['damaged-charging', 'damaged-flash'] });
  const ch = H.states.charging, row = H.frames[0];
  assert.equal(ch.frames, 6);
  // Each charging frame has more lit (cyan) pixels than the one before.
  const cyan = new Set(['cyan1', 'cyan2', 'white'].map(n => ALPHABET[PALETTE.findIndex(([k]) => k === n) + 1]));
  const lit = s => [...s].filter(c => cyan.has(c)).length;
  for (let i = 1; i < ch.frames; i++) assert.ok(lit(row[ch.start + i]) > lit(row[ch.start + i - 1]), 'coil ' + i);
  assert.ok(lit(row[H.states.idle.start]) < lit(row[ch.start]), 'idle has no coil lit');
});
