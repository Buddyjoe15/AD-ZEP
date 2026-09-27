// Sprite lab: renders a three-quarter sprite spec at 96 art px per tile, checks it against
// art/SPRITE_ART_RULES.md and writes a test page. No dependencies.
// Usage: node tools/sprite-lab.mjs art/sprite-lab/specs/<key>.mjs [--capture]
//   writes art/sprite-lab/out/<key>/: sheet.png, shadow.png, meta.json and index.html
//   (self-contained: open it from disk or publish it). --capture also screenshots the page to
//   preview.png (Playwright). Exits with 1 when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PALETTE, TEAMS, png } from './pixelart.mjs';
import { renderSprite, LIFT, RES, FACINGS, ENGINE_ANIMS, ENGINE_STATES, OUTLINE, RAMP, UNIT_FRAMES } from './sprite-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB = path.join(ROOT, 'art/sprite-lab');
const REFERENCE = path.join(LAB, 'specs/utility_spider.mjs');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

export async function loadSpec(file){
  return (await import(pathToFileURL(path.resolve(file)).href)).default;
}

// Frames in sheet order: a unit's animations, or a structure's states, each frame in turn.
function sequence(spec){
  const list = spec.kind === 'unit' ? spec.animations : spec.states, seq = [];
  for (const [anim, a] of Object.entries(list)) for (let frame = 0; frame < a.frames; frame++) seq.push({ anim, frame, frames: a.frames });
  return seq;
}

// Renders every facing (units: 8, others: 1) and frame into buffers padded for the shadow.
export function renderSpec(spec){
  const F = spec.frame, pad = F.shadowPad || 32, BW = F.w + pad, BH = F.h + pad, seq = sequence(spec);
  const headings = spec.kind === 'unit' ? FACINGS.map((_, i) => i * Math.PI / 4) : [0];
  const rows = headings.map(heading => seq.map(s => {
    const model = spec.build({ ...s, state: s.anim });
    return renderSprite(model, { w: BW, h: BH, ox: F.ox, oy: F.oy, res: RES, heading, lift: LIFT, outline: OUTLINE });
  }));
  return { rows, seq, BW, BH };
}

// The checks from "Checks" in the rules. Level: pass, warn (worth a look) or fail (must fix).
export function check(spec, R, ref = null){
  const out = [], add = (level, name, detail) => out.push({ level, name, detail });
  const F = spec.frame, unit = spec.kind === 'unit', team = new Set(RAMP.team);
  if (unit){
    const size = Object.entries(UNIT_FRAMES).find(([, u]) => u.w === F.w && u.h === F.h && u.ox === F.ox && u.oy === F.oy);
    add(size ? 'pass' : 'fail', 'Frame size', size ? `${F.w} × ${F.h} art px, the ${size[0]} unit frame` : `${F.w} × ${F.h} with origin ${F.ox}, ${F.oy} is not a unit frame (use unitFrame())`);
  } else {
    const ok = F.w % 96 === 0 && F.headroom % 16 === 0 && (F.h - F.headroom) % 96 === 0;
    add(ok ? 'pass' : 'fail', 'Frame size', `${F.w} × ${F.h} art px: ${F.w / 96} × ${(F.h - F.headroom) / 96} tiles plus ${F.headroom} px headroom`);
  }
  // Inside the frame with a 1 px margin, and the shadow inside its padded frame.
  let outside = 0, clipped = 0, bad = 0, where = '';
  R.rows.forEach((row, r) => row.forEach((f, c) => {
    for (let y = 0; y < R.BH; y++) for (let x = 0; x < R.BW; x++){
      const k = y * R.BW + x, v = f.px[k];
      if (v && (x < 1 || y < 1 || x > F.w - 2 || y > F.h - 2)){ if (!outside) where = `${unit ? FACINGS[r] + ', ' : ''}${R.seq[c].anim} ${R.seq[c].frame} at ${x}, ${y}`; outside++; }
      if (v > PALETTE.length) bad++;
      if (f.shadow[k] && (x === R.BW - 1 || y === R.BH - 1 || x === 0 || y === 0)) clipped++;
    }
  }));
  add(outside ? 'fail' : 'pass', 'Inside the frame', outside ? `${outside} px outside the 1 px margin, first in ${where}` : 'Every facing and frame keeps a 1 px margin');
  add(clipped ? 'fail' : 'pass', 'Shadow fits', clipped ? `The shadow reaches the edge of its ${R.BW} × ${R.BH} frame` : `Inside its ${R.BW} × ${R.BH} frame`);
  add(bad ? 'fail' : 'pass', 'Palette', bad ? `${bad} px outside the palette` : `Only the shared ${PALETTE.length} colours`);
  // Team colour: visible in the main view, and absent from teamless art.
  const main = R.rows[unit ? 3 : 0][0].px;
  let teamPx = 0;
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (team.has(main[y * R.BW + x])) teamPx++;
  const need = F.w <= 64 ? 32 : 64;
  if (spec.team) add(teamPx >= need ? 'pass' : 'fail', 'Team colour', `${teamPx} team px in the ${unit ? 'down-right facing' : 'first state'} (at least ${need})`);
  else add(teamPx ? 'fail' : 'pass', 'Team colour', teamPx ? `${teamPx} team px on art that has no team` : 'None, as this asset has no team');
  // Names the engine plays.
  const names = Object.keys(unit ? spec.animations : spec.states), known = unit ? ENGINE_ANIMS : ENGINE_STATES;
  const extra = names.filter(n => !known.includes(n));
  add(extra.length ? 'warn' : 'pass', unit ? 'Animations' : 'States', extra.length ? `${extra.join(', ')} need engine work; the engine plays ${known.join(', ')}` : names.join(', '));
  if (unit && !names.includes('idle')) add('warn', 'Idle', 'No idle animation; the engine shows idle when a unit stands still');
  if (!unit && !names.includes('finished')) add('warn', 'Finished state', 'No finished state; the engine shows it when the structure is built and idle');
  // Silhouette against the Utility Spider: a unit should not be mistaken for one.
  if (unit && ref && ref.spec.key !== spec.key){
    const a = R.rows[3][0].px, b = ref.R.rows[3][0].px, RF = ref.spec.frame, at = (buf, W, H, x, y) => x >= 0 && y >= 0 && x < W && y < H && buf[y * W + x];
    let both = 0, either = 0;
    for (let dy = -128; dy < 128; dy++) for (let dx = -64; dx < 64; dx++){   // both frames aligned on their origins
      const p = at(a, R.BW, R.BH, F.ox + dx, F.oy + dy), q = at(b, ref.R.BW, ref.R.BH, RF.ox + dx, RF.oy + dy);
      if (p && q) both++; if (p || q) either++;
    }
    const iou = either ? both / either : 0;
    add(iou > 0.75 ? 'warn' : 'pass', 'Silhouette', `${Math.round(iou * 100)}% overlap with the Utility Spider's (warn above 75%)`);
  }
  return out;
}

// ---- Output ----
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RGB = [null, ...PALETTE.map(([, h]) => hexRGB(h))];
function sheet(R, w, h, layer){
  const cols = R.seq.length, rows = R.rows.length, W = cols * w, H = rows * h, rgba = new Uint8Array(W * H * 4);
  R.rows.forEach((row, r) => row.forEach((f, c) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const k = y * R.BW + x, o = ((r * h + y) * W + c * w + x) * 4;
      if (layer === 'shadow'){ if (f.shadow[k]) rgba[o + 3] = 255; continue; }
      const v = f.px[k];
      if (!v) continue;
      const [cr, cg, cb] = RGB[v]; rgba[o] = cr; rgba[o + 1] = cg; rgba[o + 2] = cb; rgba[o + 3] = 255;
    }
  }));
  return { W, H, png: png(W, H, rgba) };
}
function meta(spec, R, img, shadowImg){
  const F = spec.frame, unit = spec.kind === 'unit', timeline = {};
  R.seq.forEach((s, i) => { (timeline[s.anim] ||= { start: i, frames: 0, fps: (unit ? spec.animations : spec.states)[s.anim].fps || 0 }).frames++; });
  return {
    name: spec.name, key: spec.key, gameKey: spec.gameKey || null, kind: spec.kind, faction: spec.faction, team: !!spec.team, elevation: spec.elevation,
    camera: { view: 'three-quarter (oblique)', faceHeight: LIFT, light: 'top left', rules: 'art/SPRITE_ART_RULES.md' },
    worldPxPerArtPx: 1 / RES, frameWidth: F.w, frameHeight: F.h, origin: [F.ox, F.oy],
    ...(unit ? { facings: FACINGS, animations: timeline } : { footprint: spec.footprint, footprintOrigin: [0, F.headroom], states: timeline }),
    shadow: { drawnBy: 'engine', from: 'model', image: 'shadow.png', frameWidth: R.BW, frameHeight: R.BH, origin: [F.ox, F.oy] },
    image: 'sheet.png', sheetWidth: img.W, sheetHeight: img.H, palette: 'shared (tools/pixelart.mjs)', teamRamp: spec.team ? 'team0..team2 (magenta)' : null
  };
}
// Woodlands grass and dust plain tiles from the game's art, as 48 × 48 PNG data URIs.
function groundTiles(){
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/render/pixel-data.js'), 'utf8'), ctx);
  const D = ctx.window.PIXEL_ART, tile = str => {
    const rgba = new Uint8Array(48 * 48 * 4);
    for (let i = 0; i < 48 * 48; i++){ const v = D.alphabet.indexOf(str[i]); if (v <= 0) continue; const [r, g, b] = RGB[v]; rgba.set([r, g, b, 255], i * 4); }
    return 'data:image/png;base64,' + Buffer.from(png(48, 48, rgba)).toString('base64');
  };
  return { grass: { tiles: D.woodlands.grass.tiles.map(tile), weights: D.woodlands.grass.weights }, dust: { tiles: D.terrain.v2.tiles.map(tile), weights: D.terrain.v2.weights } };
}
const dataURI = buf => 'data:image/png;base64,' + Buffer.from(buf).toString('base64');

export async function build(file, { capture = false } = {}){
  const spec = await loadSpec(file), R = renderSpec(spec);
  const refSpec = path.resolve(file) === REFERENCE ? spec : await loadSpec(REFERENCE), refR = refSpec === spec ? R : renderSpec(refSpec);
  const checks = check(spec, R, { spec: refSpec, R: refR });
  const dir = path.join(LAB, 'out', spec.key);
  fs.mkdirSync(dir, { recursive: true });
  const img = sheet(R, spec.frame.w, spec.frame.h), sh = sheet(R, R.BW, R.BH, 'shadow'), m = meta(spec, R, img, sh);
  fs.writeFileSync(path.join(dir, 'sheet.png'), img.png);
  fs.writeFileSync(path.join(dir, 'shadow.png'), sh.png);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m, null, 2) + '\n');
  const refImg = refSpec === spec ? img : sheet(refR, refSpec.frame.w, refSpec.frame.h), refSh = refSpec === spec ? sh : sheet(refR, refR.BW, refR.BH, 'shadow');
  const data = {
    spec: { key: spec.key, name: spec.name, gameKey: spec.gameKey || null, request: spec.request, kind: spec.kind, faction: spec.faction, team: !!spec.team, elevation: spec.elevation, fit: spec.fit, footprint: spec.footprint || [1, 1] },
    meta: m, checks, sheet: dataURI(img.png), shadow: dataURI(sh.png),
    ref: { meta: meta(refSpec, refR, refImg, refSh), sheet: dataURI(refImg.png), shadow: dataURI(refSh.png) },
    ground: groundTiles(), teams: TEAMS, magenta: RAMP.team.map(i => PALETTE[i - 1][1]),
    files: { spec: rel(path.resolve(file)), out: rel(dir), rules: 'art/SPRITE_ART_RULES.md' }
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
