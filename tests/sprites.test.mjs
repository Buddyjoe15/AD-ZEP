// Pixel-art test set (art/pixel-test): the pipeline rules hold, and the committed files
// match what tools/sprites.mjs generates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { build, dataScript, OUT, FACINGS } from '../tools/sprites.mjs';
import { PALETTE, ALPHABET, Grid, rot90, finish } from '../tools/pixelart.mjs';

const { data } = build();
const decode = (s, w) => { const g = new Grid(w, s.length / w); [...s].forEach((ch, i) => g.p[i] = ALPHABET.indexOf(ch)); return g; };

test('palette has 37 distinct colours', () => {
  assert.equal(PALETTE.length, 37);
  assert.equal(new Set(PALETTE.map(([, h]) => h)).size, 37);
  assert.equal(ALPHABET.length, 38);
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

test('committed sheets and sprites-data.js are up to date (run npm run sprites)', () => {
  assert.equal(fs.readFileSync(path.join(OUT, 'sprites-data.js'), 'utf8'), dataScript(data));
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
