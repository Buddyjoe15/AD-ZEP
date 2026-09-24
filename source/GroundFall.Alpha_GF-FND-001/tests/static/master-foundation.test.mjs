import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { GAMEPLAY_UPDATE_PHASES } from "../../contracts/platform-foundation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(root, "src/Groundfall_Master_v0_7_0.html");
const baselinePath = path.join(root, "baseline/Groundfall_Master_v0_7_0.html");
const html = fs.readFileSync(sourcePath, "utf8");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");

test("GF-FND-001 canonical source remains byte-identical to approved baseline", () => {
  const src = fs.readFileSync(sourcePath);
  const base = fs.readFileSync(baselinePath);
  assert.equal(sha(src), "5b05ff60123caa372ce05625c0716ebe90bfcfe4a7cfece9ac829d67317f299f");
  assert.equal(Buffer.compare(src, base), 0);
});

test("512x512 world at 48 world pixels per tile is intact", () => {
  assert.match(html, /WORLD_W:24576,WORLD_H:24576,TILE:48,COLS:512,ROWS:512/);
  assert.match(html, /G\.setWorldSize\(512\)/);
});

test("fixed-step scheduler and four-step cap remain present", () => {
  assert.match(html, /FIXED_DT:1\/30,MAX_FRAME:0\.25/);
  assert.match(html, /while\(acc>=C\.FIXED_DT&&steps<4\)\{G\.SceneManager\.update\(C\.FIXED_DT\);acc-=C\.FIXED_DT;steps\+\+\}/);
  assert.match(html, /if\(steps===4&&acc>=C\.FIXED_DT\)acc=0/);
  assert.match(html, /G\.SceneManager\.render\(now\)/);
});

test("gameplay update order is unchanged", () => {
  const expected = `const systems=[${GAMEPLAY_UPDATE_PHASES.map(x => `"${x}"`).join(",")}];`;
  assert.ok(html.includes(expected));
});

test("existing save key prefixes and v0.7.0 save version remain intact", () => {
  assert.match(html, /prefix:"groundfall-master-save-slot-",legacyPrefix:"groundfall-save-slot-"/);
  assert.match(html, /version:GW\.CONFIG\.VERSION,worldSize:GW\.CONFIG\.COLS/);
  assert.match(html, /VERSION:"0\.7\.0"/);
});

test("main menu and gameplay scene wiring remain present", () => {
  assert.match(html, /<button data-home="new">New Game<\/button>/);
  assert.match(html, /G\.SceneManager\.register\("gameplay"/);
  assert.match(html, /G\.SceneManager\.change\("wormhole",\{newGame:true/);
  assert.match(html, /G\.SceneManager\.change\("gameplay",\{introReveal:true/);
});
