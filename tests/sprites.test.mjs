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
  assert.equal(T, 48, 'woodlands art is drawn at 1 art px per world px');
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
  assert.ok(name(S.get(24, 24)).startsWith('dust') || name(S.get(24, 24)).startsWith('char'));
  assert.ok(name(N.get(24, 24)).startsWith('grass'));
  // Tree props: three kinds, each variant with 9 frames (lean * 3 + rustle): leans move further
  // downwind (east), rustle steps change the leaves without moving the crown;
  // transparent 1 px margin, outlined, engine shadow offset.
  assert.deepEqual([...W.tree.shadow.offset], [4, 4]);
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
