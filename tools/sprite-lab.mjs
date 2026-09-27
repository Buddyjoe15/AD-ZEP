// Sprite lab: renders a sprite spec (a 3D model built in code, art/sprite-lab/specs/*.mjs)
// straight top-down at 96 art px per tile, checks it against art/PIXEL_ART_RULES.md and
// writes a test page. No dependencies.
// Usage: node tools/sprite-lab.mjs art/sprite-lab/specs/<key>.mjs [--capture]
//   writes art/sprite-lab/out/<key>/: sheet.png, meta.json and index.html (self-contained:
//   open it from disk or publish it). --capture also screenshots the page to preview.png
//   (Playwright). Exits with 1 when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PALETTE, TEAMS, png } from './pixelart.mjs';
import { renderSprite, renderStructure, LIFT, RES, FACINGS, ENGINE_ANIMS, ENGINE_STATES, OUTLINE, RAMP, UNIT_FRAMES, SHADOW, CONNECT } from './sprite-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB = path.join(ROOT, 'art/sprite-lab');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

export async function loadSpec(file){
  return (await import(pathToFileURL(path.resolve(file)).href)).default;
}

// The game's art (src/render/pixel-data.js): the Utility Spider every unit is compared with,
// and the ground tiles the test page draws on.
let GAME = null;
export function gameArt(){
  if (GAME) return GAME;
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/render/pixel-data.js'), 'utf8'), ctx);
  return (GAME = ctx.window.PIXEL_ART);
}
const decode = (D, str) => Uint8Array.from(str, ch => Math.max(0, D.alphabet.indexOf(ch)));
// The in-game Utility Spider in the lab's layout: rows are facings, columns frames.
export function referenceSpider(){
  const D = gameArt(), sp = D.sprites.spider;
  return {
    meta: { name: 'Utility Spider (in game)', frameWidth: sp.frameWidth, frameHeight: sp.frameHeight, origin: sp.origin, animations: sp.animations, shadow: { drawnBy: 'engine', offset: sp.shadow.offset } },
    rows: sp.frames.map(row => row.map(str => ({ px: decode(D, str) }))), BW: sp.frameWidth, BH: sp.frameHeight
  };
}

// Frames in sheet order: a unit's animations, or a structure's states, each frame in turn.
// A spec with variants (spec.variants.values, such as a hopper's fill levels) repeats that
// whole block once per variant, left to right.
function sequence(spec){
  const list = spec.kind === 'unit' ? spec.animations : spec.states, seq = [];
  for (const variant of spec.variants ? spec.variants.values : [null])
    for (const [anim, a] of Object.entries(list)) for (let frame = 0; frame < a.frames; frame++) seq.push({ anim, frame, frames: a.frames, variant });
  return seq;
}

// Renders every facing (units: 8, each from the model; others: 1) and frame.
export function renderSpec(spec){
  const F = spec.frame, seq = sequence(spec);
  const headings = spec.kind === 'unit' ? FACINGS.map((_, i) => i * Math.PI / 4) : [0];
  const rows = headings.map(heading => seq.map(s => {
    const model = spec.build({ ...s, state: s.anim });
    if (spec.kind !== 'unit') return renderStructure(model, F, { heading: spec.heading || 0, bleed: spec.bleed || 0 });
    return renderSprite(model, { w: F.w, h: F.h, ox: F.ox, oy: F.oy, res: RES, heading, lift: LIFT, outline: OUTLINE });
  }));
  return { rows, seq, BW: F.w, BH: F.h, head: spec.head ? renderHead(spec) : null };
}

// A structure's turning head layer (spec.head): one row per facing, clockwise from up, each
// rendered from the model; columns are the head states' frames. Same frame as the base, its
// origin on the footprint centre, which the head turns about.
export const headSequence = H => Object.entries(H.states).flatMap(([anim, a]) => Array.from({ length: a.frames }, (_, frame) => ({ anim, frame, frames: a.frames })));
export function renderHead(spec){
  const F = spec.frame, H = spec.head, seq = headSequence(H);
  const rows = Array.from({ length: H.facings }, (_, i) => seq.map(s => renderSprite(H.build({ ...s, state: s.anim }), { w: F.w, h: F.h, ox: F.ox, oy: F.oy, res: RES, heading: i * 2 * Math.PI / H.facings, lift: LIFT, outline: OUTLINE })));
  return { rows, seq, BW: F.w, BH: F.h };
}

// The checks listed under "Sprite lab" in the rules. Level: pass, warn (worth a look) or
// fail (must fix).
export function check(spec, R, ref = referenceSpider()){
  const out = [], add = (level, name, detail) => out.push({ level, name, detail });
  const F = spec.frame, unit = spec.kind === 'unit', team = new Set(RAMP.team);
  if (unit){
    const size = Object.entries(UNIT_FRAMES).find(([, u]) => u.w === F.w && u.h === F.h && u.ox === F.ox && u.oy === F.oy);
    add(size ? 'pass' : 'fail', 'Frame size', size ? `${F.w} × ${F.h} art px, the ${size[0]} unit frame` : `${F.w} × ${F.h} with origin ${F.ox}, ${F.oy} is not a unit frame (use unitFrame())`);
  } else {
    const [fw, fh] = spec.footprint || [1, 1], ok = F.w === fw * 96 && F.h === fh * 96;
    add(ok ? 'pass' : 'fail', 'Frame size', `${F.w} × ${F.h} art px for a ${fw} × ${fh} footprint${ok ? '' : ` (should be ${fw * 96} × ${fh * 96})`}`);
  }
  // Inside the frame with a 1 px margin; units also inside the inscribed circle less 1 world px.
  const r = unit ? Math.min(F.w, F.h) / 2 - RES : Infinity;
  let outside = 0, circle = 0, bad = 0, where = '';
  const at = (ri, c, x, y) => `${unit ? FACINGS[ri] + ', ' : ''}${R.seq[c].variant ? R.seq[c].variant + ' ' : ''}${R.seq[c].anim} ${R.seq[c].frame} at ${x}, ${y}`;
  R.rows.forEach((row, ri) => row.forEach((f, c) => {
    // A connecting state's frame may run to the edge on the sides its mask joins.
    const st = !unit && spec.states[R.seq[c].anim], mask = st && st.connect ? R.seq[c].frame : 0;
    for (let y = 0; y < R.BH; y++) for (let x = 0; x < R.BW; x++){
      const v = f.px[y * R.BW + x];
      if (!v) continue;
      if (v > PALETTE.length) bad++;
      const joined = (x < 1 && mask & CONNECT.W) || (x > F.w - 2 && mask & CONNECT.E) || (y < 1 && mask & CONNECT.N) || (y > F.h - 2 && mask & CONNECT.S);
      if ((x < 1 || y < 1 || x > F.w - 2 || y > F.h - 2) && !joined){ if (!outside) where = at(ri, c, x, y); outside++; }
      else if (Math.hypot(x + 0.5 - F.w / 2, y + 0.5 - F.h / 2) > r){ if (!circle && !outside) where = at(ri, c, x, y); circle++; }
    }
  }));
  if (R.head) R.head.rows.forEach((row, ri) => row.forEach((f, c) => {
    for (let y = 0; y < R.BH; y++) for (let x = 0; x < R.BW; x++){
      const v = f.px[y * R.BW + x];
      if (!v) continue;
      if (v > PALETTE.length) bad++;
      if (x < 1 || y < 1 || x > F.w - 2 || y > F.h - 2){ if (!outside) where = `head facing ${ri}, ${R.head.seq[c].anim} ${R.head.seq[c].frame} at ${x}, ${y}`; outside++; }
    }
  }));
  add(outside || circle ? 'fail' : 'pass', 'Inside the frame', outside ? `${outside} px outside the 1 px margin, first in ${where}`
    : circle ? `${circle} px outside the inscribed circle (radius ${r} art px), first in ${where}` : unit ? 'Every facing and frame stays inside the inscribed circle' : 'Every state keeps a 1 px margin');
  add(bad ? 'fail' : 'pass', 'Palette', bad ? `${bad} px outside the palette` : `Only the shared ${PALETTE.length} colours`);
  // Team colour: at least 6 × 6 world px (12 × 12 art px) on a Spider-sized unit, seen from above.
  const main = R.rows[unit ? 3 : 0][0].px;
  let teamPx = 0;
  for (const v of main) if (team.has(v)) teamPx++;
  const need = unit ? Math.round(144 * (F.w * F.h) / (96 * 96)) : 144;
  if (spec.team) add(teamPx >= need ? 'pass' : 'fail', 'Team colour', `${teamPx} team px in the ${unit ? 'down-right facing' : 'first state'} (at least ${need})`);
  else add(teamPx ? 'fail' : 'pass', 'Team colour', teamPx ? `${teamPx} team px on art that has no team` : 'None, as this asset has no team');
  // Names the engine plays.
  const names = Object.keys(unit ? spec.animations : spec.states), known = unit ? ENGINE_ANIMS : ENGINE_STATES;
  const extra = names.filter(n => !known.includes(n));
  add(extra.length ? 'warn' : 'pass', unit ? 'Animations' : 'States', extra.length ? `${extra.join(', ')} need engine work; the engine plays ${known.join(', ')}` : names.join(', '));
  if (unit && !names.includes('idle')) add('warn', 'Idle', 'No idle animation; the engine shows idle when a unit stands still');
  if (!unit && !names.includes('finished')) add('warn', 'Finished state', 'No finished state; the engine shows it when the structure is built and idle');
  // Connecting states: 16 frames, one per neighbour mask; each must reach the edge on the
  // sides it joins, so neighbours meet, and stay clear of the sides it doesn't.
  const conn = unit ? [] : Object.entries(spec.states).filter(([, s]) => s.connect);
  if (conn.length){
    let bad = [];
    for (const [name, s] of conn){
      if (s.frames !== 16){ bad.push(`${name} has ${s.frames} frames`); continue; }
      const start = R.seq.findIndex(q => q.anim === name);
      for (let mask = 0; mask < 16; mask++){
        const px = R.rows[0][start + mask].px, W = R.BW, H = R.BH, mid = [W / 2, H / 2];
        const reach = { [CONNECT.N]: px[mid[0]], [CONNECT.S]: px[(H - 1) * W + mid[0]], [CONNECT.W]: px[mid[1] * W], [CONNECT.E]: px[mid[1] * W + W - 1] };
        for (const [bit, v] of Object.entries(reach)) if (!!v !== !!(mask & bit)){ bad.push(`${name} mask ${mask} side ${bit}`); break; }
      }
    }
    add(bad.length ? 'fail' : 'pass', 'Connections', bad.length ? 'Frames must reach the edge exactly on the sides they join: ' + bad.slice(0, 4).join('; ') : `${conn.map(([n]) => n).join(', ')}: 16 neighbour masks each, joining at the middle of each side`);
  }
  // Turning head: the engine draws one over finished and damaged structures (G.PixelArt.drawHead).
  if (spec.head){
    const H = spec.head, hn = Object.keys(H.states), on = Object.entries(H.on || {});
    const ok = [16, 8].includes(H.facings) && hn.includes('idle') && on.length && on.every(([b, h]) => names.includes(b) && hn.includes(h));
    add(ok ? 'pass' : 'fail', 'Turning head', ok ? `${H.facings} facings, ${hn.join(', ')}; over ${on.map(([b, h]) => b + ' → ' + h).join(', ')}` : 'Needs 8 or 16 facings, an idle state, and `on` mapping base states to head states');
  }
  // Variants: the engine picks cargo variants (G.PixelArt.variant); any other kind needs engine work.
  if (spec.variants){
    const V = spec.variants, cargo = V.by === 'cargo' && Array.isArray(V.at) && V.at.length === V.values.length && V.at[0] === 0;
    add(cargo ? 'pass' : 'warn', 'Variants', `${V.values.join(', ')} by ${V.by}` + (cargo ? ': the engine picks one from the cargo aboard' : ': the engine needs to pick the block (see the metadata)'));
  }
  // Silhouette against the in-game Utility Spider: a unit should not be mistaken for one.
  if (unit && spec.gameKey !== 'utility_spider'){
    const a = R.rows[3][0].px, b = ref.rows[3][0].px, RO = ref.meta.origin, px = (buf, W, H, x, y) => x >= 0 && y >= 0 && x < W && y < H && buf[y * W + x];
    let both = 0, either = 0;
    for (let dy = -100; dy < 100; dy++) for (let dx = -100; dx < 100; dx++){   // both frames aligned on their origins
      const p = px(a, R.BW, R.BH, F.ox + dx, F.oy + dy), q = px(b, ref.BW, ref.BH, Math.round(RO[0]) + dx, Math.round(RO[1]) + dy);
      if (p && q) both++; if (p || q) either++;
    }
    const iou = either ? both / either : 0;
    add(iou > 0.75 ? 'warn' : 'pass', 'Silhouette', `${Math.round(iou * 100)}% overlap with the in-game Utility Spider's (warn above 75%)`);
  }
  return out;
}

// ---- Output ----
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RGB = [null, ...PALETTE.map(([, h]) => hexRGB(h))];
function sheet(R0, w, h){
  const R = R0.head ? { ...R0, rows: [...R0.rows, ...R0.head.rows] } : R0;
  const cols = Math.max(...R.rows.map(row => row.length)), rows = R.rows.length, W = cols * w, H = rows * h, rgba = new Uint8Array(W * H * 4);
  R.rows.forEach((row, r) => row.forEach((f, c) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const v = f.px[y * R.BW + x];
      if (!v) continue;
      const o = ((r * h + y) * W + c * w + x) * 4, [cr, cg, cb] = RGB[v];
      rgba[o] = cr; rgba[o + 1] = cg; rgba[o + 2] = cb; rgba[o + 3] = 255;
    }
  }));
  return { W, H, png: png(W, H, rgba) };
}
function meta(spec, R, img){
  const F = spec.frame, unit = spec.kind === 'unit', timeline = {}, elevation = spec.elevation || (unit ? 'ground' : 'structure');
  R.seq.forEach((s, i) => { if (s.variant === R.seq[0].variant) (timeline[s.anim] ||= { start: i, frames: 0, fps: (unit ? spec.animations : spec.states)[s.anim].fps || 0, ...(!unit && spec.states[s.anim].connect ? { connect: true } : {}) }).frames++; });
  const V = spec.variants, each = R.seq.length / (V ? V.values.length : 1);
  return {
    name: spec.name, key: spec.key, gameKey: spec.gameKey || null, kind: spec.kind, faction: spec.faction, team: !!spec.team, elevation,
    view: 'top-down', rules: 'art/PIXEL_ART_RULES.md', worldPxPerArtPx: 1 / RES, frameWidth: F.w, frameHeight: F.h, origin: [F.ox, F.oy],
    ...(unit ? { facings: FACINGS, renderedFacings: 'all 8, each from the model', animations: timeline } : { footprint: spec.footprint || [1, 1], footprintOrigin: [0, 0], states: timeline }),
    ...(V ? { variants: { label: V.label || 'Variant', by: V.by, values: V.values, at: V.at || null, pick: V.pick || null, framesEach: each, column: 'variant index × framesEach + start + frame' } } : {}),
    ...(spec.head ? { head: headMeta(spec, R) } : {}),
    ...(!unit && Object.values(spec.states).some(s => s.connect) ? { connect: { masks: 'frame = start + mask; mask bits 1 north, 2 east, 4 south, 8 west: the sides a wall or a gate end joins', joins: spec.connect || null } } : {}),
    ...(spec.heading ? { turned: spec.heading } : {}),
    shadow: { drawnBy: 'engine', offset: (SHADOW[elevation] || SHADOW.ground).map(v => v * RES), elevation },
    image: 'sheet.png', sheetWidth: img.W, sheetHeight: img.H, palette: 'shared (tools/pixelart.mjs)', teamRamp: spec.team ? 'team0..team2 (magenta)' : null
  };
}
export function headMeta(spec, R){
  const H = spec.head, states = {};
  R.head.seq.forEach((s, i) => { (states[s.anim] ||= { start: i, frames: 0, fps: H.states[s.anim].fps || 0 }).frames++; });
  return { facings: H.facings, rows: `sheet rows ${R.rows.length} to ${R.rows.length + H.facings - 1}, clockwise from up`, pivot: 'footprint centre', states, on: H.on, turnRate: H.turnRate || null, firing: H.firing || null, chargeTime: H.chargeTime || null, flashTime: H.flashTime || null, muzzle: H.muzzle || null };
}
const dataURI = buf => 'data:image/png;base64,' + Buffer.from(buf).toString('base64');
// Grass and dust plain tiles from the game's art, as PNG data URIs.
function groundTiles(){
  const D = gameArt(), n = D.tileArt, tile = str => {
    const rgba = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++){ const v = D.alphabet.indexOf(str[i]); if (v <= 0) continue; const [r, g, b] = RGB[v]; rgba.set([r, g, b, 255], i * 4); }
    return dataURI(png(n, n, rgba));
  };
  return { grass: { tiles: D.woodlands.grass.tiles.map(tile), weights: D.woodlands.grass.weights }, dust: { tiles: D.terrain.v2.tiles.map(tile), weights: D.terrain.v2.weights } };
}

export async function build(file, { capture = false } = {}){
  const spec = await loadSpec(file), R = renderSpec(spec), ref = referenceSpider();
  const checks = check(spec, R, ref);
  const dir = path.join(LAB, 'out', spec.key);
  fs.mkdirSync(dir, { recursive: true });
  const img = sheet(R, spec.frame.w, spec.frame.h), m = meta(spec, R, img);
  fs.writeFileSync(path.join(dir, 'sheet.png'), img.png);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m, null, 2) + '\n');
  const data = {
    spec: { key: spec.key, name: spec.name, gameKey: spec.gameKey || null, request: spec.request, kind: spec.kind, faction: spec.faction, team: !!spec.team, elevation: m.elevation, fit: spec.fit, footprint: spec.footprint || [1, 1] },
    meta: m, checks, sheet: dataURI(img.png),
    ref: { meta: ref.meta, sheet: dataURI(sheet(ref, ref.BW, ref.BH).png) },
    ground: groundTiles(), teams: TEAMS, magenta: RAMP.team.map(i => PALETTE[i - 1][1]),
    files: { spec: rel(path.resolve(file)), out: rel(dir), rules: 'art/PIXEL_ART_RULES.md' }
  };
  const page = fs.readFileSync(path.join(LAB, 'page.html'), 'utf8')
    .replace('@TITLE@', spec.name.replace(/[<&>]/g, '') + ' Sprite Test')
    .replace('/*@DATA@*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
  fs.writeFileSync(path.join(dir, 'index.html'), page);
  if (capture) await screenshot(path.join(dir, 'index.html'), path.join(dir, 'preview.png'));
  return { spec, checks, dir };
}

async function screenshot(file, out){
  const { createRequire } = await import('node:module'), { execSync } = await import('node:child_process');
  const require = createRequire(import.meta.url), tries = ['playwright', process.env.PLAYWRIGHT_MODULE];
  try { tries.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e){ /* no npm */ }
  let pw = null;
  for (const t of tries.filter(Boolean)){ try { pw = require(t); break; } catch (e){ /* next */ } }
  if (!pw){ console.error('Playwright is not installed; skipping the screenshot.'); return; }
  const browser = await pw.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.LAB_READY === true, null, { timeout: 20000 });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  if (errors.length) throw new Error('Test page errors: ' + errors.join('; '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const file = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!file){ console.error('Usage: node tools/sprite-lab.mjs art/sprite-lab/specs/<key>.mjs [--capture]'); process.exit(2); }
  const { spec, checks, dir } = await build(file, { capture: process.argv.includes('--capture') });
  for (const c of checks) console.log(`${{ pass: 'PASS', warn: 'WARN', fail: 'FAIL' }[c.level]}  ${c.name}: ${c.detail}`);
  console.log(`\n${spec.name}: wrote ${rel(dir)}/index.html`);
  if (checks.some(c => c.level === 'fail')) process.exitCode = 1;
}
