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

test('genesis trees: five species in three sizes drawn to the crowns the generator plants, outlined, with rustle frames', async () => {
  const { loadSim } = await import('./harness.mjs');
  const { unrle, rle } = await import('../tools/genesis-trees.mjs');
  const G = loadSim(), GT = data.genesis.trees;
  assert.equal(GT.encoding, 'rle');
  assert.equal(unrle(rle('...AAAB.C')), '...AAAB.C');
  assert.equal(rle('....AAAB'), '.4A3B');
  assert.deepEqual(GT.kinds, [...G.TREES.KINDS], 'same species as src/data/trees.js');
  assert.deepEqual(GT.sizes, [...G.TREES.SIZES]);
  for (const kind of GT.kinds){
    assert.deepEqual(GT.crown[kind], [...G.TREES.species[kind].crown], kind + ' crown sizes match the generator');
    GT.art[kind].forEach((variants, z) => {
      assert.ok(variants.length >= 2, `${kind} ${z} variants`);
      for (const { n, frames } of variants){
        assert.equal(n % 4, 0, 'whole world px on each side of the centre');
        assert.equal(frames.length, kind === 'snag' ? 1 : 3, kind + ' rustle frames (a snag has no leaves)');
        const gs = frames.map(str => { str = unrle(str); assert.equal(str.length, n * n); return decode(str, n); });
        for (const g of gs){
          for (let i = 0; i < n; i++) for (const [x, y] of [[i, 0], [0, i], [i, n - 1], [n - 1, i]]) assert.equal(g.get(x, y), 0, `${kind} margin`);
          // The crown fills its diameter (2 art px per world px), give or take the outline and rustled leaves.
          let far = 0; const c = (n - 1) / 2;
          for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g.get(x, y) > 1) far = Math.max(far, Math.hypot(x - c, y - c) + 0.5);
          const d = far;   // radius in art px = diameter in world px
          assert.ok(d <= GT.crown[kind][z] + 2 && d >= GT.crown[kind][z] * 0.75, `${kind} ${z} crown ${d} for ${GT.crown[kind][z]}`);
        }
        assert.ok(unrle(frames[0]).includes(ALPHABET[1]), 'outlined');
        for (let f = 1; f < frames.length; f++) assert.notEqual(frames[f], frames[0], kind + ' leaves move');
      }
    });
  }
  assert.deepEqual(GT.shadow.map(o => o[0] / 2), [3, 4, 6], 'taller trees throw their shadow further (world px)');
  // Dead wood: the sizes the generator plants, stumps in variants, fallen trees at every angle.
  assert.deepEqual(Object.keys(GT.props), Object.keys(G.TREES.props));
  assert.equal(GT.logAngles, G.TREES.LOG_ANGLES);
  for (const [kind, specs] of Object.entries(GT.props)){
    assert.equal(JSON.stringify(specs), JSON.stringify(G.TREES.props[kind].sizes), kind + ' sizes match the generator');
    GT.art[kind].forEach((frames, z) => {
      assert.equal(frames.length, kind === 'log' ? GT.logAngles * 2 : 3, kind + ' frames');
      for (const { n, frames: [str] } of frames){
        const g = decode(unrle(str), n);
        for (let i = 0; i < n; i++) for (const [x, y] of [[i, 0], [0, i], [i, n - 1], [n - 1, i]]) assert.equal(g.get(x, y), 0, `${kind} margin`);
        assert.ok(unrle(str).includes(ALPHABET[1]), 'outlined');
      }
    });
  }
  // A fallen tree's crown end points along its angle: at angle 0 the root plate is west.
  const log0 = GT.art.log[1][0], g0 = decode(unrle(log0.frames[0]), log0.n), mid = log0.n / 2;
  let west = 0, east = 0;
  for (let y = 0; y < log0.n; y++) for (let x = 0; x < log0.n; x++){ const v = g0.get(x, y); if (v && PALETTE[v - 1][0] === 'dust0') x < mid ? west++ : east++; }
  assert.ok(west > east, 'root plate (dark soil) at the west end');
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
